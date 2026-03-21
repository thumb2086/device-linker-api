import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import {
    CHAT_FETCH_LIMIT,
    applyChatCacheHeaders,
    buildChatAccessError,
    buildChatSnapshotMessage,
    getChatRoomOptionsCached,
    listChatMessages,
    normalizeChatRoomId,
    normalizeChatSessionId,
    requireChatSession,
    resolveChatRoom,
    resolveChatRoomAccess
} from "../lib/chat-store.js";
import { createRealtimeSubscriber, getRealtimeChannel, hasRealtimeBusConfig } from "../lib/realtime-bus.js";

const port = Number(process.env.CHAT_REALTIME_PORT || process.env.PORT || 8787);
const pathName = String(process.env.CHAT_REALTIME_PATH || "/chat").trim() || "/chat";
const heartbeatMs = 30000;

const server = http.createServer((req, res) => {
    applyChatCacheHeaders(res, { status: "MISS", layer: "origin", generatedAt: new Date().toISOString() });
    res.statusCode = 404;
    res.end("Not Found");
});

const wss = new WebSocketServer({ noServer: true });
const roomClients = new Map();

function getRoomClientSet(roomId) {
    const normalizedRoomId = normalizeChatRoomId(roomId);
    if (!roomClients.has(normalizedRoomId)) {
        roomClients.set(normalizedRoomId, new Set());
    }
    return roomClients.get(normalizedRoomId);
}

function leaveRoom(ws) {
    const currentRoomId = ws.roomId;
    if (!currentRoomId) return;
    const roomSet = roomClients.get(currentRoomId);
    if (roomSet) {
        roomSet.delete(ws);
        if (roomSet.size === 0) roomClients.delete(currentRoomId);
    }
    ws.roomId = "";
}

function joinRoom(ws, roomId) {
    leaveRoom(ws);
    const normalizedRoomId = normalizeChatRoomId(roomId);
    getRoomClientSet(normalizedRoomId).add(ws);
    ws.roomId = normalizedRoomId;
}

function sendJson(ws, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload || {}));
}

async function handleJoin(ws, payload) {
    const sessionId = normalizeChatSessionId(payload && payload.sessionId);
    const roomId = normalizeChatRoomId(payload && payload.roomId);
    if (!sessionId) {
        sendJson(ws, { type: "error", code: "MISSING_SESSION", message: "Missing sessionId" });
        return;
    }

    try {
        const session = await requireChatSession(sessionId);
        const room = resolveChatRoom(roomId);
        const access = await resolveChatRoomAccess(room, sessionId);
        if (!access.allowed) {
            sendJson(ws, { type: "error", code: "ROOM_FORBIDDEN", message: buildChatAccessError(room, access) });
            return;
        }

        const roomsResult = await getChatRoomOptionsCached();
        const listResult = await listChatMessages(room.id, { limit: CHAT_FETCH_LIMIT });
        ws.sessionId = sessionId;
        ws.address = String(session.address || "").toLowerCase();
        joinRoom(ws, room.id);
        sendJson(ws, buildChatSnapshotMessage(room, (roomsResult.value || {}).rooms || [], listResult.messages, listResult.cursor));
    } catch (error) {
        sendJson(ws, { type: "error", code: "SESSION_EXPIRED", message: error?.message || "Session expired" });
    }
}

function startHeartbeat() {
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                ws.terminate();
                return;
            }
            ws.isAlive = false;
            try {
                ws.ping();
            } catch (_) {
                ws.terminate();
            }
        });
    }, heartbeatMs);
}

async function startRealtimeBridge() {
    if (!hasRealtimeBusConfig()) {
        console.warn("Realtime Redis config missing; chat WebSocket will only serve snapshots.");
        return;
    }

    const subscriber = await createRealtimeSubscriber();
    if (!subscriber) return;
    await subscriber.pSubscribe("chat:room:*", (message, channel) => {
        let payload;
        try {
            payload = JSON.parse(message);
        } catch {
            return;
        }
        const roomId = normalizeChatRoomId(String(channel || "").split(":").slice(-1)[0] || "public");
        const clients = roomClients.get(roomId);
        if (!clients || !clients.size) return;
        for (const client of clients) {
            sendJson(client, payload);
        }
    });
}

wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.roomId = "";
    ws.sessionId = "";
    ws.address = "";

    ws.on("pong", () => {
        ws.isAlive = true;
    });

    ws.on("message", (raw) => {
        let payload;
        try {
            payload = JSON.parse(String(raw || "{}"));
        } catch {
            sendJson(ws, { type: "error", code: "BAD_PAYLOAD", message: "Invalid JSON payload" });
            return;
        }

        if (String(payload && payload.type || "").trim().toLowerCase() === "join") {
            handleJoin(ws, payload).catch((error) => {
                sendJson(ws, { type: "error", code: "JOIN_FAILED", message: error?.message || "Join failed" });
            });
            return;
        }

        sendJson(ws, { type: "error", code: "UNSUPPORTED_TYPE", message: "Unsupported realtime message type" });
    });

    ws.on("close", () => {
        leaveRoom(ws);
    });
});

server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== pathName) {
        socket.destroy();
        return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
    });
});

await startRealtimeBridge();
startHeartbeat();

server.listen(port, () => {
    console.log(`Chat realtime server listening on ${pathName} port ${port}`);
});
