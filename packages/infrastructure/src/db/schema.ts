import {
  pgTable, uuid, text, boolean, timestamp, numeric, jsonb, integer, bigint, index, uniqueIndex
} from "drizzle-orm/pg-core";

// ─── Identity ─────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").default(false),
  isBlacklisted: boolean("is_blacklisted").default(false),
  blacklistReason: text("blacklist_reason"),
  blacklistedAt: timestamp("blacklisted_at"),
  blacklistedBy: text("blacklisted_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const custodyAccounts = pgTable("custody_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  saltHex: text("salt_hex").notNull(),
  address: text("address").notNull().unique(),
  publicKey: text("public_key"),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const custodyUsers = pgTable("custody_users", {
  username: text("username").primaryKey(),
  saltHex: text("salt_hex"),
  passwordHash: text("password_hash"),
  address: text("address"),
  raw: jsonb("raw"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  address: text("address"),
  status: text("status").notNull(), // pending, authorized, expired
  publicKey: text("public_key"),
  mode: text("mode").default("live"), // live, custody
  platform: text("platform").default("unknown"),
  clientType: text("client_type").default("unknown"),
  deviceId: text("device_id"),
  appVersion: text("app_version"),
  accountId: text("account_id"), // custody username
  authorizedAt: timestamp("authorized_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ─── User Profile & Display ────────────────────────────────────────────────────

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  address: text("address").notNull().unique(),
  selectedAvatarId: text("selected_avatar_id").default("classic_chip"),
  selectedTitleId: text("selected_title_id"),
  inventory: jsonb("inventory").default({}),
  ownedAvatars: jsonb("owned_avatars").default([]),
  ownedTitles: jsonb("owned_titles").default([]),
  activeBuffs: jsonb("active_buffs").default([]),
  systemTitleStreaks: jsonb("system_title_streaks").default({}),
  winBias: numeric("win_bias"), // admin-adjustable win bias 0-1
  soundPrefs: jsonb("sound_prefs").default({
    amountDisplay: "compact",
    danmuEnabled: true,
    masterVolume: 0.7,
    bgmEnabled: true,
    bgmVolume: 0.45,
    sfxEnabled: true,
    sfxVolume: 0.75,
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Leaderboard & Betting Totals ───────────────────────────────────────────────

export const totalBets = pgTable("total_bets", {
  periodType: text("period_type").notNull(), // 'all' | 'week' | 'month' | 'season'
  periodId: text("period_id").notNull(),     // '' | '20260309' | '2026-03' | 'S15-20260223'
  address: text("address").notNull(),
  amount: bigint("amount", { mode: "number" }).default(0),
}, (t) => ({
  pk: index("total_bets_pk").on(t.periodType, t.periodId, t.address),
  addressIdx: index("total_bets_address_idx").on(t.address),
}));

export type TotalBets = typeof totalBets.$inferSelect;
export type NewTotalBets = typeof totalBets.$inferInsert;

export const leaderboardKings = pgTable("leaderboard_kings", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull(), // 'weekly' | 'monthly' | 'season'
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  displayName: text("display_name"),
  winCount: integer("win_count").notNull().default(0),
  lastWinAt: timestamp("last_win_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  periodId: text("period_id"),
}, (t) => ({
  categoryUserIdx: index("leaderboard_kings_category_user_idx").on(t.category, t.userId),
  addressIdx: index("leaderboard_kings_address_idx").on(t.address),
}));

export type LeaderboardKing = typeof leaderboardKings.$inferSelect;
export type NewLeaderboardKing = typeof leaderboardKings.$inferInsert;

export const levelSnapshots = pgTable("level_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  totalBet: numeric("total_bet").notNull().default("0"),
  levelLabel: text("level_label").notNull(),
  maxBet: numeric("max_bet").notNull(),
  snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
});

export const totalBetLedger = pgTable("total_bet_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  game: text("game").notNull(),
  amount: numeric("amount").notNull(),
  token: text("token").notNull().default("zhixi"),
  roundId: uuid("round_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Wallet ────────────────────────────────────────────────────────────────────

export const walletAccounts = pgTable("wallet_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  token: text("token").notNull().default("zhixi"),
  balance: numeric("balance").notNull().default("0"),
  lockedBalance: numeric("locked_balance").notNull().default("0"),
  airdropDistributed: numeric("airdrop_distributed").notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  addrTokenIdx: uniqueIndex("wallet_addr_token_idx").on(table.address, table.token),
}));

export const walletLedgerEntries = pgTable("wallet_ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  token: text("token").notNull(),
  type: text("type").notNull(), // bet, payout, airdrop, deposit, withdrawal, transfer, register_bonus
  amount: numeric("amount").notNull(),
  balanceBefore: numeric("balance_before"),
  balanceAfter: numeric("balance_after"),
  game: text("game"),
  roundId: uuid("round_id"),
  txIntentId: uuid("tx_intent_id"),
  txHash: text("tx_hash"),
  requestId: text("request_id"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const walletBalanceSnapshots = pgTable("wallet_balance_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  token: text("token").notNull(),
  balance: numeric("balance").notNull(),
  snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
});

// ─── Transactions ─────────────────────────────────────────────────────────────

export const txIntents = pgTable("tx_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  token: text("token").notNull(),
  type: text("type").notNull(), // bet, payout, airdrop, register_bonus, withdrawal, transfer
  amount: numeric("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, confirmed, failed, reconciling
  errorCode: text("error_code"),
  errorStage: text("error_stage"), // validation_error, domain_error, api_error, tx_broadcast_error, tx_receipt_error, reconciliation_error
  requestId: text("request_id"),
  roundId: uuid("round_id"),
  game: text("game"),
  txHash: text("tx_hash"),
  contractAddress: text("contract_address"),
  retryCount: integer("retry_count").default(0),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const txAttempts = pgTable("tx_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  txIntentId: uuid("tx_intent_id").notNull().references(() => txIntents.id),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").notNull(), // broadcasting, confirmed, failed, reverted
  txHash: text("tx_hash"),
  error: text("error"),
  errorCode: text("error_code"),
  broadcastAt: timestamp("broadcast_at"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const txReceipts = pgTable("tx_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  txIntentId: uuid("tx_intent_id").notNull().references(() => txIntents.id).unique(),
  txHash: text("tx_hash").notNull(),
  blockNumber: bigint("block_number", { mode: "number" }),
  status: text("status").notNull(), // confirmed, reverted
  gasUsed: text("gas_used"),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
});

// ─── Game Sessions (Phase 3) ───────────────────────────────────────────────────

export const gameSessions = pgTable("game_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  game: text("game").notNull(), // 'shoot_dragon_gate' | 'horse_race' | 'dice' | etc.
  betAmount: numeric("bet_amount").notNull(),
  result: text("result").notNull(), // 'win' | 'lose' | 'draw'
  payout: numeric("payout").notNull().default("0"),
  meta: jsonb("meta").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  addressIdx: index("game_sessions_address_idx").on(t.address),
  gameIdx: index("game_sessions_game_idx").on(t.game),
  createdAtIdx: index("game_sessions_created_at_idx").on(t.createdAt),
}));

export type GameSession = typeof gameSessions.$inferSelect;
export type NewGameSession = typeof gameSessions.$inferInsert;

// ─── Games ─────────────────────────────────────────────────────────────────────

export const gameRounds = pgTable("game_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  game: text("game").notNull(),
  externalRoundId: text("external_round_id").notNull(),
  userId: uuid("user_id").references(() => users.id),
  address: text("address"),
  status: text("status").notNull().default("open"), // open, betting_closed, settled, failed, cancelled
  betTxIntentId: uuid("bet_tx_intent_id"),
  payoutTxIntentId: uuid("payout_tx_intent_id"),
  result: jsonb("result"),
  requestId: text("request_id"),
  opensAt: timestamp("opens_at").notNull(),
  closesAt: timestamp("closes_at").notNull(),
  bettingClosesAt: timestamp("betting_closes_at").notNull(),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gameActions = pgTable("game_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => gameRounds.id),
  userId: uuid("user_id").references(() => users.id),
  address: text("address"),
  type: text("type").notNull(), // bet, hit, stand, fold, spin, cashout, etc.
  payload: jsonb("payload"),
  result: jsonb("result"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gameSettlements = pgTable("game_settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => gameRounds.id).unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  game: text("game").notNull(),
  token: text("token").notNull(),
  betAmount: numeric("bet_amount").notNull(),
  payoutAmount: numeric("payout_amount").notNull(),
  netResult: numeric("net_result").notNull(), // payout - bet
  multiplier: numeric("multiplier"),
  isWin: boolean("is_win").default(false),
  betTxHash: text("bet_tx_hash"),
  payoutTxHash: text("payout_tx_hash"),
  status: text("status").notNull().default("pending"), // pending, settled, failed
  error: text("error"),
  meta: jsonb("meta"),
  settledAt: timestamp("settled_at").notNull().defaultNow(),
});

// ─── Rewards ──────────────────────────────────────────────────────────────────

export const rewardCatalog = pgTable("reward_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: text("item_id").notNull().unique(),
  type: text("type").notNull(), // title, avatar, buff, chest, key
  name: text("name").notNull(),
  rarity: text("rarity").notNull(),
  source: text("source").notNull(), // admin, system, campaign, shop
  description: text("description"),
  icon: text("icon"),
  price: numeric("price"),
  isActive: boolean("is_active").default(true),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rewardCampaigns = pgTable("reward_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: text("campaign_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  requiredLevel: text("required_level"),
  maxClaimsTotal: integer("max_claims_total"),
  maxClaimsPerUser: integer("max_claims_per_user").default(1),
  rewards: jsonb("rewards").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rewardGrants = pgTable("reward_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  itemId: text("item_id").notNull(),
  type: text("type").notNull(), // title, avatar, buff, tokens
  source: text("source").notNull(), // admin, campaign, system, chest
  campaignId: text("campaign_id"),
  grantedBy: text("granted_by"),
  tokenAmount: numeric("token_amount"),
  expiresAt: timestamp("expires_at"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Reward Campaigns claim tracking + grant logs ────────────────────────────

export const rewardCampaignClaims = pgTable("reward_campaign_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: text("campaign_id").notNull(),
  userId: uuid("user_id").notNull(),
  address: text("address").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const rewardGrantLogs = pgTable("reward_grant_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetAddress: text("target_address").notNull(),
  operatorAddress: text("operator_address"),
  source: text("source").notNull(), // admin | campaign | system
  note: text("note"),
  bundle: jsonb("bundle").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Reward Submissions (user-proposed avatars / titles awaiting review) ──────

export const rewardSubmissions = pgTable("reward_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: text("submission_id").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  type: text("type").notNull(), // avatar | title
  name: text("name").notNull(),
  icon: text("icon"), // emoji for avatars; optional for titles
  description: text("description"),
  rarity: text("rarity").notNull().default("common"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  approvedItemId: text("approved_item_id"), // reward_catalog.item_id after approval
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Market Simulation ─────────────────────────────────────────────────────────

export const marketAccounts = pgTable("market_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  address: text("address").notNull().unique(),
  data: jsonb("data").notNull(), // full market account state
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const marketTrades = pgTable("market_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  type: text("type").notNull(), // stock_buy, stock_sell, futures_open, futures_close, bank_deposit, bank_withdraw, loan_borrow, loan_repay
  symbol: text("symbol"),
  quantity: numeric("quantity"),
  price: numeric("price"),
  amount: numeric("amount"),
  fee: numeric("fee"),
  pnl: numeric("pnl"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Support & Announcements ───────────────────────────────────────────────────

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  announcementId: text("announcement_id").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false),
  isActive: boolean("is_active").default(true),
  publishedBy: text("published_by"),
  updatedBy: text("updated_by"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: text("report_id").notNull().unique(),
  userId: uuid("user_id").references(() => users.id),
  address: text("address"),
  displayName: text("display_name"),
  category: text("category").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  contact: text("contact"),
  pageUrl: text("page_url"),
  userAgent: text("user_agent"),
  platform: text("platform"),
  clientType: text("client_type"),
  deviceId: text("device_id"),
  appVersion: text("app_version"),
  mode: text("mode"),
  status: text("status").notNull().default("open"), // open, in_progress, resolved, closed
  adminUpdate: text("admin_update"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Ops & Observability ───────────────────────────────────────────────────────

export const opsEvents = pgTable("ops_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: text("channel").notNull(), // game, wallet, api, worker, admin, system
  severity: text("severity").notNull(), // info, warn, error, fatal
  source: text("source").notNull(), // coinflip, withdrawal, tx_processor, etc.
  kind: text("kind").notNull(), // bet_created, tx_failed, round_resolved, etc.
  requestId: text("request_id"),
  userId: uuid("user_id"),
  address: text("address"),
  game: text("game"),
  token: text("token"),
  roundId: uuid("round_id"),
  txIntentId: uuid("tx_intent_id"),
  txHash: text("tx_hash"),
  errorCode: text("error_code"),
  errorStage: text("error_stage"),
  message: text("message").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminActions = pgTable("admin_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminAddress: text("admin_address").notNull(),
  action: text("action").notNull(), // blacklist, unblacklist, reset_total_bets, reset_balance, etc.
  targetAddress: text("target_address"),
  targetUsername: text("target_username"),
  requestId: text("request_id"),
  payload: jsonb("payload"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── System Config ─────────────────────────────────────────────────────────────

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── KV Persistence Fallback ──────────────────────────────────────────────────

export const kvStore = pgTable("kv_store", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
