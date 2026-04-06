# Phase 1-5 開發總覽

## 專案名稱: device-linker-api

**最後更新**: 2025-04-06

---

## Phase 1: 基礎架構與認證系統

### 目標
建立專案基礎架構、資料庫連線、使用者認證與錢包管理。

### 主要功能
- ✅ Monorepo 架構設定 (Turborepo)
- ✅ PostgreSQL 資料庫連線 (Drizzle ORM)
- ✅ 使用者註冊/登入/登出
- ✅ Session 管理 (Redis KV)
- ✅ 託管錢包生成 (私鑰加密儲存)
- ✅ 錢包餘額查詢與轉帳

### 關鍵檔案
- `packages/infrastructure/src/db/index.ts` - 資料庫連線
- `packages/infrastructure/src/db/schema.ts` - 資料表結構
- `apps/api/src/routes/v1/auth.ts` - 認證路由
- `apps/api/src/routes/v1/wallet.ts` - 錢包路由

### 資料表
- `users` - 使用者基本資料
- `sessions` - 登入 session
- `custody_accounts` - 託管帳號密碼
- `wallet_accounts` - 錢包餘額

---

## Phase 2: 遊戲核心與結算系統

### 目標
實作 12 款遊戲邏輯、遊戲結算與投注管理。

### 主要功能
- ✅ 12 款遊戲邏輯 (slots, coinflip, roulette, horse, sicbo, bingo, duel, blackjack, crash, poker, bluffdice, shoot_dragon_gate)
- ✅ 遊戲房間管理 (RoomManager)
- ✅ VIP 等級與投注限制
- ✅ 鏈上結算整合 (OnchainSettlementManager)
- ✅ 交易意圖與收據追踨

### 關鍵檔案
- `packages/domain/src/games/game-manager.ts` - 遊戲邏輯
- `packages/domain/src/games/game-session-manager.ts` - 遊戲會話
- `packages/domain/src/settlement/onchain-settlement-manager.ts` - 鏈上結算
- `packages/domain/src/wallet/onchain-wallet-manager.ts` - 鏈上錢包

### 資料表
- `game_sessions` - 遊戲結果記錄
- `total_bets` - 累計投注統計
- `game_rounds` - 遊戲回合資訊
- `tx_intents` - 交易意圖
- `tx_attempts` - 交易嘗試
- `tx_receipts` - 交易收據

---

## Phase 3: 前端介面與資料整合

### 目標
完成前端 SPA 所有功能頁面，整合真實資料，移除硬編碼內容。

### 主要功能
- ✅ React SPA 路由架構
- ✅ 12 款遊戲前端介面
- ✅ 錢包、市場、公告、排行榜頁面
- ✅ VIP 與獎勵系統
- ✅ 系統健康監控頁面

### 關鍵修復 (2025-04-06)

#### 1. 服務狀態真實化
**問題**: HealthView 和 PublicTransactionsView 使用硬編碼假數據

**修復**:
- 修改 `/stats/health` API 從 `ops_events` 即時聚合
- 24 小時成功率、失敗率、活躍用戶數
- 每小時柱狀圖數據

**檔案**:
- `apps/api/src/routes/v1/stats.ts`

#### 2. 公告顯示修復
**問題**: 只顯示 `is_active=true` 的公告，歷史公告消失

**修復**:
- API 回傳所有公告（包含非活動中）
- 新增 `listAllAnnouncements()` 方法

**檔案**:
- `apps/api/src/routes/v1/announcements.ts`
- `packages/infrastructure/src/db/index.ts`

#### 3. 開發中頁面標示
**問題**: Support、Admin 等頁面有無功能區塊造成困惑

**修復**:
- 新增 `UnderConstruction.tsx` 組件
- SupportView 移除假客服聊天與系統協定
- AdminView 標示 DEMO 數據

**檔案**:
- `apps/web/src/components/UnderConstruction.tsx`
- `apps/web/src/features/support/SupportView.tsx`
- `apps/web/src/features/admin/AdminView.tsx`

#### 4. 🚨 GameSessionManager.recordGame() 缺失 (P0 緊急 - 已修復)
**問題**: 主遊戲路由 `games.ts` 沒有呼叫 `GameSessionManager.recordGame()`

**影響**:
- ❌ 遊戲結果不寫入 `game_sessions`
- ❌ `total_bets` 不更新
- ❌ 排行榜永遠是空的

**修復**:
- 在 `games.ts` 整合 `GameSessionManager.recordGame()`
- 在鏈上結算後記錄遊戲結果
- 錯誤處理不影響遊戲流程

**檔案**:
- `apps/api/src/routes/v1/games.ts`

**詳情**: 見 `docs/PHASE3_URGENT_GAMERECORD_ISSUE.md`

#### 5. 🚨 分局遊戲 roundId 不匹配問題 (P0 緊急 - 已修復)
**問題**: 5 個分局遊戲（coinflip, roulette, horse, sicbo, bingo）前端顯示 "目前下注：反(#undefined)"

**原因**:
- 後端錯誤響應格式不符合 API 規範（error 應為 string，但傳遞了 object）
- 前端未正確處理 roundId 缺失情況

**修復**:
- 修復 5 個分局遊戲後端錯誤響應格式，統一使用 `createApiEnvelope(data, requestId, success, error)` 格式
- 前端添加 roundId 防禦性檢查，缺失時顯示 "未知"
- 確保所有錯誤響應都包含正確的 roundId 信息

**修復的遊戲**:
- ✅ coinflip
- ✅ roulette
- ✅ horse
- ✅ sicbo
- ✅ bingo

**檔案**:
- `apps/api/src/routes/v1/games/coinflip.ts`
- `apps/api/src/routes/v1/games/roulette.ts`
- `apps/api/src/routes/v1/games/horse.ts`
- `apps/api/src/routes/v1/games/sicbo.ts`
- `apps/api/src/routes/v1/games/bingo.ts`
- `apps/web/src/features/casino/CoinflipView.tsx`

#### 6. 🚨 即時遊戲錯誤響應格式統一 (P0 緊急 - 已修復)
**問題**: 7 個即時遊戲（shoot-dragon-gate, slots, blackjack, crash, duel, poker, bluffdice）錯誤響應格式不符合 API 規範

**原因**:
- 後端錯誤響應格式不符合 API 規範（error 應為 string，但傳遞了 object）

**修復**:
- 修復 7 個即時遊戲後端錯誤響應格式，統一使用 `createApiEnvelope(data, requestId, success, error)` 格式
- 確保所有遊戲的錯誤響應格式一致

**修復的遊戲**:
- ✅ shoot-dragon-gate
- ✅ slots
- ✅ blackjack
- ✅ crash
- ✅ duel
- ✅ poker
- ✅ bluffdice

**檔案**:
- `apps/api/src/routes/v1/games/shoot-dragon-gate.ts`
- `apps/api/src/routes/v1/games/slots.ts`
- `apps/api/src/routes/v1/games/blackjack.ts`
- `apps/api/src/routes/v1/games/crash.ts`
- `apps/api/src/routes/v1/games/duel.ts`
- `apps/api/src/routes/v1/games/poker.ts`
- `apps/api/src/routes/v1/games/bluffdice.ts`

**結算流程確認**:
所有 7 個即時遊戲的結算流程都正確：
- ✅ 使用 gameSettlement.validateAndDeductBalance
- ✅ 使用 gameSettlement.executeSettlement
- ✅ 使用 gameSettlement.creditPayout
- ✅ 使用 gameSettlement.updateTotalBet
- ✅ 使用 GameSessionManager.recordGame
- ✅ 使用 gameSettlement.logGameEvent
- ✅ 使用 gameSettlement.saveRound

#### 7. 🎨 前端視覺效果增強 (P1 重要 - 進行中)
**目標**: 為遊戲添加視覺效果，提升用戶體驗

**已實作**:
- ✅ 創建籌碼動畫組件 (ChipAnimation.tsx)
- ✅ 在 CoinflipView 添加 ALL IN 按鈕
- ✅ 在 CoinflipView 集成籌碼飛入動畫

**檔案**:
- `apps/web/src/components/ChipAnimation.tsx` (新增)
- `apps/web/src/components/ChipAnimation.css` (新增)
- `apps/web/src/features/casino/CoinflipView.tsx`

**功能說明**:
- **籌碼動畫**: 下注時籌碼從按鈕飛向遊戲區域，帶有拋物線效果
- **ALL IN 按鈕**: 一鍵將餘額全部設定為下注金額

**待完成**:
- 🔄 在其他遊戲添加 ALL IN 按鈕和籌碼動畫（roulette, slots, crash, blackjack 等）

#### 8. 🧹 儲存庫清理 (P1 重要 - 已完成)
**目標**: 清理專案中的測試檔和未使用的臨時檔案

**測試檔案狀態**:
- ✅ 保留：`packages/domain/tests/` 下的單元測試（測試核心業務邏輯）
- ✅ 保留：`packages/infrastructure/tests/db.test.ts`（測試資料庫配置）

**已刪除的臨時檔案**:
- ✅ `main-auto-round.js` - 舊版自動回合邏輯（已遷移至 auto-round.ts）
- ✅ `main-coinflip.js` - 舊版擲幣遊戲處理器
- ✅ `main-game-clean.js` - 臨時遊戲清理腳本
- ✅ `tmp-main-game.js` - 臨時主遊戲腳本
- ✅ `data/__pycache__/` - Python 快取目錄
- ✅ `data/import_new.py` - 臨時資料導入腳本
- ✅ `data/redis_export.json` - 臨時 Redis 導出數據（8MB）
- ✅ `git_status.txt` - 臨時 Git 狀態檔案
- ✅ `data/` - 已清空並刪除空目錄
- ✅ `test-results/` - 已清空並刪除空目錄

**清理結果**:
- 刪除了 4 個舊版 JS 腳本檔案
- 刪除了 data 目錄下的臨時檔案（~8MB）
- 刪除了 2 個空目錄
- 保留了所有有用的單元測試檔案

---

## Phase 4: 市場與交易系統

### 目標
實作代幣市場、交易對、價格圖表。

### 規劃功能
- 🔄 市場指數與趨勢
- 🔄 恐懼貪婪指數
- 🔄 個股/代幣交易
- 🔄 銀行存提款
- 🔄 資產淨值計算

### 目前狀態
- `MarketView.tsx` 已有 UI 但需確認 API 整合
- 需實作市場數據 API

---

## Phase 5: 營運與監控系統

### 目標
完整後台管理、客服系統、系統監控。

### 規劃功能
- 🔄 Admin 儀表板（真實數據）
- 🔄 用戶管理（黑名單、餘額調整）
- 🔄 公告管理
- 🔄 即時客服聊天
- 🔄 工單系統
- 🔄 系統協定文件
- 🔄 營運事件追踨 (ops_events)

### 目前狀態
- Admin 頁面顯示 DEMO 數據（需後端 API）
- Support 頁面標示開發中
- `ops_events` 已實作並寫入數據

---

## 已完成資料表總覽

| 資料表 | 用途 | 狀態 |
|--------|------|------|
| users | 使用者資料 | ✅ |
| sessions | 登入 session | ✅ |
| custody_accounts | 託管帳號 | ✅ |
| wallet_accounts | 錢包餘額 | ✅ |
| game_sessions | 遊戲記錄 | ✅ |
| total_bets | 投注統計 | ✅ |
| game_rounds | 遊戲回合 | ✅ |
| tx_intents | 交易意圖 | ✅ |
| tx_attempts | 交易嘗試 | ✅ |
| tx_receipts | 交易收據 | ✅ |
| ops_events | 營運事件 | ✅ |
| announcements | 公告 | ✅ |
| support_tickets | 客服工單 | ✅ |
| kv_store | KV 快取 | ✅ |

---

## 下一步優先級

### 🔴 P0 - 最緊急
（已清空 - 所有 P0 問題已修復）

### 🟡 P1 - 重要
1. Admin 頁面真實數據 API
3. Support 客服系統實作
4. 市場交易 API

### 🟢 P2 - 次要
5. 優化前端效能
6. 增加更多遊戲統計圖表
7. 多語言完善

---

## 相關文件

- `docs/PHASE3_URGENT_GAMERECORD_ISSUE.md` - P0 問題詳細報告
- `docs/DB_SCHEMA_REFERENCE.md` - 資料庫結構參考
