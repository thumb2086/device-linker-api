import { KVClient } from "@repo/infrastructure";

export class SoundManager {
  private PREF_KEY = "user:sound:prefs";

  constructor(private kv: KVClient) {}

  async getPrefs(userId: string) {
    return await this.kv.get<any>(`${this.PREF_KEY}:${userId}`) || {
      bgmEnabled: true,
      sfxEnabled: true,
      volume: 0.5
    };
  }

  async savePrefs(userId: string, prefs: any) {
    await this.kv.set(`${this.PREF_KEY}:${userId}`, prefs);
  }
}

export class MetaManager {
    constructor(private kv: KVClient) {}

    // Add other meta/system wide logic here
}
