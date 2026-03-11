import { kv } from "@vercel/kv";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { ADMIN_WALLET_ADDRESS, CONTRACT_ADDRESS } from "../lib/config.js";
import { getRoundInfo } from "../lib/auto-round.js";
import { buildVipStatus } from "../lib/vip.js";
import { getSession, saveSession } from "../lib/session-store.js";
import { ensureDisplayName, getDisplayName, setDisplayName } from "../lib/user-profile.js";
import { buildRewardSummary } from "../lib/reward-center.js";
import { settlementService } from "../lib/settlement-service.js";
import {
    createIssueReport,
    listAnnouncements,
    listIssueReports,
    sanitizeIssueInput,
    validateIssueInput
} from "../lib/support-center.js";

async function getDecimals() {
    return settlementService.getDecimals();
}

const ALLOWED_PLATFORMS = new Set(["android", "ios", "web", "macos", "windows", "linux", "unknown"]);
const ALLOWED_CLIENT_TYPES = new Set(["mobile", "desktop", "web", "server", "unknown"]);
const DEEP_LINK_SCHEME = "dlinker://login";
const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const CUSTODY_PASSWORD_MIN = 6;
const CUSTODY_PASSWORD_MAX = 128;
const CUSTODY_REGISTER_BONUS = "100000";
const AUTH_API_BUILD = "2026-03-11-user-opt-v3";

function normalizeText(value, fallback = "unknown", maxLength = 64) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized.slice(0, maxLength);
}

function trimRawText(value, maxLength = 256) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizeSessionId(rawSessionId) {
    if (typeof rawSessionId !== "string") return null;
    const value = rawSessionId.trim();
    if (!value || value.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(value)) return null;
    return value;
}

function normalizePlatform(platform) {
    const normalized = normalizeText(platform);
    return ALLOWED_PLATFORMS.has(normalized) ? normalized : "unknown";
}

function normalizeClientType(clientType) {
    const normalized = normalizeText(clientType);
    return ALLOWED_CLIENT_TYPES.has(normalized) ? normalized : "unknown";
}

function normalizeDeviceId(deviceId) {
    return normalizeText(deviceId, "", 128);
}

function safePublicKey(publicKey) {
    if (typeof publicKey !== "string") return null;
    const value = publicKey.trim();
    if (!value || value.length > 8192) return null;
    return value;
}

function parseSessionTTL(input) {
    if (input === null || input === undefined || input === "") return null;
    if (typeof input === "string") {
        const normalized = input.trim().toLowerCase();
        if (["0", "none", "never", "off"].includes(normalized)) return null;
    }
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(3600, Math.max(60, Math.floor(parsed)));
}

function buildExpiresAt(ttlSeconds) {
    if (ttlSeconds === null) return null;
    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function buildDeepLink(sessionId) {
    return `${DEEP_LINK_SCHEME}?sessionId=${encodeURIComponent(sessionId)}`;
}

function toDecimalString(value, fallback = "0.00", fractionDigits = 2) {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    const numberValue = Number(normalized);
    if (!Number.isFinite(numberValue)) return fallback;
    return numberValue.toFixed(fractionDigits);
}

function normalizeUsername(value) {
    return normalizeText(value, "", 32);
}

function hasOuterWhitespace(value) {
    return typeof value === "string" && value.trim() !== value;
}

function custodyUserKey(username) {
    return `custody_user:${username}`;
}

function hashPassword(password, saltHex) {
    return scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

function verifyPassword(password, saltHex, expectedHashHex) {
    const actual = Buffer.from(hashPassword(password, saltHex), "hex");
    const expected = Buffer.from(String(expectedHashHex || ""), "hex");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

function buildCustodyAddress(seed) {
    const hashHex = createHash("sha256").update(seed).digest("hex");
    return ethers.getAddress(`0x${hashHex.slice(0, 40)}`).toLowerCase();
}

function buildCustodyPublicKey(seed) {
    const hashHex = createHash("sha256").update(seed).digest("hex");
    return `custody_pk_${hashHex}`;
}

function getSafeQuery(req) {
    if (!req || typeof req !== "object") return {};
    return req.query && typeof req.query === "object" ? req.query : {};
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

function buildPendingPayload(sessionData = {}) {
    return {
        status: "pending",
        platform: sessionData.platform || "unknown",
        clientType: sessionData.clientType || "unknown",
        expiresAt: sessionData.expiresAt || null
    };
}

function buildAuthPayload(sessionData, balance, totalBet, vipStatus, displayName = "", rewardProfile = null) {
    const isAdmin = String(sessionData.address || "").toLowerCase() === ADMIN_WALLET_ADDRESS.toLowerCase();
    return {
        success: true,
        status: "authorized",
        address: sessionData.address,
        displayName,
        publicKey: sessionData.publicKey || null,
        mode: sessionData.mode || "live",
        platform: sessionData.platform || "unknown",
        clientType: sessionData.clientType || "unknown",
        deviceId: sessionData.deviceId || "",
        appVersion: sessionData.appVersion || "",
        authorizedAt: sessionData.authorizedAt || null,
        expiresAt: sessionData.expiresAt || null,
        balance: toDecimalString(balance),
        totalBet: toDecimalString(totalBet),
        vipLevel: vipStatus.vipLevel,
        maxBet: toDecimalString(vipStatus.maxBet),
        isAdmin,
        rewardProfile
    };
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

async function loadUserMetrics(address) {
    const contract = settlementService.contract;
    const [balanceRaw, decimals, totalBetRaw, displayName] = await Promise.all([
        contract.balanceOf(address),
        getDecimals(),
        kv.get(`total_bet:${address.toLowerCase()}`),
        getDisplayName(address)
    ]);
    const totalBet = Number(totalBetRaw || 0);
    const rewardProfile = await buildRewardSummary(address, totalBet);
    return {
        balance: ethers.formatUnits(balanceRaw, decimals),
        totalBet,
        vipStatus: buildVipStatus(totalBet),
        displayName,
        rewardProfile
    };
}

function resolveProfileAction(action) {
    if (action === "get_profile" || action === "get") return "get";
    if (action === "set_profile" || action === "set") return "set";
    return "";
}

async function requireAuthorizedSession(sessionId) {
    const session = await getSession(sessionId);
    if (!session || !session.address) {
        throw new Error("Session expired");
    }
    return session;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Auth-Build", AUTH_API_BUILD);

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const query = getSafeQuery(req);
        const body = getSafeBody(req);
        const sessionId = normalizeSessionId(query.sessionId || body.sessionId);
        const action = normalizeText(body.action || query.action, req.method === "GET" ? "get_status" : "authorize");
        const clockOnly = String(query.clock || "") === "1";

        if (req.method === "GET") {
            if (clockOnly) {
                const game = typeof query.game === "string" ? query.game : "roulette";
                const nowTs = Date.now();
                const round = getRoundInfo(game, nowTs);
                return res.status(200).json({ success: true, serverNowTs: nowTs, ...round });
            }
            if (!sessionId) return res.status(200).json({ status: "pending" });
            const sessionData = await getSession(sessionId);
            if (!sessionData) return res.status(200).json({ status: "pending" });
            if (sessionData.status === "pending") return res.status(200).json(buildPendingPayload(sessionData));
            const blacklisted = await checkBlacklist(sessionData.address);
            if (blacklisted) {
                return res.status(200).json({
                    success: false,
                    status: "blacklisted",
                    error: `帳號已被禁止進入：${blacklisted.reason || "未註明原因"}`
                });
            }
            try {
                const metrics = await loadUserMetrics(sessionData.address);
                return res.status(200).json(
                    buildAuthPayload(sessionData, metrics.balance, metrics.totalBet, metrics.vipStatus, metrics.displayName, metrics.rewardProfile)
                );
            } catch (error) {
                console.error("User metrics read failed:", error.message);
                return res.status(200).json(
                    buildAuthPayload(sessionData, "0.00", 0, buildVipStatus(0), "", null)
                );
            }
        }

        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

        if (action === "get_status") {
            if (!sessionId) return res.status(200).json({ status: "pending" });
            const sessionData = await getSession(sessionId);
            if (!sessionData) return res.status(200).json({ status: "pending" });
            if (sessionData.status === "pending") return res.status(200).json(buildPendingPayload(sessionData));
            const blacklisted = await checkBlacklist(sessionData.address);
            if (blacklisted) {
                return res.status(200).json({
                    success: false,
                    status: "blacklisted",
                    error: `帳號已被禁止進入：${blacklisted.reason || "未註明原因"}`
                });
            }
            try {
                const metrics = await loadUserMetrics(sessionData.address);
                return res.status(200).json(
                    buildAuthPayload(sessionData, metrics.balance, metrics.totalBet, metrics.vipStatus, metrics.displayName, metrics.rewardProfile)
                );
            } catch (error) {
                return res.status(200).json(
                    buildAuthPayload(sessionData, "0.00", 0, buildVipStatus(0), "", null)
                );
            }
        }

        if (action === "create" || action === "create_session") {
            const requestedSessionId = normalizeSessionId(body.sessionId);
            const generatedSessionId = requestedSessionId || `session_${randomUUID()}`;
            const ttlSeconds = parseSessionTTL(body.ttlSeconds);
            const effectiveTtlSeconds = ttlSeconds === null && action === "create_session" ? 3600 : ttlSeconds;
            const platform = normalizePlatform(body.platform);
            const clientType = normalizeClientType(body.clientType);
            const deviceId = normalizeDeviceId(body.deviceId);
            const appVersion = normalizeText(body.appVersion, "", 32);
            await saveSession(generatedSessionId, {
                status: "pending",
                platform,
                clientType,
                deviceId,
                appVersion,
                createdAt: new Date().toISOString(),
                expiresAt: buildExpiresAt(effectiveTtlSeconds)
            }, effectiveTtlSeconds);
            return res.status(200).json({
                success: true,
                status: "pending",
                sessionId: generatedSessionId,
                deepLink: buildDeepLink(generatedSessionId),
                legacyDeepLink: `dlinker:login:${generatedSessionId}`,
                ttlSeconds: effectiveTtlSeconds,
                platform,
                clientType
            });
        }

        if (action === "custody_login") {
            const username = normalizeUsername(body.username);
            const password = typeof body.password === "string" ? body.password : "";
            const passwordHasOuterWhitespace = hasOuterWhitespace(password);
            const ttlSeconds = parseSessionTTL(body.ttlSeconds);
            const platform = normalizePlatform(body.platform);
            const clientType = normalizeClientType(body.clientType);
            const deviceId = normalizeDeviceId(body.deviceId);
            const appVersion = normalizeText(body.appVersion, "", 32);
            if (!CUSTODY_USERNAME_REGEX.test(username)) return res.status(400).json({ success: false, error: "Invalid username format" });
            if (password.length < CUSTODY_PASSWORD_MIN || password.length > CUSTODY_PASSWORD_MAX) return res.status(400).json({ success: false, error: "Password length must be 6-128" });
            const key = custodyUserKey(username);
            let custodyUser = await kv.get(key);
            let isNewAccount = false;
            let bonusGranted = false;
            let bonusTxHash = "";
            let bonusError = "";
            if (!custodyUser) {
                if (passwordHasOuterWhitespace) return res.status(400).json({ success: false, error: "Password cannot start or end with spaces" });
                isNewAccount = true;
                const saltHex = randomBytes(16).toString("hex");
                const accountSeed = `${username}:${saltHex}:${Date.now()}:${randomUUID()}`;
                custodyUser = {
                    username,
                    saltHex,
                    passwordHash: hashPassword(password, saltHex),
                    address: buildCustodyAddress(accountSeed),
                    publicKey: buildCustodyPublicKey(accountSeed),
                    createdAt: new Date().toISOString()
                };
                await kv.set(key, custodyUser);
                try {
                    const decimals = await getDecimals();
                    const bonusWei = ethers.parseUnits(CUSTODY_REGISTER_BONUS, decimals);
                    const results = await settlementService.settle({
                        userAddress: custodyUser.address,
                        betWei: 0n,
                        payoutWei: bonusWei,
                        source: "user_register_bonus"
                    });
                    if (results && results.payoutTxHash) {
                        bonusGranted = true;
                        bonusTxHash = results.payoutTxHash;
                    }
                } catch (error) {
                    bonusError = error.message || "Register bonus failed";
                }
            } else {
                const blacklisted = await checkBlacklist(custodyUser.address);
                if (blacklisted) return res.status(403).json({ success: false, error: `帳號已被禁止進入：${blacklisted.reason || "未註明原因"}` });
                if (!custodyUser.saltHex || !custodyUser.passwordHash) return res.status(500).json({ success: false, error: "Custody user record is invalid" });
                if (!verifyPassword(password, custodyUser.saltHex, custodyUser.passwordHash)) return res.status(401).json({ success: false, error: "Invalid username or password" });
                if (!custodyUser.publicKey) {
                    const fallbackSeed = `${username}:${custodyUser.address}:${custodyUser.createdAt || ""}`;
                    custodyUser.publicKey = buildCustodyPublicKey(fallbackSeed);
                    await kv.set(key, custodyUser);
                }
            }
            await ensureDisplayName(custodyUser.address, username);
            const custodySessionId = `session_${randomUUID()}`;
            await saveSession(custodySessionId, {
                status: "authorized",
                address: custodyUser.address,
                publicKey: custodyUser.publicKey,
                mode: "custody",
                accountId: username,
                platform,
                clientType,
                deviceId,
                appVersion,
                authorizedAt: new Date().toISOString(),
                expiresAt: buildExpiresAt(ttlSeconds)
            }, ttlSeconds);
            return res.status(200).json({
                success: true, status: "authorized", sessionId: custodySessionId, address: custodyUser.address, publicKey: custodyUser.publicKey,
                mode: "custody", isNewAccount, registerBonus: CUSTODY_REGISTER_BONUS, bonusGranted, bonusTxHash, bonusError
            });
        }

        const profileAction = resolveProfileAction(action);
        if (profileAction) {
            const profileSession = await getSession(body.sessionId);
            if (!profileSession || !profileSession.address) return res.status(403).json({ success: false, error: "Session expired" });
            if (profileAction === "get") {
                const displayName = await getDisplayName(profileSession.address);
                return res.status(200).json({ success: true, displayName });
            }
            const displayName = await setDisplayName(profileSession.address, body.displayName);
            return res.status(200).json({ success: true, displayName });
        }

        if (action === "get_announcements") {
            const result = await listAnnouncements({
                limit: body.limit,
                activeOnly: body.activeOnly === undefined ? true : String(body.activeOnly).trim().toLowerCase() === "true"
            });
            return res.status(200).json({ success: true, announcements: result.announcements, total: result.total, returned: result.announcements.length });
        }

        if (action === "submit_issue_report") {
            if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });
            const reportSession = await requireAuthorizedSession(sessionId);
            const input = sanitizeIssueInput({ title: body.title, category: body.category, message: body.message, contact: body.contact, pageUrl: body.pageUrl, userAgent: body.userAgent });
            const validationError = validateIssueInput(input);
            if (validationError) return res.status(400).json({ success: false, error: validationError });
            const report = await createIssueReport({ ...input, address: String(reportSession.address || "").toLowerCase(), displayName: await getDisplayName(reportSession.address), platform: reportSession.platform || normalizePlatform(body.platform), clientType: reportSession.clientType || normalizeClientType(body.clientType), deviceId: reportSession.deviceId || normalizeDeviceId(body.deviceId), appVersion: reportSession.appVersion || trimRawText(body.appVersion, 64), mode: reportSession.mode || "live" });
            return res.status(200).json({ success: true, report });
        }

        if (action === "list_my_issue_reports") {
            if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });
            const reportSession = await requireAuthorizedSession(sessionId);
            const result = await listIssueReports({ limit: body.limit, address: String(reportSession.address || "").toLowerCase() });
            return res.status(200).json({ success: true, reports: result.reports, total: result.total, returned: result.reports.length });
        }

        if (action === "get_history") {
            const address = String(body.address || "").trim();
            const page = Number(body.page || 1);
            const limit = Number(body.limit || 20);
            if (!address) return res.status(400).json({ success: false, error: "Missing address" });
            
            // Note: global fetch is available in Node 18+. 
            // If this fails, it means the environment is too old.
            const apiKey = process.env.ETHERSCAN_API_KEY || "";
            const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&address=${address}&page=${page}&offset=${limit}&sort=desc&apikey=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();
            const normalizeResText = (val) => String(val || "").replace(/\s+/g, " ").trim().toLowerCase();
            const noTx = normalizeResText(data.message).includes("no transactions found") || normalizeResText(data.result).includes("no transactions found") || (Array.isArray(data.result) && data.result.length === 0);
            if (data.status === "0" && !noTx) return res.status(200).json({ success: false, error: data.message || "Etherscan request failed", details: data.result });
            const history = (Array.isArray(data.result) ? data.result : []).map((tx) => {
                const isSend = tx.from.toLowerCase() === address.toLowerCase();
                const ts = parseInt(tx.timeStamp, 10);
                return { type: isSend ? "send" : "receive", amount: ethers.formatUnits(tx.value, 18), counterParty: isSend ? tx.to : tx.from, timestamp: ts, date: new Date(ts * 1000).toLocaleString("zh-TW", { hour12: false }), txHash: tx.hash };
            });
            return res.status(200).json({ success: true, page, limit, count: history.length, hasMore: history.length === limit, history });
        }

        if (action === "authorize") {
            const publicKey = safePublicKey(body.publicKey);
            const address = body.address;
            const blacklisted = await checkBlacklist(address);
            if (blacklisted) return res.status(403).json({ success: false, error: `帳號已被禁止進入：${blacklisted.reason || "未註明原因"}` });
            if (!sessionId || !address || !publicKey) return res.status(400).json({ success: false, error: "Missing required fields" });
            let normalizedAddress;
            try { normalizedAddress = ethers.getAddress(address).toLowerCase(); } catch { return res.status(400).json({ success: false, error: "Invalid address" }); }
            const existingSession = await getSession(sessionId);
            const ttlSeconds = parseSessionTTL(body.ttlSeconds);
            const platform = normalizePlatform(body.platform || (existingSession && existingSession.platform));
            const clientType = normalizeClientType(body.clientType || (existingSession && existingSession.clientType));
            const deviceId = normalizeDeviceId(body.deviceId || (existingSession && existingSession.deviceId));
            const appVersion = normalizeText(body.appVersion || (existingSession && existingSession.appVersion), "", 32);
            await saveSession(sessionId, { status: "authorized", address: normalizedAddress, publicKey, mode: "live", platform, clientType, deviceId, appVersion, authorizedAt: new Date().toISOString(), expiresAt: buildExpiresAt(ttlSeconds) }, ttlSeconds);
            return res.status(200).json({ success: true, status: "authorized", sessionId, address: normalizedAddress, publicKey, mode: "live", platform, clientType });
        }
        return res.status(400).json({ success: false, error: "Unsupported action", supportedActions: ["create_session", "get_status", "authorize", "custody_login", "get_profile", "set_profile", "get_history", "get_announcements", "submit_issue_report", "list_my_issue_reports"] });
    } catch (error) {
        console.error("User API Error:", error);
        return res.status(500).json({ success: false, error: error.message || "User API failed" });
    }
}
