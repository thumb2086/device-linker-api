import { kv } from "@vercel/kv";
import { getSession } from "./session-store.js";
import { canAccessVipChatRoom, getVipChatRoomById, getVipChatRoomOptions } from "./vip.js";
import { readThroughCache, applyReadCacheHeaders, invalidateReadCacheByPrefix } from "./read-cache.js";
import { getRealtimeChannel, publishRealtime } from "./realtime-bus.js";

export const CHAT_FETCH_LIMIT = 60;
export const CHAT_MESSAGE_MAX = 160;
export const BULLET_MESSAGE_MAX = 80;
export const CHAT_ROOM_MAX_ITEMS = 120;

function trimText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export function safeChatType(value) {
    return value === "winner" ? "winner" : "chat";
}

export function normalizeChatRoomId(value) {
    const roomId = String(value || "public").trim().toLowerCase();
    return roomId || "public";
}

export function chatRoomStreamKey(roomId) {
    return `chat:stream:v1:${normalizeChatRoomId(roomId)}`;
}

async function resolveUserTotalBet(address) {
    if (!address) return 0;
    const raw = await kv.get(`total_bet:${String(address).toLowerCase()}`);
    return Number(raw || 0);
}

export function normalizeChatSessionId(value) {
    if (typeof value !== "string") return "";
    const sessionId = value.trim();
    if (!sessionId || sessionId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(sessionId)) return "";
    return sessionId;
}

export async function requireChatSession(sessionId) {
    const session = await getSession(sessionId);
    if (!session || !session.address) throw new Error("Session expired");
    return session;
}

export async function resolveChatRoomAccess(room, sessionId) {
    if (!room || !room.requiredLevel) return { allowed: true, session: null, currentLevel: null };
    const normalizedSessionId = normalizeChatSessionId(sessionId);
    if (!normalizedSessionId) return { allowed: false, reason: "missing_session" };
    const session = await requireChatSession(normalizedSessionId);
    const totalBet = await resolveUserTotalBet(session.address);
    const access = canAccessVipChatRoom(totalBet, room.id);
    return { ...access, session };
}

async function loadRawRoomMessages(roomId) {
    const data = await kv.get(chatRoomStreamKey(roomId));
    return Array.isArray(data) ? data : [];
}

export async function getChatRoomOptionsCached() {
    return readThroughCache({
        namespace: "chat-room-meta",
        keyParts: ["options"],
        tier: "chat-room-meta",
        loader: async () => ({
            generatedAt: new Date().toISOString(),
            rooms: getVipChatRoomOptions()
        })
    });
}

export async function listChatMessages(roomId, options = {}) {
    const normalizedRoomId = normalizeChatRoomId(roomId);
    const limitParsed = Number(options.limit || CHAT_FETCH_LIMIT);
    const limit = Number.isFinite(limitParsed)
        ? Math.min(CHAT_FETCH_LIMIT, Math.max(1, Math.floor(limitParsed)))
        : CHAT_FETCH_LIMIT;
    const sinceId = String(options.sinceId || "").trim();

    const cached = await readThroughCache({
        namespace: "chat-room-snapshot",
        keyParts: [normalizedRoomId],
        tier: "chat-room-snapshot",
        loader: async () => {
            const rows = await loadRawRoomMessages(normalizedRoomId);
            const trimmed = rows.slice(-CHAT_FETCH_LIMIT);
            const cursor = trimmed.length ? String(trimmed[trimmed.length - 1].id || "") : "";
            return {
                generatedAt: new Date().toISOString(),
                roomId: normalizedRoomId,
                cursor,
                messages: trimmed
            };
        }
    });

    const payload = cached.value || {};
    const allMessages = Array.isArray(payload.messages) ? payload.messages : [];
    let messages = allMessages.slice(-limit);
    if (sinceId) {
        const index = allMessages.findIndex((item) => String((item || {}).id || "") === sinceId);
        messages = index >= 0 ? allMessages.slice(index + 1) : allMessages.slice(-limit);
    }

    return {
        messages,
        cursor: payload.cursor || (messages.length ? String(messages[messages.length - 1].id || "") : ""),
        meta: cached.meta
    };
}

export async function appendChatMessage(message, roomId) {
    const normalizedRoomId = normalizeChatRoomId(roomId);
    const data = await loadRawRoomMessages(normalizedRoomId);
    const rows = Array.isArray(data) ? data : [];
    rows.push(message);
    const trimmed = rows.slice(-CHAT_ROOM_MAX_ITEMS);
    await kv.set(chatRoomStreamKey(normalizedRoomId), trimmed);
    await invalidateReadCacheByPrefix("chat-room-snapshot", [normalizedRoomId]);

    const cursor = String(message && message.id || "");
    const event = {
        type: "message",
        roomId: normalizedRoomId,
        message,
        cursor
    };
    await publishRealtime(getRealtimeChannel(normalizedRoomId), event);

    return {
        messages: trimmed,
        cursor
    };
}

export function applyChatCacheHeaders(res, meta) {
    if (!res) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    applyReadCacheHeaders(res, meta);
}

export function buildChatAccessError(room, access) {
    if (room && room.requiredLevel) {
        return `進入 ${room.label} 需要 ${room.requiredLevel}`;
    }
    return access && access.reason === "missing_session" ? "Missing sessionId" : "聊天室無法進入";
}

export function buildChatSnapshotMessage(room, rooms, messages, cursor) {
    return {
        type: "snapshot",
        room,
        rooms,
        messages,
        cursor
    };
}

export function resolveChatRoom(roomId) {
    return getVipChatRoomById(roomId);
}
