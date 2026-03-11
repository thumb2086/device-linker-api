import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { logChainTxEvent } from "./tx-monitor.js";
import { withDistLock } from "./tx-lock.js";

const NONCE_MANAGER_LOCK_KEY = "nonce-manager";
const NONCE_KEY_PREFIX = "nonce:";

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
        
        const storedNonce = Number(storedNonceRaw) || 0;
        const nextNonce = Math.max(onChainNonce, storedNonce);

        await kv.set(key, nextNonce + 1);
        return nextNonce;
    });
}

async function buildOverrides(provider, nonce) {
    const feeData = await provider.getFeeData();
    const minPriorityFee = ethers.parseUnits("2", "gwei");

    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 0n;
    if (maxPriorityFeePerGas < minPriorityFee) {
        maxPriorityFeePerGas = minPriorityFee;
    }

    return {
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas: feeData.maxFeePerGas || undefined
    };
}

function isRetryableError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("replacement transaction underpriced") || message.includes("transaction underpriced");
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
            const nonce = await getNextNonce(runner.provider, signerAddress);
            const txOverrides = await buildOverrides(runner.provider, nonce);
            
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

            if (!isRetryableError(error) || attempt === attempts - 1) {
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
    
    throw lastError;
}
