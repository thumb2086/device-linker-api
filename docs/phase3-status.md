# Phase 3 Status

## Completed
- Shared on-chain package (`@repo/on-chain`) created and integrated by API/Domain/Worker.
- Dashboard backend APIs online:
  - `GET /api/v1/dashboard/transactions`
  - `GET /api/v1/dashboard/summary`
- Dashboard web page online: `/app/dashboard/transactions`.
- Public transactions page switched to dashboard API data source.
- Transaction recording includes idempotency key checks and reconciliation checkpoint in summary response.

## In progress
- Full removal of remaining legacy settlement code from API/domain wrappers.
- Full game-route unification to DomainService -> OnChainSettlementService.

## Next actions
1. Finish legacy cleanup in `apps/api/src/utils/game-settlement.ts`.
2. Slim `packages/domain/src/settlement/onchain-settlement-manager.ts` to validation-only wrapper.
3. Add end-to-end idempotency tests for duplicate settlement requests.
4. Add automated reconciliation alerting.
