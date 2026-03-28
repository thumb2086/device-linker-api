import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { MarketManager } from "@repo/domain";
import { SessionRepository, UserRepository, MarketRepository, OpsRepository } from "@repo/infrastructure";

export async function marketRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const marketManager = new MarketManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const marketRepo = new MarketRepository();
  const opsRepo = new OpsRepository();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  typedFastify.get("/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const snapshot = marketManager.buildSnapshot();
    const account = await marketRepo.getAccount(ctx.session.address);
    const normalized = marketManager.normalizeAccount(account);
    marketManager.settleLiquidations(normalized, snapshot);
    await marketRepo.saveAccount(ctx.session.address, ctx.user.id, normalized);
    return createApiEnvelope({ account: marketManager.buildAccountSummary(normalized, snapshot) }, request.id);
  });

  typedFastify.post("/action", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        type: z.enum(["stock_buy", "stock_sell", "bank_deposit", "bank_withdraw"]),
        symbol: z.string().optional(),
        amount: z.string().optional(),
        quantity: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { type, symbol, amount, quantity } = request.body;
    const snapshot = marketManager.buildSnapshot();
    const account = marketManager.normalizeAccount(await marketRepo.getAccount(ctx.session.address));

    let result: any;
    try {
      if (type === "stock_buy") result = marketManager.buyStock(account, snapshot, symbol, quantity);
      else if (type === "stock_sell") result = marketManager.sellStock(account, snapshot, symbol, quantity);
      else if (type === "bank_deposit") result = marketManager.bankDeposit(account, amount);
      else if (type === "bank_withdraw") result = marketManager.bankWithdraw(account, amount);
      await marketRepo.saveAccount(ctx.session.address, ctx.user.id, account);
      return createApiEnvelope({ success: true, result }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });
}
