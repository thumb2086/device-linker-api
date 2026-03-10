import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { buildVipStatus, meetsVipLevelRequirement } from "./vip.js";

const PROFILE_PREFIX = "reward_profile:";
const CAMPAIGN_PREFIX = "reward_campaign:";
const CLAIM_PREFIX = "reward_claim:";
const GRANT_LOG_PREFIX = "reward_grant_log:";
const TITLE_CATALOG_PREFIX = "reward_title_catalog:";
const DEFAULT_AVATAR_ID = "classic_chip";

const AVATAR_CATALOG = [
    { id: "classic_chip", name: "經典籌碼", rarity: "common", icon: "🪙", source: "default" },
    { id: "cue_master", name: "球桌王牌", rarity: "rare", icon: "🎱", source: "shop" },
    { id: "neon_dice", name: "霓虹骰魂", rarity: "rare", icon: "🎲", source: "shop" },
    { id: "gold_dragon", name: "金龍印記", rarity: "epic", icon: "🐉", source: "chest" },
    { id: "celestial_crown", name: "星冠信標", rarity: "mythic", icon: "👑", source: "campaign" },
    { id: "admin_shield", name: "管理聖盾", rarity: "legendary", icon: "🛡️", source: "admin" }
];

const BASE_TITLE_CATALOG = [
    { id: "yuanlao_figure", name: "元老人物", rarity: "mythic", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "founding_player", name: "開服玩家", rarity: "epic", source: "campaign", adminGrantable: true, showOnLeaderboard: true },
    { id: "closed_beta_member", name: "封測成員", rarity: "epic", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "beta_witness", name: "內測見證者", rarity: "epic", source: "campaign", adminGrantable: true, showOnLeaderboard: true },
    { id: "legendary_player", name: "傳奇玩家", rarity: "legendary", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "million_winner", name: "百萬贏家", rarity: "rare", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "ten_million_winner", name: "千萬贏家", rarity: "epic", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "hundred_million_winner", name: "億級贏家", rarity: "mythic", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "hundred_billion_winner", name: "百億贏家", rarity: "legendary", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "weekly_champion", name: "周榜冠軍", rarity: "rare", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "monthly_champion", name: "月榜冠軍", rarity: "epic", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "season_king", name: "賽季王者", rarity: "mythic", source: "system", adminGrantable: true, showOnLeaderboard: true },
    { id: "event_champion", name: "活動冠軍", rarity: "rare", source: "campaign", adminGrantable: true, showOnLeaderboard: true },
    { id: "event_legend", name: "活動傳奇", rarity: "legendary", source: "campaign", adminGrantable: true, showOnLeaderboard: true },
    { id: "official_certified", name: "官方認證", rarity: "epic", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "official_guest", name: "官方特邀", rarity: "epic", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "zixi_hot_burn", name: "子熙好燒", rarity: "legendary", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "admin_operator", name: "管理員", rarity: "legendary", source: "admin", adminGrantable: true, showOnLeaderboard: true },
    { id: "genesis_supporter", name: "創世支持者", rarity: "mythic", source: "campaign", adminGrantable: true, showOnLeaderboard: true }
];

const SHOP_ITEM_CATALOG = [
    {
        id: "profit_boost_small",
        name: "小型獲利翻倍卡",
        rarity: "rare",
        type: "buff",
        price: 8000000,
        description: "15 分鐘內淨盈利 x2，總加成上限 2,000 萬。",
        effect: { effectType: "profit_boost", durationMinutes: 15, multiplier: 2, maxBonus: 20000000, stackable: false, eligibleScopes: ["solo"] }
    },
    {
        id: "profit_boost_large",
        name: "大型獲利翻倍卡",
        rarity: "legendary",
        type: "buff",
        price: 300000000,
        description: "30 分鐘內淨盈利 x2，總加成上限 5 億。",
        effect: { effectType: "profit_boost", durationMinutes: 30, multiplier: 2, maxBonus: 500000000, stackable: false, eligibleScopes: ["solo"] }
    },
    {
        id: "loss_shield_single",
        name: "單次免損護盾",
        rarity: "epic",
        type: "buff",
        price: 25000000,
        description: "失敗時返還本金一次，按次數保護，不設金額上限。",
        effect: { effectType: "loss_shield", uses: 1, maxProtectedLoss: 0, stackable: true, eligibleScopes: ["solo"] }
    },
    {
        id: "loss_shield_triple",
        name: "三次免損護盾",
        rarity: "mythic",
        type: "buff",
        price: 90000000,
        description: "共可保護 3 次失敗，按次數保護，不設金額上限。",
        effect: { effectType: "loss_shield", uses: 3, maxProtectedLoss: 0, stackable: false, eligibleScopes: ["solo"] }
    },
    {
        id: "loss_shield_timed",
        name: "15 分鐘免損護盾",
        rarity: "legendary",
        type: "buff",
        price: 800000000,
        description: "15 分鐘內最多保護 3 次，按次數保護，不設金額上限。",
        effect: { effectType: "loss_shield", durationMinutes: 15, uses: 3, maxProtectedLoss: 0, stackable: false, eligibleScopes: ["solo"] }
    },
    {
        id: "luck_boost",
        name: "幸運增幅卡",
        rarity: "legendary",
        type: "buff",
        price: 120000000,
        description: "30 分鐘內提升寶箱高稀有獎勵權重。",
        effect: { effectType: "luck_boost", durationMinutes: 30, luckMultiplier: 2, stackable: false, eligibleScopes: ["chest", "campaign_bonus"] }
    },
    { id: "rare_chest", name: "稀有寶箱", rarity: "rare", type: "chest", price: 3000000, description: "小額資源與基礎增幅道具。" },
    { id: "super_rare_chest", name: "超稀有寶箱", rarity: "super_rare", type: "chest", price: 12000000, description: "中低階 Buff、鑰匙與稀有外觀。" },
    { id: "epic_chest", name: "史詩寶箱", rarity: "epic", type: "chest", price: 60000000, description: "高價 Buff 與史詩獎勵池。" },
    { id: "mythic_chest", name: "神話寶箱", rarity: "mythic", type: "chest", price: 300000000, description: "高價值稱號、外觀與道具。" },
    { id: "legendary_chest", name: "傳奇寶箱", rarity: "legendary", type: "chest", price: 1200000000, description: "頂級限定內容與超高價值資源。" },
    { id: "basic_key", name: "普通鑰匙補給箱", rarity: "common", type: "key", price: 500000, description: "開啟後可獲得基礎資源、Buff 或額外寶箱。" },
    { id: "advanced_key", name: "高級鑰匙補給箱", rarity: "epic", type: "key", price: 8000000, description: "開啟後可獲得進階 Buff、稱號或高價值資源。" },
    { id: "master_key", name: "萬用鑰匙補給箱", rarity: "legendary", type: "key", price: 80000000, description: "開啟後可獲得高階稱號、Buff 與傳奇級資源。" }
];

const CHEST_RULES = {
    rare_chest: {
        rewards: [
            { weight: 44, rewards: { tokens: 250000, items: [{ id: "basic_key", qty: 1 }] }, rarity: "rare" },
            { weight: 25, rewards: { items: [{ id: "profit_boost_small", qty: 1 }] }, rarity: "rare" },
            { weight: 16, rewards: { items: [{ id: "loss_shield_single", qty: 1 }] }, rarity: "epic" },
            { weight: 10, rewards: { avatars: ["cue_master"] }, rarity: "epic" },
            { weight: 5, rewards: { titles: [{ id: "million_winner" }] }, rarity: "mythic" }
        ]
    },
    super_rare_chest: {
        rewards: [
            { weight: 36, rewards: { tokens: 900000, items: [{ id: "advanced_key", qty: 1 }] }, rarity: "super_rare" },
            { weight: 24, rewards: { items: [{ id: "profit_boost_small", qty: 2 }] }, rarity: "epic" },
            { weight: 16, rewards: { items: [{ id: "loss_shield_single", qty: 2 }] }, rarity: "epic" },
            { weight: 12, rewards: { avatars: ["neon_dice"] }, rarity: "epic" },
            { weight: 8, rewards: { titles: [{ id: "weekly_champion" }] }, rarity: "mythic" },
            { weight: 4, rewards: { titles: [{ id: "founding_player" }] }, rarity: "legendary" }
        ]
    },
    epic_chest: {
        rewards: [
            { weight: 30, rewards: { tokens: 5000000, items: [{ id: "profit_boost_large", qty: 1 }] }, rarity: "epic" },
            { weight: 22, rewards: { items: [{ id: "loss_shield_triple", qty: 1 }] }, rarity: "epic" },
            { weight: 16, rewards: { items: [{ id: "luck_boost", qty: 1 }] }, rarity: "mythic" },
            { weight: 14, rewards: { avatars: ["gold_dragon"] }, rarity: "mythic" },
            { weight: 10, rewards: { titles: [{ id: "ten_million_winner" }] }, rarity: "mythic" },
            { weight: 8, rewards: { titles: [{ id: "event_champion" }] }, rarity: "legendary" }
        ]
    },
    mythic_chest: {
        rewards: [
            { weight: 28, rewards: { tokens: 20000000, items: [{ id: "loss_shield_timed", qty: 1 }] }, rarity: "mythic" },
            { weight: 24, rewards: { items: [{ id: "profit_boost_large", qty: 1 }, { id: "master_key", qty: 1 }] }, rarity: "mythic" },
            { weight: 16, rewards: { avatars: ["celestial_crown"] }, rarity: "mythic" },
            { weight: 14, rewards: { titles: [{ id: "beta_witness" }] }, rarity: "mythic" },
            { weight: 10, rewards: { titles: [{ id: "season_king" }] }, rarity: "legendary" },
            { weight: 8, rewards: { titles: [{ id: "genesis_supporter" }] }, rarity: "legendary" }
        ]
    },
    legendary_chest: {
        rewards: [
            { weight: 26, rewards: { tokens: 80000000, items: [{ id: "loss_shield_timed", qty: 1 }, { id: "profit_boost_large", qty: 1 }] }, rarity: "legendary" },
            { weight: 22, rewards: { items: [{ id: "luck_boost", qty: 2 }, { id: "master_key", qty: 1 }] }, rarity: "legendary" },
            { weight: 16, rewards: { avatars: ["admin_shield"] }, rarity: "legendary" },
            { weight: 14, rewards: { titles: [{ id: "legendary_player" }] }, rarity: "legendary" },
            { weight: 12, rewards: { titles: [{ id: "official_certified" }] }, rarity: "legendary" },
            { weight: 10, rewards: { titles: [{ id: "event_legend" }] }, rarity: "legendary" }
        ]
    }
};

const KEY_PACK_RULES = {
    basic_key: {
        rewards: [
            { weight: 44, rewards: { tokens: 120000 }, rarity: "common" },
            { weight: 26, rewards: { items: [{ id: "profit_boost_small", qty: 1 }] }, rarity: "rare" },
            { weight: 16, rewards: { items: [{ id: "loss_shield_single", qty: 1 }] }, rarity: "epic" },
            { weight: 9, rewards: { items: [{ id: "rare_chest", qty: 1 }] }, rarity: "epic" },
            { weight: 5, rewards: { avatars: ["cue_master"] }, rarity: "mythic" }
        ]
    },
    advanced_key: {
        rewards: [
            { weight: 34, rewards: { tokens: 600000 }, rarity: "rare" },
            { weight: 24, rewards: { items: [{ id: "profit_boost_small", qty: 2 }] }, rarity: "epic" },
            { weight: 18, rewards: { items: [{ id: "loss_shield_single", qty: 2 }] }, rarity: "epic" },
            { weight: 14, rewards: { items: [{ id: "epic_chest", qty: 1 }] }, rarity: "mythic" },
            { weight: 10, rewards: { titles: [{ id: "weekly_champion" }] }, rarity: "legendary" }
        ]
    },
    master_key: {
        rewards: [
            { weight: 28, rewards: { tokens: 8000000 }, rarity: "epic" },
            { weight: 24, rewards: { items: [{ id: "profit_boost_large", qty: 1 }] }, rarity: "mythic" },
            { weight: 18, rewards: { items: [{ id: "loss_shield_timed", qty: 1 }] }, rarity: "mythic" },
            { weight: 16, rewards: { items: [{ id: "legendary_chest", qty: 1 }] }, rarity: "legendary" },
            { weight: 14, rewards: { titles: [{ id: "official_certified" }] }, rarity: "legendary" }
        ]
    }
};

function profileKey(address) {
    return `${PROFILE_PREFIX}${String(address || "").trim().toLowerCase()}`;
}

function campaignKey(campaignId) {
    return `${CAMPAIGN_PREFIX}${campaignId}`;
}

function claimKey(campaignId, address) {
    return `${CLAIM_PREFIX}${String(campaignId || "").trim()}:${String(address || "").trim().toLowerCase()}`;
}

function grantLogKey(grantId) {
    return `${GRANT_LOG_PREFIX}${grantId}`;
}

function titleCatalogKey(titleId) {
    return `${TITLE_CATALOG_PREFIX}${titleId}`;
}

function trimText(value, maxLength = 120) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function parseDate(value) {
    const ts = Date.parse(String(value || ""));
    return Number.isFinite(ts) ? ts : 0;
}

function hasStarted(startAt, atMs = Date.now()) {
    if (!trimText(startAt, 64)) return true;
    return parseDate(startAt) <= atMs;
}

function hasEnded(endAt, atMs = Date.now()) {
    if (!trimText(endAt, 64)) return false;
    return parseDate(endAt) < atMs;
}

function nowIso() {
    return new Date().toISOString();
}

function asPositiveInt(value, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(1, Math.floor(parsed));
}

function asNonNegativeInt(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function toSlug(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

function rewardCatalogIndex(list) {
    const map = new Map();
    for (const item of list) {
        map.set(item.id, item);
    }
    return map;
}

const avatarMap = rewardCatalogIndex(AVATAR_CATALOG);
const shopItemMap = rewardCatalogIndex(SHOP_ITEM_CATALOG);
const baseTitleMap = rewardCatalogIndex(BASE_TITLE_CATALOG);
let cachedTitleCatalogAt = 0;
let cachedTitleCatalog = null;

function normalizeOwnedEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => ({
            id: trimText(entry && entry.id, 64),
            source: trimText(entry && entry.source, 32),
            grantedAt: trimText(entry && entry.grantedAt, 64),
            expiresAt: trimText(entry && entry.expiresAt, 64)
        }))
        .filter((entry) => entry.id);
}

function normalizeTitleCatalogEntry(record = {}) {
    const generatedId = toSlug(record.id || record.name);
    return {
        id: trimText(generatedId, 64),
        name: trimText(record.name, 80),
        rarity: trimText(record.rarity || "epic", 24) || "epic",
        source: trimText(record.source || "admin", 32) || "admin",
        adminGrantable: record.adminGrantable !== false,
        showOnLeaderboard: record.showOnLeaderboard === true,
        shopEnabled: record.shopEnabled === true,
        shopPrice: asNonNegativeInt(record.shopPrice, 0),
        shopDescription: trimText(record.shopDescription || record.description, 240),
        shopCategory: trimText(record.shopCategory, 32),
        shopPriority: asNonNegativeInt(record.shopPriority, 0),
        salePrice: asNonNegativeInt(record.salePrice, 0),
        saleStartAt: trimText(record.saleStartAt, 64),
        saleEndAt: trimText(record.saleEndAt, 64),
        createdAt: trimText(record.createdAt, 64),
        updatedAt: trimText(record.updatedAt, 64)
    };
}

function getDefaultTitleShopCategory(title) {
    const source = trimText(title && title.source, 32);
    switch (source) {
        case "campaign":
            return "event";
        case "system":
            return "achievement";
        case "vip":
            return "vip";
        case "admin":
            return "special";
        case "shop":
            return "featured";
        default:
            return "featured";
    }
}

function isTitleSaleActive(title, atMs = Date.now()) {
    const basePrice = asNonNegativeInt(title && title.shopPrice, 0);
    const salePrice = asNonNegativeInt(title && title.salePrice, 0);
    if (basePrice <= 0 || salePrice <= 0 || salePrice >= basePrice) return false;
    if (!hasStarted(title && title.saleStartAt, atMs)) return false;
    if (hasEnded(title && title.saleEndAt, atMs)) return false;
    return true;
}

function resolveTitleShopData(title, atMs = Date.now()) {
    const normalized = normalizeTitleCatalogEntry(title || {});
    const category = normalized.shopCategory || getDefaultTitleShopCategory(normalized);
    const saleActive = isTitleSaleActive(normalized, atMs);
    return {
        ...normalized,
        shopCategory: category,
        saleActive,
        originalShopPrice: normalized.shopPrice,
        effectiveShopPrice: saleActive ? normalized.salePrice : normalized.shopPrice
    };
}

async function loadDynamicTitleCatalog() {
    const titles = [];
    for await (const key of kv.scanIterator({ match: `${TITLE_CATALOG_PREFIX}*`, count: 1000 })) {
        const record = normalizeTitleCatalogEntry(await kv.get(key));
        if (record.id && record.name) titles.push(record);
    }
    titles.sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "zh-Hant"));
    return titles;
}

export async function getTitleCatalog(forceRefresh = false) {
    if (!forceRefresh && cachedTitleCatalog && Date.now() - cachedTitleCatalogAt < 30 * 1000) {
        return clone(cachedTitleCatalog);
    }

    const dynamicTitles = await loadDynamicTitleCatalog();
    const merged = clone(BASE_TITLE_CATALOG);
    dynamicTitles.forEach((item) => {
        const existingIndex = merged.findIndex((entry) => entry.id === item.id);
        if (existingIndex >= 0) merged[existingIndex] = { ...merged[existingIndex], ...item };
        else merged.push(item);
    });

    cachedTitleCatalog = merged.map((item) => resolveTitleShopData(item));
    cachedTitleCatalogAt = Date.now();
    return clone(cachedTitleCatalog);
}

async function getTitleCatalogMap(forceRefresh = false) {
    return rewardCatalogIndex(await getTitleCatalog(forceRefresh));
}

export async function upsertRewardTitle(input) {
    const requestedId = trimText(input && input.id, 64) || toSlug(input && input.name);
    const baseRecord = requestedId ? (baseTitleMap.get(requestedId) || {}) : {};
    const storedRecord = requestedId ? await kv.get(titleCatalogKey(requestedId)) : null;
    const existing = storedRecord && typeof storedRecord === "object" ? storedRecord : {};
    const normalized = normalizeTitleCatalogEntry({
        ...baseRecord,
        ...existing,
        ...input,
        id: requestedId,
        name: trimText(input && input.name, 80) || trimText(existing.name, 80) || trimText(baseRecord.name, 80),
        createdAt: trimText(existing.createdAt, 64) || trimText(input && input.createdAt, 64) || nowIso(),
        updatedAt: nowIso()
    });
    if (!normalized.id || !normalized.name) throw new Error("稱號資料不完整");
    await kv.set(titleCatalogKey(normalized.id), {
        ...normalized,
        createdAt: trimText(existing.createdAt, 64) || normalized.createdAt
    });
    cachedTitleCatalog = null;
    cachedTitleCatalogAt = 0;
    return normalizeTitleCatalogEntry(await kv.get(titleCatalogKey(normalized.id)) || normalized);
}

function normalizeActiveBuffs(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => {
            const effectType = trimText(entry && entry.effectType, 32);
            const rawRemainingUses = entry && entry.remainingUses;
            const rawRemainingMaxBonus = entry && entry.remainingMaxBonus;
            const parsedMaxBonus = Number(entry && entry.maxBonus || 0);
            const parsedRemainingUses = rawRemainingUses === null || rawRemainingUses === undefined || rawRemainingUses === "" ? null : Number(rawRemainingUses);
            const parsedRemainingMaxBonus = rawRemainingMaxBonus === null || rawRemainingMaxBonus === undefined || rawRemainingMaxBonus === ""
                ? (effectType === "profit_boost" && parsedMaxBonus > 0 ? parsedMaxBonus : null)
                : Number(rawRemainingMaxBonus);
            return {
            instanceId: trimText(entry && entry.instanceId, 128),
            itemId: trimText(entry && entry.itemId, 64),
            effectType,
            startedAt: trimText(entry && entry.startedAt, 64),
            expiresAt: trimText(entry && entry.expiresAt, 64),
            remainingUses: effectType === "profit_boost" || effectType === "luck_boost" ? null : parsedRemainingUses,
            multiplier: Number(entry && entry.multiplier || 0),
            luckMultiplier: Number(entry && entry.luckMultiplier || 0),
            maxBonus: parsedMaxBonus,
            remainingMaxBonus: parsedRemainingMaxBonus,
            maxProtectedLoss: Number(entry && entry.maxProtectedLoss || 0),
            eligibleScopes: Array.isArray(entry && entry.eligibleScopes) ? entry.eligibleScopes.map((scope) => trimText(scope, 32)).filter(Boolean) : []
        };
        })
        .filter((entry) => entry.instanceId && entry.itemId && entry.effectType);
}

function isEntryActive(entry, atMs = Date.now()) {
    if (!entry || !entry.id) return false;
    if (!entry.expiresAt) return true;
    return parseDate(entry.expiresAt) > atMs;
}

function isBuffActive(entry, atMs = Date.now()) {
    if (!entry || !entry.instanceId) return false;
    if (entry.remainingUses !== null && entry.remainingUses !== undefined && entry.remainingUses <= 0) return false;
    if (entry.remainingMaxBonus !== null && entry.remainingMaxBonus !== undefined && entry.remainingMaxBonus <= 0) return false;
    if (!entry.expiresAt) return true;
    return parseDate(entry.expiresAt) > atMs;
}

function removeExpiredEntries(entries) {
    const nowMs = Date.now();
    return normalizeOwnedEntries(entries).filter((entry) => isEntryActive(entry, nowMs));
}

function removeExpiredBuffs(entries) {
    const nowMs = Date.now();
    return normalizeActiveBuffs(entries).filter((entry) => isBuffActive(entry, nowMs));
}

function createDefaultProfile(address) {
    return {
        address: String(address || "").trim().toLowerCase(),
        selectedAvatarId: DEFAULT_AVATAR_ID,
        selectedTitleId: "",
        inventory: {},
        ownedAvatars: [{ id: DEFAULT_AVATAR_ID, source: "default", grantedAt: nowIso(), expiresAt: "" }],
        ownedTitles: [],
        activeBuffs: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
    };
}

function normalizeProfile(record, address) {
    const base = record && typeof record === "object" ? record : createDefaultProfile(address);
    const normalized = {
        address: String(base.address || address || "").trim().toLowerCase(),
        selectedAvatarId: trimText(base.selectedAvatarId || DEFAULT_AVATAR_ID, 64) || DEFAULT_AVATAR_ID,
        selectedTitleId: trimText(base.selectedTitleId, 64),
        inventory: {},
        ownedAvatars: removeExpiredEntries(base.ownedAvatars),
        ownedTitles: removeExpiredEntries(base.ownedTitles),
        activeBuffs: removeExpiredBuffs(base.activeBuffs),
        createdAt: trimText(base.createdAt, 64) || nowIso(),
        updatedAt: nowIso()
    };

    const rawInventory = base.inventory && typeof base.inventory === "object" ? base.inventory : {};
    Object.keys(rawInventory).forEach((key) => {
        const itemId = trimText(key, 64);
        const qty = asPositiveInt(rawInventory[key], 0);
        if (itemId && qty > 0) {
            normalized.inventory[itemId] = qty;
        }
    });

    if (!normalized.ownedAvatars.some((entry) => entry.id === DEFAULT_AVATAR_ID)) {
        normalized.ownedAvatars.unshift({ id: DEFAULT_AVATAR_ID, source: "default", grantedAt: nowIso(), expiresAt: "" });
    }

    if (!normalized.ownedAvatars.some((entry) => entry.id === normalized.selectedAvatarId && isEntryActive(entry))) {
        normalized.selectedAvatarId = DEFAULT_AVATAR_ID;
    }

    if (normalized.selectedTitleId && !normalized.ownedTitles.some((entry) => entry.id === normalized.selectedTitleId && isEntryActive(entry))) {
        normalized.selectedTitleId = "";
    }

    return normalized;
}

export async function getRewardProfile(address) {
    const normalizedAddress = String(address || "").trim().toLowerCase();
    const existing = await kv.get(profileKey(normalizedAddress));
    const profile = normalizeProfile(existing, normalizedAddress);
    await kv.set(profileKey(normalizedAddress), profile);
    return profile;
}

export async function saveRewardProfile(profile) {
    const normalized = normalizeProfile(profile, profile && profile.address);
    await kv.set(profileKey(normalized.address), normalized);
    return normalized;
}

function grantOwnedEntry(list, id, source = "grant", expiresAt = "") {
    const activeList = normalizeOwnedEntries(list);
    const existingIndex = activeList.findIndex((entry) => entry.id === id);
    const nextEntry = {
        id,
        source,
        grantedAt: nowIso(),
        expiresAt: trimText(expiresAt, 64)
    };
    if (existingIndex >= 0) {
        activeList[existingIndex] = nextEntry;
        return activeList;
    }
    activeList.push(nextEntry);
    return activeList;
}

function addInventory(profile, itemId, qty = 1) {
    const item = shopItemMap.get(itemId);
    if (!item) throw new Error(`Unknown item: ${itemId}`);
    const nextQty = asPositiveInt(profile.inventory[itemId] || 0, 0) + asPositiveInt(qty, 1);
    profile.inventory[itemId] = nextQty;
}

function consumeInventory(profile, itemId, qty = 1) {
    const current = asPositiveInt(profile.inventory[itemId] || 0, 0);
    const needed = asPositiveInt(qty, 1);
    if (current < needed) {
        throw new Error("道具數量不足");
    }
    const nextQty = current - needed;
    if (nextQty > 0) {
        profile.inventory[itemId] = nextQty;
    } else {
        delete profile.inventory[itemId];
    }
}

function getBuffExpiresAt(effect) {
    const durationMinutes = Number(effect && effect.durationMinutes || 0);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return "";
    return new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
}

function getActiveLuckMultiplier(profile) {
    const activeBuff = removeExpiredBuffs(profile.activeBuffs).find((buff) => buff.effectType === "luck_boost");
    if (!activeBuff) return 1;
    return Math.max(1, Number(activeBuff.luckMultiplier || 1));
}

export async function getRewardCatalog() {
    return {
        avatars: clone(AVATAR_CATALOG),
        titles: await getTitleCatalog(),
        shopItems: clone(SHOP_ITEM_CATALOG)
    };
}

export function buildVipRewardTitle(totalBet) {
    const vipStatus = buildVipStatus(totalBet);
    if (!vipStatus || !vipStatus.vipLevel || vipStatus.vipLevel === "普通會員") return null;
    return {
        id: `vip_auto:${vipStatus.vipLevel}`,
        name: vipStatus.vipLevel,
        rarity: vipStatus.vipLevel.indexOf("VIP") >= 0 ? "epic" : "rare",
        source: "vip",
        showOnLeaderboard: true,
        isVirtual: true
    };
}

async function resolveEquippedTitle(profile, totalBet) {
    const nowMs = Date.now();
    const ownedTitles = removeExpiredEntries(profile.ownedTitles);
    const titleMap = await getTitleCatalogMap();
    if (profile.selectedTitleId) {
        const owned = ownedTitles.find((entry) => entry.id === profile.selectedTitleId && isEntryActive(entry, nowMs));
        const catalogTitle = owned ? titleMap.get(owned.id) : null;
        if (catalogTitle) {
            return {
                id: catalogTitle.id,
                name: catalogTitle.name,
                rarity: catalogTitle.rarity,
                source: owned.source || catalogTitle.source,
                showOnLeaderboard: !!catalogTitle.showOnLeaderboard,
                expiresAt: owned.expiresAt || ""
            };
        }
    }
    return buildVipRewardTitle(totalBet);
}

function resolveAvatar(profile) {
    const ownedAvatars = removeExpiredEntries(profile.ownedAvatars);
    const selected = ownedAvatars.find((entry) => entry.id === profile.selectedAvatarId);
    const avatar = avatarMap.get(selected ? selected.id : DEFAULT_AVATAR_ID) || avatarMap.get(DEFAULT_AVATAR_ID);
    return avatar ? {
        id: avatar.id,
        name: avatar.name,
        rarity: avatar.rarity,
        icon: avatar.icon
    } : null;
}

function summarizeInventory(profile) {
    return Object.keys(profile.inventory || {})
        .sort()
        .map((itemId) => {
            const catalog = shopItemMap.get(itemId);
            return {
                itemId,
                qty: asPositiveInt(profile.inventory[itemId], 0),
                name: catalog ? catalog.name : itemId,
                type: catalog ? catalog.type : "unknown",
                rarity: catalog ? catalog.rarity : "common",
                description: catalog ? catalog.description : ""
            };
        })
        .filter((entry) => entry.qty > 0);
}

function summarizeOwnedEntries(entries, catalogMap, transform) {
    return removeExpiredEntries(entries).map((entry) => {
        const catalog = catalogMap.get(entry.id);
        if (!catalog) return null;
        return transform(catalog, entry);
    }).filter(Boolean);
}

export async function buildRewardSummaryFromProfile(profile, totalBet = 0) {
    const titleMap = await getTitleCatalogMap();
    const equippedTitle = await resolveEquippedTitle(profile, totalBet);
    return {
        address: profile.address,
        selectedAvatarId: profile.selectedAvatarId,
        selectedTitleId: profile.selectedTitleId,
        avatar: resolveAvatar(profile),
        title: equippedTitle,
        inventory: summarizeInventory(profile),
        avatars: summarizeOwnedEntries(profile.ownedAvatars, avatarMap, (catalog, owned) => ({
            id: catalog.id,
            name: catalog.name,
            rarity: catalog.rarity,
            icon: catalog.icon,
            source: owned.source,
            expiresAt: owned.expiresAt || ""
        })),
        titles: summarizeOwnedEntries(profile.ownedTitles, titleMap, (catalog, owned) => ({
            id: catalog.id,
            name: catalog.name,
            rarity: catalog.rarity,
            source: owned.source || catalog.source,
            showOnLeaderboard: !!catalog.showOnLeaderboard,
            shopDescription: catalog.shopDescription || "",
            expiresAt: owned.expiresAt || ""
        })),
        activeBuffs: removeExpiredBuffs(profile.activeBuffs).map((buff) => ({
            instanceId: buff.instanceId,
            itemId: buff.itemId,
            effectType: buff.effectType,
            expiresAt: buff.expiresAt || "",
            remainingUses: buff.remainingUses ?? null,
            multiplier: buff.multiplier || 0,
            luckMultiplier: buff.luckMultiplier || 0,
            maxBonus: buff.maxBonus || 0,
            remainingMaxBonus: buff.remainingMaxBonus ?? null,
            maxProtectedLoss: buff.maxProtectedLoss || 0,
            eligibleScopes: buff.eligibleScopes || []
        }))
    };
}

export async function buildRewardSummary(address, totalBet = 0) {
    const profile = await getRewardProfile(address);
    return buildRewardSummaryFromProfile(profile, totalBet);
}

export async function buildRewardDisplayMap(entries, totalBetResolver) {
    const result = new Map();
    await Promise.all((entries || []).map(async (address) => {
        const normalizedAddress = String(address || "").trim().toLowerCase();
        if (!normalizedAddress) return;
        const totalBet = typeof totalBetResolver === "function" ? Number(totalBetResolver(normalizedAddress) || 0) : 0;
        const summary = await buildRewardSummary(normalizedAddress, totalBet);
        result.set(normalizedAddress, {
            avatar: summary.avatar,
            title: summary.title
        });
    }));
    return result;
}

export async function equipAvatar(address, avatarId) {
    const profile = await getRewardProfile(address);
    if (!removeExpiredEntries(profile.ownedAvatars).some((entry) => entry.id === avatarId)) {
        throw new Error("尚未持有此頭像");
    }
    profile.selectedAvatarId = avatarId;
    return saveRewardProfile(profile);
}

export async function equipTitle(address, titleId) {
    const profile = await getRewardProfile(address);
    const titleMap = await getTitleCatalogMap();
    if (titleId) {
        if (!removeExpiredEntries(profile.ownedTitles).some((entry) => entry.id === titleId)) {
            throw new Error("尚未持有此稱號");
        }
        if (!titleMap.has(titleId)) {
            throw new Error("找不到此稱號");
        }
    }
    profile.selectedTitleId = trimText(titleId, 64);
    return saveRewardProfile(profile);
}

async function applyGrantBundleToProfile(profile, bundle, meta = {}) {
    const normalizedBundle = bundle && typeof bundle === "object" ? bundle : {};
    if (Array.isArray(normalizedBundle.items)) {
        normalizedBundle.items.forEach((item) => {
            if (!item || !item.id) return;
            addInventory(profile, item.id, item.qty || 1);
        });
    }
    if (Array.isArray(normalizedBundle.avatars)) {
        normalizedBundle.avatars.forEach((avatarId) => {
            if (avatarMap.has(avatarId)) {
                profile.ownedAvatars = grantOwnedEntry(profile.ownedAvatars, avatarId, meta.source || "grant", meta.expiresAt || "");
            }
        });
    }
    if (Array.isArray(normalizedBundle.titles)) {
        const titleMap = await getTitleCatalogMap();
        normalizedBundle.titles.forEach((titleEntry) => {
            const titleId = typeof titleEntry === "string" ? titleEntry : titleEntry && titleEntry.id;
            const expiresAt = typeof titleEntry === "object" && titleEntry ? titleEntry.expiresAt : meta.expiresAt;
            if (titleMap.has(titleId)) {
                profile.ownedTitles = grantOwnedEntry(profile.ownedTitles, titleId, meta.source || "grant", expiresAt || "");
            }
        });
    }
    return profile;
}

export async function grantRewardBundle(address, bundle, meta = {}) {
    const profile = await getRewardProfile(address);
    await applyGrantBundleToProfile(profile, bundle, meta);
    const saved = await saveRewardProfile(profile);
    return {
        profile: saved,
        tokens: Number(bundle && bundle.tokens || 0)
    };
}

export async function purchaseShopItem(address, itemId) {
    const item = shopItemMap.get(itemId);
    if (!item) throw new Error("找不到商品");
    const profile = await getRewardProfile(address);
    if (item.type === "chest" || item.type === "key" || item.type === "buff") {
        addInventory(profile, item.id, 1);
    }
    await saveRewardProfile(profile);
    return item;
}

export async function purchaseRewardTitle(address, titleId) {
    const normalizedTitleId = trimText(titleId, 64);
    const titleMap = await getTitleCatalogMap();
    const title = resolveTitleShopData(titleMap.get(normalizedTitleId));
    if (!title) throw new Error("找不到稱號");
    if (!title.shopEnabled || asNonNegativeInt(title.effectiveShopPrice, 0) <= 0) {
        throw new Error("此稱號尚未上架販售");
    }

    const profile = await getRewardProfile(address);
    if (removeExpiredEntries(profile.ownedTitles).some((entry) => entry.id === normalizedTitleId)) {
        throw new Error("已持有此稱號");
    }

    profile.ownedTitles = grantOwnedEntry(profile.ownedTitles, normalizedTitleId, "shop", "");
    await saveRewardProfile(profile);
    return title;
}

export async function activateInventoryItem(address, itemId) {
    const profile = await getRewardProfile(address);
    const item = shopItemMap.get(itemId);
    if (!item || item.type !== "buff" || !item.effect) {
        throw new Error("此道具無法啟用");
    }
    consumeInventory(profile, itemId, 1);

    if (!item.effect.stackable) {
        const hasSame = removeExpiredBuffs(profile.activeBuffs).some((buff) => buff.effectType === item.effect.effectType);
        if (hasSame) {
            throw new Error("同類 Buff 已生效中");
        }
    }

    profile.activeBuffs.push({
        instanceId: `buff_${randomUUID()}`,
        itemId: item.id,
        effectType: item.effect.effectType,
        startedAt: nowIso(),
        expiresAt: getBuffExpiresAt(item.effect),
        remainingUses: item.effect.uses !== undefined ? Number(item.effect.uses || 0) : null,
        multiplier: Number(item.effect.multiplier || 0),
        luckMultiplier: Number(item.effect.luckMultiplier || 0),
        maxBonus: Number(item.effect.maxBonus || 0),
        remainingMaxBonus: item.effect.maxBonus !== undefined ? Number(item.effect.maxBonus || 0) : null,
        maxProtectedLoss: Number(item.effect.maxProtectedLoss || 0),
        eligibleScopes: Array.isArray(item.effect.eligibleScopes) ? item.effect.eligibleScopes.slice() : []
    });

    return saveRewardProfile(profile);
}

function pickWeightedReward(entries, luckMultiplier) {
    const weighted = entries.map((entry) => {
        const rarity = String(entry.rarity || "").toLowerCase();
        const isBoosted = rarity === "mythic" || rarity === "legendary";
        return {
            ...entry,
            adjustedWeight: entry.weight * (isBoosted ? luckMultiplier : 1)
        };
    });

    const totalWeight = weighted.reduce((sum, entry) => sum + Number(entry.adjustedWeight || 0), 0);
    let roll = Math.random() * totalWeight;
    for (const entry of weighted) {
        roll -= Number(entry.adjustedWeight || 0);
        if (roll <= 0) return entry;
    }
    return weighted[weighted.length - 1];
}

export async function openChest(address, chestItemId) {
    const profile = await getRewardProfile(address);
    const rewardItem = shopItemMap.get(chestItemId);
    const isChest = rewardItem && rewardItem.type === "chest";
    const isKeyPack = rewardItem && rewardItem.type === "key";
    const rule = isChest ? CHEST_RULES[chestItemId] : KEY_PACK_RULES[chestItemId];
    if (!rewardItem || (!isChest && !isKeyPack) || !rule) {
        throw new Error("此獎勵道具無法開啟");
    }

    consumeInventory(profile, chestItemId, 1);

    const selectedReward = pickWeightedReward(rule.rewards, getActiveLuckMultiplier(profile));
    await applyGrantBundleToProfile(profile, selectedReward.rewards, { source: `chest:${chestItemId}` });
    const saved = await saveRewardProfile(profile);

    return {
        chestId: chestItemId,
        chestName: rewardItem.name,
        rewardRarity: selectedReward.rarity,
        rewards: selectedReward.rewards,
        profile: saved
    };
}

function normalizeCampaignRecord(record) {
    const raw = record && typeof record === "object" ? record : {};
    return {
        id: trimText(raw.id, 128),
        title: trimText(raw.title, 120),
        description: trimText(raw.description, 600),
        isActive: raw.isActive !== false,
        startAt: trimText(raw.startAt, 64),
        endAt: trimText(raw.endAt, 64),
        claimLimitPerUser: asPositiveInt(raw.claimLimitPerUser, 1),
        minVipLevel: trimText(raw.minVipLevel, 64),
        rewards: raw.rewards && typeof raw.rewards === "object" ? clone(raw.rewards) : {},
        createdAt: trimText(raw.createdAt, 64),
        updatedAt: trimText(raw.updatedAt, 64),
        createdBy: trimText(raw.createdBy, 128),
        updatedBy: trimText(raw.updatedBy, 128)
    };
}

export async function createRewardCampaign(input) {
    const record = normalizeCampaignRecord({
        ...input,
        id: `campaign_${randomUUID()}`,
        createdAt: nowIso(),
        updatedAt: nowIso()
    });
    if (!record.title) throw new Error("活動標題不可為空");
    await kv.set(campaignKey(record.id), record);
    return record;
}

export async function saveRewardCampaign(record) {
    const normalized = normalizeCampaignRecord({
        ...record,
        updatedAt: nowIso()
    });
    if (!normalized.id || !normalized.title) throw new Error("活動資料不完整");
    await kv.set(campaignKey(normalized.id), normalized);
    return normalized;
}

export async function getRewardCampaign(campaignId) {
    const record = await kv.get(campaignKey(trimText(campaignId, 128)));
    const normalized = normalizeCampaignRecord(record);
    return normalized.id ? normalized : null;
}

export async function listRewardCampaigns(options = {}) {
    const activeOnly = options.activeOnly === true;
    const hideClaimed = options.hideClaimed === true;
    const address = String(options.address || "").trim().toLowerCase();
    const records = [];
    for await (const key of kv.scanIterator({ match: `${CAMPAIGN_PREFIX}*`, count: 1000 })) {
        const record = normalizeCampaignRecord(await kv.get(key));
        if (!record.id) continue;
        if (activeOnly && !record.isActive) continue;
        records.push(record);
    }

    const nowMs = Date.now();
    if (activeOnly) {
        let activeRecords = records.filter((record) => record.isActive && hasStarted(record.startAt, nowMs) && !hasEnded(record.endAt, nowMs));
        if (hideClaimed && address) {
            activeRecords = (await Promise.all(activeRecords.map(async (record) => {
                const claimCount = await getCampaignClaimCount(record.id, address);
                return claimCount >= record.claimLimitPerUser ? null : record;
            }))).filter(Boolean);
        }
        activeRecords.sort((left, right) => parseDate(right.updatedAt || right.createdAt) - parseDate(left.updatedAt || left.createdAt));
        return {
            total: activeRecords.length,
            campaigns: activeRecords
        };
    }

    records.sort((left, right) => {
        const leftActive = left.isActive && hasStarted(left.startAt, nowMs) && !hasEnded(left.endAt, nowMs);
        const rightActive = right.isActive && hasStarted(right.startAt, nowMs) && !hasEnded(right.endAt, nowMs);
        if (leftActive !== rightActive) return leftActive ? -1 : 1;
        return parseDate(right.updatedAt || right.createdAt) - parseDate(left.updatedAt || left.createdAt);
    });

    return {
        total: records.length,
        campaigns: records
    };
}

async function getCampaignClaimCount(campaignId, address) {
    const record = await kv.get(claimKey(campaignId, address));
    return asPositiveInt(record && record.count || 0, 0);
}

export async function claimRewardCampaign(campaignId, address, totalBet = 0) {
    const campaign = await getRewardCampaign(campaignId);
    if (!campaign || !campaign.isActive) throw new Error("活動不存在或未啟用");
    const nowMs = Date.now();
    if (!hasStarted(campaign.startAt, nowMs)) throw new Error("活動尚未開始");
    if (hasEnded(campaign.endAt, nowMs)) throw new Error("活動已結束");

    const vipStatus = buildVipStatus(totalBet);
    if (campaign.minVipLevel && !meetsVipLevelRequirement(vipStatus.vipLevel, campaign.minVipLevel)) {
        throw new Error(`需達 ${campaign.minVipLevel} 才可領取`);
    }

    const currentCount = await getCampaignClaimCount(campaignId, address);
    if (currentCount >= campaign.claimLimitPerUser) {
        throw new Error("已達領取上限");
    }

    const grant = await grantRewardBundle(address, campaign.rewards, { source: `campaign:${campaignId}` });
    await kv.set(claimKey(campaignId, address), {
        campaignId,
        address: String(address || "").trim().toLowerCase(),
        count: currentCount + 1,
        claimedAt: nowIso()
    });

    return {
        campaign,
        tokens: grant.tokens,
        profile: grant.profile
    };
}

function normalizeGrantLog(record) {
    const raw = record && typeof record === "object" ? record : {};
    return {
        id: trimText(raw.id, 128),
        address: trimText(raw.address, 128).toLowerCase(),
        operator: trimText(raw.operator, 128).toLowerCase(),
        source: trimText(raw.source, 64),
        note: trimText(raw.note, 240),
        bundle: raw.bundle && typeof raw.bundle === "object" ? clone(raw.bundle) : {},
        createdAt: trimText(raw.createdAt, 64)
    };
}

export async function createGrantLog(input) {
    const record = normalizeGrantLog({
        ...input,
        id: `grant_${randomUUID()}`,
        createdAt: nowIso()
    });
    await kv.set(grantLogKey(record.id), record);
    return record;
}

export async function listGrantLogs(limit = 100) {
    const records = [];
    for await (const key of kv.scanIterator({ match: `${GRANT_LOG_PREFIX}*`, count: 1000 })) {
        const record = normalizeGrantLog(await kv.get(key));
        if (record.id) records.push(record);
    }
    records.sort((left, right) => parseDate(right.createdAt) - parseDate(left.createdAt));
    return {
        total: records.length,
        logs: records.slice(0, Math.max(1, Math.min(200, Number(limit) || 100)))
    };
}
