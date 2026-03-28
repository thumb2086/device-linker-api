import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, AIRDROP_DISTRIBUTED_TOTAL_KEY } from "@repo/shared";
import { WalletManager, IdentityManager } from "@repo/domain";
import { SessionRepository, UserRepository, WalletRepository, OpsRepository, kv } from "@repo/infrastructure";
import { ethers } from "ethers";

export async function walletRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletManager = new WalletManager();
  const identityManager = new IdentityManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

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

    const intent = walletManager.createTxIntent(ctx.user.id, token.toUpperCase() as any, "transfer", amount);
    await walletRepo.saveTxIntent(intent);

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
    const intent = walletManager.createTxIntent(ctx.user.id, token.toUpperCase() as any, "withdrawal", amount);

    await walletRepo.saveTxIntent(intent);
    return createApiEnvelope({ intent }, request.id);
  });
}
