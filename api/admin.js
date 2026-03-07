import { randomBytes, scryptSync } from "crypto";
import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";
import { DEFAULT_RESET_THRESHOLD, resetHighTotalBets } from "../lib/ops/reset-high-total-bets.js";

const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const CUSTODY_PASSWORD_MIN = 6;
const CUSTODY_PASSWORD_MAX = 128;
const MAX_CUSTODY_LIST_LIMIT = 500;

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function getSafeBody(req) {
    if (!req || typeof req !== "object") return {};
    const rawBody = req.body;
    if (!rawBody) return {};

    if (typeof rawBody === "string") {
        try {
            const parsed = JSON.parse(rawBody);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }

    return typeof rawBody === "object" ? rawBody : {};
}

function normalizeAddress(rawValue) {
    try {
        return ethers.getAddress(String(rawValue || "").trim()).toLowerCase();
    } catch {
        return "";
    }
}

function normalizeText(rawValue, maxLength = 64) {
    if (typeof rawValue !== "string") return "";
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return "";
    return normalized.slice(0, maxLength);
}

function normalizeUsername(rawValue) {
    return normalizeText(rawValue, 32);
}

function hasOuterWhitespace(value) {
    return typeof value === "string" && value.trim() !== value;
}

function normalizeListLimit(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return Math.min(MAX_CUSTODY_LIST_LIMIT, Math.floor(parsed));
}

function custodyUserKey(username) {
    return `custody_user:${username}`;
}

function hashPassword(password, saltHex) {
    return scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

function toTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

async function listCustodyUsers(limit) {
    const keys = [];
    for await (const key of kv.scanIterator({ match: "custody_user:*", count: 1000 })) {
        keys.push(key);
    }

    const users = [];
    const chunkSize = 100;

    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunkKeys.map((key) => kv.get(key)));

        chunkKeys.forEach((key, chunkIndex) => {
            const record = chunkValues[chunkIndex];
            if (!record || typeof record !== "object") return;
            const username = key.slice("custody_user:".length);
            users.push({
                username,
                address: record.address || null,
                createdAt: record.createdAt || null,
                updatedAt: record.updatedAt || null,
                hasSaltHex: !!record.saltHex,
                hasPasswordHash: !!record.passwordHash,
                hasPublicKey: !!record.publicKey
            });
        });
    }

    users.sort((left, right) => {
        const rightTs = toTimestamp(right.updatedAt || right.createdAt);
        const leftTs = toTimestamp(left.updatedAt || left.createdAt);
        if (rightTs !== leftTs) return rightTs - leftTs;
        return String(left.username).localeCompare(String(right.username));
    });

    return {
        total: users.length,
        users: users.slice(0, limit)
    };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method Not Allowed" });
    }

    try {
        const body = getSafeBody(req);
        const action = String(body.action || "reset_total_bets").trim().toLowerCase();
        const sessionId = normalizeSessionId(body.sessionId);
        const dryRun = body.dryRun === true || String(body.dryRun || "").trim().toLowerCase() === "true";
        const configuredAdminAddress = normalizeAddress(process.env.OPS_ADMIN_ADDRESS || ADMIN_WALLET_ADDRESS);

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "Missing sessionId" });
        }

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "Session expired" });
        }

        const sessionAddress = normalizeAddress(session.address);
        if (!configuredAdminAddress || sessionAddress !== configuredAdminAddress) {
            return res.status(403).json({ success: false, error: "Current session is not an admin wallet" });
        }

        if (action === "list_custody_users") {
            const limit = normalizeListLimit(body.limit);
            const result = await listCustodyUsers(limit);
            return res.status(200).json({
                success: true,
                users: result.users,
                total: result.total,
                returned: result.users.length,
                limit
            });
        }

        if (action === "inspect_custody_user") {
            const username = normalizeUsername(body.username);
            if (!CUSTODY_USERNAME_REGEX.test(username)) {
                return res.status(400).json({ success: false, error: "Invalid username format" });
            }

            const record = await kv.get(custodyUserKey(username));
            return res.status(200).json({
                success: true,
                username,
                exists: !!record,
                address: record?.address || null,
                createdAt: record?.createdAt || null,
                updatedAt: record?.updatedAt || null,
                hasSaltHex: !!record?.saltHex,
                hasPasswordHash: !!record?.passwordHash,
                hasPublicKey: !!record?.publicKey
            });
        }

        if (action === "reset_custody_password") {
            const username = normalizeUsername(body.username);
            const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

            if (!CUSTODY_USERNAME_REGEX.test(username)) {
                return res.status(400).json({ success: false, error: "Invalid username format" });
            }
            if (newPassword.length < CUSTODY_PASSWORD_MIN || newPassword.length > CUSTODY_PASSWORD_MAX) {
                return res.status(400).json({ success: false, error: "Password length must be 6-128" });
            }
            if (hasOuterWhitespace(newPassword)) {
                return res.status(400).json({ success: false, error: "Password cannot start or end with spaces" });
            }

            const key = custodyUserKey(username);
            const record = await kv.get(key);
            if (!record || typeof record !== "object" || !record.address) {
                return res.status(404).json({ success: false, error: "Custody user not found" });
            }

            const saltHex = randomBytes(16).toString("hex");
            await kv.set(key, {
                ...record,
                username,
                saltHex,
                passwordHash: hashPassword(newPassword, saltHex),
                updatedAt: new Date().toISOString()
            });

            return res.status(200).json({
                success: true,
                username,
                address: record.address,
                message: "Custody password reset"
            });
        }

        if (action !== "reset_total_bets") {
            return res.status(400).json({
                success: false,
                error: `Unsupported action: ${action}`,
                supportedActions: [
                    "reset_total_bets",
                    "list_custody_users",
                    "inspect_custody_user",
                    "reset_custody_password"
                ]
            });
        }

        const result = await resetHighTotalBets({
            threshold: DEFAULT_RESET_THRESHOLD,
            dryRun
        });
        return res.status(200).json(result);
    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Admin API failed"
        });
    }
}
