import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { getSession } from "../session-store.js";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { withQueuedChainTxLock } from "../tx-lock.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { recordGameHistory } from "../game-history.js";
import { getDisplayName } from "../user-profile.js";
import { sendManagedContractTx } from "../admin-chain.js";

const TX_SOURCE = "duel";
const DUEL_PREFIX = "duel_match:";
const ACTIVE_DUEL_PREFIX = "duel_active:";
const DUEL_TTL = 3600;

function duelKey(id) { return `${DUEL_PREFIX}${id}`; }
function activeDuelKey(addr) { return `${ACTIVE_DUEL_PREFIX}${addr.toLowerCase()}`; }

async function getContractContext() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
    const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
    const contract = new ethers.Contract(CONTRACT_ADDRESS, [
        "function adminTransfer(address from, address to, uint256 amount) public",
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint256)"
    ], wallet);
    const decimals = await contract.decimals();
    return { contract, decimals, lossPoolAddress };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { sessionId, action, amount, duelId, choice } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    try {
        const session = await getSession(sessionId);
        if (!session || !session.address) return res.status(403).json({ error: "Session expired" });
        const address = session.address.toLowerCase();

        if (action === "list") {
            const duels = [];
            for await (const key of kv.scanIterator({ match: `${DUEL_PREFIX}*`, count: 100 })) {
                const d = await kv.get(key);
                if (d && d.status === "open") duels.push(d);
            }
            return res.status(200).json({ success: true, duels });
        }

        if (action === "create") {
            const betAmount = Number(amount);
            if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

            const { contract, decimals, lossPoolAddress } = await getContractContext();
            const betWei = ethers.parseUnits(String(betAmount), decimals);
            const balance = await contract.balanceOf(address);
            if (balance < betWei) return res.status(400).json({ error: "Insufficient balance" });

            const id = randomUUID();
            const duel = {
                id,
                creator: address,
                creatorName: await getDisplayName(address) || address.slice(0, 6),
                amount: betAmount,
                status: "open",
                createdAt: new Date().toISOString()
            };

            await withQueuedChainTxLock(async () => {
                await sendManagedContractTx(contract, "adminTransfer", [address, lossPoolAddress, betWei], { txSource: TX_SOURCE });
            }, undefined, TX_SOURCE);

            await kv.set(duelKey(id), duel, { ex: DUEL_TTL });
            await kv.set(activeDuelKey(address), id, { ex: DUEL_TTL });
            return res.status(200).json({ success: true, duel });
        }

        if (action === "join") {
            const duel = await kv.get(duelKey(duelId));
            if (!duel || duel.status !== "open") return res.status(400).json({ error: "Duel no longer available" });
            if (duel.creator === address) return res.status(400).json({ error: "Cannot join your own duel" });

            const { contract, decimals, lossPoolAddress } = await getContractContext();
            const betWei = ethers.parseUnits(String(duel.amount), decimals);
            const balance = await contract.balanceOf(address);
            if (balance < betWei) return res.status(400).json({ error: "Insufficient balance" });

            duel.joiner = address;
            duel.joinerName = await getDisplayName(address) || address.slice(0, 6);
            duel.status = "rolling";
            await kv.set(duelKey(duelId), duel, { ex: DUEL_TTL });

            const winner = Math.random() < 0.5 ? duel.creator : duel.joiner;
            const loser = winner === duel.creator ? duel.joiner : duel.creator;
            const payoutWei = betWei * 2n;

            let txHash = "";
            try {
                await withQueuedChainTxLock(async () => {
                    // Collect joiner's bet
                    await sendManagedContractTx(contract, "adminTransfer", [address, lossPoolAddress, betWei], { txSource: TX_SOURCE });
                    // Pay winner
                    const tx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, winner, payoutWei, { txSource: TX_SOURCE });
                    txHash = tx.hash;
                }, undefined, TX_SOURCE);
            } catch (e) {
                duel.status = "error";
                duel.error = e.message;
                await kv.set(duelKey(duelId), duel, { ex: DUEL_TTL });
                throw e;
            }

            duel.status = "finished";
            duel.winner = winner;
            duel.txHash = txHash;
            await kv.set(duelKey(duelId), duel, { ex: DUEL_TTL });

            await recordGameHistory({
                address: winner, game: "duel", gameLabel: "玩家對賭", outcome: "win",
                betWei, payoutWei, netWei: betWei, multiplier: 2, txHash, details: `對戰 ${winner === duel.creator ? duel.joinerName : duel.creatorName}`, decimals
            });
            await recordGameHistory({
                address: loser, game: "duel", gameLabel: "玩家對賭", outcome: "lose",
                betWei, payoutWei: 0n, netWei: -betWei, multiplier: 0, txHash, details: `對戰 ${loser === duel.creator ? duel.joinerName : duel.creatorName}`, decimals
            });

            return res.status(200).json({ success: true, duel });
        }

        return res.status(400).json({ error: "Unsupported action" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
