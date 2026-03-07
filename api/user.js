import { kv } from "@vercel/kv";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { ADMIN_WALLET_ADDRESS, CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo } from "../lib/auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { buildVipStatus } from "../lib/vip.js";
import { getSession, saveSession } from "../lib/session-store.js";
import { ensureDisplayName, getDisplayName, setDisplayName } from "../lib/user-profile.js";

const ALLOWED_PLATFORMS = new Set(["android", "ios", "web", "macos", "windows", "linux", "unknown"]);
const ALLOWED_CLIENT_TYPES = new Set(["mobile", "desktop", "web", "server", "unknown"]);
const DEEP_LINK_SCHEME = "dlinker://login";
const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const CUSTODY_PASSWORD_MIN = 6;
const CUSTODY_PASSWORD_MAX = 128;
const CUSTODY_REGISTER_BONUS = "100000";
const AUTH_API_BUILD = "2026-03-08-user-compat-v2";

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

function buildAuthPayload(sessionData, balance, totalBet, vipStatus, displayName = "") {
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
        isAdmin
    };
}

async function loadUserMetrics(address) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ],
        provider
    );

    const [balanceRaw, decimals, totalBetRaw, displayName] = await Promise.all([
        contract.balanceOf(address),
        contract.decimals(),
        kv.get(`total_bet:${address.toLowerCase()}`),
        getDisplayName(address)
    ]);

    const totalBet = Number(totalBetRaw || 0);
    return {
        balance: ethers.formatUnits(balanceRaw, decimals),
        totalBet,
        vipStatus: buildVipStatus(totalBet),
        displayName
    };
}

function resolveProfileAction(action) {
    if (action === "get_profile" || action === "get") return "get";
    if (action === "set_profile" || action === "set") return "set";
    return "";
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

            try {
                const metrics = await loadUserMetrics(sessionData.address);
                return res.status(200).json(
                    buildAuthPayload(sessionData, metrics.balance, metrics.totalBet, metrics.vipStatus, metrics.displayName)
                );
            } catch (error) {
                console.error("User metrics read failed:", error.message);
                return res.status(200).json(
                    buildAuthPayload(sessionData, "0.00", 0, buildVipStatus(0), "")
                );
            }
        }

        if (req.method !== "POST") {
            return res.status(405).json({ success: false, error: "Method Not Allowed" });
        }

        if (action === "get_status") {
            if (!sessionId) return res.status(200).json({ status: "pending" });

            const sessionData = await getSession(sessionId);
            if (!sessionData) return res.status(200).json({ status: "pending" });
            if (sessionData.status === "pending") return res.status(200).json(buildPendingPayload(sessionData));

            try {
                const metrics = await loadUserMetrics(sessionData.address);
                return res.status(200).json(
                    buildAuthPayload(sessionData, metrics.balance, metrics.totalBet, metrics.vipStatus, metrics.displayName)
                );
            } catch (error) {
                console.error("User metrics read failed:", error.message);
                return res.status(200).json(
                    buildAuthPayload(sessionData, "0.00", 0, buildVipStatus(0), "")
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
            const ttlSeconds = parseSessionTTL(body.ttlSeconds);
            const platform = normalizePlatform(body.platform);
            const clientType = normalizeClientType(body.clientType);
            const deviceId = normalizeDeviceId(body.deviceId);
            const appVersion = normalizeText(body.appVersion, "", 32);

            if (!CUSTODY_USERNAME_REGEX.test(username)) {
                return res.status(400).json({ success: false, error: "Invalid username format" });
            }
            if (password.length < CUSTODY_PASSWORD_MIN || password.length > CUSTODY_PASSWORD_MAX) {
                return res.status(400).json({ success: false, error: "Password length must be 6-128" });
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
                    let privateKey = process.env.ADMIN_PRIVATE_KEY;
                    if (!privateKey) {
                        bonusError = "ADMIN_PRIVATE_KEY is not configured";
                    } else {
                        const provider = new ethers.JsonRpcProvider(RPC_URL);
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
                    }
                } catch (error) {
                    bonusError = error.message || "Register bonus failed";
                }
            } else {
                if (!custodyUser.saltHex || !custodyUser.passwordHash) {
                    return res.status(500).json({ success: false, error: "Custody user record is invalid" });
                }
                if (!verifyPassword(password, custodyUser.saltHex, custodyUser.passwordHash)) {
                    return res.status(401).json({ success: false, error: "Invalid username or password" });
                }
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

        const profileAction = resolveProfileAction(action);
        if (profileAction) {
            const profileSession = await getSession(body.sessionId);
            if (!profileSession || !profileSession.address) {
                return res.status(403).json({ success: false, error: "Session expired" });
            }

            if (profileAction === "get") {
                const displayName = await getDisplayName(profileSession.address);
                return res.status(200).json({ success: true, displayName });
            }

            const displayName = await setDisplayName(profileSession.address, body.displayName);
            return res.status(200).json({ success: true, displayName });
        }

        if (action === "get_history") {
            const address = String(body.address || "").trim();
            const page = Number(body.page || 1);
            const limit = Number(body.limit || 20);
            if (!address) {
                return res.status(400).json({ success: false, error: "Missing address" });
            }

            const apiKey = process.env.ETHERSCAN_API_KEY || "";
            const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&address=${address}&page=${page}&offset=${limit}&sort=desc&apikey=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            const normalizeResponseText = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
            const messageText = normalizeResponseText(data.message);
            const resultText = normalizeResponseText(data.result);
            const noTransactions =
                messageText.includes("no transactions found") ||
                resultText.includes("no transactions found") ||
                (Array.isArray(data.result) && data.result.length === 0);

            if (data.status === "0" && !noTransactions) {
                return res.status(200).json({
                    success: false,
                    error: data.message || "Etherscan request failed",
                    details: data.result
                });
            }

            const history = (Array.isArray(data.result) ? data.result : []).map((tx) => {
                const isSend = tx.from.toLowerCase() === address.toLowerCase();
                const timestamp = parseInt(tx.timeStamp, 10);
                return {
                    type: isSend ? "send" : "receive",
                    amount: ethers.formatUnits(tx.value, 18),
                    counterParty: isSend ? tx.to : tx.from,
                    timestamp,
                    date: new Date(timestamp * 1000).toLocaleString("zh-TW", { hour12: false }),
                    txHash: tx.hash
                };
            });

            return res.status(200).json({
                success: true,
                page,
                limit,
                count: history.length,
                hasMore: history.length === limit,
                history
            });
        }

        if (action === "authorize") {
            const publicKey = safePublicKey(body.publicKey);
            const address = body.address;
            if (!sessionId || !address || !publicKey) {
                return res.status(400).json({ success: false, error: "Missing required fields" });
            }

            let normalizedAddress;
            try {
                normalizedAddress = ethers.getAddress(address).toLowerCase();
            } catch {
                return res.status(400).json({ success: false, error: "Invalid address" });
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
                publicKey,
                mode: "live",
                platform,
                clientType
            });
        }

        return res.status(400).json({ success: false, error: "Unsupported action" });
    } catch (error) {
        console.error("User API Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "User API failed"
        });
    }
}
