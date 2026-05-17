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
    currency?: "zhixi" | "yjc"; // token type for currency items (defaults to zhixi)
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
    { id: "token_1", name: "1 ZXC", nameEn: "1 ZXC", type: "token", rarity: "common", description: "1 子熙幣", icon: "🪙", tradable: false, consumable: true, effect: { type: "currency", value: 1 } },
    { id: "token_5", name: "5 ZXC", nameEn: "5 ZXC", type: "token", rarity: "common", description: "5 子熙幣", icon: "🪙", tradable: false, consumable: true, effect: { type: "currency", value: 5 } },
    { id: "token_10", name: "10 ZXC", nameEn: "10 ZXC", type: "token", rarity: "common", description: "10 子熙幣", icon: "🪙", tradable: false, consumable: true, effect: { type: "currency", value: 10 } },
    { id: "token_25", name: "25 ZXC", nameEn: "25 ZXC", type: "token", rarity: "common", description: "25 子熙幣", icon: "🪙", tradable: false, consumable: true, effect: { type: "currency", value: 25 } },
    { id: "buff_xp_30m", name: "經驗加倍 (30分鐘)", nameEn: "XP Boost (30m)", type: "buff", rarity: "common", description: "30分鐘內獲得經驗值翻倍", icon: "⚡", tradable: false, consumable: true, effect: { type: "xp_boost", value: 2, duration: 0.5 } },
    { id: "buff_xp_1h", name: "經驗加倍 (1小時)", nameEn: "XP Boost (1h)", type: "buff", rarity: "common", description: "1小時內獲得經驗值翻倍", icon: "⚡", tradable: false, consumable: true, effect: { type: "xp_boost", value: 2, duration: 1 } },
    { id: "buff_xp_2h", name: "經驗加倍 (2小時)", nameEn: "XP Boost (2h)", type: "buff", rarity: "common", description: "2小時內獲得經驗值翻倍", icon: "⚡", tradable: false, consumable: true, effect: { type: "xp_boost", value: 2, duration: 2 } },
    { id: "buff_prevent_loss_1", name: "免輸護符 (1 次)", nameEn: "Loss Shield (1 use)", type: "buff", rarity: "common", description: "使用後下一次輸的下注將全額退回（1 次）", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 1 } },
    { id: "avatar_chip", name: "經典籌碼", nameEn: "Classic Chip", type: "avatar", rarity: "common", description: "經典籌碼頭像", icon: "🎰", tradable: true, consumable: false },
    { id: "avatar_cat", name: "貓咪", nameEn: "Cat", type: "avatar", rarity: "common", description: "可愛的貓咪頭像", icon: "🐱", tradable: false, consumable: false },
    { id: "avatar_fox", name: "狐狸", nameEn: "Fox", type: "avatar", rarity: "common", description: "聰明的狐狸頭像", icon: "🦊", tradable: false, consumable: false },
    { id: "avatar_owl", name: "貓頭鷹", nameEn: "Owl", type: "avatar", rarity: "common", description: "睿智的貓頭鷹頭像", icon: "🦉", tradable: false, consumable: false },
    { id: "title_newbie", name: "新手", nameEn: "Newbie", type: "title", rarity: "common", description: "剛開始冒險的新手", icon: "🌱", tradable: false, consumable: false },
    { id: "title_beginner", name: "初心者", nameEn: "Beginner", type: "title", rarity: "common", description: "邁出第一步的初心者", icon: "🌱", tradable: false, consumable: false },
    { id: "title_iron", name: "鐵人", nameEn: "Iron", type: "title", rarity: "common", description: "意志如鐵的初心者", icon: "⚙️", tradable: false, consumable: false },
  ],
  rare: [
    { id: "token_50", name: "50 ZXC", nameEn: "50 ZXC", type: "token", rarity: "rare", description: "50 子熙幣", icon: "💰", tradable: false, consumable: true, effect: { type: "currency", value: 50 } },
    { id: "token_100", name: "100 ZXC", nameEn: "100 ZXC", type: "token", rarity: "rare", description: "100 子熙幣", icon: "💰", tradable: false, consumable: true, effect: { type: "currency", value: 100 } },
    { id: "buff_xp_4h", name: "經驗加倍 (4小時)", nameEn: "XP Boost (4h)", type: "buff", rarity: "rare", description: "4小時內獲得經驗值翻倍", icon: "⚡", tradable: false, consumable: true, effect: { type: "xp_boost", value: 2, duration: 4 } },
    { id: "buff_luck_1h", name: "幸運加成 (1小時)", nameEn: "Luck Boost (1h)", type: "buff", rarity: "rare", description: "1小時內遊戲勝率微幅提升", icon: "🍀", tradable: false, consumable: true, effect: { type: "luck_boost", value: 0.05, duration: 1 } },
    { id: "buff_prevent_loss_3", name: "免輸護符 (3 次)", nameEn: "Loss Shield (3 uses)", type: "buff", rarity: "rare", description: "使用後下 3 次輸的下注將全額退回", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 3 } },
    { id: "avatar_diamond", name: "鑽石", nameEn: "Diamond", type: "avatar", rarity: "rare", description: "閃亮的鑽石頭像", icon: "💎", tradable: true, consumable: false },
    { id: "avatar_panda", name: "熊貓", nameEn: "Panda", type: "avatar", rarity: "rare", description: "憨厚的熊貓頭像", icon: "🐼", tradable: false, consumable: false },
    { id: "avatar_lion", name: "獅子", nameEn: "Lion", type: "avatar", rarity: "rare", description: "威猛的獅子頭像", icon: "🦁", tradable: false, consumable: false },
    { id: "avatar_tiger", name: "猛虎", nameEn: "Tiger", type: "avatar", rarity: "rare", description: "兇猛的老虎頭像", icon: "🐯", tradable: false, consumable: false },
    { id: "avatar_knight", name: "騎士", nameEn: "Knight", type: "avatar", rarity: "rare", description: "榮耀的騎士頭像", icon: "🛡️", tradable: false, consumable: false },
    { id: "title_gambler", name: "賭徒", nameEn: "Gambler", type: "title", rarity: "rare", description: "喜歡下注的賭徒", icon: "🎲", tradable: false, consumable: false },
    { id: "title_lucky", name: "幸運星", nameEn: "Lucky Star", type: "title", rarity: "rare", description: "運氣總是站在你這邊", icon: "🍀", tradable: false, consumable: false },
    { id: "title_sharpshooter", name: "神射手", nameEn: "Sharpshooter", type: "title", rarity: "rare", description: "百發百中的神射手", icon: "🎯", tradable: false, consumable: false },
    { id: "title_noble", name: "貴族", nameEn: "Noble", type: "title", rarity: "rare", description: "氣質出眾的貴族", icon: "🎩", tradable: false, consumable: false },
    { id: "collectible_crystal", name: "紫水晶", nameEn: "Amethyst", type: "collectible", rarity: "rare", description: "閃耀著神秘光芒的紫水晶", icon: "🔮", tradable: false, consumable: false },
    { id: "collectible_moon", name: "月光石", nameEn: "Moonstone", type: "collectible", rarity: "rare", description: "沐浴月光的寧靜之石", icon: "🌙", tradable: false, consumable: false },
    { id: "collectible_coin", name: "古錢幣", nameEn: "Ancient Coin", type: "collectible", rarity: "rare", description: "帶有歷史痕跡的古老錢幣", icon: "🪙", tradable: false, consumable: false },
  ],
  epic: [
    { id: "token_250", name: "250 ZXC", nameEn: "250 ZXC", type: "token", rarity: "epic", description: "250 子熙幣", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 250 } },
    { id: "token_500", name: "500 ZXC", nameEn: "500 ZXC", type: "token", rarity: "epic", description: "500 子熙幣", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 500 } },
    { id: "buff_luck_2h", name: "強運加持 (2小時)", nameEn: "Luck Boost (2h)", type: "buff", rarity: "epic", description: "2小時內大幅提升遊戲勝率", icon: "🍀", tradable: false, consumable: true, effect: { type: "luck_boost", value: 0.10, duration: 2 } },
    { id: "buff_prevent_loss_5", name: "免輸護符 (5 次)", nameEn: "Loss Shield (5 uses)", type: "buff", rarity: "epic", description: "使用後下 5 次輸的下注將全額退回", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 5 } },
    { id: "buff_vip_24h", name: "VIP 體驗 (24小時)", nameEn: "VIP Trial (24h)", type: "buff", rarity: "epic", description: "24小時 VIP 權限體驗", icon: "👑", tradable: false, consumable: true, effect: { type: "vip_trial", value: 1, duration: 24 } },
    { id: "avatar_gold", name: "黃金", nameEn: "Gold", type: "avatar", rarity: "epic", description: "尊貴的黃金頭像", icon: "👑", tradable: true, consumable: false },
    { id: "avatar_dragon", name: "龍頭", nameEn: "Dragon", type: "avatar", rarity: "epic", description: "威嚴的龍之頭像", icon: "🐉", tradable: false, consumable: false },
    { id: "avatar_wolf", name: "狼王", nameEn: "Wolf King", type: "avatar", rarity: "epic", description: "統領狼群的王者", icon: "🐺", tradable: false, consumable: false },
    { id: "avatar_samurai", name: "武士", nameEn: "Samurai", type: "avatar", rarity: "epic", description: "堅毅的武士頭像", icon: "⚔️", tradable: false, consumable: false },
    { id: "avatar_pharaoh", name: "法老", nameEn: "Pharaoh", type: "avatar", rarity: "epic", description: "古老埃及的法老頭像", icon: "👳", tradable: false, consumable: false },
    { id: "title_highroller", name: "大戶", nameEn: "High Roller", type: "title", rarity: "epic", description: "下注額度極高的大戶", icon: "💵", tradable: false, consumable: false },
    { id: "title_rich", name: "土豪", nameEn: "Rich", type: "title", rarity: "epic", description: "錢多到沒地方花", icon: "💰", tradable: false, consumable: false },
    { id: "title_whale", name: "大鯨魚", nameEn: "Whale", type: "title", rarity: "epic", description: "橫掃賭場的大鯨魚", icon: "🐋", tradable: false, consumable: false },
    { id: "title_mystic", name: "神秘人", nameEn: "Mystic", type: "title", rarity: "epic", description: "身分不明的神秘人物", icon: "🎭", tradable: false, consumable: false },
    { id: "collectible_neon", name: "霓虹燈牌", nameEn: "Neon Sign", type: "collectible", rarity: "epic", description: "閃爍的霓虹燈招牌", icon: "🪩", tradable: false, consumable: false },
    { id: "collectible_dragon_eye", name: "龍之眼", nameEn: "Dragon Eye", type: "collectible", rarity: "epic", description: "傳說巨龍遺留的眼珠", icon: "👁️", tradable: false, consumable: false },
    { id: "collectible_ring", name: "翡翠戒指", nameEn: "Jade Ring", type: "collectible", rarity: "epic", description: "通體翠綠的翡翠戒指", icon: "💍", tradable: false, consumable: false },
  ],
  legendary: [
    { id: "token_1000", name: "1000 ZXC", nameEn: "1000 ZXC", type: "token", rarity: "legendary", description: "1000 子熙幣", icon: "🏆", tradable: false, consumable: true, effect: { type: "currency", value: 1000 } },
    { id: "token_5000", name: "5000 ZXC", nameEn: "5000 ZXC", type: "token", rarity: "legendary", description: "5000 子熙幣", icon: "🏆", tradable: false, consumable: true, effect: { type: "currency", value: 5000 } },
    { id: "token_25000", name: "25,000 ZXC", nameEn: "25000 ZXC", type: "token", rarity: "legendary", description: "25000 子熙幣", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 25000 } },
    { id: "token_50000", name: "50,000 ZXC", nameEn: "50000 ZXC", type: "token", rarity: "legendary", description: "50000 子熙幣", icon: "💵", tradable: false, consumable: true, effect: { type: "currency", value: 50000 } },
    { id: "buff_xp_24h", name: "經驗加倍 (24小時)", nameEn: "XP Boost (24h)", type: "buff", rarity: "legendary", description: "24小時內獲得經驗值翻倍", icon: "⚡", tradable: false, consumable: true, effect: { type: "xp_boost", value: 2, duration: 24 } },
    { id: "buff_luck_1h_s", name: "超級運氣 (1小時)", nameEn: "Super Luck (1h)", type: "buff", rarity: "legendary", description: "1小時內大幅提升遊戲勝率", icon: "✨", tradable: false, consumable: true, effect: { type: "luck_boost", value: 0.20, duration: 1 } },
    { id: "buff_permanent", name: "永久幸運", nameEn: "Permanent Luck", type: "buff", rarity: "legendary", description: "永久小幅提升遊戲勝率", icon: "✨", tradable: false, consumable: true, effect: { type: "luck_boost", value: 0.02 } },
    { id: "buff_prevent_loss_10", name: "免輸護符 (10 次)", nameEn: "Loss Shield (10 uses)", type: "buff", rarity: "legendary", description: "使用後下 10 次輸的下注將全額退回", icon: "🛡️", tradable: false, consumable: true, effect: { type: "prevent_loss", value: 10 } },
    { id: "token_yjc_shard", name: "YJC 碎片", nameEn: "YJC Shard", type: "token", rarity: "legendary", description: "0.0001 YJC，可在兌換商店使用", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 0.0001, currency: "yjc" } },
    { id: "avatar_legend", name: "傳奇", nameEn: "Legend", type: "avatar", rarity: "legendary", description: "傳奇玩家的專屬頭像", icon: "🌟", tradable: true, consumable: false },
    { id: "avatar_skull", name: "骷髏王", nameEn: "Skull King", type: "avatar", rarity: "legendary", description: "令人畏懼的骷髏王", icon: "💀", tradable: false, consumable: false },
    { id: "avatar_reaper", name: "死神", nameEn: "Reaper", type: "avatar", rarity: "legendary", description: "收割靈魂的死神", icon: "🗡️", tradable: false, consumable: false },
    { id: "avatar_angel", name: "天使", nameEn: "Angel", type: "avatar", rarity: "legendary", description: "純潔神聖的天使", icon: "👼", tradable: false, consumable: false },
    { id: "avatar_titan", name: "泰坦", nameEn: "Titan", type: "avatar", rarity: "legendary", description: "遠古泰坦的威嚴頭像", icon: "🗿", tradable: false, consumable: false },
    { id: "title_legend", name: "傳奇", nameEn: "The Legend", type: "title", rarity: "legendary", description: "真正的傳奇人物", icon: "🌟", tradable: false, consumable: false },
    { id: "title_king", name: "賭王", nameEn: "King", type: "title", rarity: "legendary", description: "賭場上無可匹敵的王者", icon: "👑", tradable: false, consumable: false },
    { id: "title_champion", name: "冠軍", nameEn: "Champion", type: "title", rarity: "legendary", description: "屹立不搖的冠軍", icon: "🏅", tradable: false, consumable: false },
    { id: "title_undefeated", name: "不敗傳說", nameEn: "Undefeated", type: "title", rarity: "legendary", description: "未嘗敗績的不敗傳說", icon: "🏆", tradable: false, consumable: false },
    { id: "title_emperor", name: "帝王", nameEn: "Emperor", type: "title", rarity: "legendary", description: "統治萬物的帝王", icon: "👑", tradable: false, consumable: false },
    { id: "collectible_trophy", name: "黃金獎盃", nameEn: "Golden Trophy", type: "collectible", rarity: "legendary", description: "純金打造的榮耀獎盃", icon: "🏆", tradable: false, consumable: false },
    { id: "collectible_skull", name: "龍骨化石", nameEn: "Dragon Fossil", type: "collectible", rarity: "legendary", description: "遠古巨龍的骸骨化石", icon: "🦴", tradable: false, consumable: false },
    { id: "collectible_crown", name: "皇冠", nameEn: "Crown", type: "collectible", rarity: "legendary", description: "鑲滿寶石的華麗皇冠", icon: "👑", tradable: false, consumable: false },
    { id: "collectible_orb", name: "魔法球", nameEn: "Magic Orb", type: "collectible", rarity: "legendary", description: "蘊含遠古魔力的水晶球", icon: "🔮", tradable: false, consumable: false },
  ],
  mythic: [
    { id: "token_10000", name: "10000 ZXC", nameEn: "10000 ZXC", type: "token", rarity: "mythic", description: "10000 子熙幣", icon: "🔱", tradable: false, consumable: true, effect: { type: "currency", value: 10000 } },
    { id: "token_100000", name: "100,000 ZXC", nameEn: "100000 ZXC", type: "token", rarity: "mythic", description: "100000 子熙幣", icon: "💎", tradable: false, consumable: true, effect: { type: "currency", value: 100000 } },
    { id: "token_yjc", name: "YJC 幣", nameEn: "YJC Coin", type: "token", rarity: "mythic", description: "0.001 YJC，稀有加密資產", icon: "👑", tradable: false, consumable: true, effect: { type: "currency", value: 0.001, currency: "yjc" } },
    { id: "avatar_mythic", name: "神話", nameEn: "Mythic", type: "avatar", rarity: "mythic", description: "超越傳奇的神話頭像", icon: "🔱", tradable: true, consumable: false },
    { id: "avatar_phoenix", name: "鳳凰", nameEn: "Phoenix", type: "avatar", rarity: "mythic", description: "浴火重生的鳳凰", icon: "🔥", tradable: false, consumable: false },
    { id: "avatar_demon", name: "惡魔", nameEn: "Demon", type: "avatar", rarity: "mythic", description: "來自深淵的惡魔", icon: "😈", tradable: false, consumable: false },
    { id: "avatar_god", name: "神像", nameEn: "God Statue", type: "avatar", rarity: "mythic", description: "遠古神祇的莊嚴雕像", icon: "🗿", tradable: false, consumable: false },
    { id: "title_immortal", name: "不朽者", nameEn: "Immortal", type: "title", rarity: "mythic", description: "淩駕於時間之上的不朽者", icon: "👑", tradable: false, consumable: false },
    { id: "title_god", name: "賭神", nameEn: "God of Gamblers", type: "title", rarity: "mythic", description: "賭術已達神之領域", icon: "🕶️", tradable: false, consumable: false },
    { id: "title_creator", name: "創造者", nameEn: "Creator", type: "title", rarity: "mythic", description: "萬物的創造者", icon: "🎨", tradable: false, consumable: false },
    { id: "title_invincible", name: "無敵", nameEn: "Invincible", type: "title", rarity: "mythic", description: "無人能敵的至高存在", icon: "💫", tradable: false, consumable: false },
    { id: "collectible_star", name: "星塵瓶", nameEn: "Stardust Vial", type: "collectible", rarity: "mythic", description: "裝載著星辰碎片的魔法瓶", icon: "✨", tradable: false, consumable: false },
    { id: "collectible_heart", name: "龍之心", nameEn: "Dragon Heart", type: "collectible", rarity: "mythic", description: "遠古巨龍跳動的心臟", icon: "❤️‍🔥", tradable: false, consumable: false },
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
