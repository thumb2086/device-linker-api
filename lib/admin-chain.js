import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { logChainTxEvent } from "./tx-monitor.js";

const NONCE_KEY_PREFIX = "admin_chain_next_nonce:";

function nonceKey(address) {
    return `${NONCE_KEY_PREFIX}${String(address || "").trim().toLowerCase()}`;
}

function isNonceRetryable(error) {
    const message = String(
        error && (error.shortMessage || error.message || (error.info && error.info.error && error.info.error.message) || "")
    ).toLowerCase();
    return message.includes("replacement transaction underpriced")
        || message.includes("replacement fee too low")
        || message.includes("nonce too low")
        || message.includes("already known")
        || message.includes("transaction underpriced");
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildManagedOverrides(contract, overrides = {}) {
    const runner = contract && contract.runner;
    if (!runner || typeof runner.getAddress !== "function" || !runner.provider) {
        throw new Error("contract runner does not support managed transaction sending");
    }

    const signerAddress = String(await runner.getAddress()).toLowerCase();
    const provider = runner.provider;
    const key = nonceKey(signerAddress);

    // 1. 原子遞增並取得下一個可用的 Nonce
    let nonce = Number(await kv.incr(key));

    // 2. 只有在 Nonce 剛初始化或顯著落後時，才從鏈上同步
    // 透過傳入的 overrides.forceSyncNonce 可以強制同步
    const shouldSync = overrides.forceSyncNonce === true || nonce <= 0;
    
    if (shouldSync) {
        const [pendingNonce, latestNonce] = await Promise.all([
            provider.getTransactionCount(signerAddress, "pending"),
            provider.getTransactionCount(signerAddress, "latest")
        ]);
        const onChainNonce = Math.max(pendingNonce, latestNonce);
        if (onChainNonce > nonce) {
            nonce = onChainNonce;
            await kv.set(key, String(nonce + 1));
        }
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ? BigInt(feeData.gasPrice) : null;
    const minPriorityFee = ethers.parseUnits("2", "gwei");
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? BigInt(feeData.maxPriorityFeePerGas) : null;
    if (!maxPriorityFeePerGas || maxPriorityFeePerGas < minPriorityFee) {
        maxPriorityFeePerGas = minPriorityFee;
    }
    const maxFeePerGas = feeData.maxFeePerGas
        ? BigInt(feeData.maxFeePerGas)
        : (gasPrice ? gasPrice * 2n : null);

    const nextOverrides = { ...overrides };
    delete nextOverrides.txSource;
    delete nextOverrides.txMeta;

    return {
        ...nextOverrides,
        nonce,
        ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
        ...(maxFeePerGas ? { maxFeePerGas } : {}),
        ...(gasPrice && !maxFeePerGas ? { gasPrice } : {})
    };
}

async function markNextNonce(contract, nonce) {
    const runner = contract && contract.runner;
    const signerAddress = String(await runner.getAddress()).toLowerCase();
    const current = Number(await kv.get(nonceKey(signerAddress)) || 0);
    if (Number(nonce) >= current) {
        await kv.set(nonceKey(signerAddress), String(Number(nonce) + 1));
    }
}

async function waitForPendingNonceAdvance(contract, nonce, timeoutMs = 1500) {
    const runner = contract && contract.runner;
    const provider = runner && runner.provider;
    const signerAddress = runner ? String(await runner.getAddress()).toLowerCase() : "";
    if (!provider || !signerAddress) return;

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const pendingNonce = await provider.getTransactionCount(signerAddress, "pending");
        if (pendingNonce > Number(nonce)) return;
        await sleep(120);
    }
}

export async function sendManagedContractTx(contract, methodName, args = [], overrides = {}, attempts = 3) {
    const txSource = String(overrides && overrides.txSource || "").trim();
    const txMeta = overrides && typeof overrides.txMeta === "object" ? overrides.txMeta : {};
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const managedOverrides = await buildManagedOverrides(contract, overrides);
            const tx = await contract[methodName](...args, managedOverrides);
            await markNextNonce(contract, tx.nonce);
            await waitForPendingNonceAdvance(contract, tx.nonce);
            let signer = "";
            try {
                signer = String(await contract.runner.getAddress()).toLowerCase();
            } catch (_) {
                signer = "";
            }
            await logChainTxEvent({
                status: "success",
                kind: "managed_tx",
                method: methodName,
                source: txSource,
                signer,
                txHash: tx.hash,
                nonce: tx.nonce,
                attempts: attempt + 1,
                meta: {
                    to: String(tx.to || ""),
                    gasLimit: String(managedOverrides.gasLimit || ""),
                    ...txMeta
                }
            });
            return tx;
        } catch (error) {
            lastError = error;
            const message = String(error && (error.shortMessage || error.message || "")).toLowerCase();
            if (message.includes("nonce too low") || message.includes("already known")) {
                overrides.forceSyncNonce = true; 
            }
            if (!isNonceRetryable(error) || attempt === attempts - 1) {
                let signer = "";
                try {
                    signer = String(await contract.runner.getAddress()).toLowerCase();
                } catch (_) {
                    signer = "";
                }
                await logChainTxEvent({
                    status: "failure",
                    kind: "managed_tx",
                    method: methodName,
                    source: txSource,
                    signer,
                    error: String(error && (error.shortMessage || error.message || "")),
                    attempts: attempt + 1,
                    meta: txMeta
                });
                throw error;
            }
            await sleep(250 * (attempt + 1));
        }
    }
    throw lastError;
}
