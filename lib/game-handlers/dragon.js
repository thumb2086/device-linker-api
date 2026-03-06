import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
    { value: 1, label: "A" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
    { value: 6, label: "6" },
    { value: 7, label: "7" },
    { value: 8, label: "8" },
    { value: 9, label: "9" },
    { value: 10, label: "10" },
    { value: 11, label: "J" },
    { value: 12, label: "Q" },
    { value: 13, label: "K" }
];

const DRAGON_ROUND_TTL_SECONDS = 300;

function dragonRoundKey(sessionId) {
    return `dragon_round:${sessionId}`;
}

function randomInt(max) {
    return Math.floor(Math.random() * max);
}

function drawCard() {
    const rank = RANKS[randomInt(RANKS.length)];
    const suit = SUITS[randomInt(SUITS.length)];
    return { value: rank.value, rank: rank.label, suit };
}

function drawGateCards() {
    let left = drawCard();
    let right = drawCard();
    while (left.value === right.value) {
        right = drawCard();
    }
    if (left.value > right.value) {
        const temp = left;
        left = right;
        right = temp;
    }
    return { left, right };
}

function getMultiplier(gap) {
    if (gap <= 3) return 3;
    if (gap <= 5) return 2;
    return 1.2;
}

function evaluateShot(gate, shot) {
    const leftVal = gate.left.value;
    const rightVal = gate.right.value;
    const shotVal = shot.value;

    if (shotVal > leftVal && shotVal < rightVal) return "win";
    if (shotVal === leftVal || shotVal === rightVal) return "pillar";
    return "lose";
}

function resolveVipLevel(totalBet) {
    if (totalBet >= 100000) return "👑 鑽石 VIP";
    if (totalBet >= 50000) return "🥇 黃金會員";
    if (totalBet >= 10000) return "🥈 白銀會員";
    return "普通會員";
}

function normalizeAddressOrThrow(input, field = "address") {
    try {
        return ethers.getAddress(String(input || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${field} 格式錯誤`);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, mode, action } = req.body || {};
    const playMode = mode === "classic" ? "classic" : "quick";
    const playAction = action || "play";

    if (!sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData || !sessionData.address) return res.status(403).json({ error: "會話過期，請重新登入" });

        const sessionAddress = normalizeAddressOrThrow(sessionData.address, "session address");
        if (address) {
            const requestAddress = normalizeAddressOrThrow(address, "address");
            if (requestAddress !== sessionAddress) {
                return res.status(403).json({ error: "地址與會話不一致" });
            }
        }

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
        try { decimals = await contract.decimals(); } catch (e) {}

        if (playMode === "classic" && playAction === "gate") {
            const existingRound = await kv.get(dragonRoundKey(sessionId));
            if (existingRound && existingRound.gate) {
                return res.status(200).json({
                    status: "success",
                    mode: "classic",
                    action: "gate",
                    roundLocked: true,
                    gate: existingRound.gate,
                    gap: existingRound.gap,
                    multiplier: existingRound.multiplier,
                    lockExpiresAt: existingRound.expiresAt || null
                });
            }

            const gate = drawGateCards();
            const gap = gate.right.value - gate.left.value;
            const multiplier = getMultiplier(gap);
            const expiresAt = new Date(Date.now() + DRAGON_ROUND_TTL_SECONDS * 1000).toISOString();

            await kv.set(dragonRoundKey(sessionId), {
                sessionId,
                address: sessionAddress,
                gate,
                gap,
                multiplier,
                createdAt: new Date().toISOString(),
                expiresAt
            }, { ex: DRAGON_ROUND_TTL_SECONDS });

            return res.status(200).json({
                status: "success",
                mode: "classic",
                action: "gate",
                roundLocked: true,
                gate,
                gap,
                multiplier,
                lockExpiresAt: expiresAt
            });
        }

        if (playMode === "classic" && playAction === "shoot") {
            if (!amount) {
                return res.status(400).json({ error: "缺少必要參數" });
            }

            const round = await kv.get(dragonRoundKey(sessionId));
            if (!round || !round.gate) {
                return res.status(400).json({ error: "請先發門" });
            }
            if (String(round.address || "").toLowerCase() !== sessionAddress) {
                await kv.del(dragonRoundKey(sessionId));
                return res.status(403).json({ error: "回合與會話地址不一致，已取消該局" });
            }

            const betAmount = Number(amount);
            if (!Number.isFinite(betAmount) || betAmount <= 0) {
                return res.status(400).json({ error: "下注金額無效" });
            }

            const betWei = ethers.parseUnits(betAmount.toString(), decimals);
            const maxRiskWei = betWei * 2n;
            const userBalance = await contract.balanceOf(sessionAddress);
            if (userBalance < maxRiskWei) {
                return res.status(400).json({ error: "餘額不足！需至少可承擔雙倍撞柱風險" });
            }

            const gate = round.gate;
            const shot = drawCard();
            const resultType = evaluateShot(gate, shot);
            const multiplier = Number(round.multiplier || getMultiplier(round.gap));

            let tx;
            try {
                if (resultType === "win") {
                    const profitBigInt = BigInt(Math.floor(multiplier * 100));
                    const profitWei = (betWei * profitBigInt) / 100n;
                    tx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, sessionAddress, profitWei, { gasLimit: 220000 });
                } else if (resultType === "pillar") {
                    tx = await contract.adminTransfer(sessionAddress, lossPoolAddress, maxRiskWei, { gasLimit: 220000 });
                } else {
                    tx = await contract.adminTransfer(sessionAddress, lossPoolAddress, betWei, { gasLimit: 220000 });
                }
            } catch (blockchainError) {
                return res.status(500).json({
                    error: "區塊鏈交易失敗",
                    details: blockchainError.message
                });
            }

            await kv.del(dragonRoundKey(sessionId));

            const totalBetRaw = await kv.incrbyfloat(`total_bet:${sessionAddress}`, betAmount);
            const totalBet = parseFloat(totalBetRaw).toFixed(2);
            const vipLevel = resolveVipLevel(Number(totalBet));

            return res.status(200).json({
                status: "success",
                mode: "classic",
                action: "shoot",
                gate,
                shot,
                resultType,
                isWin: resultType === "win",
                lossMultiplier: resultType === "pillar" ? 2 : 1,
                multiplier,
                gap: round.gap,
                totalBet,
                vipLevel,
                txHash: tx.hash
            });
        }

        if (!address || !amount) {
            return res.status(400).json({ error: "缺少必要參數" });
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const maxRiskWei = betWei * 2n; // 撞柱會扣雙倍
        const userBalance = await contract.balanceOf(sessionAddress);
        if (userBalance < maxRiskWei) {
            return res.status(400).json({ error: "餘額不足！需至少可承擔雙倍撞柱風險" });
        }

        const gate = drawGateCards();
        const shot = drawCard();
        const resultType = evaluateShot(gate, shot); // win | pillar | lose
        const gap = gate.right.value - gate.left.value;
        const multiplier = getMultiplier(gap);

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${sessionAddress}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipLevel = resolveVipLevel(Number(totalBet));

        let tx;
        try {
            if (resultType === "win") {
                const profitBigInt = BigInt(Math.floor(multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                tx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, sessionAddress, profitWei, { gasLimit: 200000 });
            } else if (resultType === "pillar") {
                tx = await contract.adminTransfer(sessionAddress, lossPoolAddress, maxRiskWei, { gasLimit: 200000 });
            } else {
                tx = await contract.adminTransfer(sessionAddress, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${sessionAddress}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        return res.status(200).json({
            status: "success",
            mode: "quick",
            action: "play",
            gate,
            shot,
            resultType,
            isWin: resultType === "win",
            lossMultiplier: resultType === "pillar" ? 2 : 1,
            multiplier,
            gap,
            totalBet,
            vipLevel,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
