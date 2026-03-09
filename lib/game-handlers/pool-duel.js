import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { getSession } from "../session-store.js";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { acquireChainTxLock, releaseChainTxLock } from "../tx-lock.js";
import { recordGameHistory } from "../game-history.js";
import { getDisplayName } from "../user-profile.js";

const CONTRACT_ABI = [
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
];

const FIXED_STAKE = 1000;
const TARGET_SCORE = 3;
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
    return match;
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

function buildStatusPayload(match, address) {
    const nowTs = Date.now();
    if (!match) {
        return {
            status: 'idle',
            fixedStake: FIXED_STAKE,
            targetScore: TARGET_SCORE
        };
    }

    const self = getPlayer(match, address);
    const opponent = getOpponent(match, address);
    return {
        status: match.status,
        fixedStake: FIXED_STAKE,
        targetScore: TARGET_SCORE,
        matchId: match.id,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
        self: self ? {
            address: self.address,
            displayName: self.displayName,
            score: self.score
        } : null,
        opponent: opponent ? {
            address: opponent.address,
            displayName: opponent.displayName,
            score: opponent.score
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
        log: Array.isArray(match.log) ? match.log.slice(-8) : []
    };
}

function resolveShot(shotType) {
    const type = String(shotType || '').trim().toLowerCase();
    const profiles = {
        soft: { label: '輕推桿', potChance: 0.72, foulChance: 0.05, keepTurnChance: 0.34, bonusChance: 0.08 },
        bank: { label: '反彈球', potChance: 0.55, foulChance: 0.1, keepTurnChance: 0.2, bonusChance: 0.18 },
        power: { label: '強力開球', potChance: 0.42, foulChance: 0.18, keepTurnChance: 0.12, bonusChance: 0.26 }
    };
    const profile = profiles[type];
    if (!profile) {
        throw new Error('不支援的出桿方式');
    }

    const foulRoll = Math.random();
    if (foulRoll < profile.foulChance) {
        return {
            type,
            label: profile.label,
            foul: true,
            scored: 0,
            keepTurn: false,
            summary: `${profile.label}失手，母球落袋，換對手上場`
        };
    }

    const potRoll = Math.random();
    if (potRoll < profile.potChance) {
        const bonus = Math.random() < profile.bonusChance ? 1 : 0;
        const scored = 1 + bonus;
        const keepTurn = Math.random() < profile.keepTurnChance;
        return {
            type,
            label: profile.label,
            foul: false,
            scored,
            keepTurn,
            summary: `${profile.label}成功打進 ${scored} 顆球${keepTurn ? '，手感火熱續桿' : ''}`
        };
    }

    return {
        type,
        label: profile.label,
        foul: false,
        scored: 0,
        keepTurn: false,
        summary: `${profile.label}沒能進球，球權交給對手`
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
                    targetScore: TARGET_SCORE,
                    players: [
                        { address: opponentAddress, displayName: opponentDisplayName, score: 0 },
                        { address: playerAddress, displayName: displayName, score: 0 }
                    ],
                    turnAddress: '',
                    turnStartedAt: Date.now(),
                    winnerAddress: '',
                    winnerDisplayName: '',
                    payoutTxHash: '',
                    settlementError: '',
                    log: [
                        `${opponentDisplayName} 已率先入場，賭注 ${FIXED_STAKE.toLocaleString()} 子熙幣`,
                        `${displayName} 加入對局，雙方開始開球`
                    ],
                    lastAction: 'match_created'
                };
                match.turnAddress = chooseStartingTurn(match.players);
                match.turnStartedAt = Date.now();
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
                const shot = resolveShot(body.shotType);

                self.score = Math.min(TARGET_SCORE, Number(self.score || 0) + shot.scored);
                match.updatedAt = nowIso();
                match.lastAction = shot.type;
                match.log.push(`${self.displayName}：${shot.summary}`);

                if (self.score >= TARGET_SCORE) {
                    match.status = 'settling';
                    match.winnerAddress = self.address;
                    match.winnerDisplayName = self.displayName;
                    await saveMatch(match);

                    return res.status(200).json({
                        success: true,
                        match: buildStatusPayload(match, playerAddress)
                    });
                }

                if (shot.keepTurn) {
                    match.turnAddress = self.address;
                } else {
                    match.turnAddress = opponent.address;
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
