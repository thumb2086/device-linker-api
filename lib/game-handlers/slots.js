// api/slots.js - 老虎機
import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { withChainTxLock } from "../tx-lock.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { sendManagedContractTx } from "../admin-chain.js";

const TRIPLE_HIT_RATE = 0.15;

// 圖案與權重（越稀有權重越低）
const SYMBOLS = [
    { name: "cherry",  emoji: "🍒", weight: 30 },
    { name: "lemon",   emoji: "🍋", weight: 25 },
    { name: "bell",    emoji: "🔔", weight: 20 },
    { name: "star",    emoji: "⭐", weight: 15 },
    { name: "diamond", emoji: "💎", weight: 8 },
    { name: "seven",   emoji: "7️⃣", weight: 2 },
];

// 三連賠率（倍數 = 含本金總返還）
const TRIPLE_PAYOUT = {
    cherry:  2,    // 2x
    lemon:   3,    // 3x
    bell:    5,    // 5x
    star:    8,    // 8x
    diamond: 15,   // 15x
    seven:   50,   // 50x
};

// 兩連返還比例（每條線各自返還 0.5 倍押注）
const DOUBLE_PAYOUT = 0.5;
const PAYLINES = [
    // Horizontal
    { key: "top", positions: [[0, 0], [1, 0], [2, 0]] },
    { key: "middle", positions: [[0, 1], [1, 1], [2, 1]] },
    { key: "bottom", positions: [[0, 2], [1, 2], [2, 2]] },
    // Diagonal
    { key: "diag-down", positions: [[0, 0], [1, 1], [2, 2]] },
    { key: "diag-up", positions: [[0, 2], [1, 1], [2, 0]] },
    // Vertical
    { key: "left-col", positions: [[0, 0], [0, 1], [0, 2]] },
    { key: "middle-col", positions: [[1, 0], [1, 1], [1, 2]] },
    { key: "right-col", positions: [[2, 0], [2, 1], [2, 2]] }
];

function normalizeAddressOrThrow(input, field = "address") {
    try {
        return ethers.getAddress(String(input || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${field} 格式錯誤`);
    }
}

async function compensateSlotsBet(contract, lossPoolAddress, userAddress, betWei, txOptions) {
    try {
        await sendManagedContractTx(contract, "adminTransfer", [lossPoolAddress, userAddress, betWei], txOptions);
        return null;
    } catch (compensationError) {
        return compensationError;
    }
}

function pickWeightedSymbol() {
    const totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const symbol of SYMBOLS) {
        rand -= symbol.weight;
        if (rand <= 0) return symbol;
    }
    return SYMBOLS[0];
}

function createRandomBoard() {
    return Array.from({ length: 3 }, () => (
        Array.from({ length: 3 }, () => pickWeightedSymbol())
    ));
}

function forceTripleBoard() {
    const board = createRandomBoard();
    const payline = PAYLINES[Math.floor(Math.random() * PAYLINES.length)];
    const symbol = pickWeightedSymbol();

    for (const [col, row] of payline.positions) {
        board[col][row] = symbol;
    }

    return board;
}

function spinBoard() {
    if (Math.random() < TRIPLE_HIT_RATE) {
        return forceTripleBoard();
    }

    while (true) {
        const board = createRandomBoard();
        const result = evaluateResult(board);
        if (result.tripleCount === 0) {
            return board;
        }
    }
}

function evaluateResult(board) {
    const lineWins = [];

    for (const payline of PAYLINES) {
        const line = payline.positions.map(([col, row]) => board[col][row]);
        const names = line.map((symbol) => symbol.name);

        if (names[0] === names[1] && names[1] === names[2]) {
            lineWins.push({
                line: payline.key,
                type: "triple",
                symbol: names[0],
                multiplier: TRIPLE_PAYOUT[names[0]]
            });
            continue;
        }

        if (names[0] === names[1]) {
            lineWins.push({
                line: payline.key,
                type: "double",
                symbol: names[0],
                multiplier: DOUBLE_PAYOUT
            });
            continue;
        }

        if (names[1] === names[2]) {
            lineWins.push({
                line: payline.key,
                type: "double",
                symbol: names[1],
                multiplier: DOUBLE_PAYOUT
            });
            continue;
        }

        if (names[0] === names[2]) {
            lineWins.push({
                line: payline.key,
                type: "double",
                symbol: names[0],
                multiplier: DOUBLE_PAYOUT
            });
        }
    }

    const tripleWins = lineWins.filter((item) => item.type === "triple");
    const doubleWins = lineWins.filter((item) => item.type === "double");
    const totalMultiplier = lineWins.reduce((sum, item) => sum + item.multiplier, 0);

    if (lineWins.length > 0) {
        return {
            type: tripleWins.length > 0 ? (doubleWins.length > 0 ? "combo" : "triple") : "double",
            multiplier: totalMultiplier,
            symbol: tripleWins[0]?.symbol || doubleWins[0]?.symbol || null,
            winLines: lineWins.map((item) => item.line),
            lineWins,
            tripleCount: tripleWins.length,
            doubleCount: doubleWins.length
        };
    }

    return {
        type: "lose",
        multiplier: 0,
        symbol: null,
        winLines: [],
        lineWins: [],
        tripleCount: 0,
        doubleCount: 0
    };
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
        const sessionData = await getSession(sessionId);
        if (!sessionData || !sessionData.address) return res.status(403).json({ error: "會話過期，請重新登入" });
        const sessionAddress = normalizeAddressOrThrow(sessionData.address, "session address");
        const requestAddress = normalizeAddressOrThrow(address, "address");
        if (requestAddress !== sessionAddress) {
            return res.status(403).json({ error: "地址與會話不一致" });
        }

        // 準備合約
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

        const currentTotalBet = Number(await kv.get(`total_bet:${sessionAddress}`) || 0);
        const currentVipStatus = buildVipStatus(currentTotalBet);
        try {
            assertVipBetLimit(amount, currentTotalBet);
        } catch (betError) {
            return res.status(400).json({ error: betError.message, vipLevel: currentVipStatus.vipLevel, maxBet: currentVipStatus.maxBet });
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);

        // 檢查餘額
        const userBalance = await contract.balanceOf(sessionAddress);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        // 轉輪！
        const board = spinBoard();
        const result = evaluateResult(board);

        let tx;
        let betTx;
        let payoutWei = 0n;
        let netWei = -betWei;
        let betTransferred = false;
        if (result.multiplier > 0) {
            const payoutBigInt = BigInt(Math.floor(result.multiplier * 100));
            payoutWei = (betWei * payoutBigInt) / 100n;
            netWei = payoutWei - betWei;
        }
        const buffAdjusted = await applySettlementBuffs({
            address: sessionAddress,
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
                betTx = await sendManagedContractTx(contract, "adminTransfer", [sessionAddress, lossPoolAddress, betWei], { gasLimit: 220000 });
                betTransferred = true;
                if (payoutWei > 0n) {
                    return transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, sessionAddress, payoutWei, { gasLimit: 220000 });
                }
                return betTx;
            });
        } catch (blockchainError) {
            console.error("交易失敗:", blockchainError);
            const compensationError = betTransferred
                ? await compensateSlotsBet(contract, lossPoolAddress, sessionAddress, betWei, { gasLimit: 220000 })
                : null;
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: compensationError
                    ? `${blockchainError.message}；補償轉帳也失敗：${compensationError.message}`
                    : blockchainError.message
            });
        }
        if (buffAdjusted.changed) {
            await persistSettlementBuffProfile(buffAdjusted.profile);
        }

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${sessionAddress}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        const lineSummary = result.lineWins
            .map((item) => `${item.line}:${item.type === "triple" ? `${item.symbol} ${item.multiplier}x` : `${item.symbol} 對子 ${item.multiplier}x`}`)
            .join(", ");

        const outcomeLabel = result.type === "lose"
            ? "未中"
            : (result.tripleCount > 0
                ? `${result.tripleCount} 條三連${result.doubleCount > 0 ? ` + ${result.doubleCount} 條雙連` : ""}`
                : `${result.doubleCount} 條雙連`);

        await recordGameHistory({
            address: sessionAddress,
            game: "slots",
            gameLabel: "老虎機",
            outcome: result.type === "lose" ? "lose" : "win",
            outcomeLabel,
            betWei,
            payoutWei,
            netWei,
            multiplier: result.multiplier,
            txHash: tx.hash,
            details: `${board.map((column) => column.map((symbol) => symbol.emoji).join("")).join(" | ")}${lineSummary ? ` / ${lineSummary}` : ""}`,
            decimals
        });

        return res.status(200).json({
            status: "success",
            columns: board.map((column) => column.map((symbol) => ({ name: symbol.name, emoji: symbol.emoji }))),
            resultType: result.type,
            multiplier: result.multiplier,
            totalMultiplier: result.multiplier,
            isWin: result.multiplier > 1,
            winLines: result.winLines,
            lineWins: result.lineWins,
            tripleCount: result.tripleCount,
            doubleCount: result.doubleCount,
            totalBet,
            vipLevel: vipStatus.vipLevel,
            maxBet: vipStatus.maxBet,
            txHash: tx.hash
        });

    } catch (error) {
        console.error("Slots API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
