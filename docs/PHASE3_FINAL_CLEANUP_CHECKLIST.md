# Phase 3 Final Cleanup Checklist

更新日期：2026-04-30

## 目標

讓 Phase 3 後端、前端與文件回到可重建、可驗證、可部署的狀態。舊版 checklist 假設 `@repo/on-chain`、`@repo/domain`、`@repo/infrastructure` source 都存在；目前 repo 狀態不符合該假設，因此 checklist 先以恢復完整 workspace 為第一優先。

## P0：恢復可 build 狀態

- [ ] 恢復 `packages/domain` source 與 package.json。
- [ ] 恢復 `packages/infrastructure` source 與 package.json。
- [ ] 恢復 `packages/on-chain` source 與 package.json，或移除所有 `@repo/on-chain` imports。
- [ ] 修正 `pnpm-workspace.yaml` 與 lockfile，使 workspace package 與實際目錄一致。
- [ ] 修正會造成 TypeScript parse error 的亂碼 string literal。
- [ ] 執行並通過 `pnpm install`。
- [ ] 執行並通過 `pnpm --filter @repo/shared build`。
- [ ] 執行並通過 `pnpm --filter @repo/web build`。
- [ ] 執行並通過 `pnpm --filter @repo/api build`。
- [ ] 執行並通過 `pnpm --filter @repo/worker start` 的 dry-run 或等效 smoke check。

## P1：Settlement 與資料一致性

- [ ] 確認每個 game route 都會寫入 round/history。
- [ ] 確認 `GameSessionManager.recordGame()` 對 12 個遊戲都會更新 total bet。
- [ ] 確認 async settlement failure 會產生 ops event，且不吞掉 payout failure。
- [ ] 確認 prevent-loss buff 在 settlement 失敗時 rollback。
- [ ] 確認 `settlementId`, `roundId`, `txIntentId`, `txHash`, `requestId` 都能在 ops/tx tables 對上。
- [ ] 補 idempotency 測試：同一 `roundId` 重送不會重複扣款或派彩。

## P1：部署設定

- [ ] Vercel：確認 `outputDirectory=apps/web/dist` 與 root `pnpm build` 符合需求。
- [ ] Render：修正 `buildCommand` 與 `startCommand`。目前 `pnpm migrate:neon` 與 `pnpm start` 不存在於 root package.json。
- [ ] 若 API 要獨立部署，補 API-specific build/start script。
- [ ] 列出 production 必填 env var，包含 DB、KV、RPC、admin private key、token contract address、ADMIN_ADDRESS。

## P2：文件與 UI 文案

- [x] 重寫 API 文件，移除亂碼與過期 route。
- [x] 重寫 DB schema reference，標註目前缺失的 schema source 限制。
- [x] 重寫 Phase 狀態與 cleanup checklist。
- [ ] 清理 `packages/shared/src/constants.ts` 與 `packages/shared/src/constants/chests.ts` 內的亂碼文案。
- [ ] 清理前端 locales 與 component 中的亂碼文案。
- [ ] 建立一份部署 runbook。

## 驗證命令

完成 P0 後建議固定跑：

```bash
pnpm install
pnpm --filter @repo/shared build
pnpm --filter @repo/web build
pnpm --filter @repo/api build
pnpm build
```

2026-04-30 實測：

- [x] `pnpm build` 通過。
- [x] `git diff --check` 通過。
- [ ] `pnpm --filter @repo/api build` 未通過，原因是缺失 workspace package 與後續 strict TS 錯誤。

若要驗證前端：

```bash
pnpm --filter web dev
```

若要驗證 API：

```bash
pnpm --filter @repo/api dev
curl http://localhost:3000/health
```
