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

  const getAccount = async (address: string) => {
    const raw = await marketRepo.getAccount(address);
    return marketManager.normalizeAccount(raw);
  };

  const saveAccount = async (address: string, account: any) => {
    await marketRepo.saveAccount(address, account);
  };

  // ─── Market Data ──────────────────────────────────────────────────────────

  typedFastify.get("/snapshot", async (request) => {
    const snapshot = marketManager.buildSnapshot();
    return createApiEnvelope({ snapshot }, request.id);
  });

  // ─── User Market Account ──────────────────────────────────────────────────

  typedFastify.get("/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const snapshot = marketManager.buildSnapshot();
    const account = await getAccount(ctx.session.address);
    marketManager.settleLiquidations(account, snapshot);
    await saveAccount(ctx.session.address, account);

    const summary = marketManager.buildAccountSummary(account, snapshot);
    return createApiEnvelope({ account: summary }, request.id);
  });

  // ─── Actions (Buy, Sell, Long, Short, Bank, Loan) ─────────────────────────

  typedFastify.post("/action", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        type: z.enum([
            "stock_buy", "stock_sell", 
            "futures_open", "futures_close",
            "bank_deposit", "bank_withdraw",
            "loan_borrow", "loan_repay"
        ]),
        symbol: z.string().optional(),
        amount: z.string().optional(),
        quantity: z.string().optional(),
        side: z.enum(["long", "short"]).optional(),
        leverage: z.string().optional(),
        margin: z.string().optional(),
        positionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { type, symbol, amount, quantity, side, leverage, margin, positionId } = request.body;
    const address = ctx.session.address;
    
    const snapshot = marketManager.buildSnapshot();
    const account = await getAccount(address);
    marketManager.settleLiquidations(account, snapshot);

    let result: any;
    try {
      switch (type) {
        case "stock_buy": result = marketManager.buyStock(account, snapshot, symbol, quantity); break;
        case "stock_sell": result = marketManager.sellStock(account, snapshot, symbol, quantity); break;
        case "futures_open": result = marketManager.openFutures(account, snapshot, { symbol, side, margin, leverage }); break;
        case "futures_close": result = marketManager.closeFutures(account, snapshot, positionId!); break;
        case "bank_deposit": result = marketManager.bankDeposit(account, amount); break;
        case "bank_withdraw": result = marketManager.bankWithdraw(account, amount); break;
        case "loan_borrow": result = marketManager.borrowLoan(account, snapshot, amount); break;
        case "loan_repay": result = marketManager.repayLoan(account, amount); break;
      }
    } catch (e: any) {
      return createApiEnvelope({ error: { message: e.message } }, request.id);
    }

    await saveAccount(address, account);
    
    // Log Ops
    await opsRepo.logEvent({
      channel: "market",
      severity: "info",
      source: "trading",
      kind: type,
      userId: ctx.user.id,
      address,
      message: `Market action ${type} completed`,
      meta: result
    });

    return createApiEnvelope({ success: true, result, summary: marketManager.buildAccountSummary(account, snapshot) }, request.id);
  });
}
