import { kv } from '@vercel/kv';
import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getDemoBalance, isDemoSession } from "../lib/demo.js";

const DEFAULT_SESSION_TTL_SECONDS = 86400;
const MIN_SESSION_TTL_SECONDS = 300;
const MAX_SESSION_TTL_SECONDS = 604800;
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
  return Math.min(MAX_SESSION_TTL_SECONDS, Math.max(MIN_SESSION_TTL_SECONDS, Math.floor(parsed)));
}

function buildDeepLink(sessionId) {
  return `${DEEP_LINK_SCHEME}?sessionId=${encodeURIComponent(sessionId)}`;
}

function buildAuthPayload(sessionData, balance, totalBet, vipLevel) {
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
    balance: parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2 }),
    totalBet: parseFloat(totalBet).toFixed(2),
    vipLevel
  };
}

function vipFromTotalBet(totalBet) {
  if (totalBet >= 100000) return "鑽石 VIP";
  if (totalBet >= 50000) return "黃金會員";
  if (totalBet >= 10000) return "白銀會員";
  return "普通會員";
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sessionId = normalizeSessionId(req.query.sessionId || (req.body && req.body.sessionId));

    if (req.method === 'GET') {
      if (!sessionId) return res.status(200).json({ status: "pending" });

      const sessionData = await kv.get(`session:${sessionId}`);
      if (!sessionData) return res.status(200).json({ status: "pending" });

      const ttlSeconds = parseSessionTTL(req.query.ttlSeconds);
      const refreshedSession = {
        ...sessionData,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
      };
      await kv.set(`session:${sessionId}`, refreshedSession, { ex: ttlSeconds });

      if (sessionData.status === "pending") {
        return res.status(200).json({
          status: "pending",
          platform: refreshedSession.platform || "unknown",
          clientType: refreshedSession.clientType || "unknown",
          expiresAt: refreshedSession.expiresAt || null
        });
      }

      const totalBet = Number(await kv.get(`total_bet:${sessionData.address.toLowerCase()}`) || 0);
      const vipLevel = vipFromTotalBet(totalBet);

      let balance = "0";
      if (isDemoSession(sessionData)) {
        balance = String(await getDemoBalance(sessionData.address));
      } else {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
          ],
          provider
        );
        const [balanceRaw, decimals] = await Promise.all([
          contract.balanceOf(sessionData.address),
          contract.decimals()
        ]);
        balance = ethers.formatUnits(balanceRaw, decimals);
      }

      return res.status(200).json(buildAuthPayload(sessionData, balance, totalBet, vipLevel));
    }

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
          mode: "live",
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
      if (!sessionId || !address || !publicKey) {
        return res.status(400).json({ success: false, error: "missing required fields" });
      }

      let normalizedAddress;
      try {
        normalizedAddress = ethers.getAddress(address).toLowerCase();
      } catch {
        return res.status(400).json({ success: false, error: "invalid address" });
      }

      const existingSession = await kv.get(`session:${sessionId}`);
      const ttlSeconds = parseSessionTTL(body.ttlSeconds);
      const platform = normalizePlatform(body.platform || (existingSession && existingSession.platform));
      const clientType = normalizeClientType(body.clientType || (existingSession && existingSession.clientType));
      const deviceId = normalizeDeviceId(body.deviceId || (existingSession && existingSession.deviceId));
      const appVersion = normalizeText(body.appVersion || (existingSession && existingSession.appVersion), "", 32);
      const mode = normalizeText(body.mode || (existingSession && existingSession.mode), "live", 16) === "demo" ? "demo" : "live";

      await kv.set(`session:${sessionId}`, {
        status: "authorized",
        address: normalizedAddress,
        publicKey,
        mode,
        platform,
        clientType,
        deviceId,
        appVersion,
        authorizedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
      }, { ex: ttlSeconds });

      return res.status(200).json({
        success: true,
        status: "authorized",
        sessionId,
        address: normalizedAddress,
        mode,
        platform,
        clientType
      });
    }

    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  } catch (error) {
    console.error("Auth API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
