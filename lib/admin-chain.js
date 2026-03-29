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

function buildTxEventId(txHash) {
    const normalizedHash = String(txHash || "").trim().toLowerCase();
    return normalizedHash ? `tx_event_${normalizedHash}` : "";
}

export async function checkManagedTxReceipt(provider, txInput, context = {}) {
    const txHash = String((txInput && txInput.hash) || txInput || "").trim();
    if (!txHash) return null;

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;

    const eventId = buildTxEventId(txHash);
    const signer = String(context.signer || "").trim();
    const methodName = String(context.methodName || "").trim();
    const txSource = String(context.txSource || "").trim();
    const attempts = Number(context.attempts || 1);
    const txNonce = Number(context.nonce || (txInput && txInput.nonce) || 0);
    const txMeta = context.txMeta && typeof context.txMeta === "object" ? context.txMeta : {};

    if (Number(receipt.status || 0) !== 1) {
        const revertMessage = `transaction reverted: ${txHash}`;
        await logChainTxEvent({
            id: eventId,
            status: "failure",
            kind: "managed_tx_v2",
            method: methodName,
            source: txSource,
            signer,
            txHash,
            nonce: txNonce,
            attempts,
            error: revertMessage,
            meta: txMeta
        });
        throw new Error(revertMessage);
    }

    await logChainTxEvent({
        id: eventId,
        status: "success",
        kind: "managed_tx_v2",
        method: methodName,
        source: txSource,
        signer,
        txHash,
        nonce: txNonce,
        attempts,
        meta: {
            blockNumber: Number(receipt.blockNumber || 0),
            gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : "",
            ...txMeta
        }
    });

    return receipt;
}

export async function sendManagedContractTx(contract, methodName, args = [], overrides = {}, attempts = 3) {
    const txSource = String(overrides?.txSource || "").trim();
    const txMeta = typeof overrides?.txMeta === "object" ? overrides.txMeta : {};
    const waitForReceipt = overrides?.waitForReceipt !== false;
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
            delete finalOverrides.waitForReceipt;

            const tx = await contract[methodName](...args, finalOverrides);
            const eventId = buildTxEventId(tx.hash);

            await logChainTxEvent({
                id: eventId,
                status: "pending",
                kind: "managed_tx_v2",
                method: methodName,
                source: txSource,
                signer: signerAddress,
                txHash: tx.hash,
                nonce: tx.nonce,
                attempts: attempt + 1,
                meta: { to: String(tx.to || ""), ...txMeta }
            });

            tx.managedContext = {
                methodName,
                txSource,
                signer: signerAddress,
                nonce: tx.nonce,
                attempts: attempt + 1,
                txMeta: { to: String(tx.to || ""), ...txMeta }
            };

            if (!waitForReceipt) {
                return tx;
            }

            const receipt = await tx.wait();
            tx.receipt = receipt;
            await checkManagedTxReceipt(runner.provider, tx, {
                signer: signerAddress,
                methodName,
                txSource,
                nonce: tx.nonce,
                attempts: attempt + 1,
                txMeta: { to: String(tx.to || ""), ...txMeta }
            });

            return tx;

        } catch (error) {
            lastError = error;
            const message = String(error?.message || "").toLowerCase();
            const txHash = String(error?.transactionHash || error?.transaction?.hash || "").trim();
            const txNonce = Number(error?.transaction?.nonce || 0);
            
            await logChainTxEvent({
                id: buildTxEventId(txHash) || undefined,
                status: "failure",
                kind: "managed_tx_v2",
                method: methodName,
                source: txSource,
                signer: signerAddress,
                txHash,
                error: message,
                nonce: txNonce,
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
