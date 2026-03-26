import { kv } from "@vercel/kv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../packages/infrastructure/src/db/schema.js";

const connectionString = process.env.DATABASE_URL;

async function runMigration() {
  if (!connectionString) {
    console.error("Missing DATABASE_URL. Please set it to connect to Postgres.");
    process.exit(1);
  }

  console.log("Connecting to Postgres...");
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("Starting KV to Postgres migration...");

  // 1. Migrate Custody Users
  console.log("Migrating Custody Users...");
  let cursor = 0;
  let custodyCount = 0;
  let hasMore = true;
  while (hasMore) {
    const [nextCursor, keys] = await kv.scan(cursor, { match: "custody_user:*", count: 100 });
    cursor = nextCursor === "0" ? 0 : Number(nextCursor);
    hasMore = cursor !== 0;

    for (const key of keys) {
      const record = await kv.get<any>(key);
      if (!record || !record.address) continue;

      const userExists = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.address, record.address),
      });

      let userId = userExists?.id;
      if (!userExists) {
        const [newUser] = await db.insert(schema.users).values({
          address: record.address,
          createdAt: new Date(record.createdAt || Date.now()),
        }).returning({ id: schema.users.id });
        userId = newUser.id;
      }

      const accountExists = await db.query.custodyAccounts.findFirst({
         where: (accounts, { eq }) => eq(accounts.username, record.username),
      });

      if (!accountExists) {
          await db.insert(schema.custodyAccounts).values({
              username: record.username,
              passwordHash: record.passwordHash,
              saltHex: record.saltHex,
              address: record.address,
              publicKey: record.publicKey || "0x",
              userId,
              createdAt: new Date(record.createdAt || Date.now()),
          });
          custodyCount++;
      }
    }
  }
  console.log(`Migrated ${custodyCount} custody users.`);

  // 2. Migrate Balances
  console.log("Migrating Balances...");
  cursor = 0;
  let balanceCount = 0;
  hasMore = true;
  while (hasMore) {
    const [nextCursor, keys] = await kv.scan(cursor, { match: "balance:*", count: 100 });
    cursor = nextCursor === "0" ? 0 : Number(nextCursor);
    hasMore = cursor !== 0;

    for (const key of keys) {
      const address = key.replace("balance:", "");
      const balance = await kv.get<string>(key);

      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.address, address),
      });

      if (user) {
         const waExists = await db.query.walletAccounts.findFirst({
             where: (accounts, { eq }) => eq(accounts.address, address),
         });

         if (!waExists) {
            await db.insert(schema.walletAccounts).values({
                userId: user.id,
                address,
                token: "zhixi",
                balance: balance || "0",
            });
            balanceCount++;
         }
      }
    }
  }
  console.log(`Migrated ${balanceCount} wallet balances.`);

  // 3. Migrate Total Bets
  console.log("Migrating Total Bets...");
  cursor = 0;
  let betCount = 0;
  hasMore = true;
  while (hasMore) {
    const [nextCursor, keys] = await kv.scan(cursor, { match: "total_bet:*", count: 100 });
    cursor = nextCursor === "0" ? 0 : Number(nextCursor);
    hasMore = cursor !== 0;

    for (const key of keys) {
      const address = key.replace("total_bet:", "");
      const totalBet = await kv.get<string>(key);

      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.address, address),
      });

      if (user) {
         const snapshotExists = await db.query.levelSnapshots.findFirst({
             where: (snaps, { eq }) => eq(snaps.address, address),
         });

         if (!snapshotExists) {
             const betValue = totalBet || "0";
             // Use placeholder logic for level until we dynamically link it in migrations
             await db.insert(schema.levelSnapshots).values({
                 userId: user.id,
                 address,
                 totalBet: betValue,
                 levelLabel: "migrated",
                 maxBet: "1000",
             });
             betCount++;
         }
      }
    }
  }
  console.log(`Migrated ${betCount} total bets.`);

  console.log("Migration complete!");
  process.exit(0);
}

runMigration().catch(e => {
  console.error(e);
  process.exit(1);
});
