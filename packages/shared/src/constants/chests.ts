// Chest and Item System Constants (Brawl Stars Style)

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type ItemType = "avatar" | "title" | "token" | "buff" | "collectible";
export type ChestType = "common" | "rare" | "epic" | "legendary";

export interface ChestConfig {
  id: ChestType;
  name: string;
  nameEn: string;
  price: number; // in ZXC
  guaranteedRarity: Rarity | null;
  pityThreshold: number; // open count for guaranteed drop
  dropCount: { min: number; max: number };
  weights: Record<Rarity, number>;
}

export interface ItemDefinition {
  id: string;
  name: string;
  nameEn: string;
  type: ItemType;
  rarity: Rarity;
  description: string;
  icon: string;
  tradable: boolean;
  consumable: boolean;
  effect?: {
    type: string;
    value: number;
    duration?: number; // in hours
  };
}

// Chest Configurations
export const CHEST_CONFIGS: Record<ChestType, ChestConfig> = {
  common: {
    id: "common",
    name: "普通寶箱",
    nameEn: "Common Chest",
    price: 100,
    guaranteedRarity: "rare",
    pityThreshold: 10,
    dropCount: { min: 2, max: 4 },
    weights: {
      common: 700,
      rare: 250,
      epic: 45,
      legendary: 5,
      mythic: 0,
    },
  },
  rare: {
    id: "rare",
    name: "稀有寶箱",
    nameEn: "Rare Chest",
    price: 500,
    guaranteedRarity: "epic",
    pityThreshold: 10,
    dropCount: { min: 3, max: 5 },
    weights: {
      common: 400,
      rare: 450,
      epic: 130,
      legendary: 19,
      mythic: 1,
    },
  },
  epic: {
    id: "epic",
    name: "史詩寶箱",
    nameEn: "Epic Chest",
    price: 2000,
    guaranteedRarity: "legendary",
    pityThreshold: 10,
    dropCount: { min: 4, max: 6 },
    weights: {
      common: 200,
      rare: 400,
      epic: 320,
      legendary: 75,
      mythic: 5,
    },
  },
  legendary: {
    id: "legendary",
    name: "傳奇寶箱",
    nameEn: "Legendary Chest",
    price: 10000,
    guaranteedRarity: "legendary",
    pityThreshold: 1,
    dropCount: { min: 5, max: 8 },
    weights: {
      common: 0,
      rare: 100,
      epic: 400,
      legendary: 450,
      mythic: 50,
    },
  },
};

// Item Drop Tables by Rarity
export const ITEM_DROP_TABLES: Record<Rarity, ItemDefinition[]> = {
  common: [
    { id: "token_10", name: "10 ZXC", nameEn: "10 ZXC", type: "token", rarity: "common", description: "10 子熙幣", icon: "🪙", tradable: false, consumable: true, effect: { type: "currency", value: 10 } },
    { id: "token_25", name: "25 ZXC", nameEn: "25 ZXC", type: "token", rarity: "common", description: "25 子熙幣", icon: "🪙", tradable: false, consumable: true, effect: { type: "currency", value: 25 } },
    { id: "buff_xp_1h", name: "經驗加成 (1小時)", nameEn: "XP Boost (1h)", type: "buff", rarity: "common", description: "1小時內獲得經驗值翻倍", icon: "⚡", tradable: false, consumable: true, effect: { type: "xp_boost", value: 2, duration: 1 } },
    { id: "buff_prevent_loss_1", name: "免輸護符 (1 次)", nameEn: "Loss Shield (1 use)", type: "buff", rarity: "common", description: "使用後下一次輸的下注將全額退回（1 次）", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 1 } },
    { id: "avatar_chip", name: "經典籌碼", nameEn: "Classic Chip", type: "avatar", rarity: "common", description: "經典籌碼頭像", icon: "🎰", tradable: true, consumable: false },
    { id: "title_newbie", name: "新手", nameEn: "Newbie", type: "title", rarity: "common", description: "剛開始冒險的新手", icon: "🌱", tradable: false, consumable: false },
  ],
  rare: [
    { id: "token_50", name: "50 ZXC", nameEn: "50 ZXC", type: "token", rarity: "rare", description: "50 子熙幣", icon: "💰", tradable: false, consumable: true, effect: { type: "currency", value: 50 } },
    { id: "token_100", name: "100 ZXC", nameEn: "100 ZXC", type: "token", rarity: "rare", description: "100 子熙幣", icon: "💰", tradable: false, consumable: true, effect: { type: "currency", value: 100 } },
    { id: "buff_luck_1h", name: "幸運加成 (1小時)", nameEn: "Luck Boost (1h)", type: "buff", rarity: "rare", description: "1小時內遊戲勝率微幅提升", icon: "🍀", tradable: false, consumable: true, effect: { type: "luck_boost", value: 0.05, duration: 1 } },
    { id: "buff_prevent_loss_3", name: "免輸護符 (3 次)", nameEn: "Loss Shield (3 uses)", type: "buff", rarity: "rare", description: "使用後下 3 次輸的下注將全額退回", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 3 } },
    { id: "avatar_diamond", name: "鑽石", nameEn: "Diamond", type: "avatar", rarity: "rare", description: "閃亮的鑽石頭像", icon: "💎", tradable: true, consumable: false },
    { id: "title_gambler", name: "賭徒", nameEn: "Gambler", type: "title", rarity: "rare", description: "喜歡下注的賭徒", icon: "🎲", tradable: false, consumable: false },
  ],
  epic: [
    { id: "token_250", name: "250 ZXC", nameEn: "250 ZXC", type: "token", rarity: "epic", description: "250 子熙幣", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 250 } },
    { id: "token_500", name: "500 ZXC", nameEn: "500 ZXC", type: "token", rarity: "epic", description: "500 子熙幣", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 500 } },
    { id: "buff_prevent_loss_5", name: "免輸護符 (5 次)", nameEn: "Loss Shield (5 uses)", type: "buff", rarity: "epic", description: "使用後下 5 次輸的下注將全額退回", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 5 } },
    { id: "buff_vip_24h", name: "VIP 體驗 (24小時)", nameEn: "VIP Trial (24h)", type: "buff", rarity: "epic", description: "24小時 VIP 權限體驗", icon: "👑", tradable: false, consumable: true, effect: { type: "vip_trial", value: 1, duration: 24 } },
    { id: "avatar_gold", name: "黃金", nameEn: "Gold", type: "avatar", rarity: "epic", description: "尊貴的黃金頭像", icon: "👑", tradable: true, consumable: false },
    { id: "title_highroller", name: "大戶", nameEn: "High Roller", type: "title", rarity: "epic", description: "下注額度極高的大戶", icon: "💵", tradable: false, consumable: false },
  ],
  legendary: [
    { id: "token_1000", name: "1000 ZXC", nameEn: "1000 ZXC", type: "token", rarity: "legendary", description: "1000 子熙幣", icon: "🏆", tradable: false, consumable: true, effect: { type: "currency", value: 1000 } },
    { id: "token_5000", name: "5000 ZXC", nameEn: "5000 ZXC", type: "token", rarity: "legendary", description: "5000 子熙幣", icon: "🏆", tradable: false, consumable: true, effect: { type: "currency", value: 5000 } },
    { id: "buff_permanent", name: "永久幸運", nameEn: "Permanent Luck", type: "buff", rarity: "legendary", description: "永久小幅提升遊戲勝率", icon: "✨", tradable: false, consumable: true, effect: { type: "luck_boost", value: 0.02 } },
    { id: "buff_prevent_loss_10", name: "免輸護符 (10 次)", nameEn: "Loss Shield (10 uses)", type: "buff", rarity: "legendary", description: "使用後下 10 次輸的下注將全額退回", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 10 } },
    { id: "avatar_legend", name: "傳奇", nameEn: "Legend", type: "avatar", rarity: "legendary", description: "傳奇玩家的專屬頭像", icon: "🌟", tradable: true, consumable: false },
    { id: "title_legend", name: "傳奇", nameEn: "The Legend", type: "title", rarity: "legendary", description: "真正的傳奇人物", icon: "🌟", tradable: false, consumable: false },
  ],
  mythic: [
    { id: "token_10000", name: "10000 ZXC", nameEn: "10000 ZXC", type: "token", rarity: "mythic", description: "10000 子熙幣", icon: "🔱", tradable: false, consumable: true, effect: { type: "currency", value: 10000 } },
    { id: "avatar_mythic", name: "神話", nameEn: "Mythic", type: "avatar", rarity: "mythic", description: "超越傳奇的神話頭像", icon: "🔱", tradable: true, consumable: false },
    { id: "title_immortal", name: "不朽者", nameEn: "Immortal", type: "title", rarity: "mythic", description: "淩駕於時間之上的不朽者", icon: "👑", tradable: false, consumable: false },
  ],
};

// Rarity Display Names
export const RARITY_NAMES: Record<Rarity, { name: string; nameEn: string; color: string }> = {
  common: { name: "普通", nameEn: "Common", color: "#b0b0b0" },
  rare: { name: "稀有", nameEn: "Rare", color: "#4fc3f7" },
  epic: { name: "史詩", nameEn: "Epic", color: "#ba68c8" },
  legendary: { name: "傳奇", nameEn: "Legendary", color: "#ffd54f" },
  mythic: { name: "神話", nameEn: "Mythic", color: "#ff6f00" },
};

// Chest Animation Duration (ms)
export const CHEST_OPEN_DURATION = {
  intro: 500,    // Shake animation
  reveal: 1500,  // Item reveal animation
  outro: 500,    // Summary animation
};

// Max inventory slots
export const MAX_INVENTORY_SLOTS = 100;

// Daily free chest
export const DAILY_FREE_CHEST_TYPE: ChestType = "common";
export const DAILY_FREE_CHEST_COOLDOWN_HOURS = 24;
