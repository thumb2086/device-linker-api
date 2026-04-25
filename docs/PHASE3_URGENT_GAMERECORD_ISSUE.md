# Phase 3 緊急問題報告：GameSessionManager.recordGame() 缺失

**日期**: 2025-04-06  
**優先級**: 🔴 P0 - 最緊急  
**狀態**: ✅ 已修復 (2025-04-06)

---

## 問題摘要

所有 12 款遊戲的路由雖然建立了 `GameManager`（舊的 domain 邏輯），但**沒有呼叫 `GameSessionManager.recordGame()`**。這導致：

1. ❌ 遊戲結果不寫入 `game_sessions` 表
2. ❌ `total_bets` 永遠不更新
3. ❌ 排行榜資料是空的

---

## 修復方案 (已實施)

### 修改檔案: `apps/api/src/routes/v1/games.ts`

**步驟 1**: 添加必要的 import
```typescript
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
```

**步驟 2**: 在鏈上結算後，添加遊戲記錄邏輯
```typescript
// 7. Record game session to database (for leaderboard & history)
try {
  const db = await requireDb();
  const sessionManager = new GameSessionManager(db);
  
  const isWin = settlementResult.settlement.isWin;
  
  await sessionManager.recordGame({
    userId,
    address,
    game: game as any,
    betAmount: amountNum,
    gameResult: {
      result: isWin ? "win" : "lose",
      payout: finalPayout,
      meta: { 
        ...gameResult,
        roundId,
        multiplier,
        fee: feeAmount,
        token,
        betTxHash: settlementResult.betTxHash,
        payoutTxHash: settlementResult.payoutTxHash
      },
    },
  });
} catch (err: any) {
  // Log error but don't fail the request - game already settled on-chain
  await opsRepo.logEvent({
    channel: "game",
    severity: "error",
    source: game,
    kind: "record_game_failed",
    userId,
    address,
    game,
    message: `Failed to record game session: ${err.message}`,
    meta: { roundId, error: err.message }
  });
}
```

### 為什麼這樣設計？
- ✅ 在鏈上結算成功後才記錄（避免記錄未完成的遊戲）
- ✅ 錯誤處理：記錄失敗不影響遊戲結果（已鏈上確認）
- ✅ 完整的 metadata（遊戲詳細數據、交易哈希）
- ✅ 自動更新 `total_bets` 表（all/week/month/season）

---

## 修復後流程

```
1. VIP & 投注限制檢查
2. 餘額檢查
3. 扣除賭注 (kv)
4. 執行遊戲邏輯 (GameManager.resolveXXX)
5. 鏈上結算 (OnchainSettlementManager.settleGame)
6. 記錄遊戲會話 (GameSessionManager.recordGame) ✅ 新增
7. 更新餘額與總投注 (kv)
8. 保存交易意圖與記錄 ops event
```

---

## 測試驗證步驟

1. 玩一局 slots (或其他遊戲)
2. 檢查 `game_sessions` 表是否有新記錄
3. 檢查 `total_bets` 表的 `period_type='all'` 是否有累加
4. 檢查排行榜 API `/api/v1/leaderboard` 是否返回數據

---

## 相關檔案

- **修復檔案**: `apps/api/src/routes/v1/games.ts` (第 159-198 行)
- **Manager**: `packages/domain/src/games/game-session-manager.ts`
- **Schema**: `packages/infrastructure/src/db/schema.ts` (第 228-242, 267-280 行)
