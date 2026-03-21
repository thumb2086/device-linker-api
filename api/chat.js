import { getDisplayName } from "../lib/user-profile.js";
import {
    BULLET_MESSAGE_MAX,
    CHAT_FETCH_LIMIT,
    CHAT_MESSAGE_MAX,
    appendChatMessage,
    applyChatCacheHeaders,
    buildChatAccessError,
    getChatRoomOptionsCached,
    listChatMessages,
    normalizeChatRoomId,
    normalizeChatSessionId,
    requireChatSession,
    resolveChatRoom,
    resolveChatRoomAccess,
    safeChatType
} from "../lib/chat-store.js";

function parseBody(req) {
    if (!req || typeof req !== "object") return {};
    if (!req.body) return {};
    if (typeof req.body === "string") {
        try {
            const parsed = JSON.parse(req.body);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof req.body === "object" ? req.body : {};
}

function trimText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const query = req.query && typeof req.query === "object" ? req.query : {};
        const body = parseBody(req);
        const actionRaw = String((body.action || query.action || "list")).trim().toLowerCase();

        if (req.method === "GET" || actionRaw === "list") {
            const roomId = normalizeChatRoomId(body.roomId || query.roomId || "public");
            const room = resolveChatRoom(roomId);
            const access = await resolveChatRoomAccess(room, body.sessionId || query.sessionId);
            if (!access.allowed) {
                return res.status(403).json({
                    success: false,
                    error: buildChatAccessError(room, access)
                });
            }

            const roomsResult = await getChatRoomOptionsCached();
            const listResult = await listChatMessages(room.id, {
                limit: body.limit || query.limit || CHAT_FETCH_LIMIT,
                sinceId: body.sinceId || query.sinceId || ""
            });

            applyChatCacheHeaders(res, listResult.meta);
            return res.status(200).json({
                success: true,
                room,
                rooms: (roomsResult.value || {}).rooms || [],
                messages: listResult.messages,
                returned: listResult.messages.length,
                cursor: listResult.cursor
            });
        }

        if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

        if (actionRaw === "send") {
            const sessionId = normalizeChatSessionId(body.sessionId);
            if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });
            const session = await requireChatSession(sessionId);

            const roomId = normalizeChatRoomId(body.roomId || "public");
            const room = resolveChatRoom(roomId);
            const access = await resolveChatRoomAccess(room, sessionId);
            if (!access.allowed) {
                return res.status(403).json({
                    success: false,
                    error: buildChatAccessError(room, access)
                });
            }

            const type = safeChatType(body.type);
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
                createdAt: new Date().toISOString(),
                roomId: room.id
            };

            const appendResult = await appendChatMessage(payload, room.id);
            return res.status(200).json({
                success: true,
                room,
                message: payload,
                total: appendResult.messages.length,
                cursor: appendResult.cursor
            });
        }

        return res.status(400).json({ success: false, error: "Unsupported action" });
    } catch (error) {
        console.error("Chat API Error:", error?.message || error);
        if (error?.message === "Session expired" || String(error?.message || "").includes("Session")) {
            return res.status(403).json({ success: false, error: "Session expired", code: "SESSION_EXPIRED" });
        }
        return res.status(500).json({ success: false, error: error?.message || "Chat API failed" });
    }
}
