import { kv } from "@vercel/kv";
import { ethers } from "ethers";

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
        || message.includes("already known");
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
    const [feeData, pendingNonce, storedNonceRaw] = await Promise.all([
        provider.getFeeData(),
        provider.getTransactionCount(signerAddress, "pending"),
        kv.get(nonceKey(signerAddress))
    ]);

    const storedNonce = Number.isFinite(Number(storedNonceRaw)) ? Number(storedNonceRaw) : -1;
    const nonce = Math.max(pendingNonce, storedNonce);
    const gasPrice = feeData.gasPrice ? BigInt(feeData.gasPrice) : null;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? BigInt(feeData.maxPriorityFeePerGas) : null;
    const maxFeePerGas = feeData.maxFeePerGas
        ? BigInt(feeData.maxFeePerGas)
        : (gasPrice ? gasPrice * 2n : null);

    return {
        ...overrides,
        nonce,
        ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
        ...(maxFeePerGas ? { maxFeePerGas } : {}),
        ...(gasPrice && !maxFeePerGas ? { gasPrice } : {})
    };
}

async function markNextNonce(contract, nonce) {
    const runner = contract && contract.runner;
    const signerAddress = String(await runner.getAddress()).toLowerCase();
    await kv.set(nonceKey(signerAddress), String(Number(nonce) + 1));
}

async function waitForPendingNonceAdvance(contract, nonce, timeoutMs = 2500) {
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
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const managedOverrides = await buildManagedOverrides(contract, overrides);
            const tx = await contract[methodName](...args, managedOverrides);
            await markNextNonce(contract, tx.nonce);
            await waitForPendingNonceAdvance(contract, tx.nonce);
            return tx;
        } catch (error) {
            lastError = error;
            if (!isNonceRetryable(error) || attempt === attempts - 1) {
                throw error;
            }
            await sleep(250 * (attempt + 1));
        }
    }
    throw lastError;
}
