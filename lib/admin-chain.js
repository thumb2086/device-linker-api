import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { logChainTxEvent } from "./tx-monitor.js";
import { withDistLock } from "./tx-lock.js";

const NONCE_MANAGER_LOCK_KEY = "nonce-manager";
const NONCE_KEY_PREFIX = "nonce:";
const NONCE_MAX_DRIFT = Number(process.env.NONCE_MAX_DRIFT || 0);

function getNonceKey(address) {
    return `${NONCE_KEY_PREFIX}${String(address || "").trim().toLowerCase()}`;
}

async function getNextNonce(provider, signerAddress) {
    const key = getNonceKey(signerAddress);

    // Get the next nonce within a distributed lock to ensure atomicity.
    return withDistLock(NONCE_MANAGER_LOCK_KEY, async () => {
        const [onChainNonce, storedNonceRaw] = await Promise.all([
            provider.getTransactionCount(signerAddress, "pending"),
            kv.get(key)
        ]);

        const storedNonce = Number(storedNonceRaw);
        if (!Number.isFinite(storedNonce) || storedNonce < 0) {
            await kv.set(key, onChainNonce);
            return onChainNonce;
        }

        if (storedNonce > onChainNonce + NONCE_MAX_DRIFT) {
            await kv.set(key, onChainNonce);
            return onChainNonce;
        }

        const nextNonce = Math.max(onChainNonce, storedNonce);
        await kv.set(key, nextNonce + 1);
        return nextNonce;
    });
}

async function syncStoredNonce(provider, signerAddress) {
    const key = getNonceKey(signerAddress);
    const onChainNonce = await provider.getTransactionCount(signerAddress, "pending");
    await kv.set(key, onChainNonce);
    return onChainNonce;
}

async function buildOverrides(provider, nonce, attempt = 0) {
    const feeData = await provider.getFeeData();
    const minPriorityFee = ethers.parseUnits("5", "gwei");
    const baseFeePerGas = feeData.lastBaseFeePerGas || feeData.gasPrice || minPriorityFee;

    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 0n;
    if (maxPriorityFeePerGas < minPriorityFee) {
        maxPriorityFeePerGas = minPriorityFee;
    }

    // 每一重試增加 10% 的 Priority Fee 以提升打包速度
    if (attempt > 0) {
        maxPriorityFeePerGas = (maxPriorityFeePerGas * BigInt(100 + attempt * 10)) / 100n;
    }

    let maxFeePerGas = feeData.maxFeePerGas || undefined;
    if (maxFeePerGas && attempt > 0) {
        maxFeePerGas = (maxFeePerGas * BigInt(100 + attempt * 10)) / 100n;
    }

    const minMaxFeePerGas = maxPriorityFeePerGas + (baseFeePerGas * 2n);
    if (maxFeePerGas === undefined || maxFeePerGas < minMaxFeePerGas) {
        maxFeePerGas = minMaxFeePerGas;
    }

    return {
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas
    };
}

function isRetryableError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("replacement transaction underpriced") || message.includes("transaction underpriced");
}

function isNonceSyncError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("nonce too low")
        || message.includes("nonce too high")
        || message.includes("nonce has already been used")
        || message.includes("already known")
        || message.includes("already imported")
        || message.includes("known transaction");
}

export async function sendManagedContractTx(contract, methodName, args = [], overrides = {}, attempts = 3) {
    const txSource = String(overrides?.txSource || "").trim();
    const txMeta = typeof overrides?.txMeta === "object" ? overrides.txMeta : {};
    const runner = contract.runner;
    
    if (!runner || !runner.provider) {
        throw new Error("Contract runner with provider is required.");
    }
    
    const signerAddress = await runner.getAddress();
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            // 檢查管理員餘額
            const balance = await runner.provider.getBalance(signerAddress);
            if (balance < ethers.parseEther("0.005")) {
                console.warn(`Admin wallet balance low: ${ethers.formatEther(balance)} ETH`);
            }

            const nonce = await getNextNonce(runner.provider, signerAddress);
            const txOverrides = await buildOverrides(runner.provider, nonce, attempt);
            
            const finalOverrides = { ...overrides, ...txOverrides };
            delete finalOverrides.txSource;
            delete finalOverrides.txMeta;

            const tx = await contract[methodName](...args, finalOverrides);
            
            await logChainTxEvent({
                status: "success",
                kind: "managed_tx_v2",
                method: methodName,
                source: txSource,
                signer: signerAddress,
                txHash: tx.hash,
                nonce: tx.nonce,
                attempts: attempt + 1,
                meta: { to: String(tx.to || ""), ...txMeta }
            });
            
            return tx;

        } catch (error) {
            lastError = error;
            const message = String(error?.message || "").toLowerCase();
            
            await logChainTxEvent({
                status: "failure",
                kind: "managed_tx_v2",
                method: methodName,
                source: txSource,
                signer: signerAddress,
                error: message,
                attempts: attempt + 1,
                meta: txMeta
            });

            if (isNonceSyncError(error)) {
                await syncStoredNonce(runner.provider, signerAddress);
            }

            if ((!isRetryableError(error) && !isNonceSyncError(error)) || attempt === attempts - 1) {
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
    
    throw lastError;
}
