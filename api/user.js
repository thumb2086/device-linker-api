// api/user.js - 聚合使用者功能 (Auth, Profile, History)
import { kv } from '@vercel/kv';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo } from "../lib/auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../lib/treasury.js";
import { buildVipStatus } from "../lib/vip.js";
import { getSession, saveSession } from "../lib/session-store.js";
import { ensureDisplayName, getDisplayName, setDisplayName } from "../lib/user-profile.js";
import { ADMIN_WALLET_ADDRESS } from "../lib/config.js";

// --- 常量與輔助函數 (來自原 auth.js) ---
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

function hashPassword(password, saltHex) {
    return scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

function verifyPassword(password, saltHex, expectedHashHex) {
    const actual = Buffer.from(hashPassword(password, saltHex), "hex");
    const expected = Buffer.from(String(expectedHashHex || ""), "hex");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const query = req.query || {};
    const action = normalizeText(body.action || query.action, "get_status");

    try {
        // 1. 認證相關 (原 auth.js)
        if (action === 'get_status' || req.method === 'GET') {
            const sessionId = normalizeSessionId(query.sessionId || body.sessionId);
            if (!sessionId) return res.status(200).json({ status: "pending" });

            const sessionData = await getSession(sessionId);
            if (!sessionData || sessionData.status === "pending") return res.status(200).json({ status: "pending" });

            // 獲取使用者詳細資料
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"], provider);
            
            const [balanceRaw, decimals, totalBetRaw, displayName] = await Promise.all([
                contract.balanceOf(sessionData.address),
                contract.decimals(),
                kv.get(`total_bet:${sessionData.address.toLowerCase()}`),
                getDisplayName(sessionData.address)
            ]);

            const totalBet = parseFloat(totalBetRaw || 0);
            const vipStatus = buildVipStatus(totalBet);
            const isAdmin = sessionData.address.toLowerCase() === ADMIN_WALLET_ADDRESS.toLowerCase();

            return res.status(200).json({
                status: "authorized",
                address: sessionData.address,
                displayName,
                balance: ethers.formatUnits(balanceRaw, decimals),
                totalBet: totalBet.toFixed(2),
                vipLevel: vipStatus.vipLevel,
                maxBet: vipStatus.maxBet.toFixed(2),
                mode: sessionData.mode,
                isAdmin: isAdmin
            });
        }

        // 建立 Session (原 auth.js action: create)
        if (action === 'create_session') {
            const generatedSessionId = `session_${randomUUID()}`;
            await saveSession(generatedSessionId, { status: "pending", createdAt: new Date().toISOString() }, 3600);
            return res.status(200).json({ success: true, sessionId: generatedSessionId, deepLink: `${DEEP_LINK_SCHEME}?sessionId=${generatedSessionId}` });
        }

        // 託管登入 (原 auth.js action: custody_login)
        if (action === 'custody_login') {
            const username = normalizeText(body.username, "", 32);
            const password = body.password || "";
            const key = `custody_user:${username}`;
            let user = await kv.get(key);

            if (!user) {
                // 註冊邏輯 (簡化版)
                const saltHex = randomBytes(16).toString("hex");
                const seed = `${username}:${saltHex}:${Date.now()}`;
                const address = ethers.getAddress(`0x${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`).toLowerCase();
                user = { username, saltHex, passwordHash: hashPassword(password, saltHex), address, createdAt: new Date().toISOString() };
                await kv.set(key, user);
                await ensureDisplayName(address, username);
            } else if (!verifyPassword(password, user.saltHex, user.passwordHash)) {
                return res.status(401).json({ error: "密碼錯誤" });
            }

            const sessionId = `session_${randomUUID()}`;
            await saveSession(sessionId, { status: "authorized", address: user.address, mode: "custody", authorizedAt: new Date().toISOString() }, 86400);
            return res.status(200).json({ success: true, sessionId, address: user.address, mode: "custody" });
        }

        // 2. 個人資料相關 (原 profile.js)
        if (action === 'get_profile' || action === 'set_profile') {
            const session = await getSession(body.sessionId);
            if (!session) return res.status(403).json({ error: "會話過期" });

            if (action === 'get_profile') {
                const displayName = await getDisplayName(session.address);
                return res.status(200).json({ success: true, displayName });
            } else {
                const displayName = await setDisplayName(session.address, body.displayName);
                return res.status(200).json({ success: true, displayName });
            }
        }

        // 3. 歷史紀錄相關 (原 history.js)
        if (action === 'get_history') {
            const { address, page = 1, limit = 20 } = body;
            const apiKey = process.env.ETHERSCAN_API_KEY;
            const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&address=${address}&page=${page}&offset=${limit}&sort=desc&apikey=${apiKey}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === "0" && !data.message.includes("No transactions found")) {
                return res.status(400).json({ error: data.message });
            }

            const history = (data.result || []).map(tx => ({
                type: tx.from.toLowerCase() === address.toLowerCase() ? "send" : "receive",
                amount: ethers.formatUnits(tx.value, 18),
                counterParty: tx.from.toLowerCase() === address.toLowerCase() ? tx.to : tx.from,
                timestamp: parseInt(tx.timeStamp),
                txHash: tx.hash
            }));

            return res.status(200).json({ success: true, history });
        }

        return res.status(400).json({ error: "無效的 action" });

    } catch (error) {
        console.error("User API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
