import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { getSession } from "../session-store.js";
import { getDisplayName } from "../user-profile.js";
import { settlementService } from "../settlement-service.js";
import { recordGameHistory } from "../game-history.js";
import { canAccessYjcTable, getAccessibleYjcTables, getYjcTableById, resolveYjcVipStatus } from "../yjc-vip.js";

const GAME_KEY = "bluffdice";
const TX_SOURCE = "bluffdice";
const LOCK_KEY = "bluffdice_lock:global";
const TABLE_TTL_SECONDS = 3600;
const ACTIVE_TTL_SECONDS = 3600;
const LOCK_TIMEOUT_MS = 8000;
const BOT_NAMES = ["霧狼", "銀狐", "赤刃", "青梟"];
const TABLES = [
    { id: "public", label: "公共桌", ante: 1000, seatCount: 4, requiredTier: null },
    { id: "table_1", label: "VIP 一號桌", ante: 10000, seatCount: 4, requiredTier: "vip1" },
    { id: "table_2", label: "VIP 二號桌", ante: 100000, seatCount: 4, requiredTier: "vip2" }
];

function tableKey(tableId) {
    return `bluffdice_table:${String(tableId || "").trim().toLowerCase()}`;
}

function activeKey(address) {
    return `bluffdice_active:${String(address || "").trim().toLowerCase()}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
    return new Date().toISOString();
}

function formatAmount(value) {
    return Number(value || 0).toLocaleString("zh-TW");
}

function normalizeAction(value) {
    return String(value || "status").trim().toLowerCase();
}

function normalizeAddressOrThrow(input, field = "address") {
    try {
        return ethers.getAddress(String(input || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${field} 格式錯誤`);
    }
}

function shortAddress(address) {
    const text = String(address || "").trim();
    if (!text) return "-";
    return text.length <= 12 ? text : `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function getTableConfig(tableId) {
    const normalized = String(tableId || "public").trim().toLowerCase();
    return TABLES.find((table) => table.id === normalized) || TABLES[0];
}

function createBot(index, tableId) {
    return {
        id: `bot_${tableId}_${index + 1}`,
        address: "",
        displayName: BOT_NAMES[index % BOT_NAMES.length],
        type: "bot",
        seat: index + 1
    };
}

function createTable(tableId) {
    const config = getTableConfig(tableId);
    return {
        tableId: config.id,
        tableLabel: config.label,
        ante: config.ante,
        requiredTier: config.requiredTier,
        status: "waiting",
        roundId: "",
        players: Array.from({ length: config.seatCount }, (_, index) => createBot(index, config.id)),
        turnOrder: [],
        currentTurnId: "",
        dice: {},
        currentBid: null,
        loserId: "",
        winners: [],
        revealedCount: 0,
        revealedFace: 0,
        resultSummary: "",
        log: ["支援多人同桌，空位由 bot 補位；1 位真人也可開局"]
    };
}

function humanPlayers(table) {
    return (table.players || []).filter((player) => player.type === "human");
}

async function acquireLock() {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < LOCK_TIMEOUT_MS) {
        const acquired = await kv.set(LOCK_KEY, token, { nx: true, ex: 10 });
        if (acquired === "OK" || acquired === true) return token;
        await sleep(100);
    }
    throw new Error("吹牛骰子系統忙碌中，請稍後再試");
}

async function releaseLock(token) {
    if (!token) return;
    try {
        const current = await kv.get(LOCK_KEY);
        if (current === token) await kv.del(LOCK_KEY);
    } catch (_) {
        // ignore
    }
}

async function saveTable(table) {
    await kv.set(tableKey(table.tableId), table, { ex: TABLE_TTL_SECONDS });
    await Promise.all(humanPlayers(table).map((player) => {
        return kv.set(activeKey(player.address), table.tableId, { ex: ACTIVE_TTL_SECONDS });
    }));
}

async function loadTable(tableId) {
    const config = getTableConfig(tableId);
    const stored = await kv.get(tableKey(config.id));
    return stored && typeof stored === "object" ? stored : createTable(config.id);
}

async function loadActiveTable(address) {
    const activeTableId = await kv.get(activeKey(address));
    if (!activeTableId) return null;
    return loadTable(activeTableId);
}

async function clearActiveTable(address) {
    await kv.del(activeKey(address));
}

async function requireContext(body) {
    const sessionId = String(body && body.sessionId || "").trim();
    if (!sessionId) throw new Error("Missing sessionId");
    const session = await getSession(sessionId);
    if (!session || !session.address) throw new Error("Session expired");
    const address = normalizeAddressOrThrow(session.address, "session address");
    const displayName = String(session.displayName || await getDisplayName(address) || "").trim() || shortAddress(address);
    const yjcVip = await resolveYjcVipStatus(address);
    return { session, address, displayName, yjcVip };
}

function buildTables(yjcVip) {
    const accessible = getAccessibleYjcTables(yjcVip).map((item) => item.id);
    return TABLES.map((table) => {
        const access = canAccessYjcTable(yjcVip, table.id);
        return {
            id: table.id,
            label: table.label,
            ante: table.ante,
            allowed: access.allowed,
            requiredTier: table.requiredTier,
            requiredTierLabel: access.requiredTierLabel,
            accessible: accessible.includes(table.id)
        };
    });
}

function rollDiceSet() {
    return [1, 2, 3, 4, 5].map(() => 1 + Math.floor(Math.random() * 6));
}

function countFace(table, face) {
    return Object.values(table.dice || {}).reduce((sum, dice) => {
        return sum + (Array.isArray(dice) ? dice.filter((value) => value === face).length : 0);
    }, 0);
}

function isHigherBid(nextBid, currentBid) {
    if (!currentBid) return nextBid.quantity >= 1 && nextBid.face >= 1 && nextBid.face <= 6;
    if (nextBid.quantity > currentBid.quantity) return true;
    return nextBid.quantity === currentBid.quantity && nextBid.face > currentBid.face;
}

function nextTurnId(table, startIndex) {
    const order = Array.isArray(table.turnOrder) ? table.turnOrder : [];
    if (!order.length) return "";
    return order[startIndex % order.length];
}

function botBid(table, playerId) {
    const dice = table.dice[playerId] || [];
    const counts = [1, 2, 3, 4, 5, 6].map((face) => ({
        face,
        count: dice.filter((value) => value === face).length
    })).sort((a, b) => (b.count - a.count) || (b.face - a.face));
    const strongest = counts[0] || { face: 6, count: 1 };
    const currentBid = table.currentBid;
    let bid = currentBid
        ? { quantity: currentBid.quantity, face: currentBid.face + 1 }
        : { quantity: Math.max(1, strongest.count), face: strongest.face };

    if (bid.face > 6) {
        bid = { quantity: (currentBid ? currentBid.quantity + 1 : strongest.count + 1), face: strongest.face };
    }
    if (!isHigherBid(bid, currentBid)) {
        bid = { quantity: (currentBid ? currentBid.quantity + 1 : strongest.count + 1), face: strongest.face };
    }
    return bid;
}

function shouldBotChallenge(table, playerId) {
    const currentBid = table.currentBid;
    if (!currentBid) return false;
    const ownCount = (table.dice[playerId] || []).filter((value) => value === currentBid.face).length;
    const estimate = ownCount + Math.max(0, table.players.length - 1);
    if (currentBid.quantity > estimate + 1) return true;
    return Math.random() < 0.18;
}

async function settleRound(table, challengerId) {
    const bid = table.currentBid;
    const actualCount = countFace(table, bid.face);
    const loserId = actualCount >= bid.quantity ? challengerId : bid.bidderId;
    const winners = (table.players || []).filter((player) => player.id !== loserId).map((player) => ({
        id: player.id,
        displayName: player.displayName
    }));
    const humanWinnerIds = winners
        .filter((player) => (table.players || []).some((item) => item.id === player.id && item.type === "human"))
        .map((player) => player.id);
    const pot = Number(table.ante || 0) * (table.players || []).length;
    const winnerPayout = humanWinnerIds.length ? Math.floor(pot / humanWinnerIds.length) : 0;
    const decimals = await settlementService.getDecimals();

    table.status = "completed";
    table.currentTurnId = "";
    table.loserId = loserId;
    table.winners = winners;
    table.revealedCount = actualCount;
    table.revealedFace = bid.face;
    table.resultSummary = `${actualCount} 顆 ${bid.face} 點，${winners.map((winner) => winner.displayName).join(" / ")} 勝出`;
    table.log.push(`揭骰：全桌共有 ${actualCount} 顆 ${bid.face} 點`);

    await Promise.all(humanPlayers(table).map(async (player) => {
        const isWinner = humanWinnerIds.includes(player.id);
        const betWei = ethers.parseUnits(String(table.ante), decimals);
        const payoutWei = ethers.parseUnits(String(isWinner ? winnerPayout : 0), decimals);
        let txHash = "";

        try {
            const settlement = await settlementService.settle({
                userAddress: player.address,
                betWei,
                payoutWei,
                source: TX_SOURCE,
                meta: { tableId: table.tableId, roundId: table.roundId, face: bid.face, quantity: bid.quantity }
            });
            txHash = settlement.payoutTxHash || settlement.betTxHash || "";
        } catch (error) {
            table.log.push(`${player.displayName} 結算失敗：${error.message || error}`);
        }

        await recordGameHistory({
            address: player.address,
            game: GAME_KEY,
            gameLabel: "吹牛骰子",
            outcome: isWinner ? "win" : "lose",
            outcomeLabel: isWinner ? "勝利" : "失利",
            betWei,
            payoutWei,
            netWei: payoutWei - betWei,
            multiplier: isWinner ? Number((winnerPayout / table.ante).toFixed(2)) : 0,
            roundId: table.roundId,
            mode: "multiplayer",
            txHash,
            details: table.resultSummary,
            decimals
        });
    }));
}

async function runBots(table) {
    let safety = 18;
    while (table.status === "active" && safety > 0) {
        safety -= 1;
        const currentId = String(table.currentTurnId || "").trim();
        const currentPlayer = (table.players || []).find((player) => player.id === currentId);
        if (!currentPlayer || currentPlayer.type === "human") return;

        if (shouldBotChallenge(table, currentId)) {
            table.log.push(`${currentPlayer.displayName} 質疑上一口`);
            await settleRound(table, currentId);
            return;
        }

        const bid = botBid(table, currentId);
        table.currentBid = { ...bid, bidderId: currentId };
        table.log.push(`${currentPlayer.displayName} 喊 ${bid.quantity} 顆 ${bid.face}`);
        const currentIndex = Math.max(0, table.turnOrder.indexOf(currentId));
        table.currentTurnId = nextTurnId(table, currentIndex + 1);
    }
}

async function startRound(table) {
    if (table.status !== "waiting" && table.status !== "completed") throw new Error("目前不可開新局");
    if (humanPlayers(table).length < 1) throw new Error("至少需要 1 位真人玩家才能開局");

    table.status = "active";
    table.roundId = `bluff_${randomUUID()}`;
    table.turnOrder = table.players.map((player) => player.id);
    table.currentTurnId = table.turnOrder[0] || "";
    table.dice = {};
    table.currentBid = null;
    table.loserId = "";
    table.winners = [];
    table.revealedCount = 0;
    table.revealedFace = 0;
    table.resultSummary = "";
    table.log = [`新的一局開始，底注 ${formatAmount(table.ante)}`];

    table.players.forEach((player) => {
        table.dice[player.id] = rollDiceSet();
    });

    await runBots(table);
}

function seatHuman(table, context) {
    if ((table.players || []).some((player) => player.address === context.address)) return;
    const seat = (table.players || []).find((player) => player.type === "bot");
    if (!seat) throw new Error("桌位已滿");
    seat.id = context.address;
    seat.address = context.address;
    seat.displayName = context.displayName;
    seat.type = "human";
    seat.vipTierKey = context.yjcVip && context.yjcVip.tier ? context.yjcVip.tier.key : "none";
}

function removeHuman(table, address) {
    const player = (table.players || []).find((item) => item.address === address);
    if (!player) return false;
    const replacement = createBot(player.seat - 1, table.tableId);
    replacement.seat = player.seat;
    Object.assign(player, replacement);
    delete table.dice[address];
    table.turnOrder = (table.turnOrder || []).filter((id) => id !== address);
    if (table.currentTurnId === address) table.currentTurnId = table.turnOrder[0] || "";
    table.status = "waiting";
    table.log.push("有玩家離桌，等待開新局");
    return true;
}

function playerView(table, viewerId) {
    return (table.players || []).map((player) => ({
        id: player.id,
        displayName: player.displayName,
        type: player.type,
        seat: player.seat,
        dice: table.status === "completed" || player.id === viewerId ? (table.dice[player.id] || []) : [],
        diceCount: Array.isArray(table.dice[player.id]) ? table.dice[player.id].length : 0,
        loser: table.loserId === player.id,
        winner: (table.winners || []).some((winner) => winner.id === player.id)
    }));
}

function buildResponse(context, table, selectedTableId) {
    const selected = getTableConfig(selectedTableId || (table && table.tableId) || "public");
    const currentTable = table || createTable(selected.id);
    const self = (currentTable.players || []).find((player) => player.address === context.address) || null;
    return {
        success: true,
        game: GAME_KEY,
        tables: buildTables(context.yjcVip),
        selectedTableId: selected.id,
        yjcVip: context.yjcVip,
        table: {
            tableId: currentTable.tableId,
            tableLabel: currentTable.tableLabel,
            ante: currentTable.ante,
            status: currentTable.status,
            roundId: currentTable.roundId,
            players: playerView(currentTable, self ? self.id : ""),
            currentBid: currentTable.currentBid,
            currentTurnId: currentTable.currentTurnId || "",
            revealedCount: currentTable.revealedCount || 0,
            revealedFace: currentTable.revealedFace || 0,
            resultSummary: currentTable.resultSummary || "",
            winners: currentTable.winners || [],
            log: (currentTable.log || []).slice(-12),
            isMyTurn: !!(self && currentTable.currentTurnId === self.id),
            canJoin: !self && currentTable.status !== "active" && canAccessYjcTable(context.yjcVip, currentTable.tableId).allowed,
            canLeave: !!self && currentTable.status !== "active",
            canStart: !!self && (currentTable.status === "waiting" || currentTable.status === "completed"),
            canBid: !!(self && currentTable.status === "active" && currentTable.currentTurnId === self.id),
            canChallenge: !!(self && currentTable.status === "active" && currentTable.currentTurnId === self.id && currentTable.currentBid)
        }
    };
}

export default async function bluffdiceHandler(req, res) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = normalizeAction(body.action);
    const selectedTableId = String(body.tableId || "public").trim().toLowerCase() || "public";
    const context = await requireContext(body);

    if (action === "status") {
        const activeTable = await loadActiveTable(context.address);
        const table = activeTable || await loadTable(selectedTableId);
        return res.status(200).json(buildResponse(context, table, selectedTableId));
    }

    const lock = await acquireLock();
    try {
        let table = await loadActiveTable(context.address);
        if (!table) table = await loadTable(selectedTableId);

        if (action === "join_table") {
            const access = canAccessYjcTable(context.yjcVip, selectedTableId);
            if (!access.allowed) throw new Error(`進入 ${getYjcTableById(selectedTableId).label} 需要 ${access.requiredTierLabel}`);
            if (table.tableId !== selectedTableId && !(table.players || []).some((player) => player.address === context.address)) {
                table = await loadTable(selectedTableId);
            }
            if (table.status === "active") throw new Error("回合進行中，請等待下一局再入座");
            seatHuman(table, context);
            table.log.push(`${context.displayName} 已入座 ${table.tableLabel}`);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        if (action === "leave_table") {
            if (table.status === "active") throw new Error("回合進行中不可離桌");
            const removed = removeHuman(table, context.address);
            if (!removed) throw new Error("你目前不在桌上");
            await clearActiveTable(context.address);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, await loadTable(selectedTableId), selectedTableId));
        }

        const self = (table.players || []).find((player) => player.address === context.address);
        if (!self) throw new Error("請先加入桌位");

        if (action === "start_round") {
            await startRound(table);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        if (action === "bid") {
            if (table.status !== "active") throw new Error("目前沒有進行中的回合");
            if (table.currentTurnId !== self.id) throw new Error("還沒輪到你");
            const bid = {
                quantity: Math.max(1, Math.floor(Number(body.quantity || 0))),
                face: Math.max(1, Math.min(6, Math.floor(Number(body.face || 0))))
            };
            if (!isHigherBid(bid, table.currentBid)) throw new Error("新的喊骰必須比上一口更大");
            table.currentBid = { ...bid, bidderId: self.id };
            table.log.push(`${self.displayName} 喊 ${bid.quantity} 顆 ${bid.face}`);
            const currentIndex = Math.max(0, table.turnOrder.indexOf(self.id));
            table.currentTurnId = nextTurnId(table, currentIndex + 1);
            await runBots(table);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        if (action === "challenge") {
            if (table.status !== "active") throw new Error("目前沒有進行中的回合");
            if (table.currentTurnId !== self.id) throw new Error("還沒輪到你");
            if (!table.currentBid) throw new Error("目前還沒有可質疑的喊骰");
            table.log.push(`${self.displayName} 質疑上一口`);
            await settleRound(table, self.id);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        throw new Error(`Unsupported bluffdice action: ${action}`);
    } finally {
        await releaseLock(lock);
    }
}
