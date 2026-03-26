import { pgTable, uuid, text, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  address: text("address").notNull().unique(),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").default(false),
  isBlacklisted: boolean("is_blacklisted").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rewardGrants = pgTable("reward_grants", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  rewardId: text("reward_id").notNull(),
  type: text("type").notNull(),
  source: text("source").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const marketOrders = pgTable("market_orders", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  itemId: text("item_id").notNull(),
  quantity: numeric("quantity").notNull(),
  price: numeric("price").notNull(),
  total: numeric("total").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const opsEvents = pgTable("ops_events", {
  id: uuid("id").primaryKey(),
  channel: text("channel").notNull(), // e.g., "game", "wallet", "api"
  severity: text("severity").notNull(), // e.g., "info", "warn", "error"
  source: text("source").notNull(), // e.g., "coinflip", "withdrawal"
  kind: text("kind").notNull(), // e.g., "bet_created", "tx_failed"
  requestId: text("request_id"),
  userId: uuid("user_id"),
  game: text("game"),
  token: text("token"),
  roundId: text("round_id"),
  txIntentId: uuid("tx_intent_id"),
  txHash: text("tx_hash"),
  errorCode: text("error_code"),
  message: text("message").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const walletAccounts = pgTable("wallet_accounts", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  balance: numeric("balance").notNull().default("0"),
  lockedBalance: numeric("locked_balance").notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const txIntents = pgTable("tx_intents", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount").notNull(),
  status: text("status").notNull(),
  requestId: text("request_id"),
  roundId: text("round_id"),
  game: text("game"),
  txHash: text("tx_hash"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gameRounds = pgTable("game_rounds", {
  id: uuid("id").primaryKey(),
  game: text("game").notNull(),
  externalRoundId: text("external_round_id").notNull(),
  status: text("status").notNull(),
  result: jsonb("result"),
  opensAt: timestamp("opens_at").notNull(),
  closesAt: timestamp("closes_at").notNull(),
  bettingClosesAt: timestamp("betting_closes_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
