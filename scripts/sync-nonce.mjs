// scripts/sync-nonce.mjs
import { kv } from '@vercel/kv';
import { ethers } from 'ethers';
import { RPC_URL, ADMIN_WALLET_ADDRESS } from '../lib/config.js';

const NONCE_KEY_PREFIX = "nonce:";

function getNonceKey(address) {
    return `${NONCE_KEY_PREFIX}${String(address || "").trim().toLowerCase()}`;
}

async function syncNonce() {
    console.log(`Syncing nonce for admin wallet: ${ADMIN_WALLET_ADDRESS}`);
    console.log(`Using RPC: ${RPC_URL}`);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const nonceKey = getNonceKey(ADMIN_WALLET_ADDRESS);

    try {
        const [onChainNonce, storedNonceRaw] = await Promise.all([
            provider.getTransactionCount(ADMIN_WALLET_ADDRESS, "pending"),
            kv.get(nonceKey)
        ]);

        const storedNonce = Number(storedNonceRaw) || 0;
        console.log(`On-chain nonce (pending): ${onChainNonce}`);
        console.log(`Stored nonce in KV: ${storedNonce}`);

        const nextNonce = onChainNonce;
        
        if (nextNonce > storedNonce) {
            console.log(`Updating KV nonce to ${nextNonce}...`);
            await kv.set(nonceKey, nextNonce);
            console.log("Successfully updated nonce in KV.");
        } else if (nextNonce < storedNonce) {
            console.log(`Warning: On-chain nonce (${nextNonce}) is lower than stored nonce (${storedNonce}).`);
            console.log(`This might happen if some transactions are still in flight or if the RPC is lagging.`);
            console.log(`Updating KV nonce to ${nextNonce} to force sync with chain...`);
            await kv.set(nonceKey, nextNonce);
            console.log("Successfully forced updated nonce in KV.");
        } else {
            console.log("Nonce is already in sync.");
        }

    } catch (error) {
        console.error("Failed to sync nonce:", error);
    }
}

syncNonce();
