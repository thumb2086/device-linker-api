import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../packages/infrastructure/src/db/schema.js";
import { createClient } from "@vercel/kv";
import crypto from "crypto";

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
  console.log("⚠️  Note: If your Upstash limit is exceeded, this script may fail or hang.");

  try {
      // 1. Migrate Users
      console.log("📥 Migrating Users...");
      const userKeys = await kvClient.keys("pg_mock:user:*");
      console.log(`Found ${userKeys.length} users to migrate.`);
      for (const key of userKeys) {
        try {
            const user = await kvClient.get<any>(key);
            if (user && user.id && user.address) {
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
        } catch (e: any) {
            console.error(`❌ Failed to migrate user key ${key}: ${e.message}`);
        }
      }

      // 2. Migrate Balances
      console.log("📥 Migrating Balances...");
      const balanceKeys = await kvClient.keys("balance:*");
      for (const key of balanceKeys) {
        try {
            const address = key.split(":")[1];
            const balanceValue = await kvClient.get<any>(key);
            const balance = String(balanceValue);

            let user = await db.query.users.findFirst({
              where: (users, { eq }) => eq(users.address, address.toLowerCase())
            });

            if (!user) {
                const userId = crypto.randomUUID();
                await db.insert(schema.users).values({
                    id: userId,
                    address: address.toLowerCase(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                user = { id: userId } as any;
            }

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
        } catch (e: any) {
            console.error(`❌ Failed to migrate balance key ${key}: ${e.message}`);
        }
      }

      // 3. Migrate YJC Balances
      const yjcKeys = await kvClient.keys("balance_yjc:*");
      for (const key of yjcKeys) {
        try {
            const address = key.split(":")[1];
            const balanceValue = await kvClient.get<any>(key);
            const balance = String(balanceValue);

            let user = await db.query.users.findFirst({
              where: (users, { eq }) => eq(users.address, address.toLowerCase())
            });

            if (!user) {
                const userId = crypto.randomUUID();
                await db.insert(schema.users).values({
                    id: userId,
                    address: address.toLowerCase(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                user = { id: userId } as any;
            }

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
        } catch (e: any) {
            console.error(`❌ Failed to migrate YJC balance key ${key}: ${e.message}`);
        }
      }

      // 4. Migrate Custody Accounts
      console.log("📥 Migrating Custody Accounts...");
      const custodyKeys = await kvClient.keys("custody_user:*");
      for (const key of custodyKeys) {
        try {
            const username = key.split(":")[1];
            const data = await kvClient.get<any>(key);
            if (data && data.address) {
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
        } catch (e: any) {
            console.error(`❌ Failed to migrate custody key ${key}: ${e.message}`);
        }
      }

      // 5. Migrate Market Accounts
      console.log("📥 Migrating Market Accounts...");
      const marketKeys = await kvClient.keys("market_account:*");
      for (const key of marketKeys) {
        try {
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
        } catch (e: any) {
            console.error(`❌ Failed to migrate market key ${key}: ${e.message}`);
        }
      }

      console.log("✨ Migration to Neon completed successfully.");
  } catch (err: any) {
      console.error("❌ Migration script hit a fatal error:", err.message);
      if (err.message.includes("limit")) {
          console.error("💡 It looks like your Upstash KV limit has been exceeded. You may need to wait for a reset or upgrade to migrate data.");
      }
  }
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
