import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { getSession } from "../session-store.js";
import { recordGameHistory } from "../game-history.js";
import { getDisplayName } from "../user-profile.js";
import { settlementService } from "../settlement-service.js";

const TX_SOURCE = "duel";
const DUEL_PREFIX = "duel_match:";
const ACTIVE_DUEL_PREFIX = "duel_active:";
const DUEL_TTL = 3600;

function duelKey(id) { return `${DUEL_PREFIX}${id}`; }
function activeDuelKey(addr) { return `${ACTIVE_DUEL_PREFIX}${addr.toLowerCase()}`; }

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { sessionId, action, amount, duelId } = req.body || {};
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

            const decimals = await settlementService.getDecimals();
            const betWei = ethers.parseUnits(String(betAmount), decimals);
            const balance = await settlementService.contract.balanceOf(address);
            if (balance < betWei) return res.status(400).json({ error: "Insufficient balance" });

            const id = randomUUID();
            const duel = {
                id,
                creator: address,
                creatorName: await getDisplayName(address) || address,
                amount: betAmount,
                status: "open",
                createdAt: new Date().toISOString()
            };

            // Use settlementService for deducting bet
            await settlementService.settle({
                userAddress: address,
                betWei,
                payoutWei: 0n,
                source: TX_SOURCE,
                meta: { duelId: id, action: "create" }
            });

            await kv.set(duelKey(id), duel, { ex: DUEL_TTL });
            await kv.set(activeDuelKey(address), id, { ex: DUEL_TTL });
            return res.status(200).json({ success: true, duel });
        }

        if (action === "join") {
            const duel = await kv.get(duelKey(duelId));
            if (!duel || duel.status !== "open") return res.status(400).json({ error: "Duel no longer available" });
            if (duel.creator === address) return res.status(400).json({ error: "Cannot join your own duel" });

            const decimals = await settlementService.getDecimals();
            const betWei = ethers.parseUnits(String(duel.amount), decimals);
            const balance = await settlementService.contract.balanceOf(address);
            if (balance < betWei) return res.status(400).json({ error: "Insufficient balance" });

            duel.joiner = address;
            duel.joinerName = await getDisplayName(address) || address;
            duel.status = "rolling";
            await kv.set(duelKey(duelId), duel, { ex: DUEL_TTL });

            const winner = Math.random() < 0.5 ? duel.creator : duel.joiner;
            const loser = winner === duel.creator ? duel.joiner : duel.creator;
            const payoutWei = betWei * 2n;

            let finalTxHash = "";
            try {
                if (winner === address) {
                    // Current player (joiner) wins
                    const results = await settlementService.settle({
                        userAddress: address,
                        betWei,
                        payoutWei,
                        source: TX_SOURCE,
                        meta: { duelId, winner, role: "joiner" }
                    });
                    finalTxHash = results.payoutTxHash || results.betTxHash;
                } else {
                    // Creator wins, current player (joiner) loses
                    const resultsLoss = await settlementService.settle({
                        userAddress: address,
                        betWei,
                        payoutWei: 0n,
                        source: TX_SOURCE,
                        meta: { duelId, winner, role: "joiner" }
                    });
                    
                    // Pay the winner (creator)
                    const resultsWin = await settlementService.settle({
                        userAddress: winner,
                        betWei: 0n, // Bet already deducted when creating
                        payoutWei,
                        source: TX_SOURCE,
                        meta: { duelId, winner, role: "creator" }
                    });
                    finalTxHash = resultsWin.payoutTxHash || resultsLoss.betTxHash;
                }
            } catch (e) {
                duel.status = "error";
                duel.error = e.message;
                await kv.set(duelKey(duelId), duel, { ex: DUEL_TTL });
                throw e;
            }

            duel.status = "finished";
            duel.winner = winner;
            duel.txHash = finalTxHash;
            await kv.set(duelKey(duelId), duel, { ex: DUEL_TTL });

            await recordGameHistory({
                address: winner, game: "duel", gameLabel: "玩家對賭", outcome: "win",
                betWei, payoutWei, netWei: betWei, multiplier: 2, txHash: finalTxHash, details: `對戰 ${winner === duel.creator ? duel.joinerName : duel.creatorName}`, decimals
            });
            await recordGameHistory({
                address: loser, game: "duel", gameLabel: "玩家對賭", outcome: "lose",
                betWei, payoutWei: 0n, netWei: -betWei, multiplier: 0, txHash: finalTxHash, details: `對戰 ${loser === duel.creator ? duel.joinerName : duel.creatorName}`, decimals
            });

            return res.status(200).json({ success: true, duel });
        }

        return res.status(400).json({ error: "Unsupported action" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
