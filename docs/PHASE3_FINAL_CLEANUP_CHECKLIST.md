# Phase 3 Final Cleanup Checklist

## Goal
Remove remaining duplicated/legacy settlement logic and keep `@repo/on-chain` as the only on-chain entry.

## Must-do items
- [ ] Replace direct settlement internals in `apps/api/src/utils/game-settlement.ts` with thin adapter calls to `@repo/on-chain` service methods only.
- [ ] Remove duplicated transfer/fee code from `packages/domain/src/settlement/onchain-settlement-manager.ts` and delegate fully to `@repo/on-chain`.
- [ ] Ensure all 12 game routes only call Domain service -> `@repo/on-chain` (no route-level chain code).
- [ ] Add idempotency guard per `settlementId` so the same settlement cannot be processed twice.
- [ ] Add observability fields in every settlement log/event: `settlementId`, `roundId`, `txHash`, `gameType`, `requestId`.
- [ ] Keep only one source of treasury config (`getOnChainConfig().treasuryAddress`).

## Verification
- [ ] `pnpm -w build` has no TypeScript errors.
- [ ] `pnpm --filter @repo/api build` and `pnpm --filter @repo/on-chain build` pass.
- [ ] smoke test: bet + payout paths generate transaction records and dashboard reflects updates.
