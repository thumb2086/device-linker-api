# Phase 3 Game Record Issue

更新日期：2026-04-30

## 原問題

舊文件記錄的 P0 問題是：遊戲 route 完成投注與 settlement 後，沒有穩定呼叫 `GameSessionManager.recordGame()`，導致：

- `game_sessions` 沒有 history。
- `total_bets` 沒有更新。
- 排行榜、VIP、個人紀錄無法反映投注。

## 目前程式碼狀態

目前個別遊戲 route 已全面引用：

```ts
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
```

並且每個 route 都有 `/history` endpoint：

- `/api/v1/games/slots/history`
- `/api/v1/games/coinflip/history`
- `/api/v1/games/roulette/history`
- `/api/v1/games/horse/history`
- `/api/v1/games/sicbo/history`
- `/api/v1/games/bingo/history`
- `/api/v1/games/duel/history`
- `/api/v1/games/blackjack/history`
- `/api/v1/games/crash/history`
- `/api/v1/games/poker/history`
- `/api/v1/games/bluffdice/history`
- `/api/v1/games/shoot-dragon-gate/history`

`apps/api/src/utils/game-settlement.ts` 也提供：

- `executeSettlement()`
- `updateTotalBet()`
- `logGameEvent()`
- `saveRound()`

## 仍需驗證

此問題不應再被視為單純「未實作」，但仍需要 build 與 smoke test 才能關閉：

1. 恢復 `@repo/domain`、`@repo/infrastructure`、`@repo/on-chain` source。
2. 執行 `pnpm --filter @repo/api build`。
3. 建立測試 session。
4. 執行一局最小投注，例如 slots 或 coinflip。
5. 確認 response 有 `roundId`。
6. 查詢該遊戲 `/history` 能看到紀錄。
7. 查詢 leaderboard 或 `total_bets` 能看到投注累計。
8. 查詢 dashboard transactions/summary 能看到相關 tx/ops 資訊。

## 關閉條件

- 12 個個別遊戲 route 的 play + history smoke test 都通過。
- `total_bets` 的 all/week/month/season 寫入策略明確且可驗證。
- settlement failure 不會造成「已扣款但無 history」或「已派彩但未記錄」。
- CI 至少覆蓋 API build 與一條 game settlement integration test。
