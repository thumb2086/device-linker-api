import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import {
  IUserRepository,
  ISessionRepository,
  IWalletRepository,
  IMarketRepository,
  IGameRepository,
  IOpsRepository,
  IStatsRepository
} from "./interfaces.js";

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const client = connectionString ? postgres(connectionString as string) : null;
const db = client ? drizzle(client, { schema }) : null;

export class DBUserRepository implements IUserRepository {
  async saveUser(user: any) {
    await db.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }

  async getUserById(id: string) {
    return await db.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.id, id),
    });
  }

  async getUserByAddress(address: string) {
    return await db.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.address, address.toLowerCase()),
    });
  }

  async getUserProfile(userId: string) {
    return await db.query.userProfiles.findFirst({
        where: (profiles: any, { eq }: any) => eq(profiles.userId, userId)
    });
  }

  async saveUserProfile(userId: string, data: any) {
    await db.insert(schema.userProfiles).values({ userId, ...data }).onConflictDoUpdate({
        target: schema.userProfiles.userId,
        set: { ...data, updatedAt: new Date() }
    });
  }
}

export class DBSessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    await db.insert(schema.sessions).values(session).onConflictDoUpdate({
      target: schema.sessions.id,
      set: { status: session.status, userId: session.userId, address: session.address, publicKey: session.publicKey },
    });
  }

  async getSessionById(id: string) {
    return await db.query.sessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, id),
    });
  }
}

export class DBWalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    return "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
  }

  async saveTxIntent(intent: any) {
    await db.insert(schema.txIntents).values(intent);
  }

  async getPendingIntents() {
    return await db.query.txIntents.findMany({
      where: (txIntents: any, { eq }: any) => eq(txIntents.status, "pending"),
    });
  }
}

export class DBMarketRepository implements IMarketRepository {
  async getAccount(address: string) {
    return await db.query.marketAccounts.findFirst({
        where: (accounts: any, { eq }: any) => eq(accounts.address, address.toLowerCase()),
    });
  }

  async saveAccount(address: string, userId: string, account: any) {
    await db.insert(schema.marketAccounts).values({
        address: address.toLowerCase(),
        userId: userId,
        data: account,
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: schema.marketAccounts.address,
        set: { data: account, updatedAt: new Date() },
    });
  }

  async getMarketSnapshot() {
    return null;
  }

  async saveMarketSnapshot(snapshot: any) {
  }
}
