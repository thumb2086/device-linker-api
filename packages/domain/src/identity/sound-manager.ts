import { IUserRepository } from "@repo/infrastructure";
import { normalizeUserSettings, SettingsManager } from "./settings-manager.js";

export interface SoundPrefs {
  masterVolume: number;
  bgmEnabled: boolean;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
  volume: number;
}

export class SoundManager {
  private settingsManager: SettingsManager;

  constructor(private userRepo: IUserRepository) {
    this.settingsManager = new SettingsManager(userRepo);
  }

  async getPrefs(userId: string): Promise<SoundPrefs> {
    const settings = await this.settingsManager.getSettings(userId);
    return {
      masterVolume: settings.masterVolume,
      bgmEnabled: settings.bgmEnabled,
      bgmVolume: settings.bgmVolume,
      sfxEnabled: settings.sfxEnabled,
      sfxVolume: settings.sfxVolume,
      volume: settings.masterVolume,
    };
  }

  async savePrefs(userId: string, prefs: Partial<SoundPrefs>): Promise<SoundPrefs> {
    const normalized = normalizeUserSettings({
      ...(await this.settingsManager.getSettings(userId)),
      ...prefs,
      masterVolume: prefs.masterVolume ?? prefs.volume,
    });
    await this.userRepo.saveUserProfile(userId, { soundPrefs: normalized });
    return this.getPrefs(userId);
  }
}
