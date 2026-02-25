import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
    { label: "A", value: 11 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5", value: 5 },
    { label: "6", value: 6 },
    { label: "7", value: 7 },
    { label: "8", value: 8 },
    { label: "9", value: 9 },
    { label: "10", value: 10 },
    { label: "J", value: 10 },
    { label: "Q", value: 10 },
    { label: "K", value: 10 }
];

function drawCard() {
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    return { rank: rank.label, suit, value: rank.value };
}

function calcTotal(cards) {
    let total = cards.reduce((sum, c) => sum + c.value, 0);
    let aces = cards.filter((c) => c.rank === "A").length;
    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }
    return total;
}

function evaluateRound(playerCards, dealerCards) {
    const playerTotal = calcTotal(playerCards);
    const dealerTotal = calcTotal(dealerCards);
    const playerBlackjack = playerTotal === 21;

    if (playerTotal > 21) {
        return { isWin: false, playerTotal, dealerTotal, reason: "爆牌，莊家勝" };
    }
    if (dealerTotal > 21) {
        return { isWin: true, playerTotal, dealerTotal, reason: "莊家爆牌", multiplier: playerBlackjack ? 1.5 : 1 };
    }
    if (playerTotal > dealerTotal) {
        return { isWin: true, playerTotal, dealerTotal, reason: "點數較大", multiplier: playerBlackjack ? 1.5 : 1 };
    }
    return { isWin: false, playerTotal, dealerTotal, reason: "莊家點數不小於你" };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId } = req.body;
    if (!address || !amount || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
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

        const playerCards = [drawCard(), drawCard()];
        const dealerCards = [drawCard(), drawCard()];
        const result = evaluateRound(playerCards, dealerCards);

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        let vipLevel = "普通會員";
        if (totalBet >= 100000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 50000) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 10000) vipLevel = "🥈 白銀會員";

        let tx;
        try {
            if (result.isWin) {
                const multiplier = result.multiplier || 1;
                const profitBigInt = BigInt(Math.floor(multiplier * 100));
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
            playerCards,
            dealerCards,
            playerTotal: result.playerTotal,
            dealerTotal: result.dealerTotal,
            isWin: result.isWin,
            reason: result.reason,
            multiplier: result.multiplier || 0,
            totalBet,
            vipLevel,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
