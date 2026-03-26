import { WalletManager } from "@repo/domain";
import { WalletRepository, OpsRepository } from "@repo/infrastructure";

async function main() {
  console.log("Worker starting...");
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const walletManager = new WalletManager();

  while (true) {
    try {
      console.log("Checking for pending transaction intents...");

      // In real implementation, this would query the DB
      // const intents = await walletRepo.getPendingIntents();

      // Simulation of processing loop
      // for (const intent of intents) {
      //   await opsRepo.logEvent({
      //     channel: "worker",
      //     severity: "info",
      //     source: "tx_processor",
      //     kind: "tx_broadcasting",
      //     txIntentId: intent.id,
      //     message: `Broadcasting transaction for intent ${intent.id}`
      //   });
      //
      //   // Call ChainClient.transfer here...
      //
      //   await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "broadcasted", "0xmockhash"));
      // }

      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

main().catch(err => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
