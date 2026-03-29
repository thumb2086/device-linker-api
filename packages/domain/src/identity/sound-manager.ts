import { KVClient } from "@repo/infrastructure";

export interface SoundPrefs {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  volume: number;
}

export class SoundManager {
  private KEY_PREFIX = "user:sound_prefs:";

  constructor(private kv: KVClient) {}

  async getPrefs(userId: string): Promise<SoundPrefs> {
    const prefs = await this.kv.get<SoundPrefs>(`${this.KEY_PREFIX}${userId}`);
    return prefs || {
      bgmEnabled: true,
      sfxEnabled: true,
      volume: 0.5
    };
  }

  async savePrefs(userId: string, prefs: SoundPrefs): Promise<void> {
    await this.kv.set(`${this.KEY_PREFIX}${userId}`, prefs);
  }
}
