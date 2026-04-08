import { randomUUID } from "crypto";
import { kv } from "@repo/infrastructure";
import type { DashboardFilter, TransactionView } from "../types/transaction.js";

const KEY = "onchain:transactions:v1";

export class TransactionRepository {
  async saveTransactionRecord(view: Omit<TransactionView, "id" | "createdAt" | "updatedAt"> & Partial<Pick<TransactionView, "id" | "createdAt" | "updatedAt">>): Promise<TransactionView> {
    const idempotencyKey = view.extensionMetadata?.idempotencyKey as string | undefined;
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const now = new Date();
    const record: TransactionView = {
      ...view,
      id: view.id || randomUUID(),
      createdAt: view.createdAt || now,
      updatedAt: view.updatedAt || now,
    };

    await kv.lpush(KEY, record);
    await kv.ltrim(KEY, 0, 4999);
    console.log("[on-chain][tx-record]", {
      settlementId: record.settlementId,
      roundId: record.roundId,
      txHash: record.txHash,
      status: record.status,
      idempotencyKey,
    });
    return record;
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<TransactionView | null> {
    const list = await kv.lrange<TransactionView>(KEY, 0, -1);
    return list.find((item) => item.extensionMetadata?.idempotencyKey === idempotencyKey) || null;
  }

  async getTransactionById(id: string): Promise<TransactionView | null> {
    const list = await kv.lrange<TransactionView>(KEY, 0, -1);
    return list.find((item) => item.id === id) || null;
  }

  async getTransactions(filter: DashboardFilter): Promise<{ items: TransactionView[]; total: number }> {
    const list = await kv.lrange<TransactionView>(KEY, 0, -1);
    const filtered = list.filter((item) => {
      if (filter.status?.length && !filter.status.includes(item.status)) return false;
      if (filter.userAddress && item.userAddress.toLowerCase() !== filter.userAddress.toLowerCase()) return false;
      if (filter.gameType && item.gameType !== filter.gameType) return false;
      if (filter.startDate && new Date(item.createdAt) < filter.startDate) return false;
      if (filter.endDate && new Date(item.createdAt) > filter.endDate) return false;
      return true;
    });

    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(200, filter.limit || 20));
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return { items, total: filtered.length };
  }

  async getSummary(userAddress?: string): Promise<{ total: number; confirmed: number; failed: number; pending: number; successRate: number }> {
    const list = await kv.lrange<TransactionView>(KEY, 0, -1);
    const scoped = userAddress
      ? list.filter((item) => item.userAddress.toLowerCase() === userAddress.toLowerCase())
      : list;

    const total = scoped.length;
    const confirmed = scoped.filter((x) => x.status === "confirmed").length;
    const failed = scoped.filter((x) => x.status === "failed").length;
    const pending = scoped.filter((x) => x.status === "pending" || x.status === "broadcasted").length;
    const successRate = total > 0 ? confirmed / total : 0;
    return { total, confirmed, failed, pending, successRate };
  }
}
