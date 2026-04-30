# Zixi Casino 專案總覽

更新日期：2026-04-30

Zixi Casino 是一個 pnpm workspace 專案，前端使用 React + Vite，後端使用 Fastify API，並透過共用套件定義 schema、常數與格式化工具。產品面包含登入、錢包、鏈上代幣、娛樂場遊戲、排行榜、VIP、獎勵寶箱、市場模擬、公告、客服與管理後台。

## 專案結構

| 路徑 | 說明 |
| --- | --- |
| `apps/web` | React SPA。主要入口是 `/app`，登入後進入大廳、遊戲、錢包、市場、獎勵、公告、客服與設定頁。 |
| `apps/api` | Fastify API。主要入口是 `apps/api/src/index.ts`，所有 v1 API 皆掛在 `/api/v1/*`。 |
| `apps/worker` | 背景 worker，預期處理鏈上錢包與 settlement 相關工作。 |
| `packages/shared` | 目前納入 git 追蹤的共用 package，輸出 API envelope、game/user/wallet schema、寶箱常數與格式化工具。 |
| `contracts` | ZhiXiCoin 與 YouJianCoin Solidity 合約。 |
| `docs` | 專案、API、資料庫與階段狀態文件。 |
| `assets` | 目前提交過的靜態 build assets。 |

## 主要功能

- 帳號與登入：custody 帳密登入、session 狀態查詢、註冊 bonus。
- 錢包：ZXC/YJC 餘額、每日空投、轉帳、提領、ZXC/YJC 轉換、鏈上與 DB/KV 餘額同步。
- 遊戲：Slots、Coinflip、Roulette、Horse、Sicbo、Bingo、Duel、Blackjack、Crash、Poker、Bluff Dice、Shoot Dragon Gate。
- 社群與成長：VIP、排行榜、聊天室/彈幕、稱號、頭像、道具、寶箱、活動任務。
- 市場模擬：現貨、銀行、貸款、期貨部位與帳戶摘要。
- 後台：維護模式、黑名單、公告、使用者檢視、獎勵目錄、活動、發獎、客服單與 ops events。

## 常用指令

```bash
pnpm install
pnpm dev
pnpm build
pnpm --filter @repo/api build
pnpm --filter @repo/web build
```

本 repo 的根目錄 `build` 目前只建置 `@repo/shared` 與 `web`：

```json
"build": "pnpm --filter @repo/shared build && pnpm --filter web build"
```

## 本機開發

- Web dev server：`pnpm --filter web dev`，預設 Vite port `5173`。
- API dev server：`pnpm --filter @repo/api dev`，預設 port `3000`。
- Vite 會把 `/api` proxy 到 `http://localhost:3000`。
- 前端也可透過 `VITE_API_URL` 指向其他 API base URL。

## 重要環境變數

| 變數 | 用途 |
| --- | --- |
| `DATABASE_URL` 或 `POSTGRES_URL` | API 連接 Postgres。 |
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Legacy KV / Redis 相容資料。 |
| `RPC_URL` | 鏈上 RPC endpoint。 |
| `PRIVATE_KEY` 或實作 package 讀取的 admin key | 管理錢包簽交易。 |
| `ADMIN_ADDRESS` | 管理後台授權錢包，未設定時 API 內有 hardcoded fallback。 |
| `GAME_SETTLEMENT_ASYNC` | 遊戲 settlement 是否走 async queue，預設 true。 |

## 目前需要注意的 repo 狀態

- `apps/api` 與 `apps/worker` 的 package.json 依賴 `@repo/domain`、`@repo/infrastructure`、`@repo/on-chain`。
- `pnpm-lock.yaml` 也記錄了 `packages/domain`、`packages/infrastructure`、`packages/on-chain` workspace。
- 目前 git 追蹤的檔案只有 `packages/shared`，`packages/domain` 與 `packages/infrastructure` 只剩被 `.gitignore` 忽略的空 `dist`/`node_modules` 目錄，`packages/on-chain` 目錄不存在。
- 因此完整 API/worker build 需要先恢復這三個 workspace source，否則只靠目前追蹤檔案無法獨立重建後端。

## 延伸文件

- [API 文件](docs/API_DOCUMENTATION.md)
- [資料儲存參考](docs/DB_SCHEMA_REFERENCE.md)
- [Phase 1-5 總覽](docs/PHASE_1_TO_5_OVERVIEW.md)
- [Phase 3 狀態](docs/phase3-status.md)
- [Phase 3 清理 checklist](docs/PHASE3_FINAL_CLEANUP_CHECKLIST.md)
- [API 設定](apps/api/API_CONFIG.md)
