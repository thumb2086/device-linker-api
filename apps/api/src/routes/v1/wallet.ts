import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { WalletManager } from "@repo/domain";
import { WalletRepository, OpsRepository } from "@repo/infrastructure";

export async function walletRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletManager = new WalletManager();
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();

  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/summary", {
    schema: {
      querystring: z.object({
        token: z.enum(["ZXC", "YJC"]),
      }),
    },
  }, async (request) => {
    const { token } = request.query;
    const account = walletManager.createAccount(mockUserId, token);
    return createApiEnvelope({ account }, request.id);
  });

  typedFastify.post("/withdrawals", {
    schema: {
      body: z.object({
        token: z.enum(["ZXC", "YJC"]),
        amount: z.string(),
      }),
    },
  }, async (request) => {
    const { token, amount } = request.body;
    const intent = walletManager.createTxIntent(mockUserId, token, "withdrawal", amount);

    try {
      await walletRepo.saveTxIntent(intent);
      await opsRepo.logEvent({
        channel: "wallet",
        severity: "info",
        source: "withdrawal",
        kind: "intent_created",
        userId: mockUserId,
        txIntentId: intent.id,
        token,
        requestId: request.id,
        message: `Withdrawal intent created for ${amount} ${token}`,
      });
    } catch (err) {
      fastify.log.error(err);
    }

    return createApiEnvelope({ intent }, request.id);
  });
}
