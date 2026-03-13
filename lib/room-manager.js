import { kv } from "@vercel/kv";
import { withDistLock } from "./tx-lock.js";

const ROOM_DATA_KEY = "room_manager:state:v1";
const ROOM_LOCK_KEY = "room_manager:lock";

function clonePlayer(player) {
    if (!player || typeof player !== "object") return null;
    return {
        type: player.type === "bot" ? "bot" : "human",
        id: String(player.id || ""),
        vip: player.vip || null
    };
}

function createBot(botId) {
    return { type: "bot", id: String(botId), vip: null };
}

function countHumanPlayers(room) {
    return (room.players || []).filter((player) => player.type === "human").length;
}

function countVip2Humans(room) {
    return (room.players || []).filter((player) => player.type === "human" && player.vip === "vip2").length;
}

function createRoom(roomId, maxSize, botFactory) {
    const room = {
        roomId,
        maxSize,
        players: []
    };

    while (room.players.length < room.maxSize) {
        room.players.push(createBot(botFactory()));
    }

    return room;
}

export async function getRoomManager(options = {}) {
    const maxSize = Math.max(2, Number(options.maxSize || 6));
    const maxRooms = Math.max(1, Number(options.maxRooms || 4));

    async function withState(task) {
        return withDistLock(ROOM_LOCK_KEY, async () => {
            let state = await kv.get(ROOM_DATA_KEY);
            if (!state) {
                let botSeq = 1;
                const botFactory = () => `bot_${String(botSeq++).padStart(3, "0")}`;
                state = {
                    botSeq,
                    rooms: [createRoom(1, maxSize, botFactory)]
                };
            }
            const context = {
                rooms: state.rooms,
                botSeq: state.botSeq,
                botFactory: () => `bot_${String(context.botSeq++).padStart(3, "0")}`
            };
            const result = await task(context);
            await kv.set(ROOM_DATA_KEY, { rooms: context.rooms, botSeq: context.botSeq });
            return result;
        });
    }

    function ensureRoomAt(ctx, index1Based) {
        let changed = false;
        while (ctx.rooms.length < index1Based && ctx.rooms.length < maxRooms) {
            ctx.rooms.push(createRoom(ctx.rooms.length + 1, maxSize, ctx.botFactory));
            changed = true;
        }
        return { room: ctx.rooms[index1Based - 1] || null, changed };
    }

    function findPlayerRoom(ctx, playerId) {
        const normalizedPlayerId = String(playerId || "").trim();
        if (!normalizedPlayerId) return null;
        for (let i = 0; i < ctx.rooms.length; i += 1) {
            const room = ctx.rooms[i];
            if (room.players.some((player) => player.type === "human" && player.id === normalizedPlayerId)) {
                return room;
            }
        }
        return null;
    }

    function findRoomWithSeat(ctx, preferredRoomId = null) {
        if (preferredRoomId) {
            const room = ctx.rooms.find((item) => item.roomId === preferredRoomId);
            if (room && countHumanPlayers(room) < room.maxSize) return room;
        }

        for (let index = 0; index < ctx.rooms.length; index += 1) {
            const room = ctx.rooms[index];
            if (countHumanPlayers(room) < room.maxSize) return room;
        }
        return null;
    }

    function ensureRoomForJoin(ctx, preferredRoomId = null) {
        const existing = findRoomWithSeat(ctx, preferredRoomId);
        if (existing) return { room: existing, changed: false };
        if (ctx.rooms.length >= maxRooms) return { room: null, changed: false };
        const newRoom = createRoom(ctx.rooms.length + 1, maxSize, ctx.botFactory);
        ctx.rooms.push(newRoom);
        return { room: newRoom, changed: true };
    }

    function replaceBotWithHuman(room, playerId, vip = null) {
        const botIndex = room.players.findIndex((player) => player.type === "bot");
        if (botIndex < 0) return false;
        room.players[botIndex] = { type: "human", id: String(playerId), vip };
        return true;
    }

    function replaceHumanWithBot(ctx, room, playerId) {
        const humanIndex = room.players.findIndex((player) => player.type === "human" && player.id === String(playerId));
        if (humanIndex < 0) return false;
        room.players[humanIndex] = createBot(ctx.botFactory());
        return true;
    }

    async function joinPlayer(playerId, options = {}) {
        return withState(async (ctx) => {
            const normalizedPlayerId = String(playerId || "").trim();
            if (!normalizedPlayerId) {
                throw new Error("playerId is required");
            }

            const existingRoom = findPlayerRoom(ctx, normalizedPlayerId);
            if (existingRoom) {
                return { ok: true, roomId: existingRoom.roomId, reused: true };
            }

            const preferredRoomId = Number(options.preferredRoomId || 0) || null;
            const vip = options.vip === "vip2" ? "vip2" : (options.vip === "vip1" ? "vip1" : null);
            const { room: targetRoom, changed: roomCreated } = ensureRoomForJoin(ctx, preferredRoomId);

            if (!targetRoom) return { ok: false, error: "所有桌位已滿" };

            const replaced = replaceBotWithHuman(targetRoom, normalizedPlayerId, vip);
            if (!replaced) return { ok: false, error: "目前無可替補 Bot" };

            return {
                ok: true,
                roomId: targetRoom.roomId,
                createdRoom: roomCreated
            };
        });
    }

    async function joinVip2Player(playerId) {
        return withState(async (ctx) => {
            const { room: room2, changed: changed2 } = ensureRoomAt(ctx, 2);
            const targetRoom2 = room2 || ctx.rooms[0];

            if (targetRoom2 && countHumanPlayers(targetRoom2) < targetRoom2.maxSize) {
                // Re-calling joinPlayer inside withState will deadlock.
                // We must implement the logic directly or use a shared internal function.
                return await _internalJoin(ctx, playerId, { preferredRoomId: targetRoom2.roomId, vip: "vip2" });
            }

            for (let i = 0; i < ctx.rooms.length; i += 1) {
                const room = ctx.rooms[i];
                if (room.roomId <= 2) continue;
                if (countHumanPlayers(room) < room.maxSize) {
                    return await _internalJoin(ctx, playerId, { preferredRoomId: room.roomId, vip: "vip2" });
                }
            }

            if (ctx.rooms.length < maxRooms) {
                const { room: room2B, changed: changed2B } = ensureRoomAt(ctx, ctx.rooms.length + 1);
                if (room2B) {
                    return await _internalJoin(ctx, playerId, { preferredRoomId: room2B.roomId, vip: "vip2" });
                }
            }

            return { ok: false, error: "VIP2 桌位已滿" };
        });
    }

    async function _internalJoin(ctx, playerId, options = {}) {
        const normalizedPlayerId = String(playerId || "").trim();
        const existingRoom = findPlayerRoom(ctx, normalizedPlayerId);
        if (existingRoom) {
            return { ok: true, roomId: existingRoom.roomId, reused: true };
        }
        const preferredRoomId = Number(options.preferredRoomId || 0) || null;
        const vip = options.vip;
        const { room: targetRoom, changed: roomCreated } = ensureRoomForJoin(ctx, preferredRoomId);
        if (!targetRoom) return { ok: false, error: "所有桌位已滿" };
        const replaced = replaceBotWithHuman(targetRoom, normalizedPlayerId, vip);
        if (!replaced) return { ok: false, error: "目前無可替補 Bot" };
        return { ok: true, roomId: targetRoom.roomId, createdRoom: roomCreated };
    }

    async function leavePlayer(playerId) {
        return withState(async (ctx) => {
            const normalizedPlayerId = String(playerId || "").trim();
            if (!normalizedPlayerId) return { ok: false, error: "playerId is required" };

            let found = false;
            let roomId = null;
            for (let i = 0; i < ctx.rooms.length; i += 1) {
                const room = ctx.rooms[i];
                const replaced = replaceHumanWithBot(ctx, room, normalizedPlayerId);
                if (replaced) {
                    found = true;
                    roomId = room.roomId;
                    break;
                }
            }

            if (found) {
                return { ok: true, roomId };
            }

            return { ok: false, error: "找不到該玩家" };
        });
    }

    async function getSnapshot() {
        // Read-only, no lock needed but let's be safe and consistent
        const state = await kv.get(ROOM_DATA_KEY);
        const currentRooms = state ? state.rooms : [];
        return {
            rooms: currentRooms.map((room) => ({
                roomId: room.roomId,
                maxSize: room.maxSize,
                humanCount: countHumanPlayers(room),
                vip2HumanCount: countVip2Humans(room),
                players: room.players.map(clonePlayer).filter(Boolean)
            }))
        };
    }

    return {
        joinPlayer,
        joinVip2Player,
        leavePlayer,
        getSnapshot
    };
}
