import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { WalletManager, IdentityManager } from "@repo/domain";
import { SessionRepository, UserRepository, WalletRepository, OpsRepository, kv } from "@repo/infrastructure";
import { randomUUID } from "crypto";

export async function walletRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletManager = new WalletManager();
  const identityManager = new IdentityManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const tokenToSymbol = (token: "zhixi" | "yjc") => (token === "yjc" ? "YJC" : "ZXC");

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  typedFastify.get("/summary", {
    schema: {
      querystring: z.object({
        sessionId: z.string()
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const address = ctx.session.address;
    const [zxcBalance, yjcBalance, ledger] = await Promise.all([
      walletRepo.getBalance(address, "zhixi"),
      walletRepo.getBalance(address, "yjc"),
      walletRepo.listLedgerEntries({ address, limit: 25 }),
    ]);

    const lastAirdrop = await kv.get<number>(`last_airdrop:${address}`) || 0;
    const nextAirdropAt = lastAirdrop ? lastAirdrop + 24 * 60 * 60 * 1000 : null;
    const summary = walletManager.buildSummary(address, { ZXC: zxcBalance, YJC: yjcBalance }, ledger.map((entry: any) => ({
      ...entry,
      token: tokenToSymbol(entry.token === "yjc" ? "yjc" : "zhixi"),
      amount: String(entry.amount),
    })));

    return createApiEnvelope({
      summary,
      canClaimAirdrop: !nextAirdropAt || Date.now() >= nextAirdropAt,
      nextAirdropAt,
    }, request.id);
  });

  // ─── Airdrop ───────────────────────────────────────────────────────────────

  typedFastify.post("/airdrop", {
    schema: {
      body: z.object({ sessionId: z.string().optional() }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const address = ctx.session.address;
    const now = Date.now();
    const lastAirdrop = await kv.get<number>(`last_airdrop:${address}`) || 0;
    
    if (now - lastAirdrop < 24 * 60 * 60 * 1000) {
      const waitMinutes = Math.ceil((24 * 60 * 60 * 1000 - (now - lastAirdrop)) / (60 * 1000));
      return createApiEnvelope({ error: { code: "COOLDOWN", message: `Please wait ${waitMinutes} more minutes` } }, request.id);
    }

    // Fixed airdrop reward for now (simplified for refactor)
    const rewardEth = "1000";
    const currentBalanceStr = await walletRepo.getBalance(address);
    const newBalance = (parseFloat(currentBalanceStr) + parseFloat(rewardEth)).toString();
    
    await walletRepo.updateBalance(address, newBalance);
    await walletRepo.saveLedgerEntry({
      id: randomUUID(),
      userId: ctx.user.id,
      address,
      token: "zhixi",
      type: "airdrop",
      amount: rewardEth,
      balanceBefore: currentBalanceStr,
      balanceAfter: newBalance,
      meta: { source: "daily_airdrop" },
      createdAt: new Date(),
    });
    await kv.set(`last_airdrop:${address}`, now);

    await opsRepo.logEvent({
      channel: "wallet",
      severity: "info",
      source: "airdrop",
      kind: "airdrop_claimed",
      userId: ctx.user.id,
      address,
      message: `User claimed ${rewardEth} ZXC airdrop`,
      meta: { rewardEth }
    });

    return createApiEnvelope({ reward: rewardEth, balance: newBalance }, request.id);
  });

  // ─── Transfer (Secure) ─────────────────────────────────────────────────────

  typedFastify.post("/transfer", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        to: z.string(),
        amount: z.string(),
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const { to, amount, token } = request.body;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return createApiEnvelope({ error: { message: "Invalid amount" } }, request.id);

    const fromAddress = ctx.session.address;
    const toAddress = identityManager.tryNormalizeAddress(to);
    if (!toAddress) return createApiEnvelope({ error: { message: "Invalid recipient address" } }, request.id);
    if (fromAddress === toAddress) return createApiEnvelope({ error: { message: "Cannot transfer to self" } }, request.id);

    const currentBalanceStr = await walletRepo.getBalance(fromAddress, token);
    const currentBalance = parseFloat(currentBalanceStr);
    
    if (currentBalance < amountNum) return createApiEnvelope({ error: { message: "Insufficient balance" } }, request.id);

    const newFromBalance = (currentBalance - amountNum).toString();
    const targetCurrentBalanceStr = await walletRepo.getBalance(toAddress, token);
    const newToBalance = (parseFloat(targetCurrentBalanceStr) + amountNum).toString();

    await walletRepo.updateBalance(fromAddress, newFromBalance, token);
    await walletRepo.updateBalance(toAddress, newToBalance, token);

    const intent: any = walletManager.createTxIntent(ctx.user.id, tokenToSymbol(token), "transfer", amount);
    intent.address = fromAddress;
    await walletRepo.saveTxIntent(intent);
    await walletRepo.saveLedgerEntry({
      id: randomUUID(),
      userId: ctx.user.id,
      address: fromAddress,
      token,
      type: "transfer_out",
      amount,
      balanceBefore: currentBalanceStr,
      balanceAfter: newFromBalance,
      txIntentId: intent.id,
      meta: { counterparty: toAddress },
      createdAt: new Date(),
    });

    await opsRepo.logEvent({
      channel: "wallet",
      severity: "info",
      source: "transfer",
      kind: "transfer_completed",
      userId: ctx.user.id,
      from: fromAddress,
      to: toAddress,
      amount,
      token,
      message: `Transfer of ${amount} ${token} from ${fromAddress} to ${toAddress}`
    });

    return createApiEnvelope({ success: true, fromBalance: newFromBalance }, request.id);
  });

  // ─── Withdrawals (Intent based) ───────────────────────────────────────────

  typedFastify.post("/withdrawals", {
    schema: {
      body: z.object({
        token: z.enum(["zhixi", "yjc"]),
        amount: z.string(),
        sessionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const { token, amount } = request.body;
    const currentBalance = await walletRepo.getBalance(ctx.session.address, token);
    const intent: any = walletManager.createTxIntent(ctx.user.id, tokenToSymbol(token), "withdrawal", amount);
    intent.address = ctx.session.address;

    await walletRepo.saveTxIntent(intent);
    await walletRepo.saveLedgerEntry({
      id: randomUUID(),
      userId: ctx.user.id,
      address: ctx.session.address,
      token,
      type: "withdrawal",
      amount,
      balanceBefore: currentBalance,
      balanceAfter: currentBalance,
      txIntentId: intent.id,
      meta: { status: "pending" },
      createdAt: new Date(),
    });
    return createApiEnvelope({ intent }, request.id);
  });
}
