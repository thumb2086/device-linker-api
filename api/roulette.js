import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo, hashInt } from "../lib/auto-round.js";

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function getColor(num) {
    if (num === 0) return "green";
    return RED_NUMBERS.has(num) ? "red" : "black";
}

function evaluateBet(number, betType, betValue) {
    const color = getColor(number);

    if (betType === "color") {
        return { isWin: betValue === color, multiplier: 1 };
    }

    if (betType === "parity") {
        if (number === 0) return { isWin: false, multiplier: 1 };
        const parity = number % 2 === 0 ? "even" : "odd";
        return { isWin: parity === betValue, multiplier: 1 };
    }

    if (betType === "range") {
        if (number === 0) return { isWin: false, multiplier: 1 };
        const range = number <= 18 ? "low" : "high";
        return { isWin: range === betValue, multiplier: 1 };
    }

    if (betType === "dozen") {
        const n = Number(betValue);
        if (![1, 2, 3].includes(n) || number === 0) return { isWin: false, multiplier: 2 };
        const dozen = Math.ceil(number / 12);
        return { isWin: dozen === n, multiplier: 2 };
    }

    if (betType === "number") {
        const targetNumber = Number(betValue);
        return { isWin: number === targetNumber, multiplier: 35 };
    }

    return { isWin: false, multiplier: 1 };
}

function getVipLevel(totalBet) {
    if (totalBet >= 100000) return "👑 鑽石 VIP";
    if (totalBet >= 50000) return "🥇 黃金會員";
    if (totalBet >= 10000) return "🥈 白銀會員";
    return "普通會員";
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, betType, betValue } = req.body || {};

    if (!address || !amount || !sessionId || !betType || betValue === undefined || betValue === null) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const allowedBetTypes = ["color", "parity", "range", "dozen", "number"];
    if (!allowedBetTypes.includes(betType)) {
        return res.status(400).json({ error: "不支援的下注類型" });
    }

    if (betType === "number") {
        const targetNum = Number(betValue);
        if (!Number.isInteger(targetNum) || targetNum < 0 || targetNum > 36) {
            return res.status(400).json({ error: "單號下注必須是 0 到 36" });
        }
    }

    try {
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;

        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ], wallet);

        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch (e) {}

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const userBalance = await contract.balanceOf(address);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        // 固定分局開獎
        const round = getRoundInfo('roulette');
        const winningNumber = hashInt(`roulette:${round.roundId}`) % 37;
        const winningColor = getColor(winningNumber);
        const result = evaluateBet(winningNumber, betType, betValue);

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipLevel = getVipLevel(parseFloat(totalBet));

        let tx;
        try {
            if (result.isWin) {
                const profitBigInt = BigInt(Math.floor(result.multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else {
                tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        return res.status(200).json({
            status: "success",
            winningNumber,
            winningColor,
            isWin: result.isWin,
            multiplier: result.multiplier,
            betType,
            betValue,
            roundId: round.roundId,
            closesAt: round.closesAt,
            totalBet,
            vipLevel,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
