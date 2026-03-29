import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is missing.");
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: 'require' });

async function main() {
  console.log("🚀 Running production-grade schema synchronization...");

  const statements = [
    // 1. Identity
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      address TEXT NOT NULL UNIQUE,
      display_name TEXT,
      is_admin BOOLEAN DEFAULT FALSE,
      is_blacklisted BOOLEAN DEFAULT FALSE,
      blacklist_reason TEXT,
      blacklisted_at TIMESTAMP,
      blacklisted_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS custody_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt_hex TEXT NOT NULL,
      address TEXT NOT NULL UNIQUE,
      public_key TEXT,
      user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id UUID REFERENCES users(id),
      address TEXT,
      status TEXT NOT NULL,
      public_key TEXT,
      mode TEXT DEFAULT 'live',
      platform TEXT DEFAULT 'unknown',
      client_type TEXT DEFAULT 'unknown',
      device_id TEXT DEFAULT 'unknown',
      app_version TEXT DEFAULT 'unknown',
      account_id TEXT,
      authorized_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    )`,

    // 2. Profiles
    `CREATE TABLE IF NOT EXISTS user_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
      address TEXT NOT NULL UNIQUE,
      selected_avatar_id TEXT DEFAULT 'classic_chip',
      selected_title_id TEXT,
      inventory JSONB DEFAULT '{}',
      owned_avatars JSONB DEFAULT '[]',
      owned_titles JSONB DEFAULT '[]',
      active_buffs JSONB DEFAULT '[]',
      system_title_streaks JSONB DEFAULT '{}',
      win_bias NUMERIC,
      sound_prefs JSONB DEFAULT '{"bgmEnabled": true, "sfxEnabled": true, "volume": 0.5}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    // 3. Wallet
    `CREATE TABLE IF NOT EXISTS wallet_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      address TEXT NOT NULL,
      token TEXT NOT NULL DEFAULT 'zhixi',
      balance NUMERIC NOT NULL DEFAULT '0',
      locked_balance NUMERIC NOT NULL DEFAULT '0',
      airdrop_distributed NUMERIC NOT NULL DEFAULT '0',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS wallet_addr_token_idx ON wallet_accounts (address, token)`,

    // 4. Games & Market
    `CREATE TABLE IF NOT EXISTS market_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
      address TEXT NOT NULL UNIQUE,
      data JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS game_rounds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      game TEXT NOT NULL,
      external_round_id TEXT,
      user_id UUID REFERENCES users(id),
      address TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      result JSONB,
      opens_at TIMESTAMP,
      closes_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    // 5. System & Ops
    `CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      announcement_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_pinned BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      published_by TEXT,
      updated_by TEXT,
      published_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS ops_events (
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
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      expires_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`
  ];

  for (const statement of statements) {
    try {
      await sql.unsafe(statement);
      console.log(`✅ Executed: ${statement.slice(0, 50).replace(/\\n/g, ' ')}...`);
    } catch (e: any) {
      console.error(`❌ Error executing: ${statement.slice(0, 50)}...`);
      console.error(e.message);
    }
  }

  await sql.end();
  console.log("✨ Production schema synchronization complete.");
}

main().catch(console.error);
