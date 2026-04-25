import { TransactionQueryService } from "./TransactionQueryService.js";

export class DashboardService {
  constructor(private readonly query = new TransactionQueryService()) {}

  async getTransactions(filter: Parameters<TransactionQueryService["getTransactions"]>[0]) {
    return this.query.getTransactions(filter);
  }

  async getTransactionById(id: string) {
    return this.query.getTransactionById(id);
  }

  async getSummary(userAddress?: string) {
    return this.query.getSummary(userAddress);
  }

  async getReconciliationCheckpoint(userAddress?: string) {
    const summary = await this.query.getSummary(userAddress);
    return {
      offchainTotal: summary.total,
      confirmedOnchain: summary.confirmed,
      pendingOrBroadcasted: summary.pending,
      failed: summary.failed,
      delta: summary.total - summary.confirmed - summary.failed - summary.pending,
    };
  }
}
