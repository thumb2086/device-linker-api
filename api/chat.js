import { kv } from "@vercel/kv";
import { getSession } from "../lib/session-store.js";
import { getDisplayName } from "../lib/user-profile.js";

const CHAT_STREAM_KEY = "chat:stream:v1";
const CHAT_MAX_ITEMS = 120;
const CHAT_FETCH_LIMIT = 60;
const CHAT_MESSAGE_MAX = 160;
const BULLET_MESSAGE_MAX = 80;

function trimText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function safeType(value) {
    return value === "winner" ? "winner" : "chat";
}

function normalizeSessionId(value) {
    if (typeof value !== "string") return "";
    const sessionId = value.trim();
    if (!sessionId || sessionId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(sessionId)) return "";
    return sessionId;
}

async function requireAuthSession(sessionId) {
    const session = await getSession(sessionId);
    if (!session || !session.address) throw new Error("Session expired");
    return session;
}

async function listMessages(limitInput) {
    const parsed = Number(limitInput || CHAT_FETCH_LIMIT);
    const limit = Number.isFinite(parsed) ? Math.min(CHAT_FETCH_LIMIT, Math.max(1, Math.floor(parsed))) : CHAT_FETCH_LIMIT;
    const data = await kv.get(CHAT_STREAM_KEY);
    const rows = Array.isArray(data) ? data : [];
    return rows.slice(-limit);
}

async function appendMessage(message) {
    const data = await kv.get(CHAT_STREAM_KEY);
    const rows = Array.isArray(data) ? data : [];
    rows.push(message);
    const trimmed = rows.slice(-CHAT_MAX_ITEMS);
    await kv.set(CHAT_STREAM_KEY, trimmed);
    return trimmed;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const query = req.query && typeof req.query === "object" ? req.query : {};
        let body = {};
        if (req.body && typeof req.body === "string") {
            try {
                const parsed = JSON.parse(req.body);
                body = parsed && typeof parsed === "object" ? parsed : {};
            } catch {
                body = {};
            }
        } else if (req.body && typeof req.body === "object") {
            body = req.body;
        }
        const actionRaw = String((body.action || query.action || "list")).trim().toLowerCase();

        if (req.method === "GET" || actionRaw === "list") {
            const messages = await listMessages(body.limit || query.limit);
            return res.status(200).json({ success: true, messages, returned: messages.length });
        }

        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

        if (actionRaw === "send") {
            const sessionId = normalizeSessionId(body.sessionId);
            if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });
            const session = await requireAuthSession(sessionId);

            const type = safeType(body.type);
            const maxLength = type === "winner" ? BULLET_MESSAGE_MAX : CHAT_MESSAGE_MAX;
            const messageText = trimText(body.message, maxLength);
            if (!messageText) return res.status(400).json({ success: false, error: "訊息不可為空" });

            const displayName = await getDisplayName(session.address);
            const payload = {
                id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                type,
                message: messageText,
                address: String(session.address || "").toLowerCase(),
                displayName: trimText(displayName || "", 32),
                createdAt: new Date().toISOString()
            };
            const messages = await appendMessage(payload);
            return res.status(200).json({ success: true, message: payload, total: messages.length });
        }

        return res.status(400).json({ success: false, error: "Unsupported action" });
    } catch (error) {
        console.error("Chat API Error:", error);
        return res.status(500).json({ success: false, error: error.message || "Chat API failed" });
    }
}
