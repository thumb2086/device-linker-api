import { kv } from "@vercel/kv";
import {
  IUserRepository,
  ISessionRepository,
  IWalletRepository,
  IMarketRepository,
  IGameRepository,
  IOpsRepository,
  IStatsRepository
} from "./interfaces.js";

export class KVUserRepository implements IUserRepository {
  async saveUser(user: any) {
    await kv.set(`pg_mock:user:${user.id}`, user);
    await kv.set(`pg_mock:user_addr:${user.address.toLowerCase()}`, user.id);
  }

  async getUserById(id: string) {
    return await kv.get<any>(`pg_mock:user:${id}`);
  }

  async getUserByAddress(address: string) {
    const id = await kv.get<string>(`pg_mock:user_addr:${address.toLowerCase()}`);
    if (!id) return null;
    return await this.getUserById(id);
  }
}

export class KVSessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    await kv.set(`pg_mock:session:${session.id}`, session, { ex: 86400 * 7 });
  }

  async getSessionById(id: string) {
    return await kv.get<any>(`pg_mock:session:${id}`);
  }
}

export class KVWalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    const key = token === "yjc" ? `balance_yjc:${address.toLowerCase()}` : `balance:${address.toLowerCase()}`;
    return await kv.get<string>(key) || "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
    const key = token === "yjc" ? `balance_yjc:${address.toLowerCase()}` : `balance:${address.toLowerCase()}`;
    await kv.set(key, amount);
    return amount;
  }

  async saveTxIntent(intent: any) {
    await kv.set(`pg_mock:tx_intent:${intent.id}`, intent);
    if (intent.status === "pending") {
      await kv.sadd("pg_mock:pending_intents", intent.id);
    } else {
      await kv.srem("pg_mock:pending_intents", intent.id);
    }
  }

  async getPendingIntents() {
    const ids = await kv.smembers("pg_mock:pending_intents") || [];
    const intents = [];
    for (const id of ids) {
      const intent = await kv.get(`pg_mock:tx_intent:${id}`);
      if (intent) intents.push(intent);
    }
    return intents;
  }
}

export class KVMarketRepository implements IMarketRepository {
  async getAccount(address: string) {
    return await kv.get<any>(`market_account:${address.toLowerCase()}`);
  }

  async saveAccount(address: string, account: any) {
    await kv.set(`market_account:${address.toLowerCase()}`, account);
  }

  async getMarketSnapshot() {
    return await kv.get<any>("market:snapshot");
  }

  async saveMarketSnapshot(snapshot: any) {
    await kv.set("market:snapshot", snapshot);
  }
}
