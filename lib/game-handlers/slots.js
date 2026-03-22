// api/slots.js - 老虎機
import { kv } from '@vercel/kv';
import { randomUUID } from "crypto";
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { settlementService } from "../settlement-service.js";
import { recordTotalBet } from "../total-bet.js";

const TX_SOURCE = "slots";
const SLOTS_SPIN_TTL_SECONDS = 900;
const SETTLEMENT_VERSION = 2;

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
    { key: "bottom", positions: [[0, 2], [1, 1], [2, 2]] },
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
        if (acquired === "OK" || acquired === true) {
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

function resolveFinalTxHash(record) {
    return String(record.finalTxHash || record.payoutTxHash || record.betTxHash || record.txHash || "").trim();
}

function buildSpinDetails(record) {
    const columns = Array.isArray(record.columns) ? record.columns : [];
    const boardText = columns
        .map((column) => Array.isArray(column) ? column.map((symbol) => symbol && symbol.emoji ? symbol.emoji : "").join("") : "")
        .join(" | ");
    const lineSummary = (Array.isArray(record.lineWins) ? record.lineWins : [])
        .map((item) => `${item.line}:${item.type === "triple" ? `${item.symbol} ${item.multiplier}x` : `${item.symbol} 對子 ${item.multiplier}x`}`)
        .join(", ");
    return `${boardText}${lineSummary ? ` / ${lineSummary}` : ""}`;
}

function buildSpinResponse(record, extra = {}) {
    const finalTxHash = resolveFinalTxHash(record);
    const payoutStatus = String(record.payoutStatus || "").trim().toLowerCase() || (record.status === "settled" ? "settled" : "");
    return {
        success: true,
        spinId: record.spinId,
        settlementStatus: record.status,
        status: record.status,
        settlementStage: record.settlementStage || "",
        columns: record.columns,
        resultType: record.resultType,
        multiplier: record.multiplier,
        totalMultiplier: record.multiplier,
        isWin: Number(record.multiplier || 0) > 0,
        winLines: record.winLines || [],
        lineWins: record.lineWins || [],
        tripleCount: Number(record.tripleCount || 0),
        doubleCount: Number(record.doubleCount || 0),
        amount: Number(record.amount || 0),
        payoutAmount: Number(record.payoutAmount || 0),
        betStatus: record.betStatus || (record.betTransferred ? "settled" : "pending"),
        payoutStatus: payoutStatus || (Number(record.payoutAmount || 0) > 0 ? "pending" : "not_needed"),
        betTxHash: record.betTxHash || "",
        payoutTxHash: record.payoutTxHash || "",
        finalTxHash,
        txHash: finalTxHash || record.betTxHash || "",
        totalBet: record.totalBet,
        vipLevel: record.vipLevel,
        maxBet: record.maxBet,
        totalBetRecorded: Boolean(record.totalBetRecorded),
        error: record.status === "failed" || record.status === "failed_payout"
            ? String(record.settlementError || record.error || "老虎機結算失敗")
            : "",
        settlementError: String(record.settlementError || record.error || ""),
        betTransferred: record.betStatus === "settled" || Boolean(record.betTransferred),
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
        const payoutStatus = String(spin.payoutStatus || "").trim().toLowerCase();
        if (spin.status === "failed_payout" || payoutStatus === "failed" || payoutStatus === "pending" || payoutStatus === "settling" || spin.status === "pending" || spin.status === "settling") {
            spins.push(spin);
            remainingIds.push(currentSpinId);
        }
    }

    if (remainingIds.length !== spinIds.length) {
        await savePendingSpinIds(address, remainingIds);
    }

    spins.sort((left, right) => Date.parse(String(left.createdAt || "")) - Date.parse(String(right.createdAt || "")));
    return spins;
}

async function recordSettledSpinHistory(spin, sessionAddress, decimals) {
    const betWei = BigInt(spin.betWei || "0");
    const payoutWei = BigInt(spin.payoutWei || "0");
    const netWei = BigInt(spin.netWei || "0");

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
        txHash: resolveFinalTxHash(spin),
        details: buildSpinDetails(spin),
        decimals
    });
}

async function finalizeTotalBetState(sessionAddress, amount, existingTotalBet) {
    if (existingTotalBet) {
        const parsedExisting = Number(existingTotalBet);
        if (Number.isFinite(parsedExisting) && parsedExisting > 0) {
            const vipStatus = buildVipStatus(parsedExisting);
            return {
                totalBet: parsedExisting.toFixed(2),
                vipLevel: vipStatus.vipLevel,
                maxBet: vipStatus.maxBet,
                totalBetRecorded: true
            };
        }
    }

    const totalBetRaw = await recordTotalBet(sessionAddress, parseFloat(amount));
    const totalBetValue = Number(totalBetRaw || 0);
    const vipStatus = buildVipStatus(totalBetValue);
    return {
        totalBet: totalBetValue.toFixed(2),
        vipLevel: vipStatus.vipLevel,
        maxBet: vipStatus.maxBet,
        totalBetRecorded: true
    };
}

async function settleSlotSpin({ spinId, sessionAddress }) {
    const lock = await acquireSettleLock(spinId);
    if (!lock) return null;

    try {
        const key = spinKey(spinId);
        let spin = await kv.get(key);
        if (!spin || String(spin.address || "").toLowerCase() !== sessionAddress) return null;
        if (spin.status === "settled" || spin.status === "failed") return spin;

        const decimals = await settlementService.getDecimals();
        const betWei = BigInt(spin.betWei || "0");
        let payoutWei = BigInt(spin.payoutWei || "0");
        let netWei = BigInt(spin.netWei || "0");
        let buffProfile = spin.buffProfile || null;
        let buffChanged = Boolean(spin.buffChanged);

        if (Number(spin.settlementVersion || 0) < SETTLEMENT_VERSION) {
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
            buffChanged = buffAdjusted.changed;
            buffProfile = buffAdjusted.changed ? buffAdjusted.profile : buffProfile;
        }

        const needsBetTransfer = !(spin.betStatus === "settled" || spin.betTransferred);
        const payoutRequired = payoutWei > 0n;
        const nextStage = needsBetTransfer ? "bet" : (payoutRequired ? "payout" : "completed");

        spin = {
            ...spin,
            settlementVersion: SETTLEMENT_VERSION,
            payoutWei: payoutWei.toString(),
            netWei: netWei.toString(),
            buffChanged,
            buffProfile,
            status: payoutRequired ? "settling" : "pending",
            payoutStatus: payoutRequired ? "settling" : "not_needed",
            settlementStage: nextStage,
            updatedAt: new Date().toISOString()
        };
        await kv.set(key, spin, { ex: SLOTS_SPIN_TTL_SECONDS });

        try {
            const results = await settlementService.settle({
                userAddress: sessionAddress,
                betWei: needsBetTransfer ? betWei : 0n,
                payoutWei,
                source: TX_SOURCE,
                meta: { spinId }
            });

            if (buffChanged && buffProfile) {
                await persistSettlementBuffProfile(buffProfile);
            }

            const totalBetState = await finalizeTotalBetState(sessionAddress, spin.amount, spin.totalBetRecorded ? spin.totalBet : null);
            const finalTxHash = results.payoutTxHash || spin.payoutTxHash || results.betTxHash || spin.betTxHash || "";
            const settledRecord = {
                ...spin,
                status: "settled",
                betTransferred: true,
                betStatus: "settled",
                payoutStatus: payoutRequired ? "settled" : "not_needed",
                settlementStage: "completed",
                settlementError: "",
                error: "",
                betTxHash: results.betTxHash || spin.betTxHash,
                payoutTxHash: results.payoutTxHash || spin.payoutTxHash || "",
                finalTxHash,
                totalBet: totalBetState.totalBet,
                vipLevel: totalBetState.vipLevel,
                maxBet: totalBetState.maxBet,
                totalBetRecorded: totalBetState.totalBetRecorded,
                payoutAmount: Number(ethers.formatUnits(payoutWei, decimals)),
                payoutWei: payoutWei.toString(),
                netWei: netWei.toString(),
                settledAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await kv.set(key, settledRecord, { ex: SLOTS_SPIN_TTL_SECONDS });
            await removePendingSpinId(sessionAddress, spinId);
            await recordSettledSpinHistory(settledRecord, sessionAddress, decimals);
            return settledRecord;
        } catch (error) {
            const results = error.results || {};
            const betActuallyTransferred = !needsBetTransfer || Boolean(results.betTransferred) || spin.betStatus === "settled" || spin.betTransferred;
            const totalBetState = betActuallyTransferred
                ? await finalizeTotalBetState(sessionAddress, spin.amount, spin.totalBetRecorded ? spin.totalBet : null)
                : {
                    totalBet: spin.totalBet,
                    vipLevel: spin.vipLevel,
                    maxBet: spin.maxBet,
                    totalBetRecorded: Boolean(spin.totalBetRecorded)
                };

            const failedRecord = {
                ...spin,
                status: betActuallyTransferred ? "failed_payout" : "failed",
                betTransferred: betActuallyTransferred,
                betStatus: betActuallyTransferred ? "settled" : "failed",
                payoutStatus: betActuallyTransferred ? "failed" : spin.payoutStatus || "pending",
                settlementStage: betActuallyTransferred ? "payout" : "bet",
                betTxHash: results.betTxHash || spin.betTxHash || "",
                payoutTxHash: results.payoutTxHash || spin.payoutTxHash || "",
                finalTxHash: results.payoutTxHash || spin.payoutTxHash || results.betTxHash || spin.betTxHash || "",
                settlementError: error.message,
                error: error.message,
                totalBet: totalBetState.totalBet,
                vipLevel: totalBetState.vipLevel,
                maxBet: totalBetState.maxBet,
                totalBetRecorded: totalBetState.totalBetRecorded,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await kv.set(key, failedRecord, { ex: SLOTS_SPIN_TTL_SECONDS });
            if (!betActuallyTransferred) {
                await removePendingSpinId(sessionAddress, spinId);
            }
            return failedRecord;
        }
    } finally {
        await releaseSettleLock(lock);
    }
}

async function createSpinAfterBet({ sessionAddress, amount, currentTotalBet, decimals }) {
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

    const spinId = randomUUID();
    const betResults = await settlementService.settle({
        userAddress: sessionAddress,
        betWei,
        payoutWei: 0n,
        source: TX_SOURCE,
        meta: { spinId }
    });

    const totalBetRaw = await recordTotalBet(sessionAddress, parseFloat(amount));
    const totalBetValue = Number(totalBetRaw || 0);
    const vipStatus = buildVipStatus(totalBetValue || currentTotalBet || 0);
    const payoutAmount = Number(ethers.formatUnits(payoutWei, decimals));
    const nowIso = new Date().toISOString();
    const payoutRequired = payoutWei > 0n;

    const spinRecord = {
        settlementVersion: SETTLEMENT_VERSION,
        spinId,
        address: sessionAddress,
        amount: Number(amount),
        status: payoutRequired ? "pending" : "settled",
        settlementStage: payoutRequired ? "payout" : "completed",
        columns: board.map((column) => column.map((symbol) => ({ name: symbol.name, emoji: symbol.emoji }))),
        resultType: result.type,
        multiplier: Number(result.multiplier || 0),
        winLines: result.winLines || [],
        lineWins: result.lineWins || [],
        tripleCount: Number(result.tripleCount || 0),
        doubleCount: Number(result.doubleCount || 0),
        payoutAmount,
        payoutWei: payoutWei.toString(),
        netWei: netWei.toString(),
        betWei: betWei.toString(),
        totalBet: totalBetValue.toFixed(2),
        vipLevel: vipStatus.vipLevel,
        maxBet: vipStatus.maxBet,
        totalBetRecorded: true,
        betTransferred: true,
        betStatus: "settled",
        payoutStatus: payoutRequired ? "pending" : "not_needed",
        betTxHash: betResults.betTxHash || "",
        payoutTxHash: "",
        finalTxHash: payoutRequired ? "" : (betResults.betTxHash || ""),
        buffChanged: Boolean(buffAdjusted.changed),
        buffProfile: buffAdjusted.changed ? buffAdjusted.profile : null,
        settlementError: "",
        createdAt: nowIso,
        updatedAt: nowIso,
        settledAt: payoutRequired ? "" : nowIso
    };

    await kv.set(spinKey(spinId), spinRecord, { ex: SLOTS_SPIN_TTL_SECONDS });
    if (payoutRequired) {
        await appendPendingSpinId(sessionAddress, spinId);
    } else {
        await recordSettledSpinHistory(spinRecord, sessionAddress, decimals);
    }
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

                if (["pending", "settling", "failed_payout"].includes(String(spin.status || "").toLowerCase()) ||
                    ["pending", "settling", "failed"].includes(String(spin.payoutStatus || "").toLowerCase())) {
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
                updates: processedSpin && !["pending", "settling"].includes(String(processedSpin.status || "").toLowerCase())
                    ? [buildSpinResponse(processedSpin)]
                    : []
            });
        }

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ error: "缺少必要參數" });
        }

        const contract = settlementService.contract;
        const decimals = await settlementService.getDecimals();
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
            const alreadyTransferred = spin.betStatus === "settled" || spin.betTransferred;
            if (alreadyTransferred) return sum;
            return sum + BigInt(spin.betWei || "0");
        }, 0n);
        if (userBalance < (betWei + reservedPendingWei)) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        const spinRecord = await createSpinAfterBet({
            sessionAddress,
            amount,
            currentTotalBet,
            decimals
        });

        return res.status(200).json(buildSpinResponse(spinRecord));
    } catch (error) {
        console.error("Slots API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
