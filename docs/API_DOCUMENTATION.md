# API 文件

更新日期：2026-04-30
來源：`apps/api/src/index.ts` 與 `apps/api/src/routes`

## 基本規則

- Base path：`/api/v1`
- 主要回應格式來自 `createApiEnvelope`：

```json
{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "req-id",
  "timestamp": 1710000000000
}
```

- 多數登入後 API 需要 `sessionId`，可放在 query string、body，或 header `x-session-id`。
- token 參數多使用 `zhixi` 或 `yjc`；對外顯示常對應 ZXC/YJC。
- 後台 API 需要登入 session 對應 `ADMIN_ADDRESS`。

## 系統與診斷

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/health` | API health check。 |
| GET | `/api/diag` | Postgres 連線、資料表與 session table 診斷。 |
| GET | `/api/diag-thumb` | 檢查 `thumb` custody account 是否存在於新版與舊版 table。 |

## Auth

| Method | Path | Body / Query | 說明 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/create-session` | none | 建立 pending session 與 deep link。 |
| GET | `/api/v1/auth/status` | `sessionId` query | 查 session 狀態、address、publicKey。 |
| POST | `/api/v1/auth/custody/register` | `username`, `password`, optional client fields | 註冊 custody 帳號，並嘗試發註冊 bonus。 |
| POST | `/api/v1/auth/custody/login` | `username`, `password`, optional client fields | custody 登入並建立 authorized session。 |
| GET | `/api/v1/auth/me` | optional `sessionId` query | 取得目前使用者、地址、餘額與 totalBet。 |

## Wallet

| Method | Path | Body / Query | 說明 |
| --- | --- | --- | --- |
| GET | `/api/v1/wallet/summary` | `sessionId` query | ZXC/YJC 錢包、鏈上狀態、市場資產、空投狀態。 |
| POST | `/api/v1/wallet/airdrop` | optional `sessionId` | 每日 ZXC 空投，受 24 小時 cooldown 與 halving policy 影響。 |
| POST | `/api/v1/wallet/transfer` | `sessionId`, `to`, `amount`, optional `token` | 轉帳 ZXC/YJC。 |
| POST | `/api/v1/wallet/withdrawals` | `sessionId`, amount/token 相關欄位 | 提領或建立提領意圖，實作細節在 wallet route。 |
| POST | `/api/v1/wallet/convert` | `sessionId`, `zxcAmount` | ZXC 轉 YJC，比例由 domain/on-chain manager 控制，目前 route 常數為 `100000000` ZXC per YJC。 |
| POST | `/api/v1/wallet/convert/yjc-to-zxc` | `sessionId`, `yjcAmount` | YJC 轉 ZXC。 |

## Games

所有個別遊戲 route 都會驗證 session、扣餘額、執行 settlement、記錄 round/history。`token` 預設多為 `zhixi`，Poker 與 Bluff Dice 預設為 `yjc`。

| Game | Method | Path | 主要 body |
| --- | --- | --- | --- |
| Generic | POST | `/api/v1/games/:game/play` | `sessionId`, `amount`, optional `token`, optional `action` |
| Rooms | POST | `/api/v1/games/rooms/join` | `sessionId`, `roomId` |
| Rooms | POST | `/api/v1/games/rooms/leave` | `sessionId`, `roomId` |
| Rooms | GET | `/api/v1/games/rooms` | optional `game` query |
| Slots | POST | `/api/v1/games/slots/play` | `sessionId`, `betAmount`, optional `token` |
| Slots | GET | `/api/v1/games/slots/history` | `sessionId` query |
| Coinflip | POST | `/api/v1/games/coinflip/play` | `sessionId`, `betAmount`, `selection=heads|tails`, optional `token` |
| Coinflip | GET | `/api/v1/games/coinflip/history` | `sessionId` query |
| Roulette | POST | `/api/v1/games/roulette/play` | `sessionId`, `betAmount`, `bets[]`, optional `token` |
| Roulette | GET | `/api/v1/games/roulette/history` | `sessionId` query |
| Horse | GET | `/api/v1/games/horse/horses` | none |
| Horse | POST | `/api/v1/games/horse/play` | `sessionId`, `betAmount`, `horseId`, optional `token` |
| Horse | GET | `/api/v1/games/horse/history` | `sessionId` query |
| Sicbo | POST | `/api/v1/games/sicbo/play` | `sessionId`, `betAmount`, `bets[]`, optional `token` |
| Sicbo | GET | `/api/v1/games/sicbo/history` | `sessionId` query |
| Bingo | POST | `/api/v1/games/bingo/play` | `sessionId`, `betAmount`, `numbers[]`, optional `token` |
| Bingo | GET | `/api/v1/games/bingo/history` | `sessionId` query |
| Duel | POST | `/api/v1/games/duel/play` | `sessionId`, `betAmount`, `p1Selection`, `p2Selection`, optional `token` |
| Duel | GET | `/api/v1/games/duel/history` | `sessionId` query |
| Blackjack | POST | `/api/v1/games/blackjack/play` | `sessionId`, `betAmount`, `action=start|hit|stand`, optional `state`, optional `token` |
| Blackjack | GET | `/api/v1/games/blackjack/history` | `sessionId` query |
| Crash | POST | `/api/v1/games/crash/play` | `sessionId`, `betAmount`, `elapsedSeconds`, `cashout`, optional `roundId`, optional `token` |
| Crash | GET | `/api/v1/games/crash/history` | `sessionId` query |
| Poker | POST | `/api/v1/games/poker/play` | `sessionId`, `betAmount`, optional `action`, optional `token` |
| Poker | GET | `/api/v1/games/poker/history` | `sessionId` query |
| Bluff Dice | POST | `/api/v1/games/bluffdice/play` | `sessionId`, `betAmount`, optional `action`, optional `token` |
| Bluff Dice | GET | `/api/v1/games/bluffdice/history` | `sessionId` query |
| Shoot Dragon Gate | POST | `/api/v1/games/shoot-dragon-gate/open` | `sessionId` |
| Shoot Dragon Gate | POST | `/api/v1/games/shoot-dragon-gate/play` | `sessionId`, `betAmount`, `gateId`, optional `token` |
| Shoot Dragon Gate | GET | `/api/v1/games/shoot-dragon-gate/history` | `sessionId` query |

## Market

| Method | Path | Body / Query | 說明 |
| --- | --- | --- | --- |
| GET | `/api/v1/market/snapshot` | none | 取得市場價格 snapshot，並保存 market snapshot。 |
| GET | `/api/v1/market/me` | session via header/query | 取得個人市場帳戶摘要。 |
| POST | `/api/v1/market/action` | `sessionId`, `type`, optional `symbol`, `amount`, `quantity`, `side`, `leverage`, `positionId` | 執行股票、銀行、貸款、期貨操作。 |

支援 action type：

`stock_buy`, `stock_sell`, `bank_deposit`, `bank_withdraw`, `loan_borrow`, `loan_repay`, `futures_open`, `futures_close`

## VIP、排行榜與彈幕

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/v1/vip/me` | 目前使用者 VIP 狀態。 |
| GET | `/api/v1/vip/:address` | 指定地址公開 VIP 資訊。 |
| GET | `/api/v1/vip/levels` | VIP 等級表。 |
| GET | `/api/v1/leaderboard` | 排行榜，query 支援 `type`, `limit`, `periodId`, `sessionId`。 |
| GET | `/api/v1/danmaku/events` | 近期彈幕事件，query 支援 `limit`。 |
| GET | `/api/v1/stats/leaderboard` | 舊 stats leaderboard route。 |
| GET | `/api/v1/stats/health` | 統計健康度。 |

## Rewards、Chests、Inventory

| Method | Path | Body / Query | 說明 |
| --- | --- | --- | --- |
| GET | `/api/v1/rewards/catalog` | none | 內建與後台自訂 title/avatar/item catalog。 |
| GET | `/api/v1/rewards/me` | session | 使用者擁有的 titles/avatars 與目前裝備。 |
| POST | `/api/v1/rewards/submissions` | `sessionId`, `type`, `name`, optional `icon`, `description`, `rarity` | 使用者提交自訂 avatar/title 提案。 |
| GET | `/api/v1/rewards/submissions/me` | session | 我的提案列表。 |
| POST | `/api/v1/rewards/chests/open` | `sessionId`, `chestType=bronze|silver|gold` | 舊 reward chest endpoint。 |
| POST | `/api/v1/rewards/equip` | `sessionId`, `type=title|avatar`, `id` | 裝備 title 或 avatar。 |
| GET | `/api/v1/rewards/campaigns` | optional session | 可領活動。 |
| POST | `/api/v1/rewards/campaigns/:campaignId/claim` | session | 領取活動獎勵。 |
| GET | `/api/v1/chests` | none | 新寶箱 catalog 與 drop-rate。 |
| GET | `/api/v1/chests/items` | none | 新寶箱完整道具目錄。 |
| GET | `/api/v1/chests/status` | session | pity、免費寶箱 cooldown、背包格數與餘額。 |
| POST | `/api/v1/chests/open` | `sessionId`, `chestType=common|rare|epic|legendary`, optional `free` | 新寶箱開啟流程，含 pity 與 rollback。 |
| GET | `/api/v1/inventory` | session | 背包道具、頭像、稱號、buff。 |
| POST | `/api/v1/inventory/use` | `sessionId`, `itemId` | 使用消耗品或啟用 buff/title/avatar。 |

## Profile、Me、Support、公告

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/v1/me/profile` | 使用者 profile。 |
| GET | `/api/v1/me/inventory` | 使用者 inventory。 |
| POST | `/api/v1/me/use-item` | 使用道具。 |
| POST | `/api/v1/profile/set-username` | 設定 display name。 |
| GET | `/api/v1/profile/sound-prefs` | 音效設定。 |
| POST | `/api/v1/profile/sound-prefs` | 更新音效設定。 |
| GET | `/api/v1/profile/prefs` | 一般設定。 |
| POST | `/api/v1/profile/prefs` | 更新一般設定。 |
| GET | `/api/v1/support/announcements` | active announcements。 |
| POST | `/api/v1/support/tickets` | 建立客服單。 |
| GET | `/api/v1/support/chat/messages` | 聊天室訊息。 |
| POST | `/api/v1/support/chat/messages` | 發送聊天室訊息。 |
| GET | `/api/v1/announcements` | 公告列表。 |
| POST | `/api/v1/announcements/add` | 新增公告，相容 route。 |
| GET | `/api/v1/transactions/public` | 公開交易紀錄。 |
| GET | `/api/v1/dashboard/transactions` | dashboard 交易資料。 |
| GET | `/api/v1/dashboard/summary` | dashboard 摘要。 |

## Admin

Admin route 掛在 `/api/v1/admin`，授權條件是 session address 必須等於 `ADMIN_ADDRESS`。

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/ops/health` | 維護模式與 ops health。 |
| POST | `/maintenance` | 切換維護模式。 |
| POST | `/blacklist` | 加入或移除黑名單。 |
| GET | `/blacklist` | 黑名單列表。 |
| POST | `/adjust-balance` | 手動調整 ZXC/YJC 餘額。 |
| GET/POST/PATCH/DELETE | `/announcements` | 公告管理。 |
| GET/POST/PATCH/DELETE | `/reward-catalog` | 獎勵目錄管理。 |
| GET | `/submissions` | 使用者提案審核列表。 |
| POST | `/submissions/:submissionId/approve` | 通過提案並建立 catalog item。 |
| POST | `/submissions/:submissionId/reject` | 拒絕提案。 |
| GET | `/users` | 使用者列表。 |
| GET | `/users/:address` | 使用者詳情。 |
| GET/POST/DELETE | `/users/:address/win-bias` | 讀取、設定、清除 win bias。 |
| POST | `/users/:address/vip` | 設定 legacy VIP level。 |
| POST | `/users/:address/reset-total-bet` | 重設 total bet。 |
| GET/POST/DELETE | `/campaigns` | 活動管理。 |
| POST | `/grant` | 直接發放 ZXC/YJC/items/avatars/titles。 |
| GET | `/grant-logs` | 發獎紀錄。 |
| GET | `/ops/events` | ops events。 |
| GET/PATCH | `/tickets` | 客服單列表與狀態更新。 |

## Legacy API

仍掛在 `/api`：

| Method | Path | 說明 |
| --- | --- | --- |
| POST/GET | `/api/user` | 舊使用者 API。 |
| POST | `/api/wallet` | 舊錢包 API。 |
