import { kv } from "@vercel/kv";
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { getRoundInfo, hashInt } from "../auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { withChainTxLock } from "../tx-lock.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";

const BINGO_CONFIG = {
    rangeMax: 75,
    pickCount: 8,
    drawCount: 20,
    payouts: {
        8: 50,
        7: 10,
        6: 3,
        5: 1.5,
        4: 1
    }
};

function normalizeNumbers(numbers, rangeMax, pickCount) {
    if (!Array.isArray(numbers)) throw new Error("選號格式錯誤");
    const normalized = Array.from(new Set(numbers.map((n) => Number(n)).filter((n) => Number.isInteger(n))));
    if (normalized.length !== pickCount) throw new Error(`請選 ${pickCount} 個不重複號碼`);
    for (const n of normalized) {
        if (n < 1 || n > rangeMax) throw new Error(`號碼需在 1 到 ${rangeMax}`);
    }
    return normalized.sort((a, b) => a - b);
}

function drawNumbers(roundId, rangeMax, drawCount) {
    const pool = [];
    for (let i = 1; i <= rangeMax; i += 1) pool.push(i);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = hashInt(`bingo:${roundId}:${i}`) % (i + 1);
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
    }
    return pool.slice(0, drawCount).sort((a, b) => a - b);
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { address, amount, sessionId, numbers } = req.body || {};
    if (!address || !amount || !sessionId || !numbers) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        const sessionData = await getSession(sessionId);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)",
            "function totalSupply() view returns (uint256)"
        ], wallet);

        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch {}

        const currentTotalBet = Number(await kv.get(`total_bet:${address.toLowerCase()}`) || 0);
        const currentVipStatus = buildVipStatus(currentTotalBet);
        try {
            assertVipBetLimit(amount, currentTotalBet);
        } catch (betError) {
            return res.status(400).json({ error: betError.message, vipLevel: currentVipStatus.vipLevel, maxBet: currentVipStatus.maxBet });
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const userBalance = await contract.balanceOf(address);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        const round = getRoundInfo("bingo");
        if (!round.isBettingOpen) {
            return res.status(409).json({
                error: "本局開獎中，暫停下注，請等下一局",
                serverNowTs: Date.now(),
                roundId: round.roundId,
                closesAt: round.closesAt,
                bettingClosesAt: round.bettingClosesAt
            });
        }

        const userNumbers = normalizeNumbers(numbers, BINGO_CONFIG.rangeMax, BINGO_CONFIG.pickCount);
        const drawn = drawNumbers(round.roundId, BINGO_CONFIG.rangeMax, BINGO_CONFIG.drawCount);
        const drawnSet = new Set(drawn);
        const hits = userNumbers.filter((n) => drawnSet.has(n));
        const multiplier = BINGO_CONFIG.payouts[hits.length] || 0;

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        let tx;
        let betTx;
        let payoutWei = 0n;
        let netWei = -betWei;
        if (multiplier > 0) {
            const payoutBigInt = BigInt(Math.floor((multiplier + 1) * 100));
            payoutWei = (betWei * payoutBigInt) / 100n;
            netWei = payoutWei - betWei;
        }
        const buffAdjusted = await applySettlementBuffs({
            address,
            betWei,
            payoutWei,
            netWei,
            decimals,
            scope: "solo",
            persist: false
        });
        payoutWei = buffAdjusted.payoutWei;
        netWei = buffAdjusted.netWei;
        try {
            tx = await withChainTxLock(async () => {
                betTx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
                if (payoutWei > 0n) {
                    return transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, address, payoutWei, { gasLimit: 200000 });
                }
                return betTx;
            });
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }
        if (buffAdjusted.changed) {
            await persistSettlementBuffProfile(buffAdjusted.profile);
        }

        await recordGameHistory({
            address,
            game: "bingo",
            gameLabel: "賓果",
            outcome: multiplier > 0 ? "win" : "lose",
            outcomeLabel: multiplier > 0 ? `命中 ${hits.length} 個` : `命中 ${hits.length} 個`,
            betWei,
            payoutWei,
            netWei,
            multiplier: multiplier > 0 ? multiplier : 0,
            roundId: String(round.roundId),
            txHash: tx.hash,
            details: `命中 ${hits.join(",") || "無"} / 開獎 ${drawn.slice(0, 5).join(",")}...`,
            decimals
        });

        return res.status(200).json({
            status: "success",
            serverNowTs: Date.now(),
            roundId: round.roundId,
            closesAt: round.closesAt,
            bettingClosesAt: round.bettingClosesAt,
            userNumbers,
            drawn,
            hits,
            multiplier,
            totalBet,
            vipLevel: vipStatus.vipLevel,
            maxBet: vipStatus.maxBet,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
