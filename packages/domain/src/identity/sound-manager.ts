import { IUserRepository } from "@repo/infrastructure";

export interface SoundPrefs {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  volume: number;
}

export class SoundManager {
  constructor(private userRepo: IUserRepository) {}

  async getPrefs(userId: string): Promise<SoundPrefs> {
    const profile = await this.userRepo.getUserProfile(userId);
    return profile?.soundPrefs || {
      bgmEnabled: true,
      sfxEnabled: true,
      volume: 0.5
    };
  }

  async savePrefs(userId: string, prefs: SoundPrefs): Promise<void> {
    await this.userRepo.saveUserProfile(userId, { soundPrefs: prefs });
  }
}
