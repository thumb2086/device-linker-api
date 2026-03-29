import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { getSession } from "../session-store.js";
import { getDisplayName } from "../user-profile.js";
import { settlementService } from "../settlement-service.js";
import { recordGameHistory } from "../game-history.js";
import { canAccessYjcTable, getAccessibleYjcTables, getYjcTableById, resolveYjcVipStatus } from "../yjc-vip.js";

const GAME_KEY = "poker";
const TX_SOURCE = "poker";
const LOCK_KEY = "poker_lock:global";
const TABLE_TTL_SECONDS = 3600;
const ACTIVE_TTL_SECONDS = 3600;
const LOCK_TIMEOUT_MS = 8000;
const BOT_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
const TABLES = [
    { id: "public", label: "公共桌", ante: 1000, seatCount: 6, requiredTier: null },
    { id: "table_1", label: "VIP 一號桌", ante: 10000, seatCount: 6, requiredTier: "vip1" },
    { id: "table_2", label: "VIP 二號桌", ante: 100000, seatCount: 6, requiredTier: "vip2" }
];

function tableKey(tableId) {
    return `poker_table:${String(tableId || "").trim().toLowerCase()}`;
}

function activeKey(address) {
    return `poker_active:${String(address || "").trim().toLowerCase()}`;
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

function clone(value) {
    return JSON.parse(JSON.stringify(value));
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
        handId: "",
        players: Array.from({ length: config.seatCount }, (_, index) => createBot(index, config.id)),
        turnOrder: [],
        currentTurnId: "",
        currentBet: config.ante,
        commits: {},
        folded: {},
        acted: {},
        communityCards: [],
        holeCards: {},
        showdownCards: {},
        winners: [],
        resultSummary: "",
        log: ["支援多人同桌，空位由 bot 補位；1 位真人也可開局"]
    };
}

function humanPlayers(table) {
    return (table.players || []).filter((player) => player.type === "human");
}

function alivePlayers(table) {
    return (table.players || []).filter((player) => !table.folded[player.id]);
}

async function acquireLock() {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < LOCK_TIMEOUT_MS) {
        const acquired = await kv.set(LOCK_KEY, token, { nx: true, ex: 10 });
        if (acquired === "OK" || acquired === true) return token;
        await sleep(100);
    }
    throw new Error("德州撲克系統忙碌中，請稍後再試");
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

function generateDeck() {
    const suits = ["S", "H", "D", "C"];
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
    const deck = [];
    suits.forEach((suit) => ranks.forEach((rank) => deck.push(rank + suit)));
    for (let index = deck.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
}

function cardRank(card) {
    return "23456789TJQKA".indexOf(String(card || "").charAt(0)) + 2;
}

function cardSuit(card) {
    return String(card || "").slice(1);
}

function compareScores(left, right) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
        const leftValue = Number(left[index] || 0);
        const rightValue = Number(right[index] || 0);
        if (leftValue > rightValue) return 1;
        if (leftValue < rightValue) return -1;
    }
    return 0;
}

function evaluateFive(cards) {
    const ranks = cards.map(cardRank).sort((a, b) => b - a);
    const suits = cards.map(cardSuit);
    const counts = new Map();
    ranks.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));
    const entries = Array.from(counts.entries()).sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
    const uniqueRanks = Array.from(new Set(ranks));
    let straightHigh = 0;

    if (uniqueRanks.length === 5) {
        if (uniqueRanks[0] - uniqueRanks[4] === 4) {
            straightHigh = uniqueRanks[0];
        } else if (JSON.stringify(uniqueRanks) === JSON.stringify([14, 5, 4, 3, 2])) {
            straightHigh = 5;
        }
    }

    const flush = suits.every((suit) => suit === suits[0]);

    if (flush && straightHigh) return { score: [8, straightHigh], name: "同花順" };
    if (entries[0][1] === 4) return { score: [7, entries[0][0], entries[1][0]], name: "四條" };
    if (entries[0][1] === 3 && entries[1][1] === 2) return { score: [6, entries[0][0], entries[1][0]], name: "葫蘆" };
    if (flush) return { score: [5].concat(ranks), name: "同花" };
    if (straightHigh) return { score: [4, straightHigh], name: "順子" };
    if (entries[0][1] === 3) {
        const kickers = entries.slice(1).map((entry) => entry[0]).sort((a, b) => b - a);
        return { score: [3, entries[0][0]].concat(kickers), name: "三條" };
    }
    if (entries[0][1] === 2 && entries[1][1] === 2) {
        const pairs = [entries[0][0], entries[1][0]].sort((a, b) => b - a);
        return { score: [2, pairs[0], pairs[1], entries[2][0]], name: "兩對" };
    }
    if (entries[0][1] === 2) {
        const kickers = entries.slice(1).map((entry) => entry[0]).sort((a, b) => b - a);
        return { score: [1, entries[0][0]].concat(kickers), name: "一對" };
    }
    return { score: [0].concat(ranks), name: "高牌" };
}

function bestHand(cards) {
    let best = null;
    for (let a = 0; a < cards.length - 4; a += 1) {
        for (let b = a + 1; b < cards.length - 3; b += 1) {
            for (let c = b + 1; c < cards.length - 2; c += 1) {
                for (let d = c + 1; d < cards.length - 1; d += 1) {
                    for (let e = d + 1; e < cards.length; e += 1) {
                        const current = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
                        if (!best || compareScores(current.score, best.score) > 0) best = current;
                    }
                }
            }
        }
    }
    return best || { score: [0], name: "高牌" };
}

function nextAliveId(table, startIndex) {
    const order = Array.isArray(table.turnOrder) ? table.turnOrder : [];
    if (!order.length) return "";
    for (let offset = 0; offset < order.length; offset += 1) {
        const index = (startIndex + offset) % order.length;
        const id = order[index];
        if (!table.folded[id]) return id;
    }
    return "";
}

function resetActed(table, exceptId) {
    table.turnOrder.forEach((playerId) => {
        if (table.folded[playerId]) return;
        table.acted[playerId] = playerId === exceptId;
    });
}

function applyMove(table, playerId, move) {
    const action = normalizeAction(move);
    const player = (table.players || []).find((item) => item.id === playerId);
    const currentCommit = Number(table.commits[playerId] || 0);
    const currentBet = Number(table.currentBet || table.ante);

    if (action === "fold") {
        table.folded[playerId] = true;
        table.acted[playerId] = true;
        table.log.push(`${player.displayName} 蓋牌`);
        return;
    }

    if (action === "raise") {
        const nextBet = currentBet + Number(table.ante);
        table.currentBet = nextBet;
        table.commits[playerId] = nextBet;
        resetActed(table, playerId);
        table.log.push(`${player.displayName} 加注到 ${formatAmount(nextBet)}`);
        return;
    }

    if (action === "call") {
        table.commits[playerId] = currentBet;
        table.acted[playerId] = true;
        table.log.push(`${player.displayName} 跟注`);
        return;
    }

    if (action === "check") {
        if (currentCommit < currentBet) throw new Error("目前不能過牌，請跟注或蓋牌");
        table.acted[playerId] = true;
        table.log.push(`${player.displayName} 過牌`);
        return;
    }

    throw new Error("不支援的操作");
}

function botMove(table, playerId) {
    const currentCommit = Number(table.commits[playerId] || 0);
    const currentBet = Number(table.currentBet || table.ante);
    if (currentCommit < currentBet) {
        if (Math.random() < 0.18) return "fold";
        if (Math.random() < 0.25) return "raise";
        return "call";
    }
    return Math.random() < 0.22 ? "raise" : "check";
}

function shouldShowdown(table) {
    if (alivePlayers(table).length <= 1) return true;
    return alivePlayers(table).every((player) => table.acted[player.id] && Number(table.commits[player.id] || 0) >= Number(table.currentBet || table.ante));
}

async function settleShowdown(table) {
    const alive = alivePlayers(table);
    let winners = [];
    const pot = (table.turnOrder || []).reduce((sum, playerId) => sum + Number(table.commits[playerId] || 0), 0);

    if (alive.length === 1) {
        winners = [{ id: alive[0].id, handName: "對手全蓋牌" }];
    } else {
        let topScore = null;
        const evaluated = alive.map((player) => {
            const hand = bestHand((table.holeCards[player.id] || []).concat(table.communityCards || []));
            return { player, hand };
        });
        evaluated.forEach((item) => {
            if (!topScore || compareScores(item.hand.score, topScore) > 0) topScore = item.hand.score;
        });
        winners = evaluated
            .filter((item) => compareScores(item.hand.score, topScore) === 0)
            .map((item) => ({ id: item.player.id, handName: item.hand.name }));
    }

    table.status = "completed";
    table.currentTurnId = "";
    table.winners = winners;
    table.showdownCards = clone(table.holeCards);
    table.resultSummary = winners.map((winner) => {
        const player = (table.players || []).find((item) => item.id === winner.id);
        return `${player ? player.displayName : winner.id}：${winner.handName}`;
    }).join(" / ");
    table.log.push(`本局結束，底池 ${formatAmount(pot)}，${table.resultSummary}`);

    const winnerIds = winners.map((winner) => winner.id);
    const winnerPayout = winnerIds.length ? Math.floor(pot / winnerIds.length) : 0;
    const decimals = await settlementService.getDecimals();

    await Promise.all(humanPlayers(table).map(async (player) => {
        const committed = Number(table.commits[player.id] || 0);
        const payout = winnerIds.includes(player.id) ? winnerPayout : 0;
        const betWei = ethers.parseUnits(String(committed), decimals);
        const payoutWei = ethers.parseUnits(String(payout), decimals);
        let txHash = "";

        try {
            const settlement = await settlementService.settle({
                userAddress: player.address,
                betWei,
                payoutWei,
                source: TX_SOURCE,
                meta: { tableId: table.tableId, handId: table.handId, committed, payout }
            });
            txHash = settlement.payoutTxHash || settlement.betTxHash || "";
        } catch (error) {
            table.log.push(`${player.displayName} 結算失敗：${error.message || error}`);
        }

        await recordGameHistory({
            address: player.address,
            game: GAME_KEY,
            gameLabel: "德州撲克",
            outcome: payout > 0 ? "win" : "lose",
            outcomeLabel: payout > 0 ? "勝利" : "失利",
            betWei,
            payoutWei,
            netWei: payoutWei - betWei,
            multiplier: committed > 0 ? Number((payout / committed).toFixed(2)) : 0,
            roundId: table.handId,
            mode: "multiplayer",
            txHash,
            details: table.resultSummary,
            decimals
        });
    }));
}

async function runBots(table) {
    let safety = 24;
    while (table.status === "active" && safety > 0) {
        safety -= 1;
        const currentId = String(table.currentTurnId || "").trim();
        const currentPlayer = (table.players || []).find((item) => item.id === currentId);
        if (!currentPlayer || currentPlayer.type === "human") return;
        applyMove(table, currentId, botMove(table, currentId));
        if (shouldShowdown(table)) {
            await settleShowdown(table);
            return;
        }
        const currentIndex = Math.max(0, table.turnOrder.indexOf(currentId));
        table.currentTurnId = nextAliveId(table, currentIndex + 1);
    }
}

async function startHand(table) {
    if (table.status !== "waiting" && table.status !== "completed") throw new Error("目前不可開新局");
    if (humanPlayers(table).length < 1) throw new Error("至少需要 1 位真人玩家才能開局");

    const deck = generateDeck();
    table.handId = `poker_${randomUUID()}`;
    table.status = "active";
    table.turnOrder = table.players.map((player) => player.id);
    table.currentBet = Number(table.ante);
    table.commits = {};
    table.folded = {};
    table.acted = {};
    table.communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    table.holeCards = {};
    table.showdownCards = {};
    table.winners = [];
    table.resultSummary = "";
    table.log = [`新的一局開始，底注 ${formatAmount(table.ante)}`];

    table.players.forEach((player) => {
        table.holeCards[player.id] = [deck.pop(), deck.pop()];
        table.commits[player.id] = Number(table.ante);
        table.folded[player.id] = false;
        table.acted[player.id] = false;
    });

    table.currentTurnId = nextAliveId(table, 0);
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
    delete table.commits[address];
    delete table.folded[address];
    delete table.acted[address];
    delete table.holeCards[address];
    delete table.showdownCards[address];
    table.turnOrder = (table.turnOrder || []).filter((id) => id !== address);
    if (table.currentTurnId === address) {
        table.currentTurnId = nextAliveId(table, 0);
    }
    table.status = humanPlayers(table).length ? "waiting" : "waiting";
    table.log.push("有玩家離桌，等待開新局");
    return true;
}

function playerView(table, viewerId) {
    return (table.players || []).map((player) => ({
        id: player.id,
        displayName: player.displayName,
        type: player.type,
        seat: player.seat,
        folded: !!table.folded[player.id],
        committed: Number(table.commits[player.id] || 0),
        cards: table.status === "completed" || player.id === viewerId ? (table.showdownCards[player.id] || table.holeCards[player.id] || []) : [],
        hasCards: Array.isArray(table.holeCards[player.id]) && table.holeCards[player.id].length > 0,
        winner: (table.winners || []).some((winner) => winner.id === player.id)
    }));
}

function buildResponse(context, table, selectedTableId) {
    const selected = getTableConfig(selectedTableId || (table && table.tableId) || "public");
    const currentTable = table || createTable(selected.id);
    const self = (currentTable.players || []).find((player) => player.address === context.address) || null;
    const currentCommit = self ? Number(currentTable.commits[self.id] || 0) : 0;
    const currentBet = Number(currentTable.currentBet || currentTable.ante);
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
            handId: currentTable.handId,
            players: playerView(currentTable, self ? self.id : ""),
            communityCards: currentTable.communityCards || [],
            currentTurnId: currentTable.currentTurnId || "",
            pot: (currentTable.turnOrder || []).reduce((sum, playerId) => sum + Number(currentTable.commits[playerId] || 0), 0),
            currentBet,
            resultSummary: currentTable.resultSummary || "",
            winners: currentTable.winners || [],
            log: (currentTable.log || []).slice(-12),
            isMyTurn: !!(self && currentTable.currentTurnId === self.id),
            canJoin: !self && currentTable.status !== "active" && canAccessYjcTable(context.yjcVip, currentTable.tableId).allowed,
            canLeave: !!self && currentTable.status !== "active",
            canStart: !!self && (currentTable.status === "waiting" || currentTable.status === "completed"),
            canFold: !!(self && currentTable.status === "active" && currentTable.currentTurnId === self.id),
            canCheck: !!(self && currentTable.status === "active" && currentTable.currentTurnId === self.id && currentCommit >= currentBet),
            canCall: !!(self && currentTable.status === "active" && currentTable.currentTurnId === self.id && currentCommit < currentBet),
            canRaise: !!(self && currentTable.status === "active" && currentTable.currentTurnId === self.id)
        }
    };
}

export default async function pokerHandler(req, res) {
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
            if (table.status === "active") throw new Error("牌局進行中，請等待下一局再入座");
            seatHuman(table, context);
            table.log.push(`${context.displayName} 已入座 ${table.tableLabel}`);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        if (action === "leave_table") {
            if (table.status === "active") throw new Error("牌局進行中不可離桌");
            const removed = removeHuman(table, context.address);
            if (!removed) throw new Error("你目前不在桌上");
            await clearActiveTable(context.address);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, await loadTable(selectedTableId), selectedTableId));
        }

        const self = (table.players || []).find((player) => player.address === context.address);
        if (!self) throw new Error("請先加入桌位");

        if (action === "start_hand") {
            await startHand(table);
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        if (action === "player_action") {
            if (table.status !== "active") throw new Error("目前沒有進行中的牌局");
            if (table.currentTurnId !== self.id) throw new Error("還沒輪到你");
            applyMove(table, self.id, body.move);
            if (shouldShowdown(table)) {
                await settleShowdown(table);
            } else {
                const currentIndex = Math.max(0, table.turnOrder.indexOf(self.id));
                table.currentTurnId = nextAliveId(table, currentIndex + 1);
                await runBots(table);
            }
            await saveTable(table);
            return res.status(200).json(buildResponse(context, table, selectedTableId));
        }

        throw new Error(`Unsupported poker action: ${action}`);
    } finally {
        await releaseLock(lock);
    }
}
