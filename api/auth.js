// api/auth.js
import { kv } from '@vercel/kv';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo } from "../lib/auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { buildVipStatus } from "../lib/vip.js";
import { getSession, saveSession } from "../lib/session-store.js";

const ALLOWED_PLATFORMS = new Set(["android", "ios", "web", "macos", "windows", "linux", "unknown"]);
const ALLOWED_CLIENT_TYPES = new Set(["mobile", "desktop", "web", "server", "unknown"]);
const DEEP_LINK_SCHEME = "dlinker://login";
const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const CUSTODY_PASSWORD_MIN = 6;
const CUSTODY_PASSWORD_MAX = 128;
const CUSTODY_REGISTER_BONUS = "100000";

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
    // Missing ttlSeconds means non-expiring session by default.
    if (input === null || input === undefined || input === "") return null;
    if (typeof input === "string") {
        const normalized = input.trim().toLowerCase();
        if (["0", "none", "never", "off"].includes(normalized)) return null;
    }
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return null;
    if (parsed <= 0) return null;
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

function buildAuthPayload(sessionData, balance, totalBet, vipStatus) {
    return {
        status: "authorized",
        address: sessionData.address,
        publicKey: sessionData.publicKey,
        mode: sessionData.mode || "live",
        platform: sessionData.platform || "unknown",
        clientType: sessionData.clientType || "unknown",
        deviceId: sessionData.deviceId || "",
        appVersion: sessionData.appVersion || "",
        authorizedAt: sessionData.authorizedAt || null,
        balance: toDecimalString(balance),
        totalBet: toDecimalString(totalBet),
        vipLevel: vipStatus.vipLevel,
        maxBet: toDecimalString(vipStatus.maxBet)
    };
}

function normalizeUsername(value) {
    return normalizeText(value, "", 32);
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

export default async function handler(req, res) {
    // 1. 強制處理跨域與快取（最重要！）
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const query = getSafeQuery(req);
        const body = getSafeBody(req);
        const sessionId = normalizeSessionId(query.sessionId || body.sessionId);
        const clockOnly = String(query.clock || "") === "1";


        // --- GET 請求：網頁端輪詢狀態 ---
        if (req.method === 'GET') {
            if (clockOnly) {
                const game = typeof query.game === "string" ? query.game : "roulette";
                const nowTs = Date.now();
                const round = getRoundInfo(game, nowTs);
                return res.status(200).json({ success: true, serverNowTs: nowTs, ...round });
            }

            if (!sessionId) return res.status(200).json({ status: "pending" });

            const sessionData = await getSession(sessionId);

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
                let vipStatus = buildVipStatus(0);

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
                    vipStatus = buildVipStatus(totalBet);

                } catch (blockchainError) {
                    console.error("無法從鏈上獲取數據，但仍允許登入:", blockchainError.message);
                }

                return res.status(200).json(buildAuthPayload(sessionData, balance, totalBet, vipStatus));
            }
            return res.status(200).json({ status: "pending" });
        }

        // --- POST 請求：建立 session 或 App 端提交授權 ---
        if (req.method === 'POST') {
            const action = normalizeText(body.action, "authorize");

            if (action === "create") {
                const generatedSessionId = normalizeSessionId(body.sessionId) || `session_${randomUUID()}`;
                const ttlSeconds = parseSessionTTL(body.ttlSeconds);
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
                    expiresAt: buildExpiresAt(ttlSeconds)
                }, ttlSeconds);

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

            if (action === "custody_login") {
                const username = normalizeUsername(body.username);
                const password = typeof body.password === "string" ? body.password : "";
                const ttlSeconds = parseSessionTTL(body.ttlSeconds);
                const platform = normalizePlatform(body.platform);
                const clientType = normalizeClientType(body.clientType);
                const deviceId = normalizeDeviceId(body.deviceId);
                const appVersion = normalizeText(body.appVersion, "", 32);

                if (!CUSTODY_USERNAME_REGEX.test(username)) {
                    return res.status(400).json({ success: false, error: "帳號格式錯誤（3-32，英文數字底線）" });
                }
                if (password.length < CUSTODY_PASSWORD_MIN || password.length > CUSTODY_PASSWORD_MAX) {
                    return res.status(400).json({ success: false, error: "密碼長度需 6-128" });
                }

                const key = custodyUserKey(username);
                let custodyUser = await kv.get(key);
                let isNewAccount = false;
                let bonusGranted = false;
                let bonusTxHash = "";
                let bonusError = "";

                if (!custodyUser) {
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
                        const provider = new ethers.JsonRpcProvider(RPC_URL);
                        let privateKey = process.env.ADMIN_PRIVATE_KEY;
                        if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
                        const wallet = new ethers.Wallet(privateKey, provider);
                        const treasuryAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
                        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
                            "function mint(address to, uint256 amount) public",
                            "function adminTransfer(address from, address to, uint256 amount) public",
                            "function decimals() view returns (uint8)",
                            "function balanceOf(address) view returns (uint256)",
                            "function totalSupply() view returns (uint256)"
                        ], wallet);

                        const decimals = await contract.decimals();
                        const bonusWei = ethers.parseUnits(CUSTODY_REGISTER_BONUS, decimals);
                        const bonusTx = await transferFromTreasuryWithAutoTopup(
                            contract,
                            treasuryAddress,
                            custodyUser.address,
                            bonusWei,
                            { gasLimit: 200000 }
                        );
                        bonusGranted = true;
                        bonusTxHash = bonusTx.hash;
                    } catch (e) {
                        bonusError = e.message || "註冊獎勵發放失敗";
                    }
                } else if (!verifyPassword(password, custodyUser.saltHex, custodyUser.passwordHash)) {
                    return res.status(401).json({ success: false, error: "帳號或密碼錯誤" });
                }

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
                    success: true,
                    status: "authorized",
                    sessionId: custodySessionId,
                    address: custodyUser.address,
                    publicKey: custodyUser.publicKey,
                    mode: "custody",
                    isNewAccount,
                    registerBonus: CUSTODY_REGISTER_BONUS,
                    bonusGranted,
                    bonusTxHash,
                    bonusError
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

            const existingSession = await getSession(sessionId);
            const ttlSeconds = parseSessionTTL(body.ttlSeconds);
            const platform = normalizePlatform(body.platform || (existingSession && existingSession.platform));
            const clientType = normalizeClientType(body.clientType || (existingSession && existingSession.clientType));
            const deviceId = normalizeDeviceId(body.deviceId || (existingSession && existingSession.deviceId));
            const appVersion = normalizeText(body.appVersion || (existingSession && existingSession.appVersion), "", 32);

            await saveSession(sessionId, {
                status: "authorized",
                address: normalizedAddress,
                publicKey,
                mode: "live",
                platform,
                clientType,
                deviceId,
                appVersion,
                authorizedAt: new Date().toISOString(),
                expiresAt: buildExpiresAt(ttlSeconds)
            }, ttlSeconds);

            return res.status(200).json({
                success: true,
                status: "authorized",
                sessionId,
                address: normalizedAddress,
                mode: "live",
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
