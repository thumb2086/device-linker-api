# Neon Migration Schema Notes

This document summarizes the Redis-to-Neon migration inputs and the SQL tables/columns now involved in the project.

Source files reviewed:

- `C:\Users\CPXru\Downloads\import_to_neon.py`
- `C:\Users\CPXru\Downloads\redis_export.json`
- `C:\Users\CPXru\Downloads\still-wildflower-91259619_production_neondb_2026-03-29_12-10-51.json`
- `/packages/infrastructure/src/db/schema.ts`

## Important Finding

The migration script imports Redis custody users into `custody_users`:

```py
insert("""INSERT INTO custody_users (username,salt_hex,password_hash,address,raw)
          VALUES %s ON CONFLICT (username) DO NOTHING""", custody_rows, "custody_users")
```

But the current application login path uses `custody_accounts`:

- `/apps/api/src/routes/legacy/user-legacy.ts`
- `/packages/domain/src/identity/auth-manager.ts`
- `/packages/infrastructure/src/db/index.ts`

That means migrated custody login data can exist in Neon while the runtime still cannot use it unless:

- data is copied from `custody_users` to `custody_accounts`, or
- the app is updated to read `custody_users` as a fallback.

## Redis Key Prefix To SQL Table Mapping

Based on `import_to_neon.py`, these Redis key families were migrated:

| Redis key prefix | Target SQL table | Notes |
| --- | --- | --- |
| `tx_monitor:*` | `tx_monitor` | Raw tx monitor records |
| `announcement:*` | `announcements` | `announcement_id` keeps old logical id |
| `reward_claim:*` | `reward_claims` | Per campaign/address claim counts |
| `reward_profile:*` | `reward_profiles` | Avatar/title/inventory profile |
| `reward_campaign:*` | `reward_campaigns` | Campaign metadata and rewards |
| `reward_title_catalog:*` | `reward_title_catalog` | Title catalog |
| `reward_avatar_catalog:*` | `reward_avatar_catalog` | Avatar catalog |
| `reward_grant_log:*` | `reward_grant_log` | Reward audit log |
| `custody_user:*` | `custody_users` | Legacy custody login store |
| `game_history:*` | `game_history` | Historical game entries |
| `total_bet:*` | `total_bets` | Aggregated betting totals |
| `total_bet_week:*` | `total_bets` | Weekly totals |
| `total_bet_month:*` | `total_bets` | Monthly totals |
| `total_bet_season:*` | `total_bets` | Seasonal totals |
| `issue_report:*` | `issue_reports` | Support/issues |
| `market:*`, `market_sim:*` | `market_portfolios` | Market portfolio state |
| `horse_stats:*` | `horse_stats` | Horse racing stats |
| `leaderboard_settlement:*` | `leaderboard_settlement` | Settlement snapshots |
| `read_cache_snapshot:*` | `read_cache_snapshots` | Cached read models |
| `display_name:*` | `display_names` | Address to display name |
| `demo_balance:*` | `demo_balances` | Demo balances |
| everything else | `kv_store` | Fallback scalar/json KV dump |

## Runtime Tables Used By Current App

These are the main application tables defined in `/packages/infrastructure/src/db/schema.ts`.

### `users`

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key |
| `address` | `text` | no | Unique wallet address |
| `display_name` | `text` | yes | Display name |
| `is_admin` | `boolean` | yes | Admin flag |
| `is_blacklisted` | `boolean` | yes | Blacklist flag |
| `blacklist_reason` | `text` | yes | Reason |
| `blacklisted_at` | `timestamp` | yes | Blacklist time |
| `blacklisted_by` | `text` | yes | Operator |
| `created_at` | `timestamp` | no | Created time |
| `updated_at` | `timestamp` | no | Updated time |

### `custody_accounts`

This is the table the current custody login flow reads.

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key |
| `username` | `text` | no | Unique custody username |
| `password_hash` | `text` | no | Scrypt hash hex |
| `salt_hex` | `text` | no | Per-user salt hex |
| `address` | `text` | no | Unique linked address |
| `public_key` | `text` | yes | Optional custody public key |
| `user_id` | `uuid` | yes | FK to `users.id` |
| `created_at` | `timestamp` | no | Created time |
| `updated_at` | `timestamp` | no | Updated time |

### `sessions`

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `text` | no | Primary key |
| `user_id` | `uuid` | yes | FK to `users.id` |
| `address` | `text` | yes | Session address |
| `status` | `text` | no | `pending`, `authorized`, `expired` |
| `public_key` | `text` | yes | Wallet or custody key |
| `mode` | `text` | yes | `live` or `custody` |
| `platform` | `text` | yes | Client platform |
| `client_type` | `text` | yes | Client type |
| `device_id` | `text` | yes | Device identifier |
| `app_version` | `text` | yes | App version |
| `account_id` | `text` | yes | Custody username |
| `authorized_at` | `timestamp` | yes | Auth time |
| `created_at` | `timestamp` | no | Created time |
| `expires_at` | `timestamp` | no | Expiry |

### `user_profiles`

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key |
| `user_id` | `uuid` | no | Unique FK to `users.id` |
| `address` | `text` | no | Unique address |
| `selected_avatar_id` | `text` | yes | Avatar choice |
| `selected_title_id` | `text` | yes | Title choice |
| `inventory` | `jsonb` | yes | Inventory blob |
| `owned_avatars` | `jsonb` | yes | Avatar ids |
| `owned_titles` | `jsonb` | yes | Title ids |
| `active_buffs` | `jsonb` | yes | Active buffs |
| `system_title_streaks` | `jsonb` | yes | Streak data |
| `win_bias` | `numeric` | yes | Admin bias |
| `sound_prefs` | `jsonb` | yes | Sound settings |
| `created_at` | `timestamp` | no | Created time |
| `updated_at` | `timestamp` | no | Updated time |

### `wallet_accounts`

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key |
| `user_id` | `uuid` | no | FK to `users.id` |
| `address` | `text` | no | Address |
| `token` | `text` | no | Token symbol |
| `balance` | `numeric` | no | Current balance |
| `locked_balance` | `numeric` | no | Locked balance |
| `airdrop_distributed` | `numeric` | no | Airdrop total |
| `updated_at` | `timestamp` | no | Updated time |

Unique index:

- `wallet_addr_token_idx(address, token)`

### `market_accounts`

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key |
| `user_id` | `uuid` | no | Unique FK to `users.id` |
| `address` | `text` | no | Unique address |
| `data` | `jsonb` | no | Full market account payload |
| `created_at` | `timestamp` | no | Created time |
| `updated_at` | `timestamp` | no | Updated time |

### `ops_events`

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key |
| `channel` | `text` | no | Domain area |
| `severity` | `text` | no | `info`, `warn`, `error`, `fatal` |
| `source` | `text` | no | Source subsystem |
| `kind` | `text` | no | Event kind |
| `request_id` | `text` | yes | Request correlation |
| `user_id` | `uuid` | yes | User id |
| `address` | `text` | yes | Address |
| `game` | `text` | yes | Game name |
| `token` | `text` | yes | Token |
| `round_id` | `uuid` | yes | Round id |
| `tx_intent_id` | `uuid` | yes | Transaction intent id |
| `tx_hash` | `text` | yes | Chain tx hash |
| `error_code` | `text` | yes | Error code |
| `error_stage` | `text` | yes | Pipeline stage |
| `message` | `text` | no | Human-readable message |
| `meta` | `jsonb` | yes | Extra context |
| `created_at` | `timestamp` | no | Created time |

### `kv_store`

This is the generic fallback table for Redis keys that were not mapped to typed SQL tables.

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `key` | `text` | no | Primary key |
| `value` | `jsonb` | no | Stored payload |
| `expires_at` | `timestamp` | yes | Optional TTL |
| `updated_at` | `timestamp` | no | Updated time |

## Legacy Migrated Tables Seen In Neon Export

The Neon export also shows legacy tables that are not the main runtime tables in the current Drizzle schema, for example:

- `custody_users`
- `demo_balances`
- `display_names`
- `game_history`
- `horse_stats`
- `issue_reports`
- `leaderboard_settlement`
- `market_portfolios`
- `read_cache_snapshots`

These appear to be migration/staging tables created by the import script to preserve legacy Redis data.

## Recommended Follow-up

For custody login compatibility, backfill `custody_accounts` from `custody_users` if the app is expected to use migrated legacy custody accounts.

Example outline:

1. Insert missing `users` rows for `custody_users.address`
2. Insert or upsert into `custody_accounts`
3. Link `custody_accounts.user_id` to `users.id`

Without that backfill, a successful Redis-to-Neon import can still leave custody login broken even though the data exists in Neon.
