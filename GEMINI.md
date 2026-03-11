# Gemini Project Mandates

## 核心結算架構 (Refactor Stage 2+)
- **統一結算**：所有涉及 Token 轉移的 API（包括遊戲、錢包 `import/withdraw`、市場模擬、獎勵系統）必須統一使用 `lib/settlement-service.js` 中的 `settlementService.settle()`。
- **移除 Legacy 鎖定**：不再使用 `lib/tx-lock.js` 中的 `withQueuedChainTxLock`。交易的序列化與互斥鎖現在由 `SettlementService` 內部的 `Redlock` 機制處理。
- **功能範圍**：`pool-duel` (撞球對戰) 已被徹底移除，不應再出現相關邏輯。

## API 性能優化標準
- **實例重用**：禁止在 API 處理器內部重複 `new ethers.JsonRpcProvider()` 或 `new ethers.Contract()`。應重用模組層級或共享的實例。
- **精度快取**：Token 的 `decimals()` 應在啟動時或首次獲取後快取，避免每次請求都進行鏈上查詢。
- **並行查詢**：使用 `Promise.all()` 並行處理 KV 存取 (Vercel KV) 與區塊鏈查詢，提升 API 反應速度。
- **Session 檢查**：API 應在執行重型邏輯前先進行黑名單與 Session 狀態的預檢。
