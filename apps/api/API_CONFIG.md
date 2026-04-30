# API 配置文檔

本文檔記錄 zixi-casino API 的所有端點和配置資訊。

## 部署資訊

| 環境 | URL |
|------|-----|
| 生產環境 | `https://zixi-casino.vercel.app/` |
| 本地開發 | `http://localhost:3000` |

## API 端點總覽

### Legacy API（向後兼容）

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/user` | POST/GET | 用戶認證、session 管理 |
| `/api/wallet` | POST | 錢包餘額、轉帳、空投 |

### V1 API（推薦使用）

| 端點 | 說明 |
|------|------|
| `/api/v1/auth` | 認證相關 |
| `/api/v1/wallet` | 錢包操作 |
| `/api/v1/games` | 遊戲列表與操作 |
| `/api/v1/games/*` | 各別遊戲端點 |
| `/api/v1/market` | 市場模擬 |
| `/api/v1/me` | 當前用戶資訊 |
| `/api/v1/stats` | 統計數據 |
| `/api/v1/leaderboard` | 排行榜 |
| `/api/v1/vip` | VIP 系統 |
| `/api/v1/admin` | 管理功能 |

### 健康檢查

| 端點 | 說明 |
|------|------|
| `/health` | 服務健康狀態 |
| `/api/diag` | 資料庫診斷 |
| `/api/diag-thumb` | Thumb 用戶診斷 |

## 專案整合

### Flutter App 串接

- **專案**: [zixi-wallet-frontend](../flutter_app/)
- **Base URL**: `https://zixi-casino.vercel.app/api/`
- **主要端點**: `/api/user`, `/api/wallet`

### 前端 Web 串接

- **專案**: [apps/web](../web/)
- **API 路徑**: `/api/v1/*`

## 環境變數

```bash
# 資料庫
DATABASE_URL=postgresql://...

# Redis/KV
KV_URL=redis://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...

# 區塊鏈
RPC_URL=https://...
PRIVATE_KEY=...

# 其他
ETHERSCAN_API_KEY=...
```

## 相關專案

- [zixi-wallet-frontend](https://github.com/thumb2086/zixi-wallet-frontend) - Flutter 手機應用
- [zixi-casino/apps/web](../web/) - Web 前端
