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

export function createRoomManager(options = {}) {
    const maxSize = Math.max(2, Number(options.maxSize || 6));
    const maxRooms = Math.max(1, Number(options.maxRooms || 2));

    let botSeq = 1;
    const botFactory = () => `bot_${String(botSeq++).padStart(3, "0")}`;
    const rooms = [createRoom(1, maxSize, botFactory)];

    function ensureRoomAt(index1Based) {
        while (rooms.length < index1Based && rooms.length < maxRooms) {
            rooms.push(createRoom(rooms.length + 1, maxSize, botFactory));
        }
        return rooms[index1Based - 1] || null;
    }

    function findPlayerRoom(playerId) {
        const normalizedPlayerId = String(playerId || "").trim();
        if (!normalizedPlayerId) return null;
        for (let i = 0; i < rooms.length; i += 1) {
            const room = rooms[i];
            if (room.players.some((player) => player.type === "human" && player.id === normalizedPlayerId)) {
                return room;
            }
        }
        return null;
    }

    function findRoomWithSeat(preferredRoomId = null) {
        if (preferredRoomId) {
            const room = rooms.find((item) => item.roomId === preferredRoomId);
            if (room && countHumanPlayers(room) < room.maxSize) return room;
        }

        for (let index = 0; index < rooms.length; index += 1) {
            const room = rooms[index];
            if (countHumanPlayers(room) < room.maxSize) return room;
        }
        return null;
    }

    function ensureRoomForJoin(preferredRoomId = null) {
        const existing = findRoomWithSeat(preferredRoomId);
        if (existing) return existing;
        if (rooms.length >= maxRooms) return null;
        const newRoom = createRoom(rooms.length + 1, maxSize, botFactory);
        rooms.push(newRoom);
        return newRoom;
    }

    function replaceBotWithHuman(room, playerId, vip = null) {
        const botIndex = room.players.findIndex((player) => player.type === "bot");
        if (botIndex < 0) return false;
        room.players[botIndex] = { type: "human", id: String(playerId), vip };
        return true;
    }

    function replaceHumanWithBot(room, playerId) {
        const humanIndex = room.players.findIndex((player) => player.type === "human" && player.id === String(playerId));
        if (humanIndex < 0) return false;
        room.players[humanIndex] = createBot(botFactory());
        return true;
    }

    function joinPlayer(playerId, options = {}) {
        const normalizedPlayerId = String(playerId || "").trim();
        if (!normalizedPlayerId) {
            throw new Error("playerId is required");
        }

        const existingRoom = findPlayerRoom(normalizedPlayerId);
        if (existingRoom) {
            return { ok: true, roomId: existingRoom.roomId, reused: true };
        }

        const preferredRoomId = Number(options.preferredRoomId || 0) || null;
        const vip = options.vip === "vip2" ? "vip2" : (options.vip === "vip1" ? "vip1" : null);
        const targetRoom = ensureRoomForJoin(preferredRoomId);
        if (!targetRoom) return { ok: false, error: "所有桌位已滿" };

        const replaced = replaceBotWithHuman(targetRoom, normalizedPlayerId, vip);
        if (!replaced) return { ok: false, error: "目前無可替補 Bot" };

        return {
            ok: true,
            roomId: targetRoom.roomId,
            createdRoom: targetRoom.roomId === rooms.length && countHumanPlayers(targetRoom) === 1 && rooms.length > 1
        };
    }

    // VIP2 規則：
    // 1) 優先進入二號桌（roomId=2）。
    // 2) 若二號桌真人數滿 6，嘗試建立 2-B（下一個房間）。
    // 3) 一律以 bot 讓位給真人。
    function joinVip2Player(playerId) {
        ensureRoomAt(2);
        const room2 = rooms.find((room) => room.roomId === 2) || rooms[0];
        if (room2 && countHumanPlayers(room2) < room2.maxSize) {
            return joinPlayer(playerId, { preferredRoomId: room2.roomId, vip: "vip2" });
        }

        for (let i = 0; i < rooms.length; i += 1) {
            const room = rooms[i];
            if (room.roomId <= 2) continue;
            if (countHumanPlayers(room) < room.maxSize) {
                return joinPlayer(playerId, { preferredRoomId: room.roomId, vip: "vip2" });
            }
        }

        const room2B = rooms.length < maxRooms ? ensureRoomAt(rooms.length + 1) : null;
        if (!room2B) return { ok: false, error: "VIP2 桌位已滿" };
        return joinPlayer(playerId, { preferredRoomId: room2B.roomId, vip: "vip2" });
    }

    function leavePlayer(playerId) {
        const normalizedPlayerId = String(playerId || "").trim();
        if (!normalizedPlayerId) return { ok: false, error: "playerId is required" };

        for (let i = 0; i < rooms.length; i += 1) {
            const room = rooms[i];
            const replaced = replaceHumanWithBot(room, normalizedPlayerId);
            if (replaced) return { ok: true, roomId: room.roomId };
        }

        return { ok: false, error: "找不到該玩家" };
    }

    function getSnapshot() {
        return {
            rooms: rooms.map((room) => ({
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
