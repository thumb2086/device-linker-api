import coinflipHandler from "../lib/game-handlers/coinflip.js";
import rouletteHandler from "../lib/game-handlers/roulette.js";
import horseHandler from "../lib/game-handlers/horse.js";
import slotsHandler from "../lib/game-handlers/slots.js";
import blackjackHandler from "../lib/game-handlers/blackjack.js";
import dragonHandler from "../lib/game-handlers/dragon.js";
import sicboHandler from "../lib/game-handlers/sicbo.js";
import bingoHandler from "../lib/game-handlers/bingo.js";
import crashHandler from "../lib/game-handlers/crash.js";
import { kv } from "@vercel/kv";
import { getSession } from "../lib/session-store.js";
import { randomUUID } from "crypto";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";

const GAME_HANDLERS = {
    coinflip: coinflipHandler,
    roulette: rouletteHandler,
    horse: horseHandler,
    slots: slotsHandler,
    blackjack: blackjackHandler,
    dragon: dragonHandler,
    sicbo: sicboHandler,
    bingo: bingoHandler,
    crash: crashHandler
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
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (body && typeof body === "object" && !Array.isArray(body)) {
            return originalJson({ ...body, requestId });
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
    let session = null;
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
