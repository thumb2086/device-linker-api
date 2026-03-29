import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { getSession } from "../session-store.js";
import { recordGameHistory } from "../game-history.js";
import { getDisplayName } from "../user-profile.js";
import { settlementService } from "../settlement-service.js";

const TX_SOURCE = "duel";
const REQUIRED_WINS = 2;
const ROUND_TIMEOUT_MS = 45000;
const MATCH_TTL_SECONDS = 3600;
const ACTIVE_TTL_SECONDS = 3600;
const WAITING_QUEUE_TTL_SECONDS = 900;
const WAITING_PLAYER_TTL_SECONDS = 3600;
const STATE_LOCK_KEY = "duel_lock:global";
const STAKE_TIERS = [1000, 5000, 10000];

function matchKey(id) {
    return `duel_match:${String(id || "").trim()}`;
}

function activeMatchKey(address) {
    return `duel_active:${String(address || "").trim().toLowerCase()}`;
}

function waitingQueueKey(stakeTier) {
    return `duel_queue:${String(stakeTier || "").trim()}`;
}

function waitingPlayerKey(address) {
    return `duel_waiting:${String(address || "").trim().toLowerCase()}`;
}

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortAddress(address) {
    const text = String(address || "").trim();
    if (!text) return "-";
    if (text.length <= 14) return text;
    return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function fallbackDisplayName(address, displayName) {
    const clean = String(displayName || "").trim();
    return clean || shortAddress(address);
}

function normalizeAddressOrThrow(input, field = "address") {
    try {
        return ethers.getAddress(String(input || "").trim()).toLowerCase();
    } catch {
        throw new Error(`${field} 格式錯誤`);
    }
}

function normalizeStakeTier(input) {
    const stakeTier = Number(input);
    if (!Number.isFinite(stakeTier) || !STAKE_TIERS.includes(stakeTier)) {
        throw new Error(`不支援的賭注檔位: ${input}`);
    }
    return stakeTier;
}

function formatStake(stakeTier) {
    return Number(stakeTier || 0).toLocaleString();
}

function createRound(roundNumber) {
    return {
        number: roundNumber,
        startedAt: Date.now(),
        deadlineAt: Date.now() + ROUND_TIMEOUT_MS,
        submissions: {}
    };
}

function rollThreeDice() {
    const dice = [
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6)
    ];
    const total = dice[0] + dice[1] + dice[2];
    return { dice, total };
}

function getPlayer(match, address) {
    return (match.players || []).find((player) => player.address === address) || null;
}

function getOpponent(match, address) {
    return (match.players || []).find((player) => player.address !== address) || null;
}

function appendLog(match, message) {
    if (!Array.isArray(match.log)) match.log = [];
    match.log.push(String(message || "").trim());
    match.log = match.log.slice(-16);
}

function isWaitingEntry(entry) {
    return !!(entry && typeof entry === "object" && entry.address && entry.stakeTier);
}

async function acquireStateLock(timeoutMs = 8000) {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(STATE_LOCK_KEY, token, { nx: true, ex: 10 });
        if (acquired === "OK" || acquired === true) {
            return { token };
        }
        await sleep(120);
    }

    throw new Error("PVP 對戰系統忙碌中，請稍後再試");
}

async function releaseStateLock(lock) {
    if (!lock || !lock.token) return;
    try {
        const currentToken = await kv.get(STATE_LOCK_KEY);
        if (currentToken === lock.token) {
            await kv.del(STATE_LOCK_KEY);
        }
    } catch (_) {
        // ignore unlock failures
    }
}

async function saveMatch(match) {
    await kv.set(matchKey(match.id), match, { ex: MATCH_TTL_SECONDS });
    await Promise.all((match.players || []).map((player) => {
        return kv.set(activeMatchKey(player.address), match.id, { ex: ACTIVE_TTL_SECONDS });
    }));
}

async function clearActiveMatch(addresses) {
    await Promise.all((addresses || []).map((address) => kv.del(activeMatchKey(address))));
}

async function loadMatchForAddress(address) {
    const activeId = await kv.get(activeMatchKey(address));
    if (!activeId) return null;
    const match = await kv.get(matchKey(activeId));
    if (!match) {
        await kv.del(activeMatchKey(address));
        return null;
    }
    return match;
}

async function loadWaitingEntryForPlayer(address) {
    const entry = await kv.get(waitingPlayerKey(address));
    if (!isWaitingEntry(entry)) return null;
    return {
        ...entry,
        address: normalizeAddressOrThrow(entry.address, "waiting address"),
        stakeTier: normalizeStakeTier(entry.stakeTier)
    };
}

async function loadQueueEntryForTier(stakeTier) {
    const entry = await kv.get(waitingQueueKey(stakeTier));
    if (!isWaitingEntry(entry)) return null;
    const address = normalizeAddressOrThrow(entry.address, "queue address");
    const waitingEntry = await loadWaitingEntryForPlayer(address);
    if (!waitingEntry || waitingEntry.stakeTier !== stakeTier) {
        await kv.del(waitingQueueKey(stakeTier));
        return null;
    }
    return waitingEntry;
}

async function saveWaitingEntry(entry) {
    const normalized = {
        ...entry,
        address: normalizeAddressOrThrow(entry.address, "waiting address"),
        stakeTier: normalizeStakeTier(entry.stakeTier)
    };
    await kv.set(waitingPlayerKey(normalized.address), normalized, { ex: WAITING_PLAYER_TTL_SECONDS });
    await kv.set(waitingQueueKey(normalized.stakeTier), normalized, { ex: WAITING_QUEUE_TTL_SECONDS });
    return normalized;
}

async function clearWaitingEntry(address, stakeTier) {
    await kv.del(waitingPlayerKey(address));
    if (stakeTier && STAKE_TIERS.includes(Number(stakeTier))) {
        const queueEntry = await kv.get(waitingQueueKey(stakeTier));
        if (queueEntry && String(queueEntry.address || "").toLowerCase() === String(address || "").toLowerCase()) {
            await kv.del(waitingQueueKey(stakeTier));
        }
    }
}

function buildIdlePayload() {
    return {
        status: "idle",
        stakeTiers: STAKE_TIERS,
        requiredWins: REQUIRED_WINS,
        roundTimeoutMs: ROUND_TIMEOUT_MS
    };
}

function buildWaitingPayload(waitingEntry) {
    return {
        status: "waiting",
        stakeTiers: STAKE_TIERS,
        requiredWins: REQUIRED_WINS,
        roundTimeoutMs: ROUND_TIMEOUT_MS,
        waiting: {
            stakeTier: waitingEntry.stakeTier,
            queuedAt: waitingEntry.queuedAt,
            displayName: waitingEntry.displayName,
            txHash: waitingEntry.txHash || "",
            note: "等待同檔位玩家加入"
        }
    };
}

function buildResolvedRounds(match, address) {
    const opponent = getOpponent(match, address);
    return (Array.isArray(match.resolvedRounds) ? match.resolvedRounds : []).slice(-6).map((round) => {
        const myKey = address;
        const opponentKey = opponent ? opponent.address : "";
        return {
            number: round.number,
            myDice: Array.isArray(round.dice && round.dice[myKey]) ? round.dice[myKey] : [],
            myTotal: Number(round.totals && round.totals[myKey]) || 0,
            opponentDice: Array.isArray(round.dice && round.dice[opponentKey]) ? round.dice[opponentKey] : [],
            opponentTotal: Number(round.totals && round.totals[opponentKey]) || 0,
            outcome: !round.winnerAddress ? "tie" : (round.winnerAddress === address ? "win" : "lose"),
            winnerAddress: round.winnerAddress || "",
            winnerDisplayName: round.winnerDisplayName || "",
            summary: round.summary || ""
        };
    });
}

function canClaimTimeout(match, address) {
    if (!match || match.status !== "active" || !match.currentRound) return false;
    if (Date.now() < Number(match.currentRound.deadlineAt || 0)) return false;

    const selfSubmission = match.currentRound.submissions && match.currentRound.submissions[address];
    if (!selfSubmission) return false;

    const opponent = getOpponent(match, address);
    if (!opponent) return false;
    const opponentSubmission = match.currentRound.submissions && match.currentRound.submissions[opponent.address];
    return !opponentSubmission;
}

function buildMatchPayload(match, address) {
    const self = getPlayer(match, address);
    const opponent = getOpponent(match, address);
    const currentRound = match.currentRound || createRound(1);
    const mySubmitted = !!(currentRound.submissions && currentRound.submissions[address]);
    const opponentSubmitted = !!(opponent && currentRound.submissions && currentRound.submissions[opponent.address]);

    return {
        status: "match",
        stakeTiers: STAKE_TIERS,
        requiredWins: REQUIRED_WINS,
        roundTimeoutMs: ROUND_TIMEOUT_MS,
        match: {
            id: match.id,
            status: match.status,
            stakeTier: match.stakeTier,
            self: {
                address: self ? self.address : address,
                displayName: self ? self.displayName : fallbackDisplayName(address),
                score: self ? Number(self.score || 0) : 0,
                submitted: mySubmitted
            },
            opponent: {
                address: opponent ? opponent.address : "",
                displayName: opponent ? opponent.displayName : "等待對手",
                score: opponent ? Number(opponent.score || 0) : 0,
                submitted: opponentSubmitted
            },
            score: {
                self: self ? Number(self.score || 0) : 0,
                opponent: opponent ? Number(opponent.score || 0) : 0,
                target: REQUIRED_WINS
            },
            roundNumber: Number(currentRound.number || 1),
            resolvedRounds: buildResolvedRounds(match, address),
            canRoll: match.status === "active" && !mySubmitted,
            canClaimTimeout: canClaimTimeout(match, address),
            canRetryPayout: match.status === "settling" && match.winnerAddress === address,
            currentRound: {
                number: Number(currentRound.number || 1),
                mySubmitted,
                opponentSubmitted,
                deadlineMs: match.status === "active" ? Math.max(0, Number(currentRound.deadlineAt || 0) - Date.now()) : 0
            },
            winnerAddress: match.winnerAddress || "",
            winnerDisplayName: match.winnerDisplayName || "",
            payoutTxHash: match.payoutTxHash || "",
            settlementError: match.settlementError || "",
            log: Array.isArray(match.log) ? match.log.slice(-12) : []
        }
    };
}

async function ensureStakeAvailable(address, stakeTier) {
    const decimals = await settlementService.getDecimals();
    const stakeWei = ethers.parseUnits(String(stakeTier), decimals);
    const balanceWei = await settlementService.contract.balanceOf(address);
    if (balanceWei < stakeWei) {
        throw new Error(`餘額不足，無法加入 ${formatStake(stakeTier)} 檔位`);
    }
    return { decimals, stakeWei };
}

async function debitStake(address, stakeTier, meta) {
    const { decimals, stakeWei } = await ensureStakeAvailable(address, stakeTier);
    const result = await settlementService.settle({
        userAddress: address,
        betWei: stakeWei,
        payoutWei: 0n,
        source: TX_SOURCE,
        meta
    });
    await kv.incrbyfloat(`total_bet:${address}`, stakeTier);
    return {
        txHash: result.betTxHash || "",
        decimals,
        stakeWei
    };
}

async function refundStake(address, stakeTier, meta) {
    const decimals = await settlementService.getDecimals();
    const stakeWei = ethers.parseUnits(String(stakeTier), decimals);
    const result = await settlementService.settle({
        userAddress: address,
        betWei: 0n,
        payoutWei: stakeWei,
        source: TX_SOURCE,
        meta
    });
    await kv.incrbyfloat(`total_bet:${address}`, -stakeTier);
    return {
        txHash: result.payoutTxHash || result.betTxHash || "",
        decimals,
        stakeWei
    };
}

function resolveRound(match) {
    const submissions = match.currentRound && match.currentRound.submissions ? match.currentRound.submissions : {};
    const first = match.players[0];
    const second = match.players[1];
    const firstSubmission = submissions[first.address];
    const secondSubmission = submissions[second.address];

    if (!firstSubmission || !secondSubmission) return null;

    const round = {
        number: Number(match.currentRound.number || 1),
        dice: {
            [first.address]: firstSubmission.dice,
            [second.address]: secondSubmission.dice
        },
        totals: {
            [first.address]: firstSubmission.total,
            [second.address]: secondSubmission.total
        },
        winnerAddress: "",
        winnerDisplayName: "",
        summary: ""
    };

    if (firstSubmission.total === secondSubmission.total) {
        round.summary = `第 ${round.number} 局平手，${first.displayName} ${firstSubmission.total} 點，${second.displayName} ${secondSubmission.total} 點`;
        appendLog(match, round.summary);
    } else {
        const winner = firstSubmission.total > secondSubmission.total ? first : second;
        const loser = winner.address === first.address ? second : first;
        winner.score = Number(winner.score || 0) + 1;
        round.winnerAddress = winner.address;
        round.winnerDisplayName = winner.displayName;
        round.summary = `第 ${round.number} 局 ${winner.displayName} 以 ${round.totals[winner.address]} 點勝過 ${loser.displayName} 的 ${round.totals[loser.address]} 點`;
        appendLog(match, round.summary);
    }

    if (!Array.isArray(match.resolvedRounds)) match.resolvedRounds = [];
    match.resolvedRounds.push(round);
    return round;
}

function startNextRound(match) {
    match.currentRound = createRound(Number((match.currentRound && match.currentRound.number) || 1) + 1);
    match.updatedAt = nowIso();
    appendLog(match, `進入第 ${match.currentRound.number} 局，等待雙方擲骰`);
}

function createMatch(waitingEntry, challengerAddress, challengerDisplayName) {
    const opponentAddress = normalizeAddressOrThrow(waitingEntry.address, "queue address");
    const opponentDisplayName = fallbackDisplayName(opponentAddress, waitingEntry.displayName);
    const match = {
        id: `duel_${randomUUID()}`,
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        stakeTier: waitingEntry.stakeTier,
        players: [
            { address: opponentAddress, displayName: opponentDisplayName, score: 0 },
            { address: challengerAddress, displayName: challengerDisplayName, score: 0 }
        ],
        currentRound: createRound(1),
        resolvedRounds: [],
        winnerAddress: "",
        winnerDisplayName: "",
        payoutTxHash: "",
        settlementError: "",
        historyRecorded: false,
        log: [
            `${opponentDisplayName} 已在 ${formatStake(waitingEntry.stakeTier)} 檔位等待對手`,
            `${challengerDisplayName} 加入對戰，開始第 1 局擲骰`
        ]
    };
    appendLog(match, "雙方各擲 3 顆骰子，比總點數高低，先贏 2 局者勝出");
    return match;
}

async function recordMatchHistory(match, payoutTxHash) {
    if (match.historyRecorded) return;

    const decimals = await settlementService.getDecimals();
    const betWei = ethers.parseUnits(String(match.stakeTier), decimals);
    const payoutWei = ethers.parseUnits(String(match.stakeTier * 2), decimals);
    const winner = (match.players || []).find((player) => player.address === match.winnerAddress);
    const loser = (match.players || []).find((player) => player.address !== match.winnerAddress);

    if (winner) {
        await recordGameHistory({
            address: winner.address,
            game: "duel",
            gameLabel: "PVP 對戰",
            outcome: "win",
            outcomeLabel: "對戰獲勝",
            betWei,
            payoutWei,
            netWei: payoutWei - betWei,
            multiplier: 2,
            roundId: match.id,
            mode: "pvp",
            txHash: payoutTxHash,
            details: `對手 ${loser ? loser.displayName : "-"} / 比分 ${winner.score}:${loser ? loser.score : 0}`,
            decimals
        });
    }

    if (loser) {
        await recordGameHistory({
            address: loser.address,
            game: "duel",
            gameLabel: "PVP 對戰",
            outcome: "lose",
            outcomeLabel: "對戰失利",
            betWei,
            payoutWei: 0n,
            netWei: -betWei,
            multiplier: 0,
            roundId: match.id,
            mode: "pvp",
            txHash: payoutTxHash,
            details: `對手 ${winner ? winner.displayName : "-"} / 比分 ${loser.score}:${winner ? winner.score : 0}`,
            decimals
        });
    }

    match.historyRecorded = true;
}

async function settleWinner(match) {
    const decimals = await settlementService.getDecimals();
    const payoutWei = ethers.parseUnits(String(match.stakeTier * 2), decimals);

    try {
        const result = await settlementService.settle({
            userAddress: match.winnerAddress,
            betWei: 0n,
            payoutWei,
            source: TX_SOURCE,
            meta: {
                matchId: match.id,
                action: "payout",
                stakeTier: match.stakeTier
            }
        });

        match.status = "finished";
        match.updatedAt = nowIso();
        match.finishedAt = nowIso();
        match.payoutTxHash = result.payoutTxHash || result.betTxHash || "";
        match.settlementError = "";
        appendLog(match, `${match.winnerDisplayName} 已收到 ${formatStake(match.stakeTier * 2)} 子熙幣獎金`);
        await recordMatchHistory(match, match.payoutTxHash);
        await saveMatch(match);

        return {
            txHash: match.payoutTxHash,
            payoutAmount: match.stakeTier * 2
        };
    } catch (error) {
        match.status = "settling";
        match.updatedAt = nowIso();
        match.settlementError = error.message || "派彩失敗";
        appendLog(match, `派彩失敗：${match.settlementError}`);
        await saveMatch(match);
        return null;
    }
}

async function resolveWinnerAndSettle(match, winnerAddress, reason) {
    const winner = getPlayer(match, winnerAddress);
    if (!winner) {
        throw new Error("找不到對戰勝者");
    }

    match.winnerAddress = winner.address;
    match.winnerDisplayName = winner.displayName;
    match.status = "settling";
    match.updatedAt = nowIso();
    appendLog(match, `${winner.displayName} ${reason}`);
    await saveMatch(match);

    return await settleWinner(match);
}

function buildActionResponse(match, address, extras = {}) {
    return {
        success: true,
        ...buildMatchPayload(match, address),
        ...extras
    };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });

    const body = req.body || {};
    const action = String(body.action || "status").trim().toLowerCase();
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
        return res.status(400).json({ success: false, error: "缺少 sessionId" });
    }

    try {
        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const playerAddress = normalizeAddressOrThrow(session.address, "session address");
        const displayName = fallbackDisplayName(playerAddress, session.displayName || await getDisplayName(playerAddress));

        let existingMatch = await loadMatchForAddress(playerAddress);
        if (existingMatch && existingMatch.status === "finished" && action === "join_queue") {
            await clearActiveMatch((existingMatch.players || []).map((player) => player.address));
            existingMatch = null;
        }

        if (action === "status") {
            if (existingMatch) {
                return res.status(200).json({ success: true, ...buildMatchPayload(existingMatch, playerAddress) });
            }

            const waitingEntry = await loadWaitingEntryForPlayer(playerAddress);
            if (waitingEntry) {
                const queueEntry = await kv.get(waitingQueueKey(waitingEntry.stakeTier));
                if (!queueEntry || String(queueEntry.address || "").toLowerCase() !== playerAddress) {
                    await kv.set(waitingQueueKey(waitingEntry.stakeTier), waitingEntry, { ex: WAITING_QUEUE_TTL_SECONDS });
                }
                return res.status(200).json({ success: true, ...buildWaitingPayload(waitingEntry) });
            }

            return res.status(200).json({ success: true, ...buildIdlePayload() });
        }

        const stateLock = await acquireStateLock();
        try {
            if (action === "join_queue") {
                if (existingMatch && existingMatch.status !== "finished") {
                    return res.status(200).json(buildActionResponse(existingMatch, playerAddress));
                }

                const stakeTier = normalizeStakeTier(body.stakeTier);
                const waitingEntry = await loadWaitingEntryForPlayer(playerAddress);
                if (waitingEntry) {
                    if (waitingEntry.stakeTier !== stakeTier) {
                        return res.status(400).json({ success: false, error: "你已在其他檔位等待中，請先取消排隊" });
                    }

                    await kv.set(waitingQueueKey(stakeTier), waitingEntry, { ex: WAITING_QUEUE_TTL_SECONDS });
                    return res.status(200).json({
                        success: true,
                        ...buildWaitingPayload(waitingEntry),
                        debitedAmount: 0
                    });
                }

                const queueEntry = await loadQueueEntryForTier(stakeTier);
                const debit = await debitStake(playerAddress, stakeTier, {
                    action: "join_queue",
                    stakeTier
                });

                if (!queueEntry || queueEntry.address === playerAddress) {
                    const savedWaiting = await saveWaitingEntry({
                        address: playerAddress,
                        displayName,
                        stakeTier,
                        queuedAt: nowIso(),
                        txHash: debit.txHash
                    });

                    return res.status(200).json({
                        success: true,
                        ...buildWaitingPayload(savedWaiting),
                        debitedAmount: stakeTier
                    });
                }

                const match = createMatch(queueEntry, playerAddress, displayName);
                await clearWaitingEntry(queueEntry.address, stakeTier);
                await saveMatch(match);

                return res.status(200).json({
                    ...buildActionResponse(match, playerAddress),
                    debitedAmount: stakeTier
                });
            }

            if (action === "cancel_queue") {
                const waitingEntry = await loadWaitingEntryForPlayer(playerAddress);
                if (!waitingEntry) {
                    return res.status(200).json({
                        success: true,
                        ...buildIdlePayload(),
                        refundedAmount: 0
                    });
                }

                const refund = await refundStake(playerAddress, waitingEntry.stakeTier, {
                    action: "cancel_queue",
                    stakeTier: waitingEntry.stakeTier
                });
                await clearWaitingEntry(playerAddress, waitingEntry.stakeTier);

                return res.status(200).json({
                    success: true,
                    ...buildIdlePayload(),
                    refundedAmount: waitingEntry.stakeTier,
                    txHash: refund.txHash
                });
            }

            let match = await loadMatchForAddress(playerAddress);
            if (!match) {
                return res.status(404).json({ success: false, error: "目前沒有進行中的對戰" });
            }

            if (action === "roll") {
                if (match.status !== "active") {
                    return res.status(400).json({
                        success: false,
                        error: "此對戰目前無法擲骰",
                        ...buildMatchPayload(match, playerAddress)
                    });
                }

                if (match.winnerAddress) {
                    return res.status(200).json(buildActionResponse(match, playerAddress));
                }

                const currentRound = match.currentRound || createRound(1);
                const existingSubmission = currentRound.submissions && currentRound.submissions[playerAddress];
                if (existingSubmission) {
                    return res.status(400).json({
                        success: false,
                        error: "本局你已經擲過骰",
                        ...buildMatchPayload(match, playerAddress)
                    });
                }

                const submission = rollThreeDice();
                currentRound.submissions[playerAddress] = {
                    dice: submission.dice,
                    total: submission.total,
                    submittedAt: Date.now()
                };
                match.currentRound = currentRound;
                match.updatedAt = nowIso();
                appendLog(match, `${displayName} 已提交第 ${currentRound.number} 局骰點`);

                const opponent = getOpponent(match, playerAddress);
                const opponentSubmitted = !!(opponent && currentRound.submissions && currentRound.submissions[opponent.address]);

                if (!opponentSubmitted) {
                    await saveMatch(match);
                    return res.status(200).json(buildActionResponse(match, playerAddress));
                }

                const resolvedRound = resolveRound(match);
                const maybeWinner = (match.players || []).find((player) => Number(player.score || 0) >= REQUIRED_WINS);
                let settlement = null;

                if (maybeWinner) {
                    settlement = await resolveWinnerAndSettle(match, maybeWinner.address, "拿下本場 PVP 對戰");
                } else {
                    startNextRound(match);
                    await saveMatch(match);
                }

                const extras = {};
                if (settlement && match.winnerAddress === playerAddress) {
                    extras.txHash = settlement.txHash;
                    extras.payoutAmount = settlement.payoutAmount;
                    extras.multiplier = 2;
                    extras.isWin = true;
                }
                if (settlement && match.winnerAddress !== playerAddress) {
                    extras.txHash = settlement.txHash;
                }
                return res.status(200).json(buildActionResponse(match, playerAddress, extras));
            }

            if (action === "claim_timeout") {
                if (match.status !== "active") {
                    return res.status(400).json({
                        success: false,
                        error: "此對戰目前不可宣告超時",
                        ...buildMatchPayload(match, playerAddress)
                    });
                }

                if (!canClaimTimeout(match, playerAddress)) {
                    return res.status(400).json({
                        success: false,
                        error: "目前尚不可宣告對手超時",
                        ...buildMatchPayload(match, playerAddress)
                    });
                }

                const settlement = await resolveWinnerAndSettle(match, playerAddress, "因對手超時未出骰而獲勝");
                const extras = {};
                if (settlement) {
                    extras.txHash = settlement.txHash;
                    extras.payoutAmount = settlement.payoutAmount;
                    extras.multiplier = 2;
                    extras.isWin = true;
                }

                return res.status(200).json(buildActionResponse(match, playerAddress, extras));
            }

            if (action === "retry_payout") {
                if (match.status !== "settling" || match.winnerAddress !== playerAddress) {
                    return res.status(400).json({
                        success: false,
                        error: "目前沒有可重試的派彩",
                        ...buildMatchPayload(match, playerAddress)
                    });
                }

                const settlement = await settleWinner(match);
                const extras = {};
                if (settlement) {
                    extras.txHash = settlement.txHash;
                    extras.payoutAmount = settlement.payoutAmount;
                    extras.multiplier = 2;
                    extras.isWin = true;
                }

                return res.status(200).json(buildActionResponse(match, playerAddress, extras));
            }

            return res.status(400).json({ success: false, error: `不支援的 action: ${action}` });
        } finally {
            await releaseStateLock(stateLock);
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || "duel failed"
        });
    }
}
