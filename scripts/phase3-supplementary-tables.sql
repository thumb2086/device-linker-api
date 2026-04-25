-- =============================================
-- device-linker-api 精簡版 Schema
-- =============================================

-- 1. users — 核心使用者
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT false,
  is_blacklisted BOOLEAN DEFAULT false,
  blacklist_reason TEXT,
  blacklisted_at TIMESTAMPTZ,
  blacklisted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_address_idx ON users(lower(address));

-- 2. custody_accounts — 托管帳號登入
CREATE TABLE IF NOT EXISTS custody_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt_hex TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  public_key TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. sessions — 登入 session（空表，會自動建立）
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  public_key TEXT,
  mode TEXT,
  platform TEXT,
  client_type TEXT,
  device_id TEXT,
  app_version TEXT,
  account_id TEXT,
  authorized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 4. user_profiles — 個人資料 + 背包（合併 reward_profiles）
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  address TEXT NOT NULL UNIQUE,
  selected_avatar_id TEXT DEFAULT 'classic_chip',
  selected_title_id TEXT DEFAULT '',
  inventory JSONB DEFAULT '{}',
  owned_avatars JSONB DEFAULT '[]',
  owned_titles JSONB DEFAULT '[]',
  active_buffs JSONB DEFAULT '[]',
  system_title_streaks JSONB DEFAULT '{}',
  win_bias NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. wallet_accounts — 錢包餘額
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  address TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL DEFAULT 'ZXC',
  balance NUMERIC NOT NULL DEFAULT 0,
  locked_balance NUMERIC NOT NULL DEFAULT 0,
  airdrop_distributed NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. total_bets — 排行榜投注數據
CREATE TABLE IF NOT EXISTS total_bets (
  period_type TEXT NOT NULL,  -- 'all' | 'week' | 'month' | 'season'
  period_id TEXT NOT NULL,    -- '' | '20260309' | '2026-03' | 'S15-20260223'
  address TEXT NOT NULL,
  amount BIGINT DEFAULT 0,
  PRIMARY KEY (period_type, period_id, address)
);
CREATE INDEX IF NOT EXISTS total_bets_address_idx ON total_bets(address);

-- 7. announcements — 公告
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. reward_title_catalog — 稱號目錄
CREATE TABLE IF NOT EXISTS reward_title_catalog (
  id TEXT PRIMARY KEY,
  name TEXT,
  rarity TEXT,
  source TEXT,
  admin_grantable BOOLEAN DEFAULT false,
  show_on_leaderboard BOOLEAN DEFAULT false,
  shop_enabled BOOLEAN DEFAULT false,
  shop_price BIGINT,
  shop_description TEXT,
  shop_category TEXT,
  raw JSONB
);

-- 10. reward_avatar_catalog — 頭像目錄
CREATE TABLE IF NOT EXISTS reward_avatar_catalog (
  id TEXT PRIMARY KEY,
  name TEXT,
  rarity TEXT,
  icon TEXT,
  source TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ
);

-- 11. reward_campaigns — 活動
CREATE TABLE IF NOT EXISTS reward_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  claim_limit_per_user INTEGER,
  min_vip_level TEXT,
  rewards JSONB,
  raw JSONB
);

-- 12. reward_claims — 領獎紀錄
CREATE TABLE IF NOT EXISTS reward_claims (
  campaign_id TEXT NOT NULL,
  address TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (campaign_id, address)
);

-- 13. reward_grant_log — 管理員發獎紀錄
CREATE TABLE IF NOT EXISTS reward_grant_log (
  id TEXT PRIMARY KEY,
  address TEXT,
  operator TEXT,
  source TEXT,
  note TEXT,
  bundle JSONB,
  created_at TIMESTAMPTZ
);

-- 14. horse_stats — 賽馬統計
CREATE TABLE IF NOT EXISTS horse_stats (
  horse_id TEXT PRIMARY KEY,
  races INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  podium INTEGER DEFAULT 0,
  last5 JSONB DEFAULT '[]'
);

-- 15. market_portfolios — 市場模擬投資組合
CREATE TABLE IF NOT EXISTS market_portfolios (
  address TEXT PRIMARY KEY,
  sim_mode BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  cash NUMERIC DEFAULT 0,
  bank_balance NUMERIC DEFAULT 0,
  loan_principal NUMERIC DEFAULT 0,
  stock_holdings JSONB DEFAULT '{}',
  futures_positions JSONB DEFAULT '[]',
  history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  raw JSONB
);

-- 15. issue_reports — 問題回報
CREATE TABLE IF NOT EXISTS issue_reports (
  id TEXT PRIMARY KEY,
  address TEXT,
  display_name TEXT,
  title TEXT,
  category TEXT,
  message TEXT,
  contact TEXT,
  page_url TEXT,
  created_at TIMESTAMPTZ,
  raw JSONB
);

-- 16. ops_events — 運營事件 log
CREATE TABLE IF NOT EXISTS ops_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  request_id TEXT,
  user_id UUID,
  address TEXT,
  game TEXT,
  token TEXT,
  round_id UUID,
  tx_intent_id UUID,
  tx_hash TEXT,
  error_code TEXT,
  error_stage TEXT,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Phase 3 補充表格 / Phase 3 Supplementary Tables
-- =============================================

-- 17. leaderboard_kings — 榜王統計 / Leaderboard Kings Statistics
CREATE TABLE IF NOT EXISTS leaderboard_kings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,                  -- weekly, monthly, season
  user_id UUID NOT NULL REFERENCES users(id),
  address TEXT NOT NULL,
  display_name TEXT,
  win_count INTEGER NOT NULL DEFAULT 0,
  last_win_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_king_category_user 
  ON leaderboard_kings(category, user_id);
