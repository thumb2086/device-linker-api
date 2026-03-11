// api/slots.js - 老虎機
import { kv } from '@vercel/kv';
import { randomUUID } from "crypto";
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { withQueuedChainTxLock } from "../tx-lock.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { sendManagedContractTx } from "../admin-chain.js";

const TX_SOURCE = "slots";
const SLOTS_SPIN_TTL_SECONDS = 900;

const TRIPLE_HIT_RATE = 0.08;
const SYMBOLS = [
    { name: "cherry", emoji: "🍒", weight: 30 },
    { name: "lemon", emoji: "🍋", weight: 25 },
    { name: "bell", emoji: "🔔", weight: 20 },
    { name: "star", emoji: "⭐", weight: 15 },
    { name: "diamond", emoji: "💎", weight: 8 },
    { name: "seven", emoji: "7️⃣", weight: 2 }
];
const TRIPLE_PAYOUT = {
    cherry: 2,
    lemon: 3,
    bell: 5,
    star: 8,
    diamond: 15,
    seven: 50
};
const DOUBLE_PAYOUT = 0.5;
const PAYLINES = [
    { key: "top", positions: [[0, 0], [1, 0], [2, 0]] },
    { key: "middle", positions: [[0, 1], [1, 1], [2, 1]] },
    { key: "bottom", positions: [[0, 2], [1, 2], [2, 2]] },
    { key: "diag-down", positions: [[0, 0], [1, 1], [2, 2]] },
    { key: "diag-up", positions: [[0, 2], [1, 1], [2, 0]] },
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

function spinKey(spinId) {
    return `slots_spin:${String(spinId || "").trim()}`;
}

function pendingSpinListKey(address) {
    return `slots_pending_spins:${String(address || "").trim().toLowerCase()}`;
}

function settleLockKey(spinId) {
    return `slots_settle_lock:${String(spinId || "").trim()}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSettleLock(spinId, timeoutMs = 3000) {
    const key = settleLockKey(spinId);
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(key, token, { nx: true, ex: 30 });
        if (acquired === 'OK' || acquired === true) {
            return { key, token };
        }
        await sleep(120);
    }
    return null;
}

async function releaseSettleLock(lock) {
    if (!lock || !lock.key || !lock.token) return;
    try {
        const currentToken = await kv.get(lock.key);
        if (currentToken === lock.token) {
            await kv.del(lock.key);
        }
    } catch (_) {
        // ignore release failures
    }
}

async function getContractContext() {
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
    try {
        decimals = await contract.decimals();
    } catch (_) {
        decimals = 18n;
    }

    return { contract, decimals, lossPoolAddress };
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
    const totalWeight = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
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

async function spinBoard(address) {
    let hitRate = TRIPLE_HIT_RATE;
    if (address) {
        const bias = await kv.get(`user_win_bias:${address.toLowerCase()}`);
        if (bias !== null && bias !== undefined) {
            hitRate = Number(bias);
        }
    }

    if (Math.random() < hitRate) {
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

function formatOutcomeLabel(result) {
    return result.type === "lose"
        ? "未中"
        : (result.tripleCount > 0
            ? `${result.tripleCount} 條三連${result.doubleCount > 0 ? ` + ${result.doubleCount} 條雙連` : ""}`
            : `${result.doubleCount} 條雙連`);
}

function buildSpinResponse(record, extra = {}) {
    return {
        success: true,
        spinId: record.spinId,
        settlementStatus: record.status,
        columns: record.columns,
        resultType: record.resultType,
        multiplier: record.multiplier,
        totalMultiplier: record.multiplier,
        isWin: Number(record.multiplier || 0) > 1,
        winLines: record.winLines || [],
        lineWins: record.lineWins || [],
        tripleCount: Number(record.tripleCount || 0),
        doubleCount: Number(record.doubleCount || 0),
        amount: Number(record.amount || 0),
        payoutAmount: Number(record.payoutAmount || 0),
        txHash: record.txHash || "",
        totalBet: record.totalBet,
        vipLevel: record.vipLevel,
        maxBet: record.maxBet,
        error: record.status === "failed" ? String(record.error || "老虎機結算失敗") : "",
        betTransferred: Boolean(record.betTransferred),
        createdAt: record.createdAt || "",
        settledAt: record.settledAt || "",
        ...extra
    };
}

async function loadPendingSpinIds(address) {
    const raw = await kv.get(pendingSpinListKey(address));
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => String(item || "").trim())
        .filter(Boolean);
}

async function savePendingSpinIds(address, spinIds) {
    const cleanIds = Array.from(new Set((spinIds || []).map((item) => String(item || "").trim()).filter(Boolean)));
    if (!cleanIds.length) {
        await kv.del(pendingSpinListKey(address));
        return [];
    }
    await kv.set(pendingSpinListKey(address), cleanIds, { ex: SLOTS_SPIN_TTL_SECONDS });
    return cleanIds;
}

async function appendPendingSpinId(address, spinId) {
    const current = await loadPendingSpinIds(address);
    current.push(spinId);
    return savePendingSpinIds(address, current);
}

async function removePendingSpinId(address, spinId) {
    const current = await loadPendingSpinIds(address);
    return savePendingSpinIds(address, current.filter((item) => item !== String(spinId || "").trim()));
}

async function loadPendingSpins(address) {
    const spinIds = await loadPendingSpinIds(address);
    if (!spinIds.length) return [];

    const spins = [];
    const remainingIds = [];
    for (const currentSpinId of spinIds) {
        const spin = await kv.get(spinKey(currentSpinId));
        if (!spin || String(spin.address || "").toLowerCase() !== String(address || "").toLowerCase()) {
            continue;
        }
        if (spin.status === "settled" || spin.status === "failed") {
            continue;
        }
        spins.push(spin);
        remainingIds.push(currentSpinId);
    }

    if (remainingIds.length !== spinIds.length) {
        await savePendingSpinIds(address, remainingIds);
    }

    spins.sort((left, right) => Date.parse(String(left.createdAt || "")) - Date.parse(String(right.createdAt || "")));
    return spins;
}

async function settleSlotSpin({ spinId, sessionAddress }) {
    const lock = await acquireSettleLock(spinId);
    if (!lock) {
        return null;
    }

    try {
        const key = spinKey(spinId);
        let spin = await kv.get(key);
        if (!spin || String(spin.address || "").toLowerCase() !== sessionAddress) {
            return null;
        }
        if (spin.status === "settled" || spin.status === "failed") {
            return spin;
        }

        const { contract, decimals, lossPoolAddress } = await getContractContext();
        const betWei = BigInt(spin.betWei || "0");
        let payoutWei = BigInt(spin.payoutWei || "0");
        let netWei = BigInt(spin.netWei || "0");

        spin = {
            ...spin,
            status: "settling",
            updatedAt: new Date().toISOString()
        };
        await kv.set(key, spin, { ex: SLOTS_SPIN_TTL_SECONDS });

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

        let betTransferred = spin.betTransferred || false;
        let betTxHash = spin.betTxHash || "";

        try {
            // 1. First transaction: Transfer bet from user to loss pool
            if (!betTransferred) {
                const betTx = await sendManagedContractTx(contract, "adminTransfer", [sessionAddress, lossPoolAddress, betWei], {
                    gasLimit: 120000,
                    txSource: TX_SOURCE,
                    txMeta: { spinId, stage: "bet_transfer" }
                });

                betTransferred = true;
                betTxHash = betTx.hash;
                spin = {
                    ...spin,
                    betTransferred: true,
                    betTxHash: betTx.hash,
                    updatedAt: new Date().toISOString()
                };
                await kv.set(key, spin, { ex: SLOTS_SPIN_TTL_SECONDS });
            }

            // 2. Second transaction: Transfer payout if win
            let payoutTxHash = "";
            if (payoutWei > 0n) {
                const payoutTx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, sessionAddress, payoutWei, {
                    gasLimit: 140000,
                    txSource: TX_SOURCE,
                    txMeta: { spinId, stage: "payout_transfer" }
                });
                payoutTxHash = payoutTx.hash;
            }

            const finalTxHash = payoutTxHash || betTxHash;
            
            if (buffAdjusted.changed) {
                await persistSettlementBuffProfile(buffAdjusted.profile);
            }

            const totalBetRaw = await kv.incrbyfloat(`total_bet:${sessionAddress}`, parseFloat(spin.amount));
            const totalBet = parseFloat(totalBetRaw).toFixed(2);
            const vipStatus = buildVipStatus(parseFloat(totalBet));
            const lineSummary = (spin.lineWins || [])
                .map((item) => `${item.line}:${item.type === "triple" ? `${item.symbol} ${item.multiplier}x` : `${item.symbol} 對子 ${item.multiplier}x`}`)
                .join(", ");

            await recordGameHistory({
                address: sessionAddress,
                game: "slots",
                gameLabel: "老虎機",
                outcome: spin.resultType === "lose" ? "lose" : "win",
                outcomeLabel: formatOutcomeLabel(spin),
                betWei,
                payoutWei,
                netWei,
                multiplier: Number(spin.multiplier || 0),
                txHash: finalTxHash,
                details: `${spin.columns.map((column) => column.map((symbol) => symbol.emoji).join("")).join(" | ")}${lineSummary ? ` / ${lineSummary}` : ""}`,
                decimals
            });

            const settledRecord = {
                ...spin,
                status: "settled",
                txHash: finalTxHash,
                totalBet,
                vipLevel: vipStatus.vipLevel,
                maxBet: vipStatus.maxBet,
                payoutAmount: Number(ethers.formatUnits(payoutWei, decimals)),
                payoutWei: payoutWei.toString(),
                netWei: netWei.toString(),
                settledAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await kv.set(key, settledRecord, { ex: SLOTS_SPIN_TTL_SECONDS });
            await removePendingSpinId(sessionAddress, spinId);
            return settledRecord;

        } catch (blockchainError) {
            const errorMessage = String(blockchainError && (blockchainError.message || blockchainError.shortMessage || "") || "");
            if (errorMessage.indexOf("鏈上交易繁忙") !== -1) {
                return { ...spin, status: "pending", updatedAt: new Date().toISOString() };
            }

            const failedRecord = {
                ...spin,
                status: betTransferred ? "failed_payout" : "failed",
                error: blockchainError.message,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await kv.set(key, failedRecord, { ex: SLOTS_SPIN_TTL_SECONDS });
            
            // Only remove from pending if it's a total failure (no bet transferred)
            if (!betTransferred) {
                await removePendingSpinId(sessionAddress, spinId);
            }
            return failedRecord;
        }
    } finally {
        await releaseSettleLock(lock);
    }
}

async function createPendingSpin({ sessionAddress, amount, currentTotalBet, decimals }) {
    const board = await spinBoard(sessionAddress);
    const result = evaluateResult(board);
    const betWei = ethers.parseUnits(String(amount), decimals);
    let payoutWei = 0n;
    let netWei = -betWei;

    if (result.multiplier > 0) {
        const payoutBigInt = BigInt(Math.floor(result.multiplier * 100));
        payoutWei = (betWei * payoutBigInt) / 100n;
        netWei = payoutWei - betWei;
    }

    const spinId = randomUUID();
    const spinRecord = {
        spinId,
        address: sessionAddress,
        amount: Number(amount),
        status: "pending",
        columns: board.map((column) => column.map((symbol) => ({ name: symbol.name, emoji: symbol.emoji }))),
        resultType: result.type,
        multiplier: Number(result.multiplier || 0),
        winLines: result.winLines || [],
        lineWins: result.lineWins || [],
        tripleCount: Number(result.tripleCount || 0),
        doubleCount: Number(result.doubleCount || 0),
        payoutAmount: Number(ethers.formatUnits(payoutWei, decimals)),
        payoutWei: payoutWei.toString(),
        netWei: netWei.toString(),
        betWei: betWei.toString(),
        totalBet: Number(currentTotalBet || 0).toFixed(2),
        vipLevel: buildVipStatus(currentTotalBet).vipLevel,
        maxBet: buildVipStatus(currentTotalBet).maxBet,
        betTransferred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await kv.set(spinKey(spinId), spinRecord, { ex: SLOTS_SPIN_TTL_SECONDS });
    await appendPendingSpinId(sessionAddress, spinId);
    return spinRecord;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, action, spinId } = req.body || {};
    const currentAction = String(action || "spin").trim().toLowerCase();

    if (!sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        const sessionData = await getSession(sessionId);
        if (!sessionData || !sessionData.address) {
            return res.status(403).json({ error: "會話過期，請重新登入" });
        }

        const sessionAddress = normalizeAddressOrThrow(sessionData.address, "session address");
        if (address) {
            const requestAddress = normalizeAddressOrThrow(address, "address");
            if (requestAddress !== sessionAddress) {
                return res.status(403).json({ error: "地址與會話不一致" });
            }
        }

        if (currentAction === "status") {
            const targetSpinId = String(spinId || "").trim();
            if (targetSpinId) {
                let spin = await kv.get(spinKey(targetSpinId));
                if (!spin || String(spin.address || "").toLowerCase() !== sessionAddress) {
                    return res.status(404).json({ success: false, error: "找不到待結算的老虎機牌局" });
                }

                if (spin.status === "pending" || spin.status === "settling") {
                    const settled = await settleSlotSpin({ spinId: spin.spinId, sessionAddress });
                    if (settled) spin = settled;
                }

                return res.status(200).json(buildSpinResponse(spin));
            }

            const pendingSpins = await loadPendingSpins(sessionAddress);
            let processedSpin = null;
            if (pendingSpins.length > 0) {
                processedSpin = await settleSlotSpin({ spinId: pendingSpins[0].spinId, sessionAddress });
            }

            const nextSpins = await loadPendingSpins(sessionAddress);
            return res.status(200).json({
                success: true,
                spins: nextSpins.map((spin) => buildSpinResponse(spin)),
                updates: processedSpin && processedSpin.status !== "pending" && processedSpin.status !== "settling"
                    ? [buildSpinResponse(processedSpin)]
                    : []
            });
        }

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ error: "缺少必要參數" });
        }

        const { contract, decimals } = await getContractContext();
        const pendingSpins = await loadPendingSpins(sessionAddress);

        const currentTotalBet = Number(await kv.get(`total_bet:${sessionAddress}`) || 0);
        const currentVipStatus = buildVipStatus(currentTotalBet);
        try {
            assertVipBetLimit(amount, currentTotalBet);
        } catch (betError) {
            return res.status(400).json({
                error: betError.message,
                vipLevel: currentVipStatus.vipLevel,
                maxBet: currentVipStatus.maxBet
            });
        }

        const userBalance = await contract.balanceOf(sessionAddress);
        const betWei = ethers.parseUnits(String(amount), decimals);
        const reservedPendingWei = pendingSpins.reduce((sum, spin) => {
            if (spin.betTransferred) return sum;
            return sum + BigInt(spin.betWei || "0");
        }, 0n);
        if (userBalance < (betWei + reservedPendingWei)) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        const pendingSpin = await createPendingSpin({
            sessionAddress,
            amount,
            currentTotalBet,
            decimals
        });

        return res.status(200).json(buildSpinResponse(pendingSpin));
    } catch (error) {
        console.error("Slots API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
