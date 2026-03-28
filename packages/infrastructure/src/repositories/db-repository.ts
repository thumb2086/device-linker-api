import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import {
  IUserRepository,
  ISessionRepository,
  IWalletRepository,
  IGameRepository,
  IOpsRepository,
  IStatsRepository
} from "./interfaces.js";

const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString as string);
const db = drizzle(client, { schema });

export class DBUserRepository implements IUserRepository {
  async saveUser(user: any) {
    return await db.insert(schema.users).values(user).onConflictDoUpdate({
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
}

export class DBSessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    return await db.insert(schema.sessions).values(session).onConflictDoUpdate({
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
