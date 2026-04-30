# API 設定

更新日期：2026-04-30

## 入口

| 環境 | URL |
| --- | --- |
| 本機 API | `http://localhost:3000` |
| 本機 Web | `http://localhost:5173` |
| 前端 production | `https://zixi-casino.vercel.app/` |

`apps/web/vite.config.ts` 會將本機 `/api` proxy 到 `http://localhost:3000`。前端也可使用 `VITE_API_URL` 指向外部 API。

## Route 掛載

所有主要 API 由 `apps/api/src/index.ts` 掛載：

| Prefix | 模組 |
| --- | --- |
| `/api` | legacy user/wallet routes |
| `/api/v1/auth` | 登入、session、custody account |
| `/api/v1/wallet` | 錢包、空投、轉帳、提領、ZXC/YJC conversion |
| `/api/v1/games` | generic game play 與 rooms |
| `/api/v1/games/{game}` | 12 個個別遊戲 route |
| `/api/v1/market` | 市場模擬 |
| `/api/v1/rewards` | catalog、提案、活動、舊寶箱 |
| `/api/v1/chests` | 新寶箱系統 |
| `/api/v1/inventory` | 背包與使用道具 |
| `/api/v1/me` | 使用者 profile/inventory |
| `/api/v1/profile` | username、音效、設定 |
| `/api/v1/stats` | leaderboard 與 health |
| `/api/v1/leaderboard` | 排行榜 |
| `/api/v1/vip` | VIP 狀態與等級表 |
| `/api/v1/danmaku` | 彈幕事件 |
| `/api/v1/support` | 公告、客服單、聊天室 |
| `/api/v1/admin` | 後台管理 |
| `/api/v1/announcements` | 公告相容 route |
| `/api/v1/transactions` | 公開交易 |
| `/api/v1/dashboard` | dashboard 交易與摘要 |

## 驗證方式

大部分 route 接受：

- Header：`x-session-id: <sessionId>`
- Body：`{ "sessionId": "<sessionId>" }`
- Query：`?sessionId=<sessionId>`

Admin route 另外要求 session address 等於 `ADMIN_ADDRESS`。若未設定，程式碼中有 fallback address，但 production 應明確設定環境變數。

## 必要環境變數

| 變數 | 說明 |
| --- | --- |
| `PORT` | API listen port，預設 `3000`。 |
| `NODE_ENV` | 執行環境。 |
| `DATABASE_URL` 或 `POSTGRES_URL` | Postgres connection string。 |
| `KV_URL` | Redis/KV connection string。 |
| `KV_REST_API_URL` | REST KV URL。 |
| `KV_REST_API_TOKEN` | REST KV token。 |
| `RPC_URL` | 鏈上 RPC endpoint。 |
| `PRIVATE_KEY` | 管理錢包 private key，實際名稱依 on-chain package runtime config 為準。 |
| `ADMIN_ADDRESS` | 管理員錢包地址。 |
| `GAME_SETTLEMENT_ASYNC` | 是否啟用 async settlement，預設 true。 |

## 部署設定現況

### Vercel

`vercel.json`：

```json
{
  "buildCommand": "pnpm install && pnpm build",
  "installCommand": "pnpm install",
  "outputDirectory": "apps/web/dist"
}
```

目前 root `pnpm build` 只建置 `@repo/shared` 與 `web`，適合純前端輸出。如果要把 API 一起放入同一部署，需要重新設計 build command 與 serverless entry。

### Render

`render.yaml` 目前設定：

```yaml
buildCommand: npm install -g pnpm && pnpm install && pnpm build
startCommand: pnpm migrate:neon && pnpm start
```

但 root `package.json` 目前沒有 `migrate:neon` 或 `start` script。若要部署 API 到 Render，需要補上 root script 或改成：

```bash
pnpm --filter @repo/api build
pnpm --filter @repo/api start
```

前提是 `@repo/domain`、`@repo/infrastructure`、`@repo/on-chain` workspace source 已恢復。

## 本機啟動

```bash
pnpm install
pnpm --filter @repo/api dev
pnpm --filter web dev
```

health check：

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/diag
```

## 已知阻礙

- `packages/on-chain` 目錄目前不存在。
- `packages/domain` 與 `packages/infrastructure` source 目前未追蹤。
- 沙盒環境可能因 Windows 權限阻擋 `pnpm` 對使用者目錄做 realpath/lstat。
- 部分 source 與舊文件仍有亂碼，需要另開修正文案與 TypeScript parse error 的工作。
