import { kv, UserRepository, SessionRepository, MarketRepository, WalletRepository, CustodyRepository } from "../packages/infrastructure/src/index.js";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../packages/infrastructure/src/db/schema.js";
import { createClient } from "@vercel/kv";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is missing. Migration aborted.");
  process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle(sql, { schema });

// We need a real KV client to use .keys()
const kvClient = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

async function migrate() {
  console.log("🚀 Starting KV to Neon Migration...");

  // 1. Migrate Users
  console.log("📥 Migrating Users...");
  const userKeys = await kvClient.keys("pg_mock:user:*");
  for (const key of userKeys) {
    const user = await kvClient.get<any>(key);
    if (user) {
      await db.insert(schema.users).values({
        id: user.id,
        address: user.address.toLowerCase(),
        displayName: user.displayName || user.username || null,
        createdAt: new Date(user.createdAt || Date.now()),
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.users.id,
        set: { updatedAt: new Date() }
      });
      console.log(`✅ Migrated User: ${user.address}`);
    }
  }

  // 2. Migrate Balances
  console.log("📥 Migrating Balances...");
  const balanceKeys = await kvClient.keys("balance:*");
  for (const key of balanceKeys) {
    const address = key.split(":")[1];
    const balance = await kvClient.get<string>(key);
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.address, address.toLowerCase())
    });

    if (user && balance) {
      await db.insert(schema.walletAccounts).values({
        userId: user.id,
        address: address.toLowerCase(),
        token: "zhixi",
        balance: balance,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.walletAccounts.address,
        set: { balance, updatedAt: new Date() }
      });
      console.log(`✅ Migrated Balance for ${address}: ${balance}`);
    }
  }

  // 3. Migrate YJC Balances
  const yjcKeys = await kvClient.keys("balance_yjc:*");
  for (const key of yjcKeys) {
    const address = key.split(":")[1];
    const balance = await kvClient.get<string>(key);
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.address, address.toLowerCase())
    });

    if (user && balance) {
      await db.insert(schema.walletAccounts).values({
        userId: user.id,
        address: address.toLowerCase(),
        token: "yjc",
        balance: balance,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.walletAccounts.address,
        set: { balance, updatedAt: new Date() }
      });
      console.log(`✅ Migrated YJC Balance for ${address}: ${balance}`);
    }
  }

  // 4. Migrate Custody Accounts
  console.log("📥 Migrating Custody Accounts...");
  const custodyKeys = await kvClient.keys("custody_user:*");
  for (const key of custodyKeys) {
    const username = key.split(":")[1];
    const data = await kvClient.get<any>(key);
    if (data) {
      // Find or create user for custody account
      let user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.address, data.address.toLowerCase())
      });

      if (!user) {
        const userId = crypto.randomUUID();
        await db.insert(schema.users).values({
          id: userId,
          address: data.address.toLowerCase(),
          displayName: username,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        user = { id: userId } as any;
      }

      await db.insert(schema.custodyAccounts).values({
        username: username.toLowerCase(),
        passwordHash: data.passwordHash,
        saltHex: data.saltHex,
        address: data.address.toLowerCase(),
        publicKey: data.publicKey || null,
        userId: user!.id,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.custodyAccounts.username,
        set: { updatedAt: new Date() }
      });
      console.log(`✅ Migrated Custody Account: ${username}`);
    }
  }

  // 5. Migrate Market Accounts
  console.log("📥 Migrating Market Accounts...");
  const marketKeys = await kvClient.keys("market_account:*");
  for (const key of marketKeys) {
    const address = key.split(":")[1];
    const data = await kvClient.get<any>(key);
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.address, address.toLowerCase())
    });

    if (user && data) {
      await db.insert(schema.marketAccounts).values({
        userId: user.id,
        address: address.toLowerCase(),
        data: data,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: schema.marketAccounts.address,
        set: { data, updatedAt: new Date() }
      });
      console.log(`✅ Migrated Market Account: ${address}`);
    }
  }

  console.log("✨ Migration to Neon completed successfully.");
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
