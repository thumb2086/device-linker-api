import type { SettlementRequest, TransactionResult } from "../types/index.js";

export interface OnChainSettlementService {
  settle(request: SettlementRequest): Promise<TransactionResult[]>;
}
