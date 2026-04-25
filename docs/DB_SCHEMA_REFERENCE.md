# Database Schema Reference / 資料庫架構參考
## device-linker-api — Neon PostgreSQL (production branch)

> **English:** Reference for AI agents. Describes the production database table structures, purposes, and important fields. All data has been migrated from the old Redis (Upstash).
> 
> **中文：** 給 AI 代理參考用。這份文件描述目前 production 資料庫的表格結構、用途與重要欄位。所有資料已從舊 Redis (Upstash) 遷移至此。

---

## Connection / 連線

| Item | English | 中文 |
|------|---------|------|
| **Pooled** | For general API use | 一般 API 用 |
| **Unpooled** | For migrations/scripts | migration/script 用 |
| **ORM** | Drizzle ORM | Drizzle ORM |
| **Env Var (Pooled)** | `DATABASE_URL` | `DATABASE_URL` |
| **Env Var (Unpooled)** | `DATABASE_URL_UNPOOLED` | `DATABASE_URL_UNPOOLED` |

---

## Table List / 表格清單

### 1. `users` — Core Users / 核心使用者
```sql
id            UUID PRIMARY KEY
address       TEXT UNIQUE NOT NULL   -- Ethereum address, lowercase / 以太坊地址，統一小寫
display_name  TEXT                   -- Display name / 顯示名稱
is_admin      BOOLEAN DEFAULT false
is_blacklisted BOOLEAN DEFAULT false
blacklist_reason TEXT
blacklisted_at TIMESTAMPTZ
blacklisted_by TEXT
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```
> **English:** All other tables reference this table via `user_id` or `address`.
> 
> **中文：** 所有其他表以 `user_id` 或 `address` 關聯此表。

---

### 2. `custody_accounts` — Custody Accounts (Login) / 托管帳號（登入用）
```sql
id            UUID PRIMARY KEY
username      TEXT UNIQUE NOT NULL   -- Login username / 登入帳號
password_hash TEXT NOT NULL
salt_hex      TEXT NOT NULL
address       TEXT UNIQUE NOT NULL   -- Wallet address (lowercase) / 對應錢包地址（小寫）
public_key    TEXT                   -- ECDSA public key / ECDSA 公鑰
user_id       UUID REFERENCES users(id)
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```
> **English:** Login flow: username → query this table → verify passwordHash → create session
> 
> **中文：** 登入驗證流程：username → 查此表 → 驗證 passwordHash → 建立 session

---

### 3. `sessions` — Login Sessions / 登入 Session
```sql
id            TEXT PRIMARY KEY       -- sess_xxx format / sess_xxx 格式
user_id       UUID REFERENCES users(id)
address       TEXT
status        TEXT NOT NULL          -- 'pending' | 'active' | 'expired'
public_key    TEXT
mode          TEXT                   -- 'custody' | 'wallet'
platform      TEXT                   -- 'web' | 'app'
client_type   TEXT
device_id     TEXT
app_version   TEXT
account_id    TEXT
authorized_at TIMESTAMPTZ
created_at    TIMESTAMPTZ NOT NULL
expires_at    TIMESTAMPTZ NOT NULL
```
> **English:** Empty table, auto-created after login, no pre-filled data needed.
> 
> **中文：** 空表，登入後自動建立，不需要預填資料。

---

### 4. `user_profiles` — Profiles + Inventory / 個人資料 + 背包
```sql
id                  UUID PRIMARY KEY
user_id             UUID NOT NULL REFERENCES users(id)
address             TEXT UNIQUE NOT NULL
selected_avatar_id  TEXT DEFAULT 'classic_chip'
selected_title_id   TEXT DEFAULT ''
inventory           JSONB DEFAULT '{}'   -- { item_id: qty } / { 物品ID: 數量 }
owned_avatars       JSONB DEFAULT '[]'   -- [{ id, source, grantedAt, expiresAt }]
owned_titles        JSONB DEFAULT '[]'   -- [{ id, source, grantedAt }]
active_buffs        JSONB DEFAULT '[]'
system_title_streaks JSONB DEFAULT '{}'
win_bias            NUMERIC DEFAULT 0
created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```
> **English:** Original Redis `reward_profile:*` migrated here.
> 
> **中文：** 原 Redis `reward_profile:*` 已遷移至此表。

---

### 5. `wallet_accounts` — Wallet Balances / 錢包餘額
```sql
id                  UUID PRIMARY KEY
user_id             UUID NOT NULL REFERENCES users(id)
address             TEXT UNIQUE NOT NULL
token               TEXT NOT NULL DEFAULT 'ZXC'
balance             NUMERIC NOT NULL DEFAULT 0
locked_balance      NUMERIC NOT NULL DEFAULT 0
airdrop_distributed NUMERIC NOT NULL DEFAULT 0
updated_at          TIMESTAMPTZ NOT NULL
```

---

### 6. `total_bets` — Leaderboard Betting Data / 排行榜投注數據
```sql
period_type  TEXT NOT NULL   -- 'all' | 'week' | 'month' | 'season'
period_id    TEXT NOT NULL   -- '' | '20260309' | '2026-03' | 'S15-20260223'
address      TEXT NOT NULL
amount       BIGINT DEFAULT 0
PRIMARY KEY (period_type, period_id, address)
```
> **English:** Query week: `WHERE period_type='week' AND period_id='20260309'`  
> Query month: `WHERE period_type='month' AND period_id='2026-03'`  
> Query all-time: `WHERE period_type='all' AND period_id=''`
> 
> **中文：** 查周榜：`WHERE period_type='week' AND period_id='20260309'`  
> 查月榜：`WHERE period_type='month' AND period_id='2026-03'`  
> 查總榜：`WHERE period_type='all' AND period_id=''`

---

### 7. `announcements` — Announcements / 公告
```sql
id         TEXT PRIMARY KEY
title      TEXT NOT NULL
content    TEXT NOT NULL
is_active  BOOLEAN DEFAULT false
pinned     BOOLEAN DEFAULT false
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

---

### 8. `reward_title_catalog` — Title Catalog / 稱號目錄
```sql
id                  TEXT PRIMARY KEY
name                TEXT
rarity              TEXT    -- 'common' | 'rare' | 'legendary' | 'mythic'
source              TEXT    -- 'admin' | 'shop' | 'chest'
admin_grantable     BOOLEAN DEFAULT false
show_on_leaderboard BOOLEAN DEFAULT false
shop_enabled        BOOLEAN DEFAULT false
shop_price          BIGINT
shop_description    TEXT
shop_category       TEXT
raw                 JSONB
```

---

### 9. `reward_avatar_catalog` — Avatar Catalog / 頭像目錄
```sql
id          TEXT PRIMARY KEY
name        TEXT
rarity      TEXT
icon        TEXT    -- emoji or icon / emoji 或圖示
source      TEXT
description TEXT
updated_at  TIMESTAMPTZ
```

---

### 10. `reward_campaigns` — Campaigns / 活動
```sql
id                   TEXT PRIMARY KEY
title                TEXT
description          TEXT
is_active            BOOLEAN DEFAULT false
start_at             TIMESTAMPTZ
end_at               TIMESTAMPTZ
claim_limit_per_user INTEGER
min_vip_level        TEXT
rewards              JSONB   -- { items: [{ id, qty }] }
raw                  JSONB
```

---

### 11. `reward_claims` — Claim Records / 領獎紀錄
```sql
campaign_id  TEXT NOT NULL
address      TEXT NOT NULL
count        INTEGER DEFAULT 1
claimed_at   TIMESTAMPTZ
PRIMARY KEY (campaign_id, address)
```

---

### 12. `reward_grant_log` — Admin Grant Log / 管理員發獎紀錄
```sql
id         TEXT PRIMARY KEY
address    TEXT
operator   TEXT    -- Admin address / 管理員地址
source     TEXT    -- 'admin_panel'
note       TEXT
bundle     JSONB   -- { items: [{ id, qty }] }
created_at TIMESTAMPTZ
```

---

### 13. `horse_stats` — Horse Racing Stats / 賽馬統計
```sql
horse_id  TEXT PRIMARY KEY   -- '1' ~ '8'
races     INTEGER DEFAULT 0
wins      INTEGER DEFAULT 0
podium    INTEGER DEFAULT 0
last5     JSONB DEFAULT '[]'  -- Last 5 race positions / 最近5場名次
```

---

### 14. `market_portfolios` — Market Simulation Portfolios / 市場模擬投資組合
```sql
address          TEXT PRIMARY KEY
sim_mode         BOOLEAN DEFAULT false   -- true = simulation mode / true = 模擬模式
version          INTEGER DEFAULT 1
cash             NUMERIC DEFAULT 0
bank_balance     NUMERIC DEFAULT 0
loan_principal   NUMERIC DEFAULT 0
stock_holdings   JSONB DEFAULT '{}'      -- { NVDA: { qty, avgPrice } }
futures_positions JSONB DEFAULT '[]'
history          JSONB DEFAULT '[]'
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
raw              JSONB
```

---

### 15. `issue_reports` — Issue Reports / 問題回報
```sql
id           TEXT PRIMARY KEY
address      TEXT
display_name TEXT
title        TEXT
category     TEXT
message      TEXT
contact      TEXT
page_url     TEXT
created_at   TIMESTAMPTZ
raw          JSONB
```

---

### 16. `ops_events` — Operations Event Log / 運營事件 Log
```sql
id           UUID PRIMARY KEY
channel      TEXT NOT NULL
severity     TEXT NOT NULL    -- 'info' | 'warn' | 'error'
source       TEXT NOT NULL
kind         TEXT NOT NULL
request_id   TEXT
user_id      UUID
address      TEXT
game         TEXT
token        TEXT
round_id     UUID
tx_intent_id UUID
tx_hash      TEXT
error_code   TEXT
error_stage  TEXT
message      TEXT NOT NULL
meta         JSONB
created_at   TIMESTAMPTZ NOT NULL
```

---

### 17. `leaderboard_kings` — Leaderboard Kings Statistics / 榜王統計
```sql
id            UUID PRIMARY KEY
category      TEXT NOT NULL           -- 'weekly' | 'monthly' | 'season'
user_id       UUID NOT NULL REFERENCES users(id)
address       TEXT NOT NULL
display_name  TEXT
win_count     INTEGER NOT NULL DEFAULT 0
last_win_at   TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
period_id     TEXT
```
> **English:** Tracks consecutive wins and king status per category.
>
> **中文：** 追蹤各類別榜王連勝紀錄與稱號。

---

## Important Notes / 重要說明

### Deleted Old Tables / 已删除的旧表
**English:** Do not query these — they no longer exist.

| Old Table | Status / 状态 |
|-----------|---------------|
| `custody_users` | Merged into `custody_accounts` / 已合併進 `custody_accounts` |
| `reward_profiles` | Merged into `user_profiles` / 已合併進 `user_profiles` |
| `display_names` | Merged into `users.display_name` / 已合併進 `users.display_name` |
| `tx_monitor` | Old on-chain transactions, not migrated / 舊鏈上交易，不遷移 |
| `game_history` | Old game records, new system accumulates fresh / 舊遊戲紀錄，新系統重新累積 |
| `kv_store` | Fully migrated to Postgres / 已全面轉 Postgres |
| `read_cache_snapshots` | Cache, not preserved / 快取，不保留 |
| `market_accounts` | Merged into `market_portfolios` / 已合併進 `market_portfolios` |
| `leaderboard_settlement` | **Deleted** / 已刪除 — Use historical data reconstruction if needed / 如需請重建歷史資料 |
| `leaderboards` | **Deleted** / 已刪除 — Can be rebuilt from `total_bets` / 可從 `total_bets` 重建 |

## Address Format / 地址格式
- **English:** All `address` fields are stored **lowercase**
- **中文：** 所有 `address` 欄位統一**小寫**儲存
- **English:** Query using `lower(address) = lower($1)` to avoid case issues
- **中文：** 查詢時使用 `lower(address) = lower($1)` 避免大小寫問題

### Drizzle ORM Notes / Drizzle ORM 注意事項
- **English:** `total_bets` table schema needs `period_type`, `period_id`, `address`, `amount` fields
- **中文：** `total_bets` 表的 Drizzle schema 需要定義 `period_type`, `period_id`, `address`, `amount` 四個欄位
- **English:** `period_id` field **already exists**, no migration needed
- **中文：** `period_id` 欄位**已存在**，不需要 migration 新增
