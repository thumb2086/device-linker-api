// api/slots.js - 老虎機
import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";

// 圖案與權重（越稀有權重越低）
const SYMBOLS = [
    { name: "cherry",  emoji: "🍒", weight: 30 },
    { name: "lemon",   emoji: "🍋", weight: 25 },
    { name: "bell",    emoji: "🔔", weight: 20 },
    { name: "star",    emoji: "⭐", weight: 15 },
    { name: "diamond", emoji: "💎", weight: 8 },
    { name: "seven",   emoji: "7️⃣", weight: 2 },
];

// 三連賠率（倍數 = 淨利潤，不含本金）
const TRIPLE_PAYOUT = {
    cherry:  2,    // 2x
    lemon:   3,    // 3x
    bell:    5,    // 5x
    star:    8,    // 8x
    diamond: 15,   // 15x
    seven:   50,   // 50x
};

// 兩連返還比例（只返還 0.5 倍押注，淨扣 0.5 倍）
const DOUBLE_PAYOUT = 0.5;

function spinReel() {
    const totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const symbol of SYMBOLS) {
        rand -= symbol.weight;
        if (rand <= 0) return symbol;
    }
    return SYMBOLS[0];
}

function evaluateResult(reels) {
    const names = reels.map(r => r.name);

    // 三連
    if (names[0] === names[1] && names[1] === names[2]) {
        return { type: "triple", multiplier: TRIPLE_PAYOUT[names[0]], symbol: names[0] };
    }

    // 兩連（任意兩個相同）
    if (names[0] === names[1] || names[1] === names[2] || names[0] === names[2]) {
        return { type: "double", multiplier: DOUBLE_PAYOUT, symbol: null };
    }

    // 全不同 → 輸
    return { type: "lose", multiplier: -1, symbol: null };
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
        // 驗證 session
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        // 準備合約
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

        // 檢查餘額
        const userBalance = await contract.balanceOf(address);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        // 轉輪！
        const reels = [spinReel(), spinReel(), spinReel()];
        const result = evaluateResult(reels);

        // 更新累計投注
        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        let vipLevel = "普通會員";
        if (totalBet >= 100000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 50000) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 10000) vipLevel = "🥈 白銀會員";

        let tx;
        try {
            if (result.type === "triple") {
                // 三連：不扣本金，僅 mint 利潤
                const profitBigInt = BigInt(Math.floor(result.multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else if (result.type === "double") {
                // 兩連：只扣半注（等效返還 0.5x）
                const halfBetWei = betWei / 2n;
                tx = await contract.adminTransfer(address, lossPoolAddress, halfBetWei, { gasLimit: 200000 });
            } else {
                // 全輸：扣整注
                tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            console.error("交易失敗:", blockchainError);
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        return res.status(200).json({
            status: "success",
            reels: reels.map(r => ({ name: r.name, emoji: r.emoji })),
            resultType: result.type,       // "triple" | "double" | "lose"
            multiplier: result.multiplier, // 賠率倍數
            isWin: result.type === "triple",
            totalBet,
            vipLevel,
            txHash: tx.hash
        });

    } catch (error) {
        console.error("Slots API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
