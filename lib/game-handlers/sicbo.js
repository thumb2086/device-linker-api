import { kv } from "@vercel/kv";
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { getRoundInfo, hashInt } from "../auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";

const TOTAL_PAYOUTS = {
    4: 50,
    5: 18,
    6: 14,
    7: 12,
    8: 8,
    9: 6,
    10: 6,
    11: 6,
    12: 6,
    13: 8,
    14: 12,
    15: 14,
    16: 18,
    17: 50
};

function rollDice(roundId) {
    return [
        (hashInt(`sicbo:${roundId}:1`) % 6) + 1,
        (hashInt(`sicbo:${roundId}:2`) % 6) + 1,
        (hashInt(`sicbo:${roundId}:3`) % 6) + 1
    ];
}

function countValue(dice, target) {
    let count = 0;
    for (const d of dice) if (d === target) count += 1;
    return count;
}

function evaluateBet(dice, betType, betValue) {
    const total = dice[0] + dice[1] + dice[2];
    const isTriple = dice[0] === dice[1] && dice[1] === dice[2];

    if (betType === "big") {
        if (isTriple) return 0;
        return total >= 11 && total <= 17 ? 1 : 0;
    }

    if (betType === "small") {
        if (isTriple) return 0;
        return total >= 4 && total <= 10 ? 1 : 0;
    }

    if (betType === "odd") {
        if (isTriple) return 0;
        return total % 2 === 1 ? 1 : 0;
    }

    if (betType === "even") {
        if (isTriple) return 0;
        return total % 2 === 0 ? 1 : 0;
    }

    if (betType === "total") {
        const target = Number(betValue);
        return TOTAL_PAYOUTS[target] || 0;
    }

    if (betType === "triple_any") {
        return isTriple ? 24 : 0;
    }

    if (betType === "triple_specific") {
        const target = Number(betValue);
        if (!Number.isInteger(target) || target < 1 || target > 6) return 0;
        return isTriple && dice[0] === target ? 150 : 0;
    }

    if (betType === "double_specific") {
        const target = Number(betValue);
        if (!Number.isInteger(target) || target < 1 || target > 6) return 0;
        return countValue(dice, target) >= 2 ? 11 : 0;
    }

    if (betType === "single") {
        const target = Number(betValue);
        if (!Number.isInteger(target) || target < 1 || target > 6) return 0;
        return countValue(dice, target);
    }

    return 0;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { address, amount, sessionId, betType, betValue } = req.body || {};
    if (!address || !amount || !sessionId || !betType) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const allowedBetTypes = new Set([
        "big",
        "small",
        "odd",
        "even",
        "total",
        "triple_any",
        "triple_specific",
        "double_specific",
        "single"
    ]);
    if (!allowedBetTypes.has(betType)) {
        return res.status(400).json({ error: "不支援的下注類型" });
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

        const round = getRoundInfo("sicbo");
        if (!round.isBettingOpen) {
            return res.status(409).json({
                error: "本局開獎中，暫停下注，請等下一局",
                serverNowTs: Date.now(),
                roundId: round.roundId,
                closesAt: round.closesAt,
                bettingClosesAt: round.bettingClosesAt
            });
        }

        const dice = rollDice(round.roundId);
        const total = dice[0] + dice[1] + dice[2];
        const isTriple = dice[0] === dice[1] && dice[1] === dice[2];
        const multiplier = evaluateBet(dice, betType, betValue);

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        let tx;
        let betTx;
        let payoutWei = 0n;
        let netWei = -betWei;
        try {
            betTx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            if (multiplier > 0) {
                const payoutBigInt = BigInt(Math.floor((multiplier + 1) * 100));
                payoutWei = (betWei * payoutBigInt) / 100n;
                netWei = payoutWei - betWei;
                tx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, address, payoutWei, { gasLimit: 200000 });
            } else {
                tx = betTx;
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        await recordGameHistory({
            address,
            game: "sicbo",
            gameLabel: "骰寶",
            outcome: multiplier > 0 ? "win" : "lose",
            outcomeLabel: multiplier > 0 ? "中獎" : "未中",
            betWei,
            payoutWei,
            netWei,
            multiplier: multiplier > 0 ? multiplier : 0,
            roundId: String(round.roundId),
            txHash: tx.hash,
            details: `${betType}${betValue !== undefined && betValue !== null && betValue !== "" ? `:${betValue}` : ""} / 骰子 ${dice.join("-")}`,
            decimals
        });

        return res.status(200).json({
            status: "success",
            serverNowTs: Date.now(),
            dice,
            total,
            isTriple,
            multiplier,
            betType,
            betValue,
            roundId: round.roundId,
            closesAt: round.closesAt,
            bettingClosesAt: round.bettingClosesAt,
            totalBet,
            vipLevel: vipStatus.vipLevel,
            maxBet: vipStatus.maxBet,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
