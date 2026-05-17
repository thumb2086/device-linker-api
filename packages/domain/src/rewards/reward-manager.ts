// packages/domain/src/rewards/reward-manager.ts

export interface RewardTitle {
  id: string;
  label: string;
  description: string;
  requirement: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "mythic";
}

export const TITLES: RewardTitle[] = [
    { id: "title_newbie", label: "新手", description: "剛加入的新手", requirement: "註冊即可獲得", rarity: "common" },
    { id: "title_beginner", label: "初心者", description: "邁出第一步的初心者", requirement: "註冊即可獲得", rarity: "common" },
    { id: "title_gambler", label: "賭徒", description: "喜歡下注的賭徒", requirement: "首次下注", rarity: "rare" },
    { id: "title_highroller", label: "大戶", description: "下注額度極高的大戶", requirement: "單次下注 > 1M", rarity: "epic" },
    { id: "title_god", label: "賭神", description: "賭術已達神之領域", requirement: "總收益 > 100M", rarity: "mythic" },
];

export class RewardManager {
  getAvailableTitles(): RewardTitle[] {
    return TITLES;
  }

  checkTitleUnlock(userId: string, stats: any): string[] {
    const unlocked: string[] = [];
    if (stats.totalBet > 1000000) unlocked.push("title_highroller");
    if (stats.totalWin > 100000000) unlocked.push("title_god");
    return unlocked;
  }

  getAvailableAvatars(): any[] {
    return [];
  }

  openChest(chestType: string, seed: string): any {
    return { items: [], currency: "0" };
  }
}
