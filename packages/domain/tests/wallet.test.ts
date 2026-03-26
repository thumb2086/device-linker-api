import { WalletManager } from "../src/wallet/wallet-manager.js";

const manager = new WalletManager();
const userId = "550e8400-e29b-41d4-a716-446655440000";

const account = manager.createAccount(userId, "ZXC");
console.log("Created Account:", account.token, account.userId);

const intent = manager.createTxIntent(userId, "ZXC", "bet", "100.5", "req_bet_1");
console.log("Created Intent:", intent.type, intent.amount, intent.status);

const broadcasted = manager.processTxIntent(intent, "broadcasted", "0xabc123");
console.log("Broadcasted:", broadcasted.status, broadcasted.txHash);

const confirmed = manager.processTxIntent(broadcasted, "confirmed");
console.log("Confirmed:", confirmed.status);
