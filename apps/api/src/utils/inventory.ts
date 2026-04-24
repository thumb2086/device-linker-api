// apps/api/src/utils/inventory.ts
// Inventory & chest helper: persists chest opens, item usage, and active buffs
// to `user_profiles`, and exposes a single point to consume the "prevent_loss"
// buff used by game-settlement.

import {
  ChestManager,
  type ChestOpenResult,
  type UserInventory,
} from "@repo/domain";
import type { ChestType, ItemDefinition } from "@repo/shared";
import {
  CHEST_CONFIGS,
  ITEM_DROP_TABLES,
  DAILY_FREE_CHEST_COOLDOWN_HOURS,
} from "@repo/shared";
import { UserRepository, kv } from "@repo/infrastructure";

const chestManager = new ChestManager();
const userRepo = new UserRepository();

function chestMetaKey(userId: string): string {
  return `chest_meta:${userId}`;
}

const ALL_ITEMS: Record<string, ItemDefinition> = (() => {
  const out: Record<string, ItemDefinition> = {};
  for (const rarity of Object.keys(ITEM_DROP_TABLES) as (keyof typeof ITEM_DROP_TABLES)[]) {
    for (const item of ITEM_DROP_TABLES[rarity]) {
      out[item.id] = item;
    }
  }
  return out;
})();

export interface ActiveBuff {
  id: string;
  type: string;
  value: number;
  remaining?: number;
  expiresAt?: string | null;
  source?: string;
}

export interface ProfileInventoryState {
  inventory: Record<string, number>;
  ownedAvatars: string[];
  ownedTitles: string[];
  activeAvatar: string;
  activeTitle: string;
  activeBuffs: ActiveBuff[];
  chestPity: Record<ChestType, number>;
  lastFreeChestAt: string | null;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string");
}

function coerceRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) out[key] = Math.floor(num);
  }
  return out;
}

function coerceBuffs(value: unknown): ActiveBuff[] {
  if (!Array.isArray(value)) return [];
  const out: ActiveBuff[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const b = entry as Record<string, unknown>;
    const type = typeof b.type === "string" ? b.type : null;
    const id = typeof b.id === "string" ? b.id : type;
    if (!id || !type) continue;
    out.push({
      id,
      type,
      value: Number(b.value ?? 0) || 0,
      remaining: b.remaining === undefined || b.remaining === null ? undefined : Math.max(0, Number(b.remaining) || 0),
      expiresAt: typeof b.expiresAt === "string" ? b.expiresAt : null,
      source: typeof b.source === "string" ? b.source : undefined,
    });
  }
  return out;
}

function coercePity(value: unknown): Record<ChestType, number> {
  const defaults: Record<ChestType, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const rec = value as Record<string, unknown>;
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as ChestType[]) {
    const n = Number(rec[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
  }
  return out;
}

interface ChestMeta {
  chestPity: Record<ChestType, number>;
  lastFreeChestAt: string | null;
}

async function loadChestMeta(userId: string): Promise<ChestMeta> {
  const raw = await kv.get<Record<string, unknown>>(chestMetaKey(userId));
  return {
    chestPity: coercePity(raw?.chestPity),
    lastFreeChestAt: typeof raw?.lastFreeChestAt === "string" ? raw.lastFreeChestAt : null,
  };
}

async function saveChestMeta(userId: string, meta: ChestMeta): Promise<void> {
  await kv.set(chestMetaKey(userId), {
    chestPity: meta.chestPity,
    lastFreeChestAt: meta.lastFreeChestAt,
  });
}

/**
 * Read the user's inventory/meta from the profile row and KV, returning safe
 * defaults when columns are empty or the profile row is missing.
 */
export async function loadInventoryState(userId: string): Promise<ProfileInventoryState> {
  const [profile, meta] = await Promise.all([
    userRepo.getUserProfile(userId),
    loadChestMeta(userId),
  ]);
  return {
    inventory: coerceRecord(profile?.inventory),
    ownedAvatars: coerceStringArray(profile?.ownedAvatars),
    ownedTitles: coerceStringArray(profile?.ownedTitles),
    activeAvatar: typeof profile?.selectedAvatarId === "string" ? profile.selectedAvatarId : "classic_chip",
    activeTitle: typeof profile?.selectedTitleId === "string" ? profile.selectedTitleId : "",
    activeBuffs: coerceBuffs(profile?.activeBuffs),
    chestPity: meta.chestPity,
    lastFreeChestAt: meta.lastFreeChestAt,
  };
}

async function persistInventoryState(userId: string, next: ProfileInventoryState): Promise<void> {
  await Promise.all([
    userRepo.saveUserProfile(userId, {
      inventory: next.inventory,
      ownedAvatars: next.ownedAvatars,
      ownedTitles: next.ownedTitles,
      selectedAvatarId: next.activeAvatar,
      selectedTitleId: next.activeTitle || null,
      activeBuffs: next.activeBuffs,
    }),
    saveChestMeta(userId, {
      chestPity: next.chestPity,
      lastFreeChestAt: next.lastFreeChestAt,
    }),
  ]);
}

function toChestManagerInventory(state: ProfileInventoryState): UserInventory {
  return {
    items: { ...state.inventory },
    avatars: [...state.ownedAvatars],
    titles: [...state.ownedTitles],
    activeAvatar: state.activeAvatar,
    activeTitle: state.activeTitle,
    chestPity: { ...state.chestPity },
  };
}

export interface OpenChestOutcome {
  result: ChestOpenResult;
  state: ProfileInventoryState;
}

export async function openChestForUser(
  userId: string,
  address: string,
  chestType: ChestType
): Promise<OpenChestOutcome> {
  if (!CHEST_CONFIGS[chestType]) throw new Error(`Unknown chest type: ${chestType}`);

  const state = await loadInventoryState(userId);
  const inventory = toChestManagerInventory(state);
  void address; // reserved for future chain-bound seeding
  const result = chestManager.openChest(userId, chestType, inventory);

  const nextPity = { ...state.chestPity };
  nextPity[chestType] = result.isPityTrigger ? 0 : state.chestPity[chestType] + 1;

  const nextState: ProfileInventoryState = {
    ...state,
    inventory: { ...state.inventory },
    ownedAvatars: [...state.ownedAvatars],
    ownedTitles: [...state.ownedTitles],
    chestPity: nextPity,
  };

  for (const reward of result.items) {
    const itemId = reward.item.id;
    nextState.inventory[itemId] = (nextState.inventory[itemId] || 0) + 1;
    if (reward.item.type === "avatar" && !nextState.ownedAvatars.includes(itemId)) {
      nextState.ownedAvatars.push(itemId);
    }
    if (reward.item.type === "title" && !nextState.ownedTitles.includes(itemId)) {
      nextState.ownedTitles.push(itemId);
    }
  }

  await persistInventoryState(userId, nextState);
  return { result, state: nextState };
}

export function isDailyFreeChestReady(lastFreeChestAt: string | null): boolean {
  if (!lastFreeChestAt) return true;
  const last = Date.parse(lastFreeChestAt);
  if (!Number.isFinite(last)) return true;
  const hoursSinceLast = (Date.now() - last) / (1000 * 60 * 60);
  return hoursSinceLast >= DAILY_FREE_CHEST_COOLDOWN_HOURS;
}

export async function markDailyFreeChestClaimed(userId: string): Promise<void> {
  const meta = await loadChestMeta(userId);
  meta.lastFreeChestAt = new Date().toISOString();
  await saveChestMeta(userId, meta);
}

/**
 * Restore the `lastFreeChestAt` cooldown timestamp to a previous value. Used to
 * roll back an early `markDailyFreeChestClaimed` if the actual chest open
 * fails downstream, so the user isn't locked out of today's free chest.
 */
export async function restoreDailyFreeChestMark(
  userId: string,
  previous: string | null
): Promise<void> {
  const meta = await loadChestMeta(userId);
  meta.lastFreeChestAt = previous;
  await saveChestMeta(userId, meta);
}

export interface UseItemOutcome {
  item: ItemDefinition;
  state: ProfileInventoryState;
  /** Pre-use snapshot; pass to `rollbackUseItem` if a downstream step (e.g. crediting ZXC) fails. */
  preUseState: ProfileInventoryState;
  effectSummary: string;
  currencyGranted?: number;
  buffActivated?: ActiveBuff;
}

/**
 * Apply an item effect. For token items this increments `pendingCurrencyCredit`
 * so the caller can credit the wallet; for buffs it adds to activeBuffs;
 * for avatar/title it moves the item into the owned list (already there,
 * but kept for safety) and clears inventory count.
 */
export async function useItem(
  userId: string,
  itemId: string
): Promise<UseItemOutcome> {
  const def = ALL_ITEMS[itemId];
  if (!def) throw new Error(`Unknown item: ${itemId}`);

  const state = await loadInventoryState(userId);
  const owned = state.inventory[itemId] || 0;
  if (owned <= 0) throw new Error(`Item not in inventory: ${itemId}`);

  const nextState: ProfileInventoryState = {
    ...state,
    inventory: { ...state.inventory },
    ownedAvatars: [...state.ownedAvatars],
    ownedTitles: [...state.ownedTitles],
    activeBuffs: [...state.activeBuffs],
  };

  let effectSummary = `${def.name} 已使用`;
  let currencyGranted: number | undefined;
  let buffActivated: ActiveBuff | undefined;

  if (def.consumable) {
    const nextCount = owned - 1;
    if (nextCount <= 0) delete nextState.inventory[itemId];
    else nextState.inventory[itemId] = nextCount;
  }

  switch (def.type) {
    case "token": {
      const value = Number(def.effect?.value || 0);
      if (value > 0) {
        currencyGranted = value;
        effectSummary = `已領取 ${value.toLocaleString()} ZXC`;
      }
      break;
    }
    case "buff": {
      const effectType = def.effect?.type || "buff";
      const remaining = def.effect?.type === "prevent_loss" ? Number(def.effect?.value || 0) : undefined;
      const duration = typeof def.effect?.duration === "number" ? def.effect.duration : null;
      const expiresAt = duration ? new Date(Date.now() + duration * 60 * 60 * 1000).toISOString() : null;
      buffActivated = {
        id: `${def.id}_${Date.now()}`,
        type: effectType,
        value: Number(def.effect?.value || 0),
        remaining,
        expiresAt,
        source: def.id,
      };
      nextState.activeBuffs.push(buffActivated);
      effectSummary = duration
        ? `${def.name} 已啟用，將於 ${duration} 小時後失效`
        : remaining !== undefined
        ? `${def.name} 已啟用，剩餘 ${remaining} 次`
        : `${def.name} 已啟用`;
      break;
    }
    case "avatar":
      if (!nextState.ownedAvatars.includes(itemId)) nextState.ownedAvatars.push(itemId);
      nextState.activeAvatar = itemId;
      effectSummary = `已裝備頭像：${def.name}`;
      break;
    case "title":
      if (!nextState.ownedTitles.includes(itemId)) nextState.ownedTitles.push(itemId);
      nextState.activeTitle = itemId;
      effectSummary = `已裝備稱號：${def.name}`;
      break;
    case "collectible":
      effectSummary = `${def.name} 已展示在收藏櫃`;
      break;
  }

  await persistInventoryState(userId, nextState);
  return {
    item: def,
    state: nextState,
    preUseState: state,
    effectSummary,
    currencyGranted,
    buffActivated,
  };
}

/**
 * Reverse a `useItem` call by re-persisting the pre-use snapshot captured in
 * `UseItemOutcome.preUseState`. Use this in the route handler when a
 * post-useItem step (e.g. crediting the wallet for a token item) fails, so the
 * user does not permanently lose the consumed item.
 */
export async function rollbackUseItem(
  userId: string,
  preUseState: ProfileInventoryState
): Promise<void> {
  await persistInventoryState(userId, preUseState);
}

/**
 * Decrement the user's active `prevent_loss` buff by 1 if present and return
 * whether the buff was consumed. Used by game-settlement to refund losing bets.
 */
export async function consumePreventLossBuff(userId: string): Promise<{
  consumed: boolean;
  remaining: number | null;
}> {
  const state = await loadInventoryState(userId);
  const idx = state.activeBuffs.findIndex(
    (buff) => buff.type === "prevent_loss" && (buff.remaining ?? 0) > 0
  );
  if (idx < 0) return { consumed: false, remaining: null };

  const buff = { ...state.activeBuffs[idx] };
  const nextRemaining = Math.max(0, (buff.remaining ?? 0) - 1);
  const nextBuffs = [...state.activeBuffs];
  if (nextRemaining > 0) {
    nextBuffs[idx] = { ...buff, remaining: nextRemaining };
  } else {
    nextBuffs.splice(idx, 1);
  }

  await persistInventoryState(userId, { ...state, activeBuffs: nextBuffs });
  return { consumed: true, remaining: nextRemaining };
}

/**
 * Reverse the effect of `consumePreventLossBuff`. Used by game-settlement when
 * the on-chain settlement subsequently fails so the user does not lose a
 * paid-for buff charge on a transaction that never completed.
 */
export async function restorePreventLossBuff(userId: string): Promise<void> {
  const state = await loadInventoryState(userId);
  const idx = state.activeBuffs.findIndex((buff) => buff.type === "prevent_loss");
  const nextBuffs = [...state.activeBuffs];
  if (idx < 0) {
    nextBuffs.push({
      id: `buff_prevent_loss_restored_${Date.now()}`,
      type: "prevent_loss",
      value: 1,
      remaining: 1,
      expiresAt: null,
      source: "settlement_rollback",
    });
  } else {
    const current = { ...nextBuffs[idx] };
    current.remaining = (current.remaining ?? 0) + 1;
    nextBuffs[idx] = current;
  }
  await persistInventoryState(userId, { ...state, activeBuffs: nextBuffs });
}

/**
 * Grant a bundle of rewards (items / avatars / titles) to a user's profile.
 * Token adjustments (ZXC/YJC) must be handled by the caller via the wallet layer.
 */
export interface RewardBundle {
  items?: Array<{ id: string; qty?: number }>;
  avatars?: string[];
  titles?: string[];
}

export async function grantBundleToUser(userId: string, bundle: RewardBundle): Promise<ProfileInventoryState> {
  const state = await loadInventoryState(userId);
  const nextInventory = { ...state.inventory };
  const nextAvatars = [...state.ownedAvatars];
  const nextTitles = [...state.ownedTitles];

  for (const it of bundle.items ?? []) {
    const id = String(it?.id || "").trim();
    if (!id) continue;
    const qty = Math.max(1, Math.floor(Number(it?.qty || 1)));
    nextInventory[id] = (nextInventory[id] || 0) + qty;
  }
  for (const avId of bundle.avatars ?? []) {
    const id = String(avId || "").trim();
    if (id && !nextAvatars.includes(id)) nextAvatars.push(id);
  }
  for (const ttId of bundle.titles ?? []) {
    const id = String(ttId || "").trim();
    if (id && !nextTitles.includes(id)) nextTitles.push(id);
  }

  const nextState: ProfileInventoryState = {
    ...state,
    inventory: nextInventory,
    ownedAvatars: nextAvatars,
    ownedTitles: nextTitles,
  };
  await persistInventoryState(userId, nextState);
  return nextState;
}

export function listAllItems(): ItemDefinition[] {
  return Object.values(ALL_ITEMS);
}
