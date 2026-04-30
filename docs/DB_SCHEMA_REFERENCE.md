# 資料儲存參考

更新日期：2026-04-30
來源：目前 API route 使用情境、舊文件與 `pnpm-lock.yaml`

## 現況摘要

本專案同時使用 Postgres 與 KV/Redis 相容儲存：

- Postgres：使用者、session、錢包餘額、交易意圖/receipt、公告、獎勵、活動、排行榜、ops events、市場帳戶等長期資料。
- KV：legacy 餘額 mirror、黑名單、維護模式、聊天訊息、客服單、部分 reward/profile 快取與 cooldown。
- 鏈上：ZXC/YJC 實際代幣餘額與 settlement tx hash 由 domain/infrastructure/on-chain workspace 封裝。

重要限制：目前 git 追蹤檔案不包含 `packages/domain`、`packages/infrastructure`、`packages/on-chain` 的 source，因此下列 schema 是根據 route 使用與舊文件整理，不是由目前 repo 內 schema source 自動產生。

## 連線環境變數

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | API 優先使用的 Postgres connection string。 |
| `POSTGRES_URL` | `DATABASE_URL` 缺席時的 fallback。 |
| `KV_URL` | Redis/KV connection string。 |
| `KV_REST_API_URL` | REST KV endpoint。 |
| `KV_REST_API_TOKEN` | REST KV token。 |

## 核心 Postgres Tables

### `users`

使用者主資料。所有 address 應以 lowercase 儲存。

```sql
id UUID PRIMARY KEY
address TEXT UNIQUE NOT NULL
display_name TEXT
is_admin BOOLEAN DEFAULT false
is_blacklisted BOOLEAN DEFAULT false
blacklist_reason TEXT
blacklisted_at TIMESTAMPTZ
blacklisted_by TEXT
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### `custody_accounts`

custody 帳密登入資料。

```sql
id UUID PRIMARY KEY
username TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
salt_hex TEXT NOT NULL
address TEXT UNIQUE NOT NULL
public_key TEXT
user_id UUID REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### `sessions`

登入 session。API 會檢查 `status='authorized'`。

```sql
id TEXT PRIMARY KEY
user_id UUID REFERENCES users(id)
address TEXT
status TEXT NOT NULL
public_key TEXT
mode TEXT
platform TEXT
client_type TEXT
device_id TEXT
app_version TEXT
account_id TEXT
authorized_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
```

### `user_profiles`

profile、背包、頭像、稱號、buff 與 win bias。

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
address TEXT UNIQUE NOT NULL
selected_avatar_id TEXT DEFAULT 'classic_chip'
selected_title_id TEXT DEFAULT ''
inventory JSONB DEFAULT '{}'
owned_avatars JSONB DEFAULT '[]'
owned_titles JSONB DEFAULT '[]'
active_buffs JSONB DEFAULT '[]'
system_title_streaks JSONB DEFAULT '{}'
win_bias NUMERIC DEFAULT 0
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### `wallet_accounts`

DB/KV/on-chain 間的錢包餘額同步表。

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
address TEXT UNIQUE NOT NULL
token TEXT NOT NULL DEFAULT 'ZXC'
balance NUMERIC NOT NULL DEFAULT 0
locked_balance NUMERIC NOT NULL DEFAULT 0
airdrop_distributed NUMERIC DEFAULT 0
updated_at TIMESTAMPTZ NOT NULL
```

### `wallet_ledger`, `tx_intents`, `tx_attempts`, `tx_receipts`

錢包與鏈上交易流水。route 會寫入 airdrop、transfer、withdrawal、conversion、game settlement。

關鍵欄位：

- `tx_intents`: id, user_id, address, token, type, amount, status, tx_hash, contract_address, round_id, meta, created_at, updated_at。
- `tx_attempts`: tx_intent_id, attempt_number, status, tx_hash, error, error_code, broadcast_at, confirmed_at。
- `tx_receipts`: tx_intent_id, tx_hash, block_number, status, gas_used, confirmed_at。
- `wallet_ledger`: user_id, address, token, type, amount, balance_before, balance_after, tx_intent_id, tx_hash, meta。

### `game_rounds` 與 `game_sessions`

個別遊戲 round 與 history 來源。個別遊戲 route 會透過 `GameSessionManager.recordGame()` 與 `gameSettlement.saveRound()` 記錄。

關鍵欄位：

- `game_rounds`: id, game, external_round_id, status, result, opens_at, closes_at, betting_closes_at, settled_at, created_at, updated_at。
- `game_sessions`: user_id, address, game, bet_amount, result, payout, metadata, created_at。

### `total_bets`

排行榜與 VIP 相關投注統計。

```sql
period_type TEXT NOT NULL
period_id TEXT NOT NULL
address TEXT NOT NULL
amount BIGINT DEFAULT 0
PRIMARY KEY (period_type, period_id, address)
```

`period_type` 常見值：`all`, `week`, `month`, `season`。

### `announcements`

公告資料，前台只讀 active，後台可讀寫 active/inactive 與 pinned。

```sql
id TEXT PRIMARY KEY
announcement_id TEXT UNIQUE
title TEXT NOT NULL
content TEXT NOT NULL
is_active BOOLEAN DEFAULT false
is_pinned BOOLEAN DEFAULT false
published_by TEXT
updated_by TEXT
published_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### Reward tables

目前 API 使用的 repository 名稱包含：

- `RewardCatalogRepository`
- `RewardSubmissionRepository`
- `RewardCampaignRepository`

建議 tables：

- `reward_catalog`: item_id, type, name, rarity, source, description, icon, price, is_active, meta, created_at, updated_at。
- `reward_submissions`: submission_id, user_id, address, type, name, icon, description, rarity, status, reviewed_by, review_note, approved_item_id, created_at, reviewed_at。
- `reward_campaigns`: campaign_id, title, description, is_active, start_at, end_at, claim_limit_per_user, min_level, rewards, created_by, created_at, updated_at。
- `reward_claims`: campaign_id, user_id, address, claimed_at。
- `reward_grant_log`: target_address, operator_address, source, note, bundle, created_at。

### Market tables

市場模擬使用 `MarketRepository`：

- `market_portfolios`: address, user_id, account json, cash, bank_balance, loan_principal, stock_holdings, futures_positions, history, created_at, updated_at。
- `market_trades`: id, user_id, address, type, symbol, quantity, price, amount, fee, pnl, meta, created_at。
- `market_snapshots`: id, snapshot json, created_at。

### Ops 與統計

`ops_events` 是跨功能 audit/event log。

```sql
id UUID PRIMARY KEY
channel TEXT NOT NULL
severity TEXT NOT NULL
source TEXT NOT NULL
kind TEXT NOT NULL
request_id TEXT
user_id UUID
address TEXT
game TEXT
token TEXT
round_id TEXT
settlement_id TEXT
tx_intent_id UUID
tx_hash TEXT
error_code TEXT
message TEXT NOT NULL
meta JSONB
created_at TIMESTAMPTZ NOT NULL
```

### 其他 tables

- `leaderboard_kings`: category, user_id, address, display_name, win_count, period_id, last_win_at, updated_at。
- `horse_stats`: horse_id, races, wins, podium, last5。
- `issue_reports`: 若客服單從 KV 遷回 PG，可保存 report_id/address/title/category/message/contact/page_url/status/admin_update/raw。

## 主要 KV Keys

| Key pattern | 說明 |
| --- | --- |
| `balance:{address}` | legacy ZXC 餘額 mirror。 |
| `balance_yjc:{address}` | legacy YJC 餘額 mirror。 |
| `total_bet:{address}` | legacy total bet mirror。 |
| `last_airdrop:{address}` | 每日空投 cooldown。 |
| `airdrop:distributed_total` | 空投 halving 累計。 |
| `system:maintenance` | 維護模式。 |
| `blacklist:{address}` | 黑名單資料。 |
| `chat:global:messages` | 全域聊天室最近訊息。 |
| `support:ticket:{reportId}` | 客服單。 |
| `user:tickets:{address}` | 使用者客服單 id list。 |
| `owned_titles:{address}` / `owned_avatars:{address}` | legacy 擁有稱號/頭像。 |
| `active_title:{address}` / `active_avatar:{address}` | legacy 已裝備稱號/頭像。 |
| `chest:free-lock:{userId}` | 免費寶箱 cooldown lock。 |

## 已淘汰或需避免的新查詢

- `custody_users`: 已由 `custody_accounts` 取代，只能做診斷相容查詢。
- `reward_profiles`: 應由 `user_profiles` 取代。
- `display_names`: 應由 `users.display_name` 取代。
- `leaderboards`: 可由 `total_bets` 重建。
- `leaderboard_settlement`: 舊 settlement table，不應作為新 API 來源。
- `kv_store`: 若已遷移到 PG，不應新增依賴。

## 維護建議

1. 恢復並追蹤 `packages/infrastructure/src/db/schema.ts` 後，以 schema source 重新產生本文件。
2. 將仍在 KV 的客服、profile 快取與 legacy balance mirror 設定明確的遷移策略。
3. 所有 address 寫入前 lowercase，查詢時使用 normalized address。
4. settlement 相關資料需保留 `settlementId`, `roundId`, `txHash`, `requestId`，方便對帳與 idempotency。
