import postgres from "postgres";
import { kv } from "@repo/infrastructure";
import { OnchainWalletManager } from "@repo/domain";
import { ChainClient } from "@repo/infrastructure";

const sql = postgres(process.env.DATABASE_URL || "", { ssl: "require", max: 1 });

async function main() {
  console.log("🔍 Scanning KV for balance entries...");

  const rows = await sql`SELECT key, value FROM kv_store WHERE key LIKE 'balance:%' OR key LIKE 'balance_yjc:%' ORDER BY key`;

  const addressBalances = new Map<string, { zhixi?: string; yjc?: string }>();

  for (const row of rows) {
    const key = row.key as string;
    const addr = key.startsWith("balance_yjc:") ? key.slice("balance_yjc:".length) : key.slice("balance:".length);
    const token = key.startsWith("balance_yjc:") ? "yjc" as const : "zhixi" as const;
    const val = String(row.value ?? "0");

    if (!addressBalances.has(addr)) {
      addressBalances.set(addr, {});
    }
    const entry = addressBalances.get(addr)!;
    if (token === "zhixi") entry.zhixi = val;
    else entry.yjc = val;
  }

  console.log(`📊 Found ${addressBalances.size} addresses with KV balance entries\n`);

  const onchainManager = new OnchainWalletManager();
  let runtime: ReturnType<typeof onchainManager.getRuntimeConfig>;
  let client: ChainClient;

  try {
    runtime = onchainManager.getRuntimeConfig();
    if (!runtime.rpcUrl || !runtime.adminPrivateKey) {
      console.error("❌ On-chain runtime not configured. Set ADMIN_PRIVATE_KEY and RPC_URL env vars.");
      await sql.end();
      process.exit(1);
    }
    client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
  } catch (e: any) {
    console.error("❌ Failed to initialize chain client:", e.message);
    await sql.end();
    process.exit(1);
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  const chainTokens = ["zhixi", "yjc"] as const;

  for (const [address, tokens] of addressBalances) {
    const addrLower = address.toLowerCase();

    for (const token of chainTokens) {
      const kvBalance = tokens[token];
      if (!kvBalance || parseFloat(kvBalance) <= 0) continue;

      try {
        const tokenRuntime = runtime.tokens[token];
        if (!tokenRuntime.enabled) {
          console.log(`  ⏭️  ${token} chain disabled, skipping ${addrLower}`);
          continue;
        }

        const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
        const rawOnChain = await client.getBalance(addrLower, tokenRuntime.contractAddress);
        const onChainBalance = client.formatUnits(rawOnChain, decimals);
        const kvNum = parseFloat(kvBalance);
        const onChainNum = parseFloat(onChainBalance);

        if (onChainNum >= kvNum) {
          console.log(`  ✅ ${addrLower.slice(0, 10)}… ${token}: on-chain ${onChainNum} >= KV ${kvNum}, OK`);
          skipped++;
          continue;
        }

        const deficit = (kvNum - onChainNum).toFixed(4);
        const deficitWei = client.parseUnits(deficit, decimals);

        if (deficitWei <= 0n) {
          skipped++;
          continue;
        }

        console.log(`  🔄 Minting ${deficit} ${token} → ${addrLower.slice(0, 10)}… (on-chain: ${onChainNum}, KV: ${kvNum})`);
        const tx = await client.mint(addrLower, deficitWei, tokenRuntime.contractAddress);
        const receipt = await tx.wait();

        if (receipt?.status === 1) {
          console.log(`    ✅ Tx confirmed: ${tx.hash}`);
          synced++;
        } else {
          console.error(`    ❌ Tx reverted: ${tx.hash}`);
          errors++;
        }
      } catch (e: any) {
        console.error(`  ❌ Error syncing ${addrLower} ${token}: ${e.message}`);
        errors++;
      }
    }
  }

  console.log(`\n📊 Done: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  await sql.end();
}

main();
