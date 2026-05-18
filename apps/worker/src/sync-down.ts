// apps/worker/src/sync-down.ts
// Chain → DB sync tool: reads real on-chain balances for all known addresses
// and writes them to the database, overwriting whatever is stored there.
//
// Usage:
//   npx tsx apps/worker/src/sync-down.ts
//   DRY_RUN=true npx tsx apps/worker/src/sync-down.ts   (preview only)

import { randomUUID } from "crypto";
import { OnchainWalletManager } from "@repo/domain";
import { WalletRepository, ChainClient, UserRepository, requireDb, kv } from "@repo/infrastructure";
import * as schema from "@repo/infrastructure/db/schema.js";
import { eq, and } from "drizzle-orm";

const DRY_RUN = process.env.DRY_RUN === "true";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

interface TokenHolder {
  address: string;
  balance: string;
}

async function getAllKnownAddresses(): Promise<Set<string>> {
  const db = await requireDb();
  const addresses = new Set<string>();

  // From users table
  const users = await db.query.users.findMany({ columns: { address: true } });
  for (const u of users) {
    if (u.address) addresses.add(u.address.toLowerCase());
  }

  // From wallet_accounts
  const accounts = await db.query.walletAccounts.findMany({ columns: { address: true } });
  for (const a of accounts) {
    if (a.address) addresses.add(a.address.toLowerCase());
  }

  // From wallet_ledger_entries
  const entries = await db.query.walletLedgerEntries.findMany({ columns: { address: true } });
  for (const e of entries) {
    const addr = e.address?.toLowerCase();
    if (addr && addr !== "0x") addresses.add(addr);
  }

  return addresses;
}

async function fetchEtherscanHolders(contractAddress: string): Promise<TokenHolder[]> {
  if (!ETHERSCAN_API_KEY) {
    console.log("    ETHERSCAN_API_KEY not set, skipping Etherscan holder discovery");
    return [];
  }
  try {
    const url = `https://api-sepolia.etherscan.io/api?module=token&action=tokenholderlist&contractaddress=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    if (data.status === "1" && Array.isArray(data.result)) {
      return (data.result as any[]).map((h: any) => ({
        address: String(h.TokenHolderAddress || h.address || "").toLowerCase(),
        balance: String(h.TokenHolderQuantity || h.balance || "0"),
      })).filter((h) => h.address && h.address.startsWith("0x"));
    }
    console.log(`    Etherscan API returned: ${data.message || JSON.stringify(data).slice(0, 200)}`);
    return [];
  } catch (e: any) {
    console.log(`    Etherscan API error: ${e.message}`);
    return [];
  }
}

async function getOnchainBalances(
  client: ChainClient,
  addresses: string[],
  contractAddress: string,
  decimals: number,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const BATCH_SIZE = 50;
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (addr) => {
      try {
        const raw = await client.getBalance(addr, contractAddress);
        const balance = client.formatUnits(raw, decimals);
        return { addr, balance };
      } catch {
        return { addr, balance: "0" };
      }
    });
    const resolved = await Promise.all(promises);
    for (const r of resolved) {
      if (Number(r.balance) > 0) {
        results.set(r.addr, r.balance);
      }
    }
  }
  return results;
}

async function main() {
  console.log("=== Zixi Chain → DB Sync Tool ===");
  if (DRY_RUN) console.log("*** DRY RUN MODE - no changes will be made ***\n");

  const onchainManager = new OnchainWalletManager();
  const runtime = onchainManager.getRuntimeConfig();
  if (!runtime.rpcUrl || !runtime.adminPrivateKey) {
    console.error("ERROR: RPC_URL and ADMIN_PRIVATE_KEY are required");
    process.exit(1);
  }

  const client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
  const walletRepo = new WalletRepository();
  const userRepo = new UserRepository();

  const tokens: Array<{ key: string; symbol: string; contract: string }> = [];
  for (const t of ["zhixi", "yjc"] as const) {
    const tr = runtime.tokens[t];
    if (tr?.enabled && tr.contractAddress) {
      tokens.push({ key: t, symbol: t === "yjc" ? "YJC" : "ZXC", contract: tr.contractAddress });
    }
  }

  if (tokens.length === 0) {
    console.error("ERROR: No on-chain tokens configured");
    process.exit(1);
  }

  console.log(`Tokens: ${tokens.map(t => `${t.symbol} (${t.contract.slice(0, 10)}...)`).join(", ")}`);

    // Step 1: Collect all known addresses
    console.log("\n--- Step 1: Collecting known addresses ---");
    const knownAddresses = await getAllKnownAddresses();
    console.log(`Found ${knownAddresses.size} known addresses from DB.`);

    // Step 2: Discover on-chain holders via Etherscan
    console.log("\n--- Step 2: Discovering on-chain holders ---");
    for (const token of tokens) {
      const holders = await fetchEtherscanHolders(token.contract);
      if (holders.length > 0) {
        let added = 0;
        for (const h of holders) {
          if (!knownAddresses.has(h.address)) {
            knownAddresses.add(h.address);
            added++;
          }
        }
        console.log(`  ${token.symbol}: ${holders.length} holders from Etherscan, ${added} new addresses`);
      } else {
        console.log(`  ${token.symbol}: Etherscan holder discovery skipped or returned no data`);
      }
    }
    console.log(`Total unique addresses: ${knownAddresses.size}`);

    const addressArray = [...knownAddresses].filter(a => a && a.startsWith("0x") && a.length === 42);
    console.log(`Valid addresses to query: ${addressArray.length}`);

    // Step 3: Query on-chain balances
    console.log("\n--- Step 3: Querying on-chain balances ---");
    const db = await requireDb();
    for (const token of tokens) {
      console.log(`\n  --- ${token.symbol} (${token.contract.slice(0, 10)}...) ---`);
      const decimals = await client.getDecimals(token.contract, 18);

      if (DRY_RUN) {
        console.log(`    Would query ${addressArray.length} addresses with decimals=${decimals}`);
        continue;
      }

      // First query all addresses in bulk
      const onchainBalances = await getOnchainBalances(client, addressArray, token.contract, decimals);
      console.log(`    Found ${onchainBalances.size} addresses with >0 balance on-chain`);

      // Get existing DB balances for comparison
      const allAccounts = await db.query.walletAccounts.findMany({
        where: (wa: any, { eq }: any) => eq(wa.token, token.key),
        columns: { address: true, balance: true },
      });
      const dbBalances = new Map<string, string>();
      for (const a of allAccounts) {
        if (a.address) dbBalances.set(a.address.toLowerCase(), a.balance || "0");
      }

      let updated = 0;
      let inserted = 0;
      let cleared = 0;
      let unchanged = 0;

      // 3a: Update addresses with on-chain balance > 0
      for (const [addr, chainBalance] of onchainBalances) {
        const existing = dbBalances.get(addr);
        if (existing === chainBalance) {
          unchanged++;
          continue;
        }

        // Find userId - might need to create user if not exists
        const existingUser = await db.query.users.findFirst({
          where: (u: any, { eq }: any) => eq(u.address, addr),
          columns: { id: true, displayName: true },
        });
        let userId: string;
        if (!existingUser) {
          userId = randomUUID();
          const displayName = `玩家_${addr.slice(2, 8)}`;
          await db.insert(schema.users).values({
            id: userId,
            address: addr,
            displayName,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).onConflictDoNothing();
          inserted++;
          console.log(`    Created user ${displayName} (${addr.slice(0, 10)}...)`);
        } else {
          userId = existingUser.id;
        }

        // Update wallet_accounts
        await db.insert(schema.walletAccounts).values({
          id: randomUUID(),
          userId,
          address: addr,
          token: token.key,
          balance: chainBalance,
          lockedBalance: "0",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [schema.walletAccounts.address, schema.walletAccounts.token],
          set: { balance: chainBalance, updatedAt: new Date() },
        });

        // Update KV balance
        const kvKey = token.key === "yjc" ? `balance_yjc:${addr}` : `balance:${addr}`;
        await kv.set(kvKey, chainBalance);

        updated++;
        if (updated <= 5 || updated % 20 === 0) {
          console.log(`    ${updated}. ${addr.slice(0, 10)}... → ${Number(chainBalance).toFixed(4)} ${token.symbol}`);
        }
      }

      // 3b: Clear DB balances for addresses that have 0 on-chain
      for (const [addr, dbBal] of dbBalances) {
        if (!onchainBalances.has(addr) && Number(dbBal) > 0) {
          await db.update(schema.walletAccounts).set({
            balance: "0",
            updatedAt: new Date(),
          }).where(and(
            eq(schema.walletAccounts.address, addr),
            eq(schema.walletAccounts.token, token.key),
          ));
          const kvKey = token.key === "yjc" ? `balance_yjc:${addr}` : `balance:${addr}`;
          await kv.set(kvKey, "0");
          cleared++;
        }
      }

      console.log(`\n  ${token.symbol} summary:`);
      console.log(`    Updated: ${updated}`);
      console.log(`    New users created: ${inserted}`);
      console.log(`    Cleared (chain=0, DB>0): ${cleared}`);
      console.log(`    Unchanged: ${unchanged}`);
    }

    console.log("\n=== Sync complete ===");
    if (DRY_RUN) console.log("(Dry run - no changes were made)");
}

main().catch((err: any) => {
  console.error("Fatal error:", err?.message || String(err));
  process.exit(1);
});
