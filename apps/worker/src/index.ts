import { WalletManager } from "@repo/domain";
import { WalletRepository, OpsRepository, ChainClient } from "@repo/infrastructure";

export async function processIntents() {
  console.log("Worker tick: Processing intents...");
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const walletManager = new WalletManager();

  const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
  const privateKey = process.env.ADMIN_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const zxcAddress = process.env.ZXC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  const yjcAddress = process.env.YJC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

  const chainClient = new ChainClient(rpcUrl, privateKey);

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

        const contractAddress = intent.token === "ZXC" ? zxcAddress : yjcAddress;
        let txHash = `0xmock_hash_${Date.now()}`;

        if (process.env.NODE_ENV === "production" && zxcAddress !== "0x" + "0".repeat(40)) {
           const tx = await chainClient.transfer(intent.userId, BigInt(intent.amount), contractAddress);
           txHash = tx.hash;
           await tx.wait();
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
