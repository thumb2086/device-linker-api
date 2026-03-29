import { IUserRepository } from "@repo/infrastructure";

export type AmountDisplayFormat = "compact" | "full";

export interface UserSettings {
  amountDisplay: AmountDisplayFormat;
  danmuEnabled: boolean;
  masterVolume: number;
  bgmEnabled: boolean;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  amountDisplay: "compact",
  danmuEnabled: true,
  masterVolume: 0.7,
  bgmEnabled: true,
  bgmVolume: 0.45,
  sfxEnabled: true,
  sfxVolume: 0.75,
};

function clampVolume(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function normalizeUserSettings(raw: unknown): UserSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacyVolume = clampVolume(source.volume, DEFAULT_USER_SETTINGS.masterVolume);
  const masterVolume = clampVolume(source.masterVolume, legacyVolume);
  const bgmVolume = clampVolume(source.bgmVolume, masterVolume);
  const sfxVolume = clampVolume(source.sfxVolume, masterVolume);
  const amountDisplay = source.amountDisplay === "full" ? "full" : "compact";

  return {
    amountDisplay,
    danmuEnabled: typeof source.danmuEnabled === "boolean" ? source.danmuEnabled : DEFAULT_USER_SETTINGS.danmuEnabled,
    masterVolume,
    bgmEnabled: typeof source.bgmEnabled === "boolean" ? source.bgmEnabled : DEFAULT_USER_SETTINGS.bgmEnabled,
    bgmVolume,
    sfxEnabled: typeof source.sfxEnabled === "boolean" ? source.sfxEnabled : DEFAULT_USER_SETTINGS.sfxEnabled,
    sfxVolume,
  };
}

export class SettingsManager {
  constructor(private userRepo: IUserRepository) {}

  async getSettings(userId: string): Promise<UserSettings> {
    const profile = await this.userRepo.getUserProfile(userId);
    return normalizeUserSettings(profile?.soundPrefs);
  }

  async saveSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings(userId);
    const next = normalizeUserSettings({ ...current, ...updates });
    await this.userRepo.saveUserProfile(userId, { soundPrefs: next });
    return next;
  }
}
