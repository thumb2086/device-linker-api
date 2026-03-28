import { kv } from "@vercel/kv";
import {
  IUserRepository,
  ISessionRepository,
  IWalletRepository,
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
