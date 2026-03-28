export interface IUserRepository {
  saveUser(user: any): Promise<void>;
  getUserByAddress(address: string): Promise<any>;
  getUserById(id: string): Promise<any>;
}

export interface ISessionRepository {
  saveSession(session: any): Promise<void>;
  getSessionById(id: string): Promise<any>;
}

export interface IWalletRepository {
  saveTxIntent(intent: any): Promise<void>;
  getPendingIntents(): Promise<any[]>;
}

export interface IGameRepository {
  saveRound(round: any): Promise<void>;
  getRoundById(id: string): Promise<any>;
}

export interface IOpsRepository {
  logEvent(event: any): Promise<void>;
  listEvents(options?: { limit?: number; userId?: string }): Promise<any[]>;
}

export interface IStatsRepository {
  getLeaderboard(type: "total_bet" | "balance"): Promise<any[]>;
}
