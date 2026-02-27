export const GAME_INTERVAL_MS = {
    coinflip: 20000,
    roulette: 30000,
    horse: 45000
};

export const GAME_BET_LOCK_MS = {
    coinflip: 3000,
    roulette: 3000,
    horse: 4000
};

function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function hashInt(seed) {
    return fnv1a32(String(seed));
}

export function hashFloat(seed) {
    return (hashInt(seed) % 1000000) / 1000000;
}

export function getRoundInfo(game, nowTs = Date.now()) {
    const interval = GAME_INTERVAL_MS[game];
    if (!interval) throw new Error(`unknown game: ${game}`);
    const lockMs = GAME_BET_LOCK_MS[game] || 0;

    const roundId = Math.floor(nowTs / interval);
    const opensAt = roundId * interval;
    const closesAt = opensAt + interval;
    const bettingClosesAt = closesAt - lockMs;
    const isBettingOpen = nowTs < bettingClosesAt;

    return {
        game,
        intervalMs: interval,
        lockMs,
        roundId,
        opensAt,
        closesAt,
        bettingClosesAt,
        isBettingOpen,
        msLeft: Math.max(0, closesAt - nowTs)
    };
}

export function pickWeighted(roundKey, items, weightKey = 'weight') {
    const totalWeight = items.reduce((sum, item) => sum + Number(item[weightKey] || 0), 0);
    if (totalWeight <= 0) return items[0];

    let cursor = hashInt(roundKey) % totalWeight;
    for (const item of items) {
        cursor -= Number(item[weightKey] || 0);
        if (cursor < 0) return item;
    }
    return items[items.length - 1];
}
