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

function getVipLevel(totalBet) {
    if (totalBet >= 100000) return "👑 鑽石 VIP";
    if (totalBet >= 50000) return "🥇 黃金會員";
    if (totalBet >= 10000) return "🥈 白銀會員";
    return "普通會員";
}

function roundKey(sessionId) {
    return `blackjack_round:${sessionId}`;
}

async function settleRound({ contract, lossPoolAddress, address, round }) {
    const betWei = BigInt(round.betWei);
    const playerTotal = calcTotal(round.playerCards);
    const dealerTotal = calcTotal(round.dealerCards);

    let result = {
        isWin: false,
        isPush: false,
        reason: "",
        multiplier: 0
    };

    if (playerTotal > 21) {
        result.reason = "你爆牌";
    } else if (dealerTotal > 21) {
        result.isWin = true;
        result.reason = "莊家爆牌";
        result.multiplier = round.playerCards.length === 2 && playerTotal === 21 ? 1.5 : 1;
    } else if (playerTotal > dealerTotal) {
        result.isWin = true;
        result.reason = "點數較大";
        result.multiplier = round.playerCards.length === 2 && playerTotal === 21 ? 1.5 : 1;
    } else if (playerTotal < dealerTotal) {
        result.reason = "莊家點數較大";
    } else {
        result.isPush = true;
        result.reason = "平手";
    }

    let txHash = "";

    if (!result.isPush) {
        if (result.isWin) {
            const profitBigInt = BigInt(Math.floor(result.multiplier * 100));
            const profitWei = (betWei * profitBigInt) / 100n;
            const tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            txHash = tx.hash;
        } else {
            const tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            txHash = tx.hash;
        }
    }

    await kv.del(roundKey(round.sessionId));

    return {
        status: "settled",
        playerCards: round.playerCards,
        dealerCards: round.dealerCards,
        playerTotal,
        dealerTotal,
        isWin: result.isWin,
        isPush: result.isPush,
        reason: result.reason,
        multiplier: result.multiplier,
        totalBet: round.totalBet,
        vipLevel: round.vipLevel,
        txHash
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, action } = req.body || {};
    if (!address || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const normalizedAction = action || "start";
    if (!["start", "hit", "stand"].includes(normalizedAction)) {
        return res.status(400).json({ error: "不支援的操作" });
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

        if (normalizedAction === "start") {
            if (!amount || Number(amount) <= 0) {
                return res.status(400).json({ error: "請輸入有效押注金額" });
            }

            let decimals = 18n;
            try { decimals = await contract.decimals(); } catch (e) {}

            const betWei = ethers.parseUnits(amount.toString(), decimals);
            const userBalance = await contract.balanceOf(address);
            if (userBalance < betWei) {
                return res.status(400).json({ error: "餘額不足！請先充值再試" });
            }

            const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
            const totalBet = parseFloat(totalBetRaw).toFixed(2);
            const vipLevel = getVipLevel(parseFloat(totalBet));

            const playerCards = [drawCard(), drawCard()];
            const dealerCards = [drawCard(), drawCard()];
            const playerTotal = calcTotal(playerCards);
            const dealerTotal = calcTotal(dealerCards);

            const round = {
                sessionId,
                address: address.toLowerCase(),
                amount: parseFloat(amount),
                betWei: betWei.toString(),
                playerCards,
                dealerCards,
                totalBet,
                vipLevel,
                startedAt: Date.now()
            };

            // 開局先存，後續 hit/stand 使用
            await kv.set(roundKey(sessionId), round, { ex: 600 });

            // 開局若雙方黑傑克或任一黑傑克，直接結算
            const playerBj = playerCards.length === 2 && playerTotal === 21;
            const dealerBj = dealerCards.length === 2 && dealerTotal === 21;
            if (playerBj || dealerBj) {
                try {
                    return res.status(200).json(await settleRound({ contract, lossPoolAddress, address, round }));
                } catch (blockchainError) {
                    await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
                    await kv.del(roundKey(sessionId));
                    return res.status(500).json({
                        error: "區塊鏈交易失敗",
                        details: blockchainError.message
                    });
                }
            }

            return res.status(200).json({
                status: "in_progress",
                playerCards,
                dealerCards: [dealerCards[0], { rank: "?", suit: "?", hidden: true }],
                playerTotal,
                dealerTotal: dealerCards[0].value,
                totalBet,
                vipLevel
            });
        }

        const round = await kv.get(roundKey(sessionId));
        if (!round) {
            return res.status(400).json({ error: "本局不存在或已過期，請重新發牌" });
        }
        if (round.address !== address.toLowerCase()) {
            return res.status(403).json({ error: "你不能操作別人的牌局" });
        }

        if (normalizedAction === "hit") {
            round.playerCards.push(drawCard());
            const playerTotal = calcTotal(round.playerCards);

            if (playerTotal > 21) {
                try {
                    return res.status(200).json(await settleRound({ contract, lossPoolAddress, address, round }));
                } catch (blockchainError) {
                    await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(round.amount));
                    await kv.del(roundKey(sessionId));
                    return res.status(500).json({
                        error: "區塊鏈交易失敗",
                        details: blockchainError.message
                    });
                }
            }

            await kv.set(roundKey(sessionId), round, { ex: 600 });
            return res.status(200).json({
                status: "in_progress",
                playerCards: round.playerCards,
                dealerCards: [round.dealerCards[0], { rank: "?", suit: "?", hidden: true }],
                playerTotal,
                dealerTotal: round.dealerCards[0].value,
                totalBet: round.totalBet,
                vipLevel: round.vipLevel
            });
        }

        // stand
        while (calcTotal(round.dealerCards) < 17) {
            round.dealerCards.push(drawCard());
        }

        try {
            return res.status(200).json(await settleRound({ contract, lossPoolAddress, address, round }));
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(round.amount));
            await kv.del(roundKey(sessionId));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
