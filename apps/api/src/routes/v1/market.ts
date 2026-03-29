import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { MarketManager } from "@repo/domain";
import { SessionRepository, UserRepository, MarketRepository, kv } from "@repo/infrastructure";
import { randomUUID } from "crypto";

export async function marketRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const marketManager = new MarketManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const marketRepo = new MarketRepository();

  const loadCompatibleAccount = async (address: string, userId: string) => {
    const dbAccount = await marketRepo.getAccount(address);
    if (dbAccount) return dbAccount;

    const [legacyPrimary, legacyFallback] = await Promise.all([
      kv.get<any>(`market:${address}`),
      kv.get<any>(`market_sim:${address}`),
    ]);
    const legacy = legacyPrimary || legacyFallback;
    if (!legacy) return null;

    const normalized = marketManager.normalizeAccount(legacy);
    await marketRepo.saveAccount(address, userId, normalized);
    return normalized;
  };

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  typedFastify.get("/snapshot", async (request) => {
    const snapshot = marketManager.buildSnapshot();
    await marketRepo.saveMarketSnapshot(snapshot);
    return createApiEnvelope({ snapshot }, request.id);
  });

  typedFastify.get("/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const snapshot = marketManager.buildSnapshot();
    const account = await loadCompatibleAccount(ctx.session.address, ctx.user.id);
    const normalized = marketManager.normalizeAccount(account);
    marketManager.settleLiquidations(normalized, snapshot);
    await marketRepo.saveAccount(ctx.session.address, ctx.user.id, normalized);
    return createApiEnvelope({ account: marketManager.buildAccountSummary(normalized, snapshot) }, request.id);
  });

  typedFastify.post("/action", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        type: z.enum(["stock_buy", "stock_sell", "bank_deposit", "bank_withdraw", "loan_borrow", "loan_repay", "futures_open", "futures_close"]),
        symbol: z.string().optional(),
        amount: z.string().optional(),
        quantity: z.string().optional(),
        side: z.enum(["long", "short"]).optional(),
        leverage: z.string().optional(),
        positionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { type, symbol, amount, quantity, side, leverage, positionId } = request.body;
    const snapshot = marketManager.buildSnapshot();
    const account = marketManager.normalizeAccount(await loadCompatibleAccount(ctx.session.address, ctx.user.id));
    marketManager.settleLiquidations(account, snapshot);

    let result: any;
    try {
      if (type === "stock_buy") result = marketManager.buyStock(account, snapshot, symbol, quantity);
      else if (type === "stock_sell") result = marketManager.sellStock(account, snapshot, symbol, quantity);
      else if (type === "bank_deposit") result = marketManager.bankDeposit(account, amount);
      else if (type === "bank_withdraw") result = marketManager.bankWithdraw(account, amount);
      else if (type === "loan_borrow") result = marketManager.borrowLoan(account, snapshot, amount);
      else if (type === "loan_repay") result = marketManager.repayLoan(account, amount);
      else if (type === "futures_open") result = marketManager.openFutures(account, snapshot, { symbol, side, margin: amount, leverage });
      else if (type === "futures_close" && positionId) result = marketManager.closeFutures(account, snapshot, positionId);
      else throw new Error("Unsupported market action payload");
      await marketRepo.saveAccount(ctx.session.address, ctx.user.id, account);
      await marketRepo.saveTrade({
        id: randomUUID(),
        userId: ctx.user.id,
        address: ctx.session.address,
        type,
        symbol: result?.symbol || symbol || null,
        quantity: result?.quantity ?? null,
        price: result?.price ?? result?.entryPrice ?? result?.closePrice ?? null,
        amount: result?.total ?? result?.net ?? result?.amount ?? result?.margin ?? result?.refund ?? null,
        fee: result?.fee ?? null,
        pnl: result?.realizedPnl ?? null,
        meta: result,
        createdAt: new Date(),
      });
      return createApiEnvelope({ success: true, result, account: marketManager.buildAccountSummary(account, snapshot) }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });
}
