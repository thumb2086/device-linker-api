import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";

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

function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ value: rank.value, rank: rank.label, suit });
        }
    }
    return deck;
}

function drawFromDeck(deck) {
    if (!Array.isArray(deck) || deck.length === 0) {
        throw new Error("牌堆不足");
    }
    const index = randomInt(deck.length);
    const [card] = deck.splice(index, 1);
    return card;
}

function drawGateCards(deck) {
    const left = drawFromDeck(deck);
    let right = drawFromDeck(deck);
    while (left.value === right.value) {
        deck.push(right);
        right = drawFromDeck(deck);
    }

    if (left.value > right.value) {
        return { left: right, right: left };
    }
    return { left, right };
}

function getMultiplier(gap) {
    if (gap <= 3) return 3;
    if (gap <= 5) return 2;
    return 1.2;
}

function normalizeSideGuess(sideGuess) {
    const normalized = String(sideGuess || "").trim().toLowerCase();
    return normalized === "lower" || normalized === "higher" ? normalized : "";
}

function countDeckByRange(deck, predicate) {
    if (!Array.isArray(deck)) return 0;
    return deck.reduce((count, card) => count + (predicate(card) ? 1 : 0), 0);
}

function buildNoGapOptions(gate, deck) {
    const lowerOuts = countDeckByRange(deck, (card) => card.value < gate.left.value);
    const higherOuts = countDeckByRange(deck, (card) => card.value > gate.right.value);
    const lowerMultiplier = lowerOuts > 0 ? Math.max(1.2, Math.round(((deck.length - lowerOuts) / lowerOuts) * 10) / 10) : 0;
    const higherMultiplier = higherOuts > 0 ? Math.max(1.2, Math.round(((deck.length - higherOuts) / higherOuts) * 10) / 10) : 0;
    return {
        lower: { enabled: lowerOuts > 0, outs: lowerOuts, multiplier: lowerMultiplier },
        higher: { enabled: higherOuts > 0, outs: higherOuts, multiplier: higherMultiplier }
    };
}

function getShotMultiplier(gate, sideGuess, deck) {
    const gap = gate.right.value - gate.left.value;
    if (gap > 1) return getMultiplier(gap);
    const options = buildNoGapOptions(gate, deck);
    if (sideGuess === "lower" && options.lower.enabled) return options.lower.multiplier;
    if (sideGuess === "higher" && options.higher.enabled) return options.higher.multiplier;
    return 0;
}

function evaluateShot(gate, shot, sideGuess) {
    const leftVal = gate.left.value;
    const rightVal = gate.right.value;
    const shotVal = shot.value;

    if (shotVal === leftVal || shotVal === rightVal) return "pillar";
    if (rightVal - leftVal <= 1) {
        if (sideGuess === "lower" && shotVal < leftVal) return "win";
        if (sideGuess === "higher" && shotVal > rightVal) return "win";
        return "lose";
    }
    if (shotVal > leftVal && shotVal < rightVal) return "win";
    return "lose";
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

    const { address, amount, sessionId, mode, action, sideGuess: rawSideGuess } = req.body || {};
    const playMode = mode === "classic" ? "classic" : "quick";
    const playAction = action || "play";
    const sideGuess = normalizeSideGuess(rawSideGuess);

    if (!sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        const sessionData = await getSession(sessionId);
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
                    requiresSideGuess: Boolean(existingRound.requiresSideGuess),
                    sideOptions: existingRound.sideOptions || null,
                    lockExpiresAt: existingRound.expiresAt || null
                });
            }

            const deck = buildDeck();
            const gate = drawGateCards(deck);
            const gap = gate.right.value - gate.left.value;
            const multiplier = getMultiplier(gap);
            const sideOptions = gap <= 1 ? buildNoGapOptions(gate, deck) : null;
            const expiresAt = new Date(Date.now() + DRAGON_ROUND_TTL_SECONDS * 1000).toISOString();

            await kv.set(dragonRoundKey(sessionId), {
                sessionId,
                address: sessionAddress,
                deck,
                gate,
                gap,
                multiplier,
                requiresSideGuess: gap <= 1,
                sideOptions,
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
                requiresSideGuess: gap <= 1,
                sideOptions,
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

            const currentTotalBet = Number(await kv.get(`total_bet:${sessionAddress}`) || 0);
            const currentVipStatus = buildVipStatus(currentTotalBet);
            try {
                assertVipBetLimit(betAmount, currentTotalBet);
            } catch (betError) {
                return res.status(400).json({ error: betError.message, vipLevel: currentVipStatus.vipLevel, maxBet: currentVipStatus.maxBet });
            }

            const betWei = ethers.parseUnits(betAmount.toString(), decimals);
            const maxRiskWei = betWei * 2n;
            const userBalance = await contract.balanceOf(sessionAddress);
            if (userBalance < maxRiskWei) {
                return res.status(400).json({ error: "餘額不足！需至少可承擔雙倍撞柱風險" });
            }

            const gate = round.gate;
            const deck = Array.isArray(round.deck) ? round.deck : [];
            const sideOptions = round.requiresSideGuess ? (round.sideOptions || buildNoGapOptions(gate, deck)) : null;
            if (round.requiresSideGuess) {
                if (!sideGuess) {
                    return res.status(400).json({ error: "此局沒有門寬，請先選擇猜上或猜下" });
                }
                if ((sideGuess === "lower" && !sideOptions.lower.enabled) || (sideGuess === "higher" && !sideOptions.higher.enabled)) {
                    return res.status(400).json({ error: "目前牌面不支援這個方向" });
                }
            }

            const multiplier = Number(round.requiresSideGuess ? getShotMultiplier(gate, sideGuess, deck) : (round.multiplier || getMultiplier(round.gap)));
            const shot = drawFromDeck(deck);
            const resultType = evaluateShot(gate, shot, sideGuess);

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
            const vipStatus = buildVipStatus(Number(totalBet));

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
                requiresSideGuess: Boolean(round.requiresSideGuess),
                sideGuess,
                totalBet,
                vipLevel: vipStatus.vipLevel,
                maxBet: vipStatus.maxBet,
                txHash: tx.hash
            });
        }

        if (!address || !amount) {
            return res.status(400).json({ error: "缺少必要參數" });
        }

        const currentTotalBet = Number(await kv.get(`total_bet:${sessionAddress}`) || 0);
        const currentVipStatus = buildVipStatus(currentTotalBet);
        try {
            assertVipBetLimit(amount, currentTotalBet);
        } catch (betError) {
            return res.status(400).json({ error: betError.message, vipLevel: currentVipStatus.vipLevel, maxBet: currentVipStatus.maxBet });
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const maxRiskWei = betWei * 2n; // 撞柱會扣雙倍
        const userBalance = await contract.balanceOf(sessionAddress);
        if (userBalance < maxRiskWei) {
            return res.status(400).json({ error: "餘額不足！需至少可承擔雙倍撞柱風險" });
        }

        const deck = buildDeck();
        const gate = drawGateCards(deck);
        const gap = gate.right.value - gate.left.value;
        const requiresSideGuess = gap <= 1;
        if (requiresSideGuess && !sideGuess) {
            return res.status(400).json({ error: "此局沒有門寬，請先選擇猜上或猜下" });
        }
        const sideOptions = requiresSideGuess ? buildNoGapOptions(gate, deck) : null;
        if (requiresSideGuess && ((sideGuess === "lower" && !sideOptions.lower.enabled) || (sideGuess === "higher" && !sideOptions.higher.enabled))) {
            return res.status(400).json({ error: "目前牌面不支援這個方向" });
        }
        const multiplier = requiresSideGuess ? getShotMultiplier(gate, sideGuess, deck) : getMultiplier(gap);
        const shot = drawFromDeck(deck);
        const resultType = evaluateShot(gate, shot, sideGuess); // win | pillar | lose

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${sessionAddress}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(Number(totalBet));

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
            requiresSideGuess,
            sideOptions,
            sideGuess,
            totalBet,
            vipLevel: vipStatus.vipLevel,
            maxBet: vipStatus.maxBet,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
