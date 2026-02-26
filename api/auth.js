// api/auth.js
import { kv } from '@vercel/kv';
import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";

const DEFAULT_SESSION_TTL_SECONDS = 600;
const ALLOWED_PLATFORMS = new Set(["android", "ios", "web", "macos", "windows", "linux", "unknown"]);
const ALLOWED_CLIENT_TYPES = new Set(["mobile", "desktop", "web", "server", "unknown"]);
const DEEP_LINK_SCHEME = "dlinker://login";

function normalizeText(value, fallback = "unknown", maxLength = 64) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized.slice(0, maxLength);
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
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return DEFAULT_SESSION_TTL_SECONDS;
    return Math.min(3600, Math.max(60, Math.floor(parsed)));
}

function buildDeepLink(sessionId) {
    return `${DEEP_LINK_SCHEME}?sessionId=${encodeURIComponent(sessionId)}`;
}

function buildAuthPayload(sessionData, balance, totalBet, vipLevel) {
    return {
        status: "authorized",
        address: sessionData.address,
        publicKey: sessionData.publicKey,
        platform: sessionData.platform || "unknown",
        clientType: sessionData.clientType || "unknown",
        deviceId: sessionData.deviceId || "",
        appVersion: sessionData.appVersion || "",
        authorizedAt: sessionData.authorizedAt || null,
        balance: parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2 }),
        totalBet: parseFloat(totalBet).toFixed(2),
        vipLevel
    };
}

export default async function handler(req, res) {
    // 1. 強制處理跨域與快取（最重要！）
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const sessionId = normalizeSessionId(req.query.sessionId || (req.body && req.body.sessionId));


        // --- GET 請求：網頁端輪詢狀態 ---
        if (req.method === 'GET') {
            if (!sessionId) return res.status(200).json({ status: "pending" });

            const sessionData = await kv.get(`session:${sessionId}`);

            if (sessionData) {
                if (sessionData.status === "pending") {
                    return res.status(200).json({
                        status: "pending",
                        platform: sessionData.platform || "unknown",
                        clientType: sessionData.clientType || "unknown",
                        expiresAt: sessionData.expiresAt || null
                    });
                }

                let balance = "0.00";
                let totalBet = 0;
                let vipLevel = "普通會員";

                try {
                    const provider = new ethers.JsonRpcProvider(RPC_URL);
                    const contract = new ethers.Contract(
                        CONTRACT_ADDRESS,
                        [
                            "function balanceOf(address) view returns (uint256)",
                            "function decimals() view returns (uint8)"   // ← 關鍵：動態取得
                        ],
                        provider
                    );

                    const balanceRaw = await contract.balanceOf(sessionData.address);
                    const decimals = await contract.decimals();           // ← 這裡會抓到你的 12
                    balance = ethers.formatUnits(balanceRaw, decimals);   // ← 正確格式化

                    totalBet = await kv.get(`total_bet:${sessionData.address.toLowerCase()}`) || 0;
                    if (totalBet >= 1000) vipLevel = "👑 鑽石 VIP";
                    else if (totalBet >= 500) vipLevel = "🥇 黃金會員";
                    else if (totalBet >= 100) vipLevel = "🥈 白銀會員";

                } catch (blockchainError) {
                    console.error("無法從鏈上獲取數據，但仍允許登入:", blockchainError.message);
                }

                return res.status(200).json(buildAuthPayload(sessionData, balance, totalBet, vipLevel));
            }
            return res.status(200).json({ status: "pending" });
        }

        // --- POST 請求：建立 session 或 App 端提交授權 ---
        if (req.method === 'POST') {
            const body = req.body || {};
            const action = normalizeText(body.action, "authorize");

            if (action === "create") {
                const generatedSessionId = normalizeSessionId(body.sessionId) || `session_${randomUUID()}`;
                const ttlSeconds = parseSessionTTL(body.ttlSeconds);
                const platform = normalizePlatform(body.platform);
                const clientType = normalizeClientType(body.clientType);
                const deviceId = normalizeDeviceId(body.deviceId);
                const appVersion = normalizeText(body.appVersion, "", 32);

                await kv.set(`session:${generatedSessionId}`, {
                    status: "pending",
                    platform,
                    clientType,
                    deviceId,
                    appVersion,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
                }, { ex: ttlSeconds });

                return res.status(200).json({
                    success: true,
                    status: "pending",
                    sessionId: generatedSessionId,
                    deepLink: buildDeepLink(generatedSessionId),
                    legacyDeepLink: `dlinker:login:${generatedSessionId}`,
                    ttlSeconds,
                    platform,
                    clientType
                });
            }

            const { address } = body;
            const publicKey = safePublicKey(body.publicKey);
            if (!sessionId || !address || !publicKey) return res.status(400).json({ success: false, error: "缺少欄位" });

            let normalizedAddress;
            try {
                normalizedAddress = ethers.getAddress(address).toLowerCase();
            } catch {
                return res.status(400).json({ success: false, error: "地址格式錯誤" });
            }

            const existingSession = await kv.get(`session:${sessionId}`);
            const ttlSeconds = parseSessionTTL(body.ttlSeconds);
            const platform = normalizePlatform(body.platform || (existingSession && existingSession.platform));
            const clientType = normalizeClientType(body.clientType || (existingSession && existingSession.clientType));
            const deviceId = normalizeDeviceId(body.deviceId || (existingSession && existingSession.deviceId));
            const appVersion = normalizeText(body.appVersion || (existingSession && existingSession.appVersion), "", 32);

            await kv.set(`session:${sessionId}`, {
                status: "authorized",
                address: normalizedAddress,
                publicKey,
                platform,
                clientType,
                deviceId,
                appVersion,
                authorizedAt: new Date().toISOString()
            }, { ex: ttlSeconds });

            return res.status(200).json({
                success: true,
                status: "authorized",
                sessionId,
                address: normalizedAddress,
                platform,
                clientType
            });
        }

        return res.status(405).json({ success: false, error: "Method Not Allowed" });
    } catch (error) {
        console.error("Auth API 嚴重錯誤:", error);
        return res.status(500).json({ success: false, error: "伺服器內部錯誤", details: error.message });
    }
}
