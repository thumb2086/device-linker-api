// packages/domain/src/rewards/reward-manager.ts

export interface RewardTitle {
  id: string;
  label: string;
  description: string;
  requirement: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "mythic";
}

export interface RewardAvatar {
  id: string;
  url: string;
  label: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export interface RewardItem {
  id: string;
  label: string;
  description: string;
  type: "buff" | "consumable" | "collectible";
  rarity: "common" | "rare" | "epic" | "legendary";
  effect?: any;
}

export const TITLES: RewardTitle[] = [
    { id: "newbie", label: "初出茅廬", description: "剛加入的新手", requirement: "註冊即可獲得", rarity: "common" },
    { id: "high_roller", label: "豪氣干雲", description: "單次下注超過 1,000,000", requirement: "單次下注 > 1M", rarity: "rare" },
    { id: "gambling_god", label: "睹聖", description: "總贏得金額超過 100,000,000", requirement: "總收益 > 100M", rarity: "mythic" },
    // Many more from lib/reward-center.js
];

export const AVATARS: RewardAvatar[] = [
    { id: "std_1", url: "/assets/avatars/1.png", label: "基本頭像 1", rarity: "common" },
    { id: "vip_1", url: "/assets/avatars/v1.png", label: "VIP 專屬 1", rarity: "rare" },
    // More avatars...
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
