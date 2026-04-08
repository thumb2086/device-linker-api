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
}
