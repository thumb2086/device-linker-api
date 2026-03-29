import { OnchainWalletManager, WalletManager } from "@repo/domain";
import { WalletRepository, OpsRepository, ChainClient } from "@repo/infrastructure";

export async function processIntents() {
  console.log("Worker tick: Processing intents...");
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const walletManager = new WalletManager();
  const onchainManager = new OnchainWalletManager();

  const runtime = onchainManager.getRuntimeConfig();
  if (!runtime.rpcUrl || !runtime.adminPrivateKey) {
    console.warn("Worker skipped: on-chain runtime is not configured.");
    return;
  }

  const chainClient = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);

  try {
    const intents = await walletRepo.getPendingIntents();
    if (intents.length === 0) return;

    console.log(`Found ${intents.length} pending intents.`);
    for (const intent of intents) {
      try {
        await opsRepo.logEvent({
          channel: "worker",
          severity: "info",
          source: "tx_processor",
          kind: "tx_broadcasting",
          userId: intent.userId,
          game: intent.game,
          roundId: intent.roundId,
          txIntentId: intent.id,
          message: `Broadcasting ${intent.type} for intent ${intent.id}`
        });

        const tokenKey = intent.token === "YJC" ? "yjc" : "zhixi";
        const tokenRuntime = runtime.tokens[tokenKey];
        const contractAddress = tokenRuntime.contractAddress;
        const fromAddress = String(intent.address || "").toLowerCase();
        const meta = intent.meta && typeof intent.meta === "object" ? intent.meta : {};
        const decimals = Number.isFinite(Number((meta as any).decimals))
          ? Number((meta as any).decimals)
          : await chainClient.getDecimals(contractAddress, 18);
        const amountWei = chainClient.parseUnits(String(intent.amount || "0"), decimals);
        const toAddress =
          intent.type === "transfer"
            ? String((meta as any).toAddress || "")
            : intent.type === "withdrawal"
              ? String(tokenRuntime.lossPoolAddress || chainClient.getWalletAddress())
              : fromAddress;
        let txHash = `0xmock_hash_${Date.now()}`;

        if (process.env.NODE_ENV === "production" && contractAddress) {
           if (intent.type === "deposit" && (meta as any).mode === "zxc_to_yjc_mint") {
             const tx = await chainClient.mint(fromAddress, amountWei, contractAddress);
             txHash = tx.hash;
             await tx.wait();
           } else if (fromAddress && toAddress) {
             const tx = await chainClient.adminTransfer(fromAddress, toAddress, amountWei, contractAddress);
             txHash = tx.hash;
             await tx.wait();
           }
        }

        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "confirmed", txHash));

        await opsRepo.logEvent({
            channel: "worker",
            severity: "info",
            source: "tx_processor",
            kind: "tx_confirmed",
            userId: intent.userId,
            game: intent.game,
            roundId: intent.roundId,
            txIntentId: intent.id,
            txHash,
            message: `Transaction ${txHash} confirmed for intent ${intent.id}`
        });
      } catch (err: any) {
        console.error(`Failed to process intent ${intent.id}:`, err);
        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "failed", undefined, err.message));
        await opsRepo.logEvent({
            channel: "worker",
            severity: "error",
            source: "tx_processor",
            kind: "tx_failed",
            userId: intent.userId,
            txIntentId: intent.id,
            message: `Transaction failed for intent ${intent.id}: ${err.message}`,
            errorCode: "TX_BROADCAST_ERROR"
        });
      }
    }
  } catch (err) {
    console.error("Worker processing fatal error:", err);
  }
}

async function main() {
  console.log("Worker starting in loop mode...");
  while (true) {
    await processIntents();
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

main().catch(err => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
