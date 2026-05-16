import { TransactionRepository } from "../repositories/TransactionRepository.js";
import type { DashboardFilter } from "../types/transaction.js";

export class TransactionQueryService {
  constructor(private readonly repo = new TransactionRepository()) {}

  getTransactions(filter: DashboardFilter) {
    return this.repo.getTransactions(filter);
  }

  getTransactionById(id: string) {
    return this.repo.getTransactionById(id);
  }

  getSummary(userAddress?: string) {
    return this.repo.getSummary(userAddress);
  }
}
