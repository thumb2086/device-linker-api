// packages/domain/src/rewards/reward-manager.ts

export type RewardRarity = "common" | "rare" | "epic" | "legendary" | "mythic" | "vip";
export type RewardSource = "default" | "shop" | "chest" | "admin" | "campaign" | "system" | "user";

export interface RewardTitle {
  id: string;
  label: string;
  name?: string;
  description: string;
  requirement?: string;
  rarity: RewardRarity;
  icon?: string;
  source?: RewardSource;
}

export interface RewardAvatar {
  id: string;
  label: string;
  name?: string;
  description?: string;
  rarity: RewardRarity;
  icon?: string;
  url?: string;
  source?: RewardSource;
}

export interface RewardItem {
  id: string;
  label: string;
  description: string;
  type: "buff" | "consumable" | "collectible";
  rarity: RewardRarity;
  effect?: any;
}

// Ported from lib/reward-center.js AVATAR_CATALOG on main — emoji icons.
export const AVATARS: RewardAvatar[] = [
  { id: "classic_chip", label: "經典籌碼", name: "經典籌碼", icon: "🪙", rarity: "common", source: "default", description: "子熙賭場最經典的籌碼圖案。" },
  { id: "cue_master", label: "球桌王牌", name: "球桌王牌", icon: "🎱", rarity: "rare", source: "shop", description: "專為撞球愛好者設計的王牌頭像。" },
  { id: "neon_dice", label: "霓虹骰魂", name: "霓虹骰魂", icon: "🎲", rarity: "rare", source: "shop", description: "充滿賽博朋克風格的動態骰子。" },
  { id: "gold_dragon", label: "金龍印記", name: "金龍印記", icon: "🐉", rarity: "epic", source: "chest", description: "象徵權威與財富的東方金龍。" },
  { id: "celestial_crown", label: "星冠信標", name: "星冠信標", icon: "👑", rarity: "mythic", source: "campaign", description: "璀璨奪目的星之冠冕。" },
  { id: "admin_shield", label: "管理聖盾", name: "管理聖盾", icon: "🛡️", rarity: "legendary", source: "admin", description: "官方管理人員專屬的神聖護盾。" },
];

// Ported from lib/reward-center.js BASE_TITLE_CATALOG on main.
export const TITLES: RewardTitle[] = [
  { id: "newbie", label: "初出茅廬", name: "初出茅廬", description: "剛加入的新手", requirement: "註冊即可獲得", rarity: "common", source: "system" },
  { id: "yuanlao_figure", label: "元老人物", name: "元老人物", description: "子熙賭場的早期元老，見證了最初的發展。", rarity: "mythic", source: "admin" },
  { id: "founding_player", label: "開服玩家", name: "開服玩家", description: "在開服初期便加入的資深冒險者。", rarity: "epic", source: "campaign" },
  { id: "closed_beta_member", label: "封測成員", name: "封測成員", description: "參與過封閉測試的尊貴成員。", rarity: "epic", source: "admin" },
  { id: "beta_witness", label: "內測見證者", name: "內測見證者", description: "內測時期的歷史見證人。", rarity: "epic", source: "campaign" },
  { id: "legendary_player", label: "傳奇玩家", name: "傳奇玩家", description: "在賭場留下了無數傳說的頂尖玩家。", rarity: "legendary", source: "admin" },
  { id: "million_winner", label: "百萬贏家", name: "百萬贏家", description: "累積贏得超過一百萬子熙幣的贏家。", rarity: "rare", source: "system" },
  { id: "ten_million_winner", label: "千萬贏家", name: "千萬贏家", description: "累積贏得超過一千萬子熙幣的頂級贏家。", rarity: "epic", source: "system" },
  { id: "hundred_million_winner", label: "億級贏家", name: "億級贏家", description: "累積贏得超過一億子熙幣的傳奇大亨。", rarity: "mythic", source: "system" },
  { id: "hundred_billion_winner", label: "百億贏家", name: "百億贏家", description: "站在財富頂點的百億級神話。", rarity: "legendary", source: "system" },
  { id: "weekly_champion", label: "週榜冠軍", name: "週榜冠軍", description: "曾在週榜競爭中脫穎而出的冠軍。", rarity: "rare", source: "system" },
  { id: "monthly_champion", label: "月榜冠軍", name: "月榜冠軍", description: "在月度排行榜中傲視群雄的王者。", rarity: "epic", source: "system" },
  { id: "season_king", label: "賽季王者", name: "賽季王者", description: "統治了整個賽季的最終王者。", rarity: "mythic", source: "system" },
  { id: "event_champion", label: "活動冠軍", name: "活動冠軍", description: "在限時活動中奪得魁首的佼佼者。", rarity: "rare", source: "campaign" },
  { id: "event_legend", label: "活動傳奇", name: "活動傳奇", description: "在活動歷史中留下不朽印記的傳奇。", rarity: "legendary", source: "campaign" },
  { id: "official_certified", label: "官方認證", name: "官方認證", description: "經過官方正式認證的信譽玩家。", rarity: "epic", source: "admin" },
  { id: "official_guest", label: "官方特邀", name: "官方特邀", description: "受邀參加官方特別活動的貴賓。", rarity: "epic", source: "admin" },
  { id: "zixi_hot_burn", label: "子熙好燒", name: "子熙好燒", description: "子熙親自認證：這個人好燒啊！", rarity: "legendary", source: "admin" },
  { id: "admin_operator", label: "管理員", name: "管理員", description: "維護賭場秩序的幕後管理者。", rarity: "legendary", source: "admin" },
  { id: "genesis_supporter", label: "創世支持者", name: "創世支持者", description: "最初提供寶貴支持的創世支持者。", rarity: "mythic", source: "campaign" },
  { id: "casino_sage", label: "賭場智者", name: "賭場智者", description: "在賭場策略與心態上令人敬佩的智者。", rarity: "epic", source: "admin" },
  { id: "lucky_star", label: "幸運之星", name: "幸運之星", description: "在活動中展現超高幸運值的玩家。", rarity: "rare", source: "campaign" },
  { id: "streak_master", label: "連勝之王", name: "連勝之王", description: "保持長時間連勝紀錄的頂尖高手。", rarity: "mythic", source: "admin" },
  { id: "market_maestro", label: "市場操盤手", name: "市場操盤手", description: "在市場模擬中展現卓越操作的操盤手。", rarity: "epic", source: "campaign" },
  { id: "battle_hand", label: "戰神之手", name: "戰神之手", description: "在關鍵戰局中掌控勝負的傳奇之手。", rarity: "legendary", source: "admin" },
  { id: "high_roller", label: "豪氣干雲", name: "豪氣干雲", description: "單次下注超過 1,000,000", requirement: "單次下注 > 1M", rarity: "rare", source: "system" },
  { id: "gambling_god", label: "賭聖", name: "賭聖", description: "總贏得金額超過 100,000,000", requirement: "總收益 > 100M", rarity: "mythic", source: "system" },
];

export class RewardManager {
  // ─── Titles ────────────────────────────────────────────────────────────────

  getAvailableTitles(): RewardTitle[] {
    return TITLES;
  }

  checkTitleUnlock(userId: string, stats: any): string[] {
    const unlocked: string[] = [];
    if (stats.totalBet > 1000000) unlocked.push("high_roller");
    if (stats.totalWin > 100000000) unlocked.push("gambling_god");
    return unlocked;
  }

  // ─── Avatars ───────────────────────────────────────────────────────────────

  getAvailableAvatars(): RewardAvatar[] {
    return AVATARS;
  }

  // ─── Items/Chests ──────────────────────────────────────────────────────────

  openChest(chestType: string, seed: string): any {
    // Ported from lib/reward-center.js
    // Logic for randomized loot based on chest type
    return {
       items: [],
       currency: "0",
    };
  }
}
