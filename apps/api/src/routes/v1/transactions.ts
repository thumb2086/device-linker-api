import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { TransactionManager } from "@repo/domain";
import { WalletRepository, MarketRepository } from "@repo/infrastructure";

export async function transactionRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const transactionManager = new TransactionManager();
  const walletRepo = new WalletRepository();
  const marketRepo = new MarketRepository();

  typedFastify.get("/public", {
    schema: {
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
      }).optional(),
    },
  }, async (request) => {
    const limit = request.query?.limit ?? 50;
    const [walletEntries, marketTrades] = await Promise.all([
      walletRepo.listLedgerEntries({ limit }),
      marketRepo.listTrades({ limit }),
    ]);

    const items = transactionManager.buildPublicFeed(walletEntries.map((entry: any) => ({
      ...entry,
      token: entry.token === "yjc" ? "YJC" : "ZXC",
      amount: Number(entry.amount),
    })), marketTrades, limit);

    return createApiEnvelope({ items }, request.id);
  });
}
