import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL || "postgres://localhost:5432/db";
const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export class UserRepository {
  async saveUser(user: any) {
    return await db.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }

  async getUserById(id: string) {
    return await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, id),
    });
  }
}

export class WalletRepository {
  async saveTxIntent(intent: any) {
    return await db.insert(schema.txIntents).values(intent);
  }

  async getPendingIntents() {
    return await db.query.txIntents.findMany({
      where: (txIntents, { eq }) => eq(txIntents.status, "pending"),
    });
  }
}

export class OpsRepository {
  async logEvent(event: any) {
    return await db.insert(schema.opsEvents).values({
      ...event,
      id: crypto.randomUUID(),
    });
  }
}
