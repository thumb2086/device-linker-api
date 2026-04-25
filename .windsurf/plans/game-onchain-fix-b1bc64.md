# 12項遊戲上鏈邏輯修復計劃 (Hybrid Approach)

針對12項遊戲API路由進行徹底修復，採用混合架構：保留個別遊戲路由的特定邏輯，但共享統一的上鏈結算基礎設施。

---

## 問題總結

1. **個別遊戲路由 (12個文件)**：
   - 僅記錄遊戲結果到數據庫，**無任何上鏈結算邏輯**
   - 無法處理代幣轉移 (ZXC/YJC)
   - 無VIP限額檢查
   - 無KV餘額扣減/增加
   - 在 `index.ts` 中被註釋掉，無法訪問

2. **統一遊戲路由 (`games.ts`)**：
   - 已實現完整上鏈結算 (`OnchainSettlementManager`)
   - 支援VIP檢查、KV餘額管理、交易記錄
   - **缺少第12個遊戲 `dragon` (射龍門) 的處理邏輯**

---

## 修復方案

### 架構設計

```
┌─────────────────────────────────────────────────────────────┐
│  個別遊戲路由 (保持特定遊戲邏輯)                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐         ┌─────────┐       │
│  │ slots   │ │coinflip │ │roulette │   ...   │ dragon  │       │
│  └────┬────┘ └────┬────┘ └────┬────┘         └────┬────┘       │
│       │           │           │                   │           │
│       └───────────┴───────────┴───────────────────┘           │
│                   ↓                                          │
│           UnifiedGameSettlement                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  1. KV餘額檢查與扣減 (bet)                            │    │
│  │  2. VIP限額檢查 (assertVipBetLimit)                  │    │
│  │  3. 調用 OnchainSettlementManager                   │    │
│  │     - 執行鏈上押注轉移                               │    │
│  │     - 執行鏈上派彩轉移 (如贏)                        │    │
│  │     - 記錄交易意圖與收據                            │    │
│  │  4. KV餘額增加 (payout)                              │    │
│  │  5. 記錄遊戲會話到數據庫                             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 具體步驟

#### Step 1: 創建統一結 settlement 包裝器

**文件**: `apps/api/src/utils/game-settlement.ts`

封裝通用的 settlement 流程：
- `validateAndDeductBalance()` - KV餘額檢查與扣減
- `executeSettlement()` - 調用 OnchainSettlementManager
- `creditPayout()` - KV餘額增加
- `recordGameSession()` - 記錄到數據庫
- `handleError()` - 錯誤處理與回滾

#### Step 2: 重構12個個別遊戲路由

每個遊戲路由文件需要：
1. **引入 settlement 包裝器**
2. **修改 play endpoint**:
   - 添加 `token` 參數到 schema (zhixi/yjc)
   - 調用 `validateAndDeductBalance()` 進行餘額檢查
   - 執行遊戲邏輯 (保留現有)
   - 調用 `executeSettlement()` 進行鏈上結算
   - 返回包含 `betTxHash` 和 `payoutTxHash` 的結果

#### Step 3: 修復統一 games.ts 路由

1. **添加 dragon 遊戲處理邏輯**到 switch case
2. **優化錯誤處理** - 確保 settlement 失敗時正確回滾KV餘額

#### Step 4: 啟用個別遊戲路由

**文件**: `apps/api/src/index.ts`
- 取消註釋12個遊戲路由註冊
- 調整路由前綴避免衝突 (如 `/api/v1/games/slots`)

#### Step 5: 移除統一 endpoint (可選)

如果個別路由完全修復後，可選擇：
- 保留統一 endpoint 作為備用
- 或完全移除以避免API混亂

---

## 文件修改清單

### 新增文件
1. `apps/api/src/utils/game-settlement.ts` - 統一結算包裝器

### 修改文件 (12個遊戲路由)
2. `apps/api/src/routes/v1/games/slots.ts`
3. `apps/api/src/routes/v1/games/coinflip.ts`
4. `apps/api/src/routes/v1/games/roulette.ts`
5. `apps/api/src/routes/v1/games/horse.ts`
6. `apps/api/src/routes/v1/games/sicbo.ts`
7. `apps/api/src/routes/v1/games/bingo.ts`
8. `apps/api/src/routes/v1/games/duel.ts`
9. `apps/api/src/routes/v1/games/blackjack.ts`
10. `apps/api/src/routes/v1/games/crash.ts`
11. `apps/api/src/routes/v1/games/poker.ts`
12. `apps/api/src/routes/v1/games/bluffdice.ts`
13. `apps/api/src/routes/v1/games/shoot-dragon-gate.ts`

### 修改文件 (核心)
14. `apps/api/src/routes/v1/games.ts` - 添加 dragon 處理
15. `apps/api/src/index.ts` - 啟用個別路由

---

## 預期結果

修復後，每個遊戲路由將：
1. 支援 `token` 參數選擇 ZXC/YJC
2. 檢查並扣減 KV 餘額
3. 執行實際鏈上交易 (押注→派彩)
4. 返回交易哈希 (`betTxHash`, `payoutTxHash`)
5. 記錄完整的交易意圖和收據
6. 支援 VIP 限額檢查

---

## 風險與注意事項

1. **向後兼容性**: 添加 `token` 參數為可選，默認 zhixi
2. **錯誤回滾**: 確保 settlement 失敗時正確恢復 KV 餘額
3. **重複扣款**: 使用 `roundId` 確保冪等性，防止重複結算
4. **測試**: 需要完整測試每個遊戲的贏/輸/錯誤場景
