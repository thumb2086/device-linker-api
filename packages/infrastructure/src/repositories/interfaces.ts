export interface IUserRepository {
  saveUser(user: any): Promise<void>;
  getUserByAddress(address: string): Promise<any>;
  getUserById(id: string): Promise<any>;
  getUserProfile(userId: string): Promise<any>;
  saveUserProfile(userId: string, data: any): Promise<void>;
}

export interface ISessionRepository {
  saveSession(session: any): Promise<void>;
  getSessionById(id: string): Promise<any>;
}

export interface IWalletRepository {
  getBalance(address: string, token?: string): Promise<string>;
  updateBalance(address: string, amount: string, token?: string): Promise<void>;
  saveTxIntent(intent: any): Promise<void>;
  getPendingIntents(): Promise<any[]>;
}

export interface IMarketRepository {
  getAccount(address: string): Promise<any>;
  saveAccount(address: string, userId: string, account: any): Promise<void>;
  getMarketSnapshot(): Promise<any>;
  saveMarketSnapshot(snapshot: any): Promise<void>;
}

export interface IMetaRepository {
  saveRewardGrant(grant: any): Promise<void>;
  saveMarketOrder(order: any): Promise<void>;
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

export interface ICustodyRepository {
  saveCustodyUser(username: string, data: any): Promise<void>;
  getCustodyUser(username: string): Promise<any | null>;
  getLegacyCustodyUser(username: string): Promise<any | null>;
}
