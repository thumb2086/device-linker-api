import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { MarketManager, OnchainWalletManager } from "@repo/domain";
import { ChainClient, SessionRepository, UserRepository, MarketRepository, WalletRepository, kv } from "@repo/infrastructure";
import { randomUUID } from "crypto";

export async function marketRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const marketManager = new MarketManager();
  const onchainManager = new OnchainWalletManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const marketRepo = new MarketRepository();
  const walletRepo = new WalletRepository();

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

  const isWalletBackedEmptyAccount = (account: any) => (
    Number(account?.bankBalance || 0) === 0 &&
    Number(account?.loanPrincipal || 0) === 0 &&
    Number(account?.bankInterestAccrued || 0) === 0 &&
    Number(account?.loanInterestAccrued || 0) === 0 &&
    Object.keys(account?.stockHoldings || {}).length === 0 &&
    (account?.futuresPositions?.length || 0) === 0 &&
    (account?.history?.length || 0) === 0
  );

  const getLiveWalletBalance = async (address: string) => {
    const [dbBalance, legacyBalance] = await Promise.all([
      walletRepo.getBalance(address, "zhixi"),
      kv.get<string | number>(`balance:${address}`),
    ]);

    const fallbackBalance = Number(dbBalance || 0) === 0 && legacyBalance !== null && legacyBalance !== undefined
      ? String(legacyBalance)
      : String(dbBalance || legacyBalance || "0");

    if (fallbackBalance !== String(dbBalance || "0") && Number(fallbackBalance || 0) > 0) {
      await walletRepo.updateBalance(address, fallbackBalance, "zhixi");
    }

    try {
      const runtime = onchainManager.getRuntimeConfig();
      const tokenRuntime = runtime.tokens.zhixi;
      if (!runtime.rpcUrl || !runtime.adminPrivateKey || !tokenRuntime.enabled) {
        return fallbackBalance;
      }

      const client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
      const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
      const balance = client.formatUnits(
        await client.getBalance(address, tokenRuntime.contractAddress),
        decimals
      );
      await walletRepo.updateBalance(address, balance, "zhixi");
      return balance;
    } catch {
      return fallbackBalance;
    }
  };

  const hydrateAccount = async (address: string, userId: string, nowTs = Date.now()) => {
    const [storedAccount, liveWalletBalance] = await Promise.all([
      loadCompatibleAccount(address, userId),
      getLiveWalletBalance(address),
    ]);

    if (!storedAccount) {
      return marketManager.createDefaultAccount(nowTs, Number(liveWalletBalance || 0));
    }

    const normalized = marketManager.normalizeAccount(storedAccount, nowTs);
    if (isWalletBackedEmptyAccount(normalized)) {
      normalized.cash = Number(liveWalletBalance || 0);
    }
    normalized.updatedAt = new Date(nowTs).toISOString();
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
    const nowTs = Date.now();
    const snapshot = marketManager.buildSnapshot(nowTs);
    const normalized = await hydrateAccount(ctx.session.address, ctx.user.id, nowTs);
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
    const nowTs = Date.now();
    const snapshot = marketManager.buildSnapshot(nowTs);
    const account = await hydrateAccount(ctx.session.address, ctx.user.id, nowTs);
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
