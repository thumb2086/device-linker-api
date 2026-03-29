// packages/domain/src/levels/level-manager.ts
// 從 main/lib/level.js 完整移植
import { LEVEL_TIERS, YJC_VIP_TIERS, VIP_CHAT_ROOMS, LevelTier, YjcVipTier } from "@repo/shared";

export interface VipStatus {
  vipLevel: string;
  maxBet: number;
  threshold: number;
}

export interface YjcVipStatus {
  available: boolean;
  source: string;
  balance: number;
  tier: {
    key: string;
    label: string;
    roomAccess: string[];
    perks: string[];
  };
  error?: string;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getVipTier(totalBet: number | string): LevelTier {
  const normalizedTotalBet = toSafeNumber(totalBet, 0);
  for (let index = LEVEL_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = LEVEL_TIERS[index];
    if (normalizedTotalBet >= tier.threshold) return tier;
  }
  return LEVEL_TIERS[0];
}

export function getVipLevel(totalBet: number | string): string {
  return getVipTier(totalBet).label;
}

export function getVipMaxBet(totalBet: number | string): number {
  return getVipTier(totalBet).maxBet;
}

export function buildVipStatus(totalBet: number | string): VipStatus {
  const tier = getVipTier(totalBet);
  return {
    vipLevel: tier.label,
    maxBet: tier.maxBet,
    threshold: tier.threshold,
  };
}

export function assertVipBetLimit(amount: number | string, totalBet: number | string): void {
  const betAmount = toSafeNumber(amount, NaN);
  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    throw new Error("押注金額必須大於 0");
  }
  const tier = getVipTier(totalBet);
  if (betAmount > tier.maxBet) {
    throw new Error(`目前 ${tier.label} 單注上限為 ${tier.maxBet.toLocaleString()} 子熙幣`);
  }
}

export function getVipTierIndexByLabel(label: string): number {
  return LEVEL_TIERS.findIndex((tier) => tier.label === label.trim());
}

export function meetsVipLevelRequirement(currentLevel: string, requiredLevel: string): boolean {
  const requiredIndex = getVipTierIndexByLabel(requiredLevel);
  if (requiredIndex < 0) return currentLevel.trim() === requiredLevel.trim();
  const currentIndex = getVipTierIndexByLabel(currentLevel);
  if (currentIndex < 0) return false;
  return currentIndex >= requiredIndex;
}

export function canAccessVipChatRoom(totalBet: number | string, roomId: string) {
  const room = VIP_CHAT_ROOMS.find((r) => r.id === roomId) || VIP_CHAT_ROOMS[0];
  if (!room.requiredLevel) return { allowed: true, room };
  const currentLevel = getVipLevel(totalBet);
  const allowed = meetsVipLevelRequirement(currentLevel, room.requiredLevel);
  return { allowed, room, currentLevel };
}

// ─── YJC VIP ──────────────────────────────────────────────────────────────────

export function getYjcVipTierByBalance(balance: number): YjcVipTier {
  const amount = Math.max(0, Math.floor(toSafeNumber(balance, 0)));
  if (amount >= 1000) return YJC_VIP_TIERS[2];
  if (amount >= 1) return YJC_VIP_TIERS[1];
  return YJC_VIP_TIERS[0];
}

export function buildYjcVipStatusFromBalance(balance: number, source = "offchain"): YjcVipStatus {
  const normalizedBalance = Math.max(0, Math.floor(toSafeNumber(balance, 0)));
  const tier = getYjcVipTierByBalance(normalizedBalance);
  return {
    available: true,
    source,
    balance: normalizedBalance,
    tier: {
      key: tier.key,
      label: tier.label,
      roomAccess: Array.isArray(tier.roomAccess) ? [...tier.roomAccess] : [],
      perks: Array.isArray(tier.perks) ? [...tier.perks] : [],
    },
  };
}

export function getTierOptions() {
  return LEVEL_TIERS.map((tier) => ({
    label: tier.label,
    threshold: tier.threshold,
    maxBet: tier.maxBet,
  }));
}
