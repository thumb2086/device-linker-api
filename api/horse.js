import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

const HORSES = [
    { id: 1, name: "赤焰", weight: 30, multiplier: 1.6 },
    { id: 2, name: "雷霆", weight: 28, multiplier: 2.0 },
    { id: 3, name: "幻影", weight: 24, multiplier: 2.5 },
    { id: 4, name: "夜刃", weight: 18, multiplier: 3.5 }
];

function pickWinner() {
    const totalWeight = HORSES.reduce((sum, h) => sum + h.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const horse of HORSES) {
        rand -= horse.weight;
        if (rand <= 0) return horse;
    }
    return HORSES[0];
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, horseId, sessionId } = req.body;
    if (!address || !amount || !horseId || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const selectedHorse = HORSES.find(function (h) { return h.id === Number(horseId); });
    if (!selectedHorse) {
        return res.status(400).json({ error: "無效的馬匹選項" });
    }

    try {
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
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

        const winner = pickWinner();
        const isWin = winner.id === selectedHorse.id;

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        let vipLevel = "普通會員";
        if (totalBet >= 100000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 50000) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 10000) vipLevel = "🥈 白銀會員";

        let tx;
        try {
            if (isWin) {
                const profitBigInt = BigInt(Math.floor(winner.multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else {
                const burnAddress = "0x000000000000000000000000000000000000dEaD";
                tx = await contract.adminTransfer(address, burnAddress, betWei, { gasLimit: 200000 });
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
            winnerId: winner.id,
            winnerName: winner.name,
            selectedHorseId: selectedHorse.id,
            selectedHorseName: selectedHorse.name,
            multiplier: winner.multiplier,
            isWin,
            horses: HORSES.map(function (h) {
                return { id: h.id, name: h.name, multiplier: h.multiplier };
            }),
            totalBet,
            vipLevel,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
