# 《佑戩幣 VIP 系統開發計畫 (Codex Final)》

## 🪙 1. 鏈上代幣規格（Smart Contract）

- 名稱：佑戩幣（YouJianCoin / YJC）
- 鏈別：Sepolia Testnet
- 標準：ERC-20
- 權限：僅管理員可 `mint` / `burn`
- 初始供給：100,000,000 YJC

### 後端落地狀態

- 已新增 `lib/yjc-vip.js`：
  - `resolveYjcVipStatus(address)`：查鏈上 `balanceOf`
  - `buildYjcVipStatusFromBalance(balance)`：轉為 VIP1/VIP2 結果
  - `convertZxcToYjc(zxc)`：`Math.floor(zxc / 100000000)`
- 若尚未設定 `YJC_CONTRACT_ADDRESS`，系統會安全降級為 `available: false`。

---

## 💎 2. VIP 門檻與權限判定（On-Chain Balance Check）

| 階級 | 持有 YJC 數量 | 兌換來源 (ZXC) | 遊戲權限 |
|---|---:|---:|---|
| VIP 1 | 1 ~ 999 | 1 億 ~ 999 億 | 解鎖一號桌 |
| VIP 2 | >= 1,000 | >= 1,000 億 | 解鎖二號桌、零手續費 |

### 後端落地狀態

- `api/user` 回傳已新增 `yjcVip` 欄位（含 on-chain 可用性、YJC 餘額、VIP 等級）。
- 目前舊有押注等級（totalBet）仍保留，YJC VIP 可逐步接管遊戲桌權限。

---

## 🤖 3. 機器人調度邏輯（Room Manager）

### 目標規則

- 二號桌（VIP2）優先真人，真人加入時 bot 立即讓位。
- 若 VIP2 真人達 6 人，自動擴展 2-B 桌。
- 新桌補滿 bot，等待下一位真人。

### 後端落地狀態

- `lib/room-manager.js` 已升級：
  - `joinVip2Player(playerId)`：VIP2 優先入二號桌，滿桌時自動擴桌
  - `joinPlayer(..., { vip })`：可標記 `vip1` / `vip2`
  - `leavePlayer(playerId)`：真人離桌自動補 bot
  - `getSnapshot()`：輸出 `vip2HumanCount` 監控指標

---

## 🛠️ 4. device-linker-api 整合路徑

1. **Config**：設定 `YJC_CONTRACT_ADDRESS`、`YJC_TOKEN_DECIMALS`。
2. **Login Sync**：每次登入透過 `api/user` 回傳 `yjcVip`。
3. **Table Gate**：遊戲房間接入 `yjcVip.tier.key` 判斷一號桌/二號桌。
4. **兌換流程**：
   - 驗證子熙幣餘額
   - `YJC = floor(ZXC / 100000000)`
   - 後端呼叫合約 mint（管理員私鑰）

---

## 🛡️ 5. 安全與風控

- 出金結算時，管理端確認後執行 burn。
- DB 僅保存 `wallet_address` 與 `real_name` 對應（最小必要原則）。
- 房間監控建議：
  - VIP2 真人占比
  - Bot 回補頻率
  - 兌換/銷毀異常告警

---

## 🚀 執行步驟（Milestones）

1. Deploy：部署 YJC 到 Sepolia。
2. Config：寫入後端合約地址與參數。
3. Mapping：先手動做 8,000 億 ZXC -> 8,000 YJC。
4. Live：開啟二號桌 VIP2 檢查。
5. Ops：開啟管理端 burn 流程與風控告警。
