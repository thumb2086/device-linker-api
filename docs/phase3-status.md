# Phase 3 狀態

更新日期：2026-04-30

## 已完成或已存在

- React SPA 主路由已存在於 `apps/web/src/App.tsx`。
- 登入後 flow 包含大廳、遊戲、錢包、市場、獎勵、活動、排行榜、公告、客服、背包、管理、設定、交易與健康頁。
- Fastify v1 API 已掛載 auth、wallet、games、market、rewards、me、stats、admin、support、profile、announcements、transactions、dashboard、leaderboard、vip、danmaku、chests、inventory。
- 12 個主要遊戲均有個別 `/play` 與 `/history` route。
- Dashboard route 已存在：`/api/v1/dashboard/transactions` 與 `/api/v1/dashboard/summary`。
- 新寶箱與 inventory route 已存在，並含 daily free chest、pity、rollback 設計。

## 部分完成

- 遊戲 settlement wrapper 已存在，並支援 async intent queue、tx event、prevent-loss buff rollback。
- Wallet route 已包含鏈上餘額讀取、airdrop、transfer、withdrawal、ZXC/YJC conversion。
- Market route 已包含 snapshot、帳戶摘要、現貨/銀行/貸款/期貨 action。
- Admin route 已包含大部分營運功能，但仰賴 `ADMIN_ADDRESS` 與 session address 比對。

## 主要阻礙

- `apps/api` 與 `apps/worker` 依賴 `@repo/domain`、`@repo/infrastructure`、`@repo/on-chain`。
- `pnpm-lock.yaml` 宣告 `packages/on-chain`，但目前目錄不存在。
- `packages/domain` 與 `packages/infrastructure` 目前沒有被 git 追蹤的 source 檔，只剩被 ignore 的空 `dist`/`node_modules` 結構。
- 舊文件與部分 source comments/strings 有編碼亂碼，需逐步清理。

## 本次驗證

- `pnpm build` 通過，實際範圍是 `@repo/shared build` 與 `web build`。
- `pnpm --filter @repo/api build` 未通過，主要錯誤是找不到 `@repo/domain`、`@repo/infrastructure`、`@repo/on-chain`；另有少量 strict TypeScript 錯誤，例如 nullable string 與 implicit any。
- `git diff --check` 通過。

## 下一步

1. 恢復或重建 `packages/domain`、`packages/infrastructure`、`packages/on-chain` source。
2. 讓 root build script 覆蓋 shared、web、api、worker，或明確拆成 `build:web` 與 `build:api`。
3. 修正部署設定：`render.yaml` 使用了目前不存在的 `pnpm migrate:neon` 與 `pnpm start`。
4. 清理亂碼常數與 UI 文案，優先處理會破壞 TypeScript string literal 的檔案。
5. 補 API/worker build 驗證與一條 smoke test：登入、wallet summary、單局遊戲、history、dashboard transaction。
