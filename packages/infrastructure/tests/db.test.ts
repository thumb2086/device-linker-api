import { getTableConfig } from "drizzle-orm/pg-core";
import { users, walletAccounts, txIntents, gameRounds } from "../src/index.js";

console.log("Users Table Name:", getTableConfig(users).name);
console.log("WalletAccounts Table Name:", getTableConfig(walletAccounts).name);
console.log("TxIntents Table Name:", getTableConfig(txIntents).name);
console.log("GameRounds Table Name:", getTableConfig(gameRounds).name);
