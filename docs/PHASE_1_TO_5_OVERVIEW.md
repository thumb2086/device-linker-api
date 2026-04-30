# Phase 1-5 總覽

更新日期：2026-04-30

本文件以目前 repo 狀態重新整理舊 Phase 文件。舊版內容有大量編碼亂碼，且曾引用目前未追蹤的 workspace source；新版改以現有檔案與 route 結構為準。

## 目前架構

- Frontend：`apps/web`，React 18、Vite、React Router、React Query、Zustand、i18next、lucide-react。
- API：`apps/api`，Fastify 4、Zod type provider、Postgres、KV、鏈上 wallet/settlement manager。
- Worker：`apps/worker`，預期處理鏈上背景工作。
- Shared：`packages/shared`，目前唯一完整納入 git 追蹤的 workspace package。
- Contracts：`contracts/ZhiXiCoin.sol`, `contracts/YouJianCoin.sol`。

## Phase 1：帳號、Session、錢包基礎

目標：建立 custody/wallet 登入、session、使用者與基本錢包能力。

目前對應：

- `POST /api/v1/auth/custody/register`
- `POST /api/v1/auth/custody/login`
- `GET /api/v1/auth/status`
- `GET /api/v1/auth/me`
- `GET /api/v1/wallet/summary`
- `POST /api/v1/wallet/airdrop`
- `POST /api/v1/wallet/transfer`

主要資料：

- `users`
- `custody_accounts`
- `sessions`
- `wallet_accounts`
- `wallet_ledger`
- `tx_intents`, `tx_attempts`, `tx_receipts`

## Phase 2：遊戲與 Settlement

目標：支援娛樂場遊戲、投注、派彩、history、total bet 與 settlement event。

目前遊戲：

- Slots
- Coinflip
- Roulette
- Horse
- Sicbo
- Bingo
- Duel
- Blackjack
- Crash
- Poker
- Bluff Dice
- Shoot Dragon Gate

主要 route：

- `POST /api/v1/games/:game/play`
- `POST /api/v1/games/{game}/play`
- `GET /api/v1/games/{game}/history`
- `POST /api/v1/games/shoot-dragon-gate/open`
- `GET /api/v1/games/horse/horses`

settlement 現況：

- `apps/api/src/utils/game-settlement.ts` 是遊戲 route 的主要 wrapper。
- 支援 async settlement，預設 `GAME_SETTLEMENT_ASYNC=true`。
- 會寫入 tx intents、ops events、game rounds，並處理 prevent-loss buff rollback。
- 依賴 `@repo/domain`、`@repo/infrastructure`、`@repo/on-chain`，但這些 workspace source 目前未納入 git 追蹤。

## Phase 3：Web SPA、排行榜、VIP、狀態頁

目標：完成 React Web 主流程與遊戲/錢包/排行/VIP/公告/客服的前台頁面。

前端路由：

- `/app`
- `/app/casino/lobby`
- `/app/casino/:game`
- `/app/wallet`
- `/app/swap`
- `/app/market`
- `/app/rewards`
- `/app/events`
- `/app/leaderboard`
- `/app/announcement`
- `/app/support`
- `/app/inventory`
- `/app/settings`
- `/app/transactions`
- `/app/dashboard/transactions`
- `/app/health`
- `/app/info`, `/app/info/vip-levels`, `/app/info/odds`

Phase 3 API：

- `GET /api/v1/leaderboard`
- `GET /api/v1/vip/me`
- `GET /api/v1/vip/:address`
- `GET /api/v1/vip/levels`
- `GET /api/v1/danmaku/events`
- `GET /api/v1/stats/health`
- `GET /api/v1/dashboard/transactions`
- `GET /api/v1/dashboard/summary`

## Phase 4：市場模擬

目標：提供 ZXC 帳戶上的市場模擬功能。

目前能力：

- 市場 snapshot。
- 個人市場帳戶摘要。
- 股票買賣。
- 銀行存提。
- 借貸與還款。
- 期貨開倉與平倉。
- liquidation settlement。

主要 route：

- `GET /api/v1/market/snapshot`
- `GET /api/v1/market/me`
- `POST /api/v1/market/action`

## Phase 5：後台、客服、公告與營運

目標：讓管理者能處理營運、公告、使用者、獎勵、活動與客服。

主要能力：

- 維護模式。
- 黑名單。
- 手動調整餘額。
- 公告 CRUD。
- 獎勵 catalog CRUD。
- 使用者提交 avatar/title 審核。
- 使用者查詢、VIP、win bias、total bet reset。
- 活動 campaign CRUD。
- 直接發獎。
- ops events。
- 客服單列表與狀態更新。

主要 route：

- `/api/v1/admin/*`
- `/api/v1/support/*`
- `/api/v1/announcements/*`

## Phase 6：寶箱與 Inventory

舊文件曾把寶箱列為下一階段；目前程式碼已存在新 route：

- `GET /api/v1/chests`
- `GET /api/v1/chests/items`
- `GET /api/v1/chests/status`
- `POST /api/v1/chests/open`
- `GET /api/v1/inventory`
- `POST /api/v1/inventory/use`

新寶箱系統支援：

- common/rare/epic/legendary chest。
- drop weights。
- pity threshold。
- daily free chest。
- inventory slot limit。
- token item、buff、avatar、title、collectible。
- 使用道具失敗時 rollback。

## 目前 P0 風險

1. `packages/domain`、`packages/infrastructure`、`packages/on-chain` 的 source 缺失或未追蹤，後端 workspace 無法只靠 git 內容完整 build。
2. 多個 TypeScript 檔案含有歷史編碼亂碼，若亂碼破壞 string literal，會造成編譯失敗。
3. `render.yaml` 仍使用 `pnpm migrate:neon && pnpm start`，但根目錄 package.json 沒有這兩個 script。
4. 根目錄 `pnpm build` 只建置 shared 與 web，沒有包含 API/worker。

## 建議下一步

1. 先恢復缺失 workspace source，或移除不再使用的 workspace 依賴。
2. 修正 shared/domain 中的亂碼常數，避免前端顯示與 TS build 同時出問題。
3. 對齊 root scripts、Render、Vercel 與 monorepo build strategy。
4. 補上 API/worker CI build，避免後端依賴缺失再次進入主分支。
