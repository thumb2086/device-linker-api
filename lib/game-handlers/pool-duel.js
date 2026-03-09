import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { getSession } from "../session-store.js";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { acquireChainTxLock, releaseChainTxLock } from "../tx-lock.js";
import { recordGameHistory } from "../game-history.js";
import { getDisplayName } from "../user-profile.js";
import {
    buildPlayerProgress,
    createInitialRules,
    createInitialTableState,
    simulateShot
} from "../pool-engine.js";

const CONTRACT_ABI = [
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
];

const FIXED_STAKE = 1000;
const TURN_TIMEOUT_MS = 45000;
const QUEUE_KEY = 'pool_duel_queue:1000';
const STATE_LOCK_KEY = 'pool_duel_lock:global';
const MATCH_TTL_SECONDS = 3600;
const ACTIVE_TTL_SECONDS = 900;
const QUEUE_TTL_SECONDS = 600;

function matchKey(matchId) {
    return `pool_duel_match:${String(matchId || '').trim()}`;
}

function activeMatchKey(address) {
    return `pool_duel_active:${String(address || '').trim().toLowerCase()}`;
}

function normalizeAddressOrThrow(input, field = 'address') {
    try {
        return ethers.getAddress(String(input || '').trim()).toLowerCase();
    } catch {
        throw new Error(`${field} 格式錯誤`);
    }
}

function shortAddress(address) {
    const text = String(address || '').trim();
    if (text.length <= 14) return text || '-';
    return text.slice(0, 6) + '...' + text.slice(-4);
}

function fallbackDisplayName(address, displayName) {
    const clean = String(displayName || '').trim();
    return clean || shortAddress(address);
}

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireStateLock(timeoutMs = 8000) {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(STATE_LOCK_KEY, token, { nx: true, ex: 10 });
        if (acquired === 'OK' || acquired === true) {
            return { key: STATE_LOCK_KEY, token };
        }
        await sleep(120);
    }

    throw new Error('撞球對戰配對繁忙，請稍後再試');
}

async function releaseStateLock(lock) {
    if (!lock || !lock.key || !lock.token) return;
    try {
        const currentToken = await kv.get(lock.key);
        if (currentToken === lock.token) {
            await kv.del(lock.key);
        }
    } catch (_) {
        // ignore unlock failures
    }
}

function chooseStartingTurn(players) {
    return Math.random() < 0.5 ? players[0].address : players[1].address;
}

function cloneMatch(match) {
    return JSON.parse(JSON.stringify(match));
}

function normalizeMatchSchema(match) {
    if (!match) return null;
    if (!match.table) {
        match.table = createInitialTableState();
    }
    if (!match.rules) {
        match.rules = createInitialRules(match.players || []);
    }
    if (typeof match.lastShotSummary !== 'string') {
        match.lastShotSummary = '';
    }
    refreshPlayerScores(match);
    return match;
}

async function saveMatch(match) {
    await kv.set(matchKey(match.id), match, { ex: MATCH_TTL_SECONDS });
    await kv.set(activeMatchKey(match.players[0].address), match.id, { ex: ACTIVE_TTL_SECONDS });
    await kv.set(activeMatchKey(match.players[1].address), match.id, { ex: ACTIVE_TTL_SECONDS });
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
    return normalizeMatchSchema(match);
}

function getPlayer(match, address) {
    return (match.players || []).find((item) => item.address === address) || null;
}

function getOpponent(match, address) {
    return (match.players || []).find((item) => item.address !== address) || null;
}

function playerCanClaimTimeout(match, address, nowTs) {
    if (!match || match.status !== 'active') return false;
    if (match.turnAddress === address) return false;
    return (nowTs - Number(match.turnStartedAt || nowTs)) >= TURN_TIMEOUT_MS;
}

function groupLabel(group) {
    if (group === 'solid') return '全色';
    if (group === 'stripe') return '花色';
    return '未分組';
}

function targetLabel(target) {
    if (target === 'solid') return '全色';
    if (target === 'stripe') return '花色';
    if (target === 'eight') return '8 號球';
    return '開放球桌';
}

function cueBallState(match) {
    return (match?.table?.balls || []).find((ball) => ball.number === 0) || null;
}

function refreshPlayerScores(match) {
    for (const player of match.players || []) {
        const progress = buildPlayerProgress(match, player.address);
        player.score = progress.clearedGroupBalls;
    }
}

function buildStatusPayload(match, address) {
    match = normalizeMatchSchema(match);
    const nowTs = Date.now();
    if (!match) {
        return {
            status: 'idle',
            fixedStake: FIXED_STAKE
        };
    }

    const self = getPlayer(match, address);
    const opponent = getOpponent(match, address);
    const selfProgress = self ? buildPlayerProgress(match, self.address) : null;
    const opponentProgress = opponent ? buildPlayerProgress(match, opponent.address) : null;
    const cueBall = cueBallState(match);
    return {
        status: match.status,
        fixedStake: FIXED_STAKE,
        matchId: match.id,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
        self: self ? {
            address: self.address,
            displayName: self.displayName,
            cleared: selfProgress ? selfProgress.clearedGroupBalls : 0,
            remaining: selfProgress ? selfProgress.remainingGroupBalls : 7,
            group: selfProgress ? selfProgress.group : "",
            groupLabel: groupLabel(selfProgress ? selfProgress.group : ""),
            target: selfProgress ? selfProgress.target : "open",
            targetLabel: targetLabel(selfProgress ? selfProgress.target : "open")
        } : null,
        opponent: opponent ? {
            address: opponent.address,
            displayName: opponent.displayName,
            cleared: opponentProgress ? opponentProgress.clearedGroupBalls : 0,
            remaining: opponentProgress ? opponentProgress.remainingGroupBalls : 7,
            group: opponentProgress ? opponentProgress.group : "",
            groupLabel: groupLabel(opponentProgress ? opponentProgress.group : ""),
            target: opponentProgress ? opponentProgress.target : "open",
            targetLabel: targetLabel(opponentProgress ? opponentProgress.target : "open")
        } : null,
        turnAddress: match.turnAddress || '',
        isMyTurn: match.turnAddress === address && match.status === 'active',
        turnDeadlineMs: match.status === 'active' ? Math.max(0, TURN_TIMEOUT_MS - (nowTs - Number(match.turnStartedAt || nowTs))) : 0,
        canClaimTimeout: playerCanClaimTimeout(match, address, nowTs),
        canClaimReward: match.status === 'settling' && match.winnerAddress === address,
        winnerAddress: match.winnerAddress || '',
        winnerDisplayName: match.winnerDisplayName || '',
        payoutTxHash: match.payoutTxHash || '',
        settlementError: match.settlementError || '',
        lastAction: match.lastAction || '',
        lastShotSummary: match.lastShotSummary || '',
        rules: {
            openTable: !!match.rules?.openTable,
            breakShot: !!match.rules?.breakShot,
            ballInHandFor: match.rules?.ballInHandFor || ''
        },
        table: match.table || null,
        shotState: {
            ballInHand: match.rules?.ballInHandFor === address,
            cueBallPocketed: !!cueBall?.pocketed
        },
        log: Array.isArray(match.log) ? match.log.slice(-8) : []
    };
}

async function getContractContext() {
    let privateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKey) throw new Error('缺少 ADMIN_PRIVATE_KEY');
    if (!privateKey.startsWith('0x')) privateKey = `0x${privateKey}`;

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(privateKey, provider);
    const treasuryAddress = normalizeAddressOrThrow(process.env.LOSS_POOL_ADDRESS || adminWallet.address, 'LOSS_POOL_ADDRESS');
    const contract = new ethers.Contract(normalizeAddressOrThrow(CONTRACT_ADDRESS, 'CONTRACT_ADDRESS'), CONTRACT_ABI, adminWallet);
    const decimals = await contract.decimals();

    return { contract, decimals, treasuryAddress };
}

async function transferStakeIntoEscrow(contract, treasuryAddress, address, decimals) {
    const stakeWei = ethers.parseUnits(String(FIXED_STAKE), decimals);
    const balanceWei = await contract.balanceOf(address);
    if (balanceWei < stakeWei) {
        throw new Error('餘額不足，無法加入撞球對戰');
    }

    const chainLock = await acquireChainTxLock();
    try {
        const tx = await contract.adminTransfer(address, treasuryAddress, stakeWei, { gasLimit: 220000 });
        return { txHash: tx.hash, stakeWei };
    } finally {
        await releaseChainTxLock(chainLock);
    }
}

async function refundStakeFromEscrow(contract, treasuryAddress, address, decimals) {
    const stakeWei = ethers.parseUnits(String(FIXED_STAKE), decimals);
    const chainLock = await acquireChainTxLock();
    try {
        const tx = await contract.adminTransfer(treasuryAddress, address, stakeWei, { gasLimit: 220000 });
        return { txHash: tx.hash, stakeWei };
    } finally {
        await releaseChainTxLock(chainLock);
    }
}

async function settleMatchPayout(match, winnerAddress, contract, treasuryAddress, decimals) {
    const payoutWei = ethers.parseUnits(String(FIXED_STAKE * 2), decimals);
    const chainLock = await acquireChainTxLock();
    try {
        const tx = await contract.adminTransfer(treasuryAddress, winnerAddress, payoutWei, { gasLimit: 240000 });
        match.status = 'finished';
        match.finishedAt = nowIso();
        match.updatedAt = nowIso();
        match.payoutTxHash = tx.hash;
        match.settlementError = '';
        await saveMatch(match);
        return { txHash: tx.hash, payoutWei };
    } catch (error) {
        match.status = 'settling';
        match.updatedAt = nowIso();
        match.settlementError = error.message || 'payout failed';
        await saveMatch(match);
        throw error;
    } finally {
        await releaseChainTxLock(chainLock);
    }
}

async function finalizeHistory(match, payoutTxHash, decimals) {
    const winner = (match.players || []).find((item) => item.address === match.winnerAddress);
    const loser = (match.players || []).find((item) => item.address !== match.winnerAddress);
    const betWei = ethers.parseUnits(String(FIXED_STAKE), decimals);
    const winnerPayoutWei = ethers.parseUnits(String(FIXED_STAKE * 2), decimals);

    if (winner) {
        await recordGameHistory({
            address: winner.address,
            game: 'poolduel',
            gameLabel: '撞球對戰',
            outcome: 'win',
            outcomeLabel: '對戰勝利',
            betWei,
            payoutWei: winnerPayoutWei,
            netWei: winnerPayoutWei - betWei,
            multiplier: 2,
            roundId: match.id,
            mode: 'pvp',
            txHash: payoutTxHash,
            details: `對手 ${loser ? loser.displayName : '-'} / 比分 ${winner.score}:${loser ? loser.score : 0}`,
            decimals
        });
    }

    if (loser) {
        await recordGameHistory({
            address: loser.address,
            game: 'poolduel',
            gameLabel: '撞球對戰',
            outcome: 'lose',
            outcomeLabel: '對戰失利',
            betWei,
            payoutWei: 0n,
            netWei: -betWei,
            multiplier: 0,
            roundId: match.id,
            mode: 'pvp',
            txHash: payoutTxHash,
            details: `對手 ${winner ? winner.displayName : '-'} / 比分 ${loser.score}:${winner ? winner.score : 0}`,
            decimals
        });
    }
}

async function cleanupFinishedMatch(match) {
    if (!match || !match.id) return;
    await clearActiveMatch((match.players || []).map((item) => item.address));
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const body = req.body || {};
    const action = String(body.action || 'status').trim().toLowerCase();
    const sessionId = String(body.sessionId || '').trim();
    if (!sessionId) {
        return res.status(400).json({ success: false, error: '缺少 sessionId' });
    }

    try {
        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: '會話過期，請重新登入' });
        }

        const playerAddress = normalizeAddressOrThrow(session.address, 'session address');
        const displayName = fallbackDisplayName(playerAddress, await getDisplayName(playerAddress));

        const existingMatch = await loadMatchForAddress(playerAddress);
        if (existingMatch && existingMatch.status === 'finished' && action === 'join_queue') {
            await cleanupFinishedMatch(existingMatch);
        }

        if (action === 'status') {
            const waiting = await kv.get(QUEUE_KEY);
            if (!existingMatch && waiting && waiting.address === playerAddress) {
                return res.status(200).json({
                    success: true,
                    waiting: true,
                    queue: {
                        status: 'waiting',
                        fixedStake: FIXED_STAKE,
                        queuedAt: waiting.queuedAt,
                        txHash: waiting.txHash || ''
                    }
                });
            }
            return res.status(200).json({
                success: true,
                match: buildStatusPayload(existingMatch, playerAddress)
            });
        }

        const stateLock = await acquireStateLock();
        try {
            if (action === 'join_queue') {
                let currentMatch = await loadMatchForAddress(playerAddress);
                if (currentMatch && currentMatch.status !== 'finished') {
                    return res.status(200).json({ success: true, match: buildStatusPayload(currentMatch, playerAddress) });
                }

                const waiting = await kv.get(QUEUE_KEY);
                if (waiting && waiting.address === playerAddress) {
                    return res.status(200).json({
                        success: true,
                        waiting: true,
                        queue: {
                            status: 'waiting',
                            fixedStake: FIXED_STAKE,
                            queuedAt: waiting.queuedAt,
                            txHash: waiting.txHash || ''
                        }
                    });
                }

                const { contract, decimals, treasuryAddress } = await getContractContext();
                const joinTransfer = await transferStakeIntoEscrow(contract, treasuryAddress, playerAddress, decimals);
                await kv.incrbyfloat(`total_bet:${playerAddress}`, FIXED_STAKE);

                if (!waiting || !waiting.address || waiting.address === playerAddress) {
                    await kv.set(QUEUE_KEY, {
                        address: playerAddress,
                        displayName,
                        queuedAt: nowIso(),
                        txHash: joinTransfer.txHash
                    }, { ex: QUEUE_TTL_SECONDS });

                    return res.status(200).json({
                        success: true,
                        waiting: true,
                        queue: {
                            status: 'waiting',
                            fixedStake: FIXED_STAKE,
                            queuedAt: nowIso(),
                            txHash: joinTransfer.txHash
                        }
                    });
                }

                const opponentAddress = normalizeAddressOrThrow(waiting.address, 'queued address');
                const opponentDisplayName = fallbackDisplayName(opponentAddress, waiting.displayName);
                const match = {
                    id: `pool_${randomUUID()}`,
                    status: 'active',
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                    fixedStake: FIXED_STAKE,
                    players: [
                        { address: opponentAddress, displayName: opponentDisplayName, score: 0 },
                        { address: playerAddress, displayName: displayName, score: 0 }
                    ],
                    table: createInitialTableState(),
                    rules: createInitialRules([
                        { address: opponentAddress },
                        { address: playerAddress }
                    ]),
                    turnAddress: '',
                    turnStartedAt: Date.now(),
                    winnerAddress: '',
                    winnerDisplayName: '',
                    payoutTxHash: '',
                    settlementError: '',
                    lastShotSummary: '',
                    log: [
                        `${opponentDisplayName} 已率先入場，賭注 ${FIXED_STAKE.toLocaleString()} 子熙幣`,
                        `${displayName} 加入對局，採標準 8 號球規則開局`
                    ],
                    lastAction: 'match_created'
                };
                match.turnAddress = chooseStartingTurn(match.players);
                match.turnStartedAt = Date.now();
                refreshPlayerScores(match);
                match.log.push(`${fallbackDisplayName(match.turnAddress, getPlayer(match, match.turnAddress).displayName)} 先攻`);

                await kv.del(QUEUE_KEY);
                await saveMatch(match);

                return res.status(200).json({
                    success: true,
                    waiting: false,
                    txHash: joinTransfer.txHash,
                    match: buildStatusPayload(match, playerAddress)
                });
            }

            if (action === 'cancel_queue') {
                const waiting = await kv.get(QUEUE_KEY);
                if (!waiting || waiting.address !== playerAddress) {
                    return res.status(200).json({ success: true, cancelled: false, match: buildStatusPayload(existingMatch, playerAddress) });
                }

                const { contract, decimals, treasuryAddress } = await getContractContext();
                const refund = await refundStakeFromEscrow(contract, treasuryAddress, playerAddress, decimals);
                await kv.incrbyfloat(`total_bet:${playerAddress}`, -FIXED_STAKE);
                await kv.del(QUEUE_KEY);

                return res.status(200).json({
                    success: true,
                    cancelled: true,
                    txHash: refund.txHash,
                    match: buildStatusPayload(null, playerAddress)
                });
            }

            let match = await loadMatchForAddress(playerAddress);
            if (!match) {
                return res.status(404).json({ success: false, error: '目前沒有進行中的撞球對戰' });
            }

            if (action === 'claim_turn_timeout') {
                if (!playerCanClaimTimeout(match, playerAddress, Date.now())) {
                    return res.status(400).json({ success: false, error: '目前尚不可宣告超時', match: buildStatusPayload(match, playerAddress) });
                }

                const winner = getPlayer(match, playerAddress);
                match.status = 'settling';
                match.updatedAt = nowIso();
                match.winnerAddress = winner.address;
                match.winnerDisplayName = winner.displayName;
                match.lastAction = 'timeout_win';
                match.log.push(`${winner.displayName} 因對手超時未出桿而獲勝`);
                await saveMatch(match);

                return res.status(200).json({
                    success: true,
                    match: buildStatusPayload(match, playerAddress)
                });
            }

            if (action === 'claim_reward') {
                if (match.status !== 'settling' || match.winnerAddress !== playerAddress) {
                    return res.status(400).json({ success: false, error: '目前沒有可領取的獎勵', match: buildStatusPayload(match, playerAddress) });
                }

                const { contract, decimals, treasuryAddress } = await getContractContext();
                const settlement = await settleMatchPayout(match, playerAddress, contract, treasuryAddress, decimals);
                await finalizeHistory(match, settlement.txHash, decimals);

                return res.status(200).json({
                    success: true,
                    txHash: settlement.txHash,
                    match: buildStatusPayload(match, playerAddress)
                });
            }

            if (action === 'shoot') {
                if (match.status !== 'active') {
                    return res.status(400).json({ success: false, error: '此對局目前無法出桿', match: buildStatusPayload(match, playerAddress) });
                }
                if (match.turnAddress !== playerAddress) {
                    return res.status(400).json({ success: false, error: '還沒輪到你出桿', match: buildStatusPayload(match, playerAddress) });
                }

                const self = getPlayer(match, playerAddress);
                const opponent = getOpponent(match, playerAddress);
                const shot = simulateShot(match, playerAddress, {
                    angle: body.angle,
                    power: body.power,
                    cueX: body.cueX,
                    cueY: body.cueY
                });

                match.table = shot.table;
                match.rules.breakShot = false;
                match.updatedAt = nowIso();
                match.lastAction = 'shoot';
                match.lastShotSummary = shot.summary;
                match.log.push(`${self.displayName}：${shot.summary}`);
                refreshPlayerScores(match);

                if (shot.win) {
                    match.status = 'settling';
                    match.winnerAddress = self.address;
                    match.winnerDisplayName = self.displayName;
                    match.rules.ballInHandFor = '';
                    match.log.push(`${self.displayName} 合法打進 8 號球，取得勝利`);
                    await saveMatch(match);

                    return res.status(200).json({
                        success: true,
                        match: buildStatusPayload(match, playerAddress)
                    });
                }

                if (shot.loss) {
                    match.status = 'settling';
                    match.winnerAddress = opponent.address;
                    match.winnerDisplayName = opponent.displayName;
                    match.rules.ballInHandFor = '';
                    match.log.push(`${self.displayName} 犯規打進 8 號球，${opponent.displayName} 獲勝`);
                    await saveMatch(match);

                    return res.status(200).json({
                        success: true,
                        match: buildStatusPayload(match, playerAddress)
                    });
                }

                if (shot.foul) {
                    match.rules.ballInHandFor = opponent.address;
                    match.turnAddress = opponent.address;
                    match.log.push(`${opponent.displayName} 獲得白球自由擺放`);
                } else {
                    match.rules.ballInHandFor = '';
                    match.turnAddress = shot.continueTurn ? self.address : opponent.address;
                }
                match.turnStartedAt = Date.now();
                await saveMatch(match);

                return res.status(200).json({
                    success: true,
                    match: buildStatusPayload(match, playerAddress)
                });
            }

            return res.status(400).json({ success: false, error: `不支援 action: ${action}` });
        } finally {
            await releaseStateLock(stateLock);
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'pool duel failed'
        });
    }
}
