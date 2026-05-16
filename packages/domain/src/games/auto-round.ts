// packages/domain/src/games/auto-round.ts
// 统一分局模块 - 参考 main 分支的实现

export const GAME_INTERVAL_MS: Record<string, number> = {
  coinflip: 15000,
  roulette: 20000,
  horse: 30000,
  sicbo: 20000,
  bingo: 30000,
};

export const GAME_BET_LOCK_MS: Record<string, number> = {
  coinflip: 4000,
  roulette: 4000,
  horse: 5000,
  sicbo: 4000,
  bingo: 5000,
};

// FNV-1a 32-bit hash function
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashInt(seed: string): number {
  return fnv1a32(String(seed));
}

export function hashFloat(seed: string): number {
  return (hashInt(seed) % 1000000) / 1000000;
}

export interface RoundInfo {
  game: string;
  intervalMs: number;
  lockMs: number;
  roundId: number;
  opensAt: number;
  closesAt: number;
  bettingClosesAt: number;
  isBettingOpen: boolean;
  msLeft: number;
}

export function getRoundInfo(game: string, nowTs = Date.now()): RoundInfo {
  const interval = GAME_INTERVAL_MS[game];
  if (!interval) {
    throw new Error(`Unknown auto-round game: ${game}`);
  }
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
    msLeft: Math.max(0, closesAt - nowTs),
  };
}

export function pickWeighted<T extends Record<string, unknown>>(
  roundKey: string,
  items: T[],
  weightKey: keyof T = 'weight' as keyof T
): T {
  const totalWeight = items.reduce((sum, item) => sum + Number(item[weightKey] || 0), 0);
  if (totalWeight <= 0) return items[0];

  let cursor = hashInt(roundKey) % totalWeight;
  for (const item of items) {
    cursor -= Number(item[weightKey] || 0);
    if (cursor < 0) return item;
  }
  return items[items.length - 1];
}

// 判断游戏是否为分局游戏
export function isAutoRoundGame(game: string): boolean {
  return game in GAME_INTERVAL_MS;
}
