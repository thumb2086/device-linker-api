export class LeaderboardService {
  private readonly enabled = String(process.env.FEATURE_ONCHAIN_LEADERBOARD || 'false') === 'true';

  isEnabled(): boolean {
    return this.enabled;
  }

  async syncLeaderboardSnapshot(_payload: Record<string, unknown>): Promise<{ enabled: boolean; queued: boolean }> {
    if (!this.enabled) return { enabled: false, queued: false };
    return { enabled: true, queued: true };
  }
}
