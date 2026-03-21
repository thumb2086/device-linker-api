import coinflipHandler from "../lib/game-handlers/coinflip.js";
import rouletteHandler from "../lib/game-handlers/roulette.js";
import horseHandler from "../lib/game-handlers/horse.js";
import slotsHandler from "../lib/game-handlers/slots.js";
import blackjackHandler from "../lib/game-handlers/blackjack.js";
import dragonHandler from "../lib/game-handlers/dragon.js";
import sicboHandler from "../lib/game-handlers/sicbo.js";
import bingoHandler from "../lib/game-handlers/bingo.js";
import crashHandler from "../lib/game-handlers/crash.js";
import duelHandler from "../lib/game-handlers/duel.js";
import { kv } from "@vercel/kv";
import { getSession } from "../lib/session-store.js";
import { randomUUID } from "crypto";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";
import { getDisplayName } from "../lib/user-profile.js";
import { appendChatMessage } from "../lib/chat-store.js";

const CHAT_STREAM_KEY = "chat:stream:v1:public";
const CHAT_MAX_ITEMS = 120;
const WINNER_BARRAGE_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

const GAME_HANDLERS = {
    coinflip: coinflipHandler,
    roulette: rouletteHandler,
    horse: horseHandler,
    slots: slotsHandler,
    blackjack: blackjackHandler,
    dragon: dragonHandler,
    sicbo: sicboHandler,
    bingo: bingoHandler,
    crash: crashHandler,
    duel: duelHandler
};

const MAINTENANCE_MODE = ["1", "true", "yes", "on"].includes(String(process.env.MAINTENANCE_MODE || "").trim().toLowerCase());
const MAINTENANCE_TITLE = String(process.env.MAINTENANCE_TITLE || "系統維護中").trim();
const MAINTENANCE_MESSAGE = String(process.env.MAINTENANCE_MESSAGE || "目前暫停登入與遊戲，請稍後再試。").trim();

function getSearchParam(req, name) {
    try {
        const url = new URL(req.url, "http://localhost");
        return url.searchParams.get(name) || "";
    } catch {
        return "";
    }
}

function resolveGame(req) {
    const byQuery = getSearchParam(req, "game");
    const byBody = req.body && typeof req.body.game === "string" ? req.body.game : "";
    return String(byQuery || byBody || "").trim().toLowerCase();
}

function toSafeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function normalizeBarrageToken(value) {
    return String(value || "").trim().toLowerCase();
}

function hasWinningOutcome(body) {
    if (!body || typeof body !== "object") return false;
    if (body.isWin === true) return true;
    return toSafeNumber(body.multiplier) > 0;
}

function isPendingWinnerState(body) {
    const status = normalizeBarrageToken(body && (body.settlementStatus || body.status || body.state));
    const action = normalizeBarrageToken(body && body.action);
    if (["pending", "in_progress", "active", "waiting", "betting", "open", "settling", "spinning"].includes(status)) {
        return true;
    }
    if (["gate", "start", "spin", "status", "list", "create", "join_queue"].includes(action)) {
        return true;
    }
    return false;
}

function isFinalWinnerState(body) {
    const status = normalizeBarrageToken(body && (body.settlementStatus || body.status || body.state));
    const action = normalizeBarrageToken(body && body.action);
    if (["settled", "success", "finished", "completed", "resolved", "cashed_out"].includes(status)) {
        return !["gate", "start", "spin"].includes(action);
    }
    if (["shoot", "play", "cashout"].includes(action)) {
        return true;
    }
    return false;
}

function resolveWinnerBarrageDedupeId(body) {
    if (!body || typeof body !== "object") return "";
    const candidates = [
        body.roundId,
        body.betId,
        body.spinId,
        body.matchId,
        body.txHash
    ];
    for (const candidate of candidates) {
        const normalized = String(candidate || "").trim();
        if (normalized) return normalized;
    }
    return "";
}

function normalizeLevelFields(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const normalized = { ...body };
    if (normalized.level === undefined && normalized.vipLevel !== undefined) normalized.level = normalized.vipLevel;
    if (normalized.betLimit === undefined && normalized.maxBet !== undefined) normalized.betLimit = normalized.maxBet;
    delete normalized.vipLevel;
    delete normalized.maxBet;
    if (!normalized.levelSystem || typeof normalized.levelSystem !== "object") {
        normalized.levelSystem = { key: "legacy_v1", label: "等級制度 v1" };
    }
    return normalized;
}
function shortAddress(address) {
    const normalized = String(address || "").trim();
    if (!normalized) return "匿名玩家";
    if (normalized.length <= 12) return normalized;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function shouldEmitWinnerBarrage(body) {
    if (!body || typeof body !== "object") return false;
    if (body.success === false || body.error) return false;
    if (!hasWinningOutcome(body)) return false;
    if (isPendingWinnerState(body)) return false;
    return isFinalWinnerState(body);
}

function resolveWinnerAmount(requestBody, responseBody, game) {
    const responseAmountCandidates = [
        responseBody && responseBody.winAmount,
        responseBody && responseBody.payoutAmount,
        responseBody && responseBody.payout,
        responseBody && responseBody.totalWon,
        responseBody && responseBody.won
    ];
    for (const candidate of responseAmountCandidates) {
        const amount = toSafeNumber(candidate);
        if (amount > 0) return amount;
    }

    const betAmount = toSafeNumber(requestBody && requestBody.amount);
    if (betAmount <= 0) return 0;

    const multiplier = toSafeNumber(responseBody && responseBody.multiplier);
    if (multiplier > 0) {
        return Number((betAmount * multiplier).toFixed(2));
    }

    const defaultWinMultiplierByGame = {
        coinflip: 1.8
    };
    const gameKey = String(game || "").trim().toLowerCase();
    const fallbackMultiplier = toSafeNumber(defaultWinMultiplierByGame[gameKey]);
    if (fallbackMultiplier > 0 && responseBody && responseBody.isWin === true) {
        return Number((betAmount * fallbackMultiplier).toFixed(2));
    }
    return 0;
}

async function appendWinnerBarrage({ session, game, requestBody, responseBody }) {
    if (!session || !session.address) return;
    if (!shouldEmitWinnerBarrage(responseBody)) return;

    const dedupeId = resolveWinnerBarrageDedupeId(responseBody);
    if (!dedupeId) return;
    const dedupeKey = `winner_barrage:${String(game || "").trim().toLowerCase()}:${String(session.address || "").toLowerCase()}:${dedupeId}`;
    const firstEmission = await kv.set(dedupeKey, new Date().toISOString(), {
        nx: true,
        ex: WINNER_BARRAGE_DEDUPE_TTL_SECONDS
    });
    if (!(firstEmission === "OK" || firstEmission === true)) return;

    const gameLabelMap = {
        coinflip: "擲硬幣",
        roulette: "輪盤",
        horse: "賽馬",
        slots: "拉霸",
        blackjack: "21 點",
        dragon: "龍虎",
        sicbo: "骰寶",
        bingo: "賓果",
        crash: "暴漲"
    };
    const label = gameLabelMap[String(game || "")] || "遊戲";
    const winnerAmount = resolveWinnerAmount(requestBody, responseBody, game);
    const amountText = winnerAmount > 0 ? `（中獎額 ${winnerAmount}）` : "";
    const displayName = String(session.displayName || await getDisplayName(session.address) || "").trim();

    const payload = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: "winner",
        message: `在 ${label} 中獎！${amountText}`,
        address: String(session.address || "").toLowerCase(),
        displayName: String(displayName || shortAddress(session.address)).slice(0, 32),
        createdAt: new Date().toISOString()
    };

    await appendChatMessage(payload, "public");
}

async function checkBlacklist(address) {
    if (!address) return null;
    try {
        const blacklisted = await kv.get(`blacklist:${String(address).toLowerCase()}`);
        return blacklisted || null;
    } catch (e) {
        console.error("Blacklist check failed:", e);
        return null;
    }
}

function isAdminAddress(address) {
    if (!address) return false;
    return String(address).trim().toLowerCase() === String(ADMIN_WALLET_ADDRESS || "").trim().toLowerCase();
}

async function loadMaintenanceStatus() {
    try {
        const record = await kv.get("maintenance:status");
        if (record && typeof record === "object") {
            return {
                enabled: !!record.enabled,
                title: record.title || MAINTENANCE_TITLE,
                message: record.message || MAINTENANCE_MESSAGE
            };
        }
    } catch (error) {
        console.error("Maintenance status load failed:", error?.message || error);
    }
    return {
        enabled: MAINTENANCE_MODE,
        title: MAINTENANCE_TITLE,
        message: MAINTENANCE_MESSAGE
    };
}

export default async function handler(req, res) {
    const requestId = String(req.headers["x-request-id"] || "").trim() || `req_${randomUUID()}`;
    res.setHeader("x-request-id", requestId);
    let session = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        appendWinnerBarrage({ session, game, requestBody: req.body || {}, responseBody: body }).catch((error) => {
            console.error("appendWinnerBarrage failed:", error?.message || error);
        });
        if (body && typeof body === "object" && !Array.isArray(body)) {
            return originalJson({ ...normalizeLevelFields(body), requestId });
        }
        return originalJson(body);
    };

    const game = resolveGame(req);
    const gameHandler = GAME_HANDLERS[game];

    if (!gameHandler) {
        return res.status(400).json({
            success: false,
            error: "不支援的 game",
            supportedGames: Object.keys(GAME_HANDLERS)
        });
    }

    // 全域黑名單檢查：防止已登入但被封鎖的使用者繼續操作
    const sessionId = (req.body && req.body.sessionId) || getSearchParam(req, "sessionId");
    const maintenance = await loadMaintenanceStatus();
    if (sessionId) {
        try {
            session = await getSession(sessionId);
            if (session && session.address) {
                if (maintenance.enabled && !isAdminAddress(session.address)) {
                    return res.status(503).json({
                        success: false,
                        status: "maintenance",
                        error: maintenance.title,
                        message: maintenance.message
                    });
                }
                const blacklisted = await checkBlacklist(session.address);
                if (blacklisted) {
                    return res.status(403).json({
                        success: false,
                        status: "blacklisted",
                        error: `帳號已被禁止進入：${blacklisted.reason || "未註明原因"}`
                    });
                }
            }
        } catch (e) {
            console.error("Session/Blacklist check error in game API:", e);
        }
    }
    if (maintenance.enabled && (!session || !session.address || !isAdminAddress(session.address))) {
        return res.status(503).json({
            success: false,
            status: "maintenance",
            error: maintenance.title,
            message: maintenance.message
        });
    }

    try {
        return await gameHandler(req, res);
    } catch (error) {
        const details = error && typeof error === "object"
            ? {
                name: error.name || "",
                message: error.message || "",
                code: error.code || "",
                reason: error.reason || "",
                shortMessage: error.shortMessage || "",
                stack: error.stack || ""
            }
            : { message: String(error || "") };
        console.error("Unhandled game handler error:", { requestId, ...details });
        if (res.headersSent) return;
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            details
        });
    }
}
