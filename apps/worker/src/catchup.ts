// apps/worker/src/catchup.ts
// One-time catch-up tool: finds all DB-only operations that never hit the chain
// and creates/executes on-chain transactions for them.
//
// Usage: npx tsx apps/worker/src/catchup.ts
//        DRY_RUN=true npx tsx apps/worker/src/catchup.ts   (preview only)

import { randomUUID } from "crypto";
import { OnchainWalletManager, WalletManager, tokenSymbolToOnchainKey } from "@repo/domain";
import { WalletRepository, OpsRepository, ChainClient, requireDb } from "@repo/infrastructure";
import { getOnChainConfig, SettlementServiceImpl, ViemRepository } from "@repo/on-chain";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DRY_RUN = process.env.DRY_RUN === "true";

async function getDirectSql() {
  return postgres(connectionString!, { ssl: "require", max: 1, connect_timeout: 10 });
}

interface LedgerEntry {
  id: string;
  userId: string;
  address: string;
  token: string;
  type: string;
  amount: string;
  txIntentId: string | null;
  txHash: string | null;
  createdAt: Date;
  meta: Record<string, unknown> | null;
}

async function findUnsyncedLedgerEntries(sql: ReturnType<typeof postgres>): Promise<LedgerEntry[]> {
  const rows = await sql`
    SELECT * FROM wallet_ledger_entries
    WHERE (tx_hash IS NULL OR tx_hash = '')
      AND (tx_intent_id IS NULL OR tx_intent_id NOT IN (
        SELECT id FROM tx_intents WHERE status = 'confirmed'
      ))
      AND type IN ('airdrop', 'deposit', 'transfer_in', 'conversion_in', 'admin_credit', 'register_bonus')
    ORDER BY created_at ASC
    LIMIT 500
  `;
  return rows as LedgerEntry[];
}

async function findStuckIntents(sql: ReturnType<typeof postgres>) {
  const rows = await sql`
    SELECT * FROM tx_intents
    WHERE status IN ('pending', 'processing', 'broadcasted')
      AND updated_at < NOW() - INTERVAL '30 minutes'
    ORDER BY created_at ASC
    LIMIT 200
  `;
  return rows as any[];
}

async function findBalanceOpsWithoutIntents(sql: ReturnType<typeof postgres>) {
  const rows = await sql`
    SELECT w.* FROM wallet_accounts w
    LEFT JOIN LATERAL (
      SELECT txi.id AS intent_id FROM tx_intents txi
      WHERE txi.address = w.address
        AND txi.token = w.token
        AND txi.status = 'confirmed'
        AND txi.type IN ('deposit', 'admin_credit', 'airdrop')
      ORDER BY txi.created_at DESC
      LIMIT 1
    ) last_tx ON true
    WHERE last_tx.intent_id IS NULL
      AND CAST(w.balance AS numeric) > 0
    LIMIT 500
  `;
  return rows as any[];
}

async function main() {
  console.log("=== Zixi One-Time On-Chain Catch-Up Tool ===");
  if (DRY_RUN) console.log("*** DRY RUN MODE - no transactions will be executed ***\n");

  if (!connectionString) {
    console.error("ERROR: DATABASE_URL or POSTGRES_URL is required");
    process.exit(1);
  }

  const runtime = new OnchainWalletManager().getRuntimeConfig();
  const hasChain = Boolean(runtime.rpcUrl && runtime.adminPrivateKey);
  if (!hasChain) {
    console.log("On-chain runtime not configured (no RPC_URL / ADMIN_PRIVATE_KEY).");
    console.log("Will only inspect DB state without attempting chain operations.\n");
  }

  const walletManager = new WalletManager();
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const FIXED_TREASURY_ADDRESS = getOnChainConfig().treasuryAddress;

  const sql = await getDirectSql();

  try {
    // ========================
    // Phase 1: Unsynced ledger entries (direct credits without chain TX)
    // ========================
    console.log("--- Phase 1: Unsynced Ledger Entries ---");
    const unsynced = await findUnsyncedLedgerEntries(sql);
    console.log(`Found ${unsynced.length} ledger entries without on-chain tx.`);

    for (const entry of unsynced) {
      console.log(`  [${entry.id.slice(0, 8)}] ${entry.type} ${entry.amount} ${entry.token} -> ${entry.address.slice(0, 10)}...`);

      const tokenKey = entry.token === "yjc" ? "yjc" : "zhixi";
      const tokenSymbol = tokenKey === "yjc" ? "YJC" : "ZXC";
      const userToken = tokenKey === "yjc" ? "YJC" : "ZXC";
      const amount = String(Number(entry.amount || "0").toFixed(4));

      if (Number(amount) <= 0) {
        console.log(`    SKIP: zero amount`);
        continue;
      }

      const txIntent: any = walletManager.createTxIntent(entry.userId, userToken, "admin_credit", amount);
      txIntent.address = entry.address;
      txIntent.meta = {
        source: "catchup",
        originalType: entry.type,
        originalLedgerId: entry.id,
        originalCreatedAt: entry.createdAt,
        ...(entry.meta as Record<string, unknown>),
      };

      if (DRY_RUN) {
        console.log(`    Would create intent: ${txIntent.id} (${entry.type})`);
        continue;
      }

      await walletRepo.saveTxIntent(txIntent);

      if (hasChain) {
        try {
          const tokenRuntime = runtime.tokens[tokenKey];
          if (!tokenRuntime?.enabled || !tokenRuntime.contractAddress) {
            console.log(`    SKIP chain: token ${tokenKey} not enabled`);
            await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "confirmed", "0xskip_no_contract"));
            continue;
          }

          const repo = new ViemRepository(runtime.rpcUrl, runtime.adminPrivateKey);
          const settlementService = new SettlementServiceImpl(repo);

          await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "broadcasted"));

          const txResult = await settlementService.adminTransfer({
            from: FIXED_TREASURY_ADDRESS,
            to: entry.address,
            amount,
            tokenAddress: tokenRuntime.contractAddress,
          });

          await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "confirmed", txResult.txHash));
          console.log(`    ✅ Confirmed: ${txResult.txHash}`);
        } catch (err: any) {
          console.log(`    ❌ Failed: ${err.message}`);
          await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "failed", undefined, err.message));
        }
      }

      if (!DRY_RUN) {
        await sql`
          UPDATE wallet_ledger_entries
          SET tx_intent_id = ${txIntent.id}, tx_hash = ${txIntent.txHash || null}
          WHERE id = ${entry.id}
        `;
      }
    }

    // ========================
    // Phase 2: Stuck pending intents
    // ========================
    console.log("\n--- Phase 2: Stuck Pending Intents ---");
    const stuck = await findStuckIntents(sql);
    console.log(`Found ${stuck.length} stuck intents (>30min in pending/broadcasted).`);

    for (const intent of stuck) {
      console.log(`  [${intent.id.slice(0, 8)}] ${intent.type} ${intent.amount} ${intent.token} status=${intent.status}`);

      if (DRY_RUN) continue;

      if (!hasChain) {
        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "failed", undefined, "catchup: no chain config"));
        continue;
      }

      try {
        const tokenKey = tokenSymbolToOnchainKey(intent.token);
        const tokenRuntime = runtime.tokens[tokenKey];
        if (!tokenRuntime?.enabled || !tokenRuntime.contractAddress) {
          await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "failed", undefined, "token not enabled"));
          continue;
        }

        const repo = new ViemRepository(runtime.rpcUrl, runtime.adminPrivateKey);
        const settlementService = new SettlementServiceImpl(repo);

        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "broadcasted"));

        const fromAddress = String(intent.address || "").toLowerCase();
        const userAddress = fromAddress;

        let txResult;
        if (intent.type === "bet") {
          txResult = await settlementService.processBet({
            from: userAddress,
            amount: String(intent.amount || "0"),
            tokenAddress: tokenRuntime.contractAddress,
          });
        } else if (intent.type === "payout") {
          txResult = await settlementService.processPayout({
            to: userAddress,
            amount: String(intent.amount || "0"),
            tokenAddress: tokenRuntime.contractAddress,
          });
        } else {
          const toAddress = intent.type === "deposit" || intent.type === "admin_credit" ? userAddress : FIXED_TREASURY_ADDRESS;
          const fromAddr = intent.type === "deposit" || intent.type === "admin_credit" ? FIXED_TREASURY_ADDRESS : userAddress;
          txResult = await settlementService.adminTransfer({
            from: fromAddr,
            to: toAddress,
            amount: String(intent.amount || "0"),
            tokenAddress: tokenRuntime.contractAddress,
          });
        }

        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "confirmed", txResult.txHash));
        console.log(`    ✅ Confirmed: ${txResult.txHash}`);
      } catch (err: any) {
        console.log(`    ❌ Failed: ${err.message}`);
        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "failed", undefined, err.message));
      }
    }

    // ========================
    // Phase 3: Wallet accounts with balance but no intents
    // ========================
    console.log("\n--- Phase 3: Wallet Accounts Without Intents ---");
    const accounts = await findBalanceOpsWithoutIntents(sql);
    console.log(`Found ${accounts.length} wallet accounts with balance > 0 but no intents.`);

    for (const acct of accounts) {
      console.log(`  [${acct.id.slice(0, 8)}] balance=${acct.balance} ${acct.token} @ ${acct.address.slice(0, 10)}...`);

      const balance = String(Number(acct.balance || "0").toFixed(4));
      if (Number(balance) <= 0) continue;

      const tokenKey = acct.token === "yjc" ? "yjc" : "zhixi";
      const tokenSymbol = tokenKey === "yjc" ? "YJC" : "ZXC";

      const txIntent: any = walletManager.createTxIntent(acct.userId, tokenSymbol, "admin_credit", balance);
      txIntent.address = acct.address;
      txIntent.meta = { source: "catchup", reason: "initial_balance_sync" };

      if (DRY_RUN) {
        console.log(`    Would create balance-sync intent`);
        continue;
      }

      await walletRepo.saveTxIntent(txIntent);

      if (hasChain) {
        try {
          const tokenRuntime = runtime.tokens[tokenKey];
          if (!tokenRuntime?.enabled || !tokenRuntime.contractAddress) {
            await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "confirmed", "0xskip_no_contract"));
            continue;
          }

          const repo = new ViemRepository(runtime.rpcUrl, runtime.adminPrivateKey);
          const settlementService = new SettlementServiceImpl(repo);

          await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "broadcasted"));

          const txResult = await settlementService.adminTransfer({
            from: FIXED_TREASURY_ADDRESS,
            to: acct.address,
            amount: balance,
            tokenAddress: tokenRuntime.contractAddress,
          });

          await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "confirmed", txResult.txHash));
          console.log(`    ✅ Confirmed: ${txResult.txHash}`);
        } catch (err: any) {
          console.log(`    ❌ Failed: ${err.message}`);
          await walletRepo.saveTxIntent(walletManager.processTxIntent(txIntent, "failed", undefined, err.message));
        }
      }
    }

    console.log("\n=== Catch-up complete ===");
    if (DRY_RUN) console.log("(Dry run - no changes were made)");

  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
