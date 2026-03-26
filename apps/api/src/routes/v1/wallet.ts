// apps/api/src/routes/v1/wallet.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, AIRDROP_HALVING_STEP, AIRDROP_BASE_REWARD, AIRDROP_MIN_REWARD, AIRDROP_DISTRIBUTED_TOTAL_KEY } from "@repo/shared";
import { WalletManager, IdentityManager, calculateAirdropRewardWei, normalizeAirdropDistributedWei } from "@repo/domain";
import { WalletRepository, OpsRepository, SessionRepository, UserRepository, kv } from "@repo/infrastructure";
import { ethers } from "ethers";

export async function walletRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletManager = new WalletManager();
  const identityManager = new IdentityManager();
  const walletRepo = new WalletRepository();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();

  // Helper to get session and user from request (or header/query)
  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  // ─── Wallet Summary ────────────────────────────────────────────────────────

  typedFastify.get("/summary", {
    schema: {
      querystring: z.object({
        token: z.enum(["zhixi", "yjc"]).optional(),
        sessionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const address = ctx.session.address;
    const zhixiBalance = await kv.get<string>(`balance:${address}`) || "0";
    const yjcBalance = await kv.get<string>(`balance_yjc:${address}`) || "0";
    const totalBet = await kv.get<string>(`total_bet:${address}`) || "0";

    return createApiEnvelope({
      address,
      balances: {
        zhixi: zhixiBalance,
        yjc: yjcBalance,
      },
      totalBet,
    }, request.id);
  });

  // ─── Airdrop Logic Port ───────────────────────────────────────────────────

  typedFastify.post("/airdrop", {
    schema: {
      body: z.object({
        sessionId: z.string(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const address = ctx.session.address;
    const now = Date.now();
    const lastAirdrop = await kv.get<number>(`last_airdrop:${address}`) || 0;
    
    // Cooldown check (24h)
    if (now - lastAirdrop < 24 * 60 * 60 * 1000) {
      const waitMinutes = Math.ceil((24 * 60 * 60 * 1000 - (now - lastAirdrop)) / (60 * 1000));
      return createApiEnvelope({ error: { code: "COOLDOWN", message: `Please wait ${waitMinutes} more minutes` } }, request.id);
    }

    // Airdrop algorithm from domain (halving)
    const distributedWeiStr = await kv.get<string>(AIRDROP_DISTRIBUTED_TOTAL_KEY) || "0";
    const distributedWei = normalizeAirdropDistributedWei(distributedWeiStr);
    const policy = calculateAirdropRewardWei(18, distributedWei);
    const rewardWei = policy.rewardWei;
    const rewardEth = ethers.formatUnits(rewardWei, 18);

    // Update balances (KV fallback)
    const currentBalanceStr = await kv.get<string>(`balance:${address}`) || "0";
    const newBalance = (parseFloat(currentBalanceStr) + parseFloat(rewardEth)).toString();
    
    await kv.set(`balance:${address}`, newBalance);
    await kv.set(`last_airdrop:${address}`, now);
    await kv.set(AIRDROP_DISTRIBUTED_TOTAL_KEY, (distributedWei + rewardWei).toString());

    await opsRepo.logEvent({
      channel: "wallet",
      severity: "info",
      source: "airdrop",
      kind: "airdrop_claimed",
      userId: ctx.user.id,
      address,
      message: `User claimed ${rewardEth} ZXC airdrop`,
      meta: { rewardEth, halvingCount: policy.halvingCount }
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

    const balanceKey = token === "yjc" ? `balance_yjc:${fromAddress}` : `balance:${fromAddress}`;
    const targetBalanceKey = token === "yjc" ? `balance_yjc:${toAddress}` : `balance:${toAddress}`;
    
    const currentBalanceStr = await kv.get<string>(balanceKey) || "0";
    const currentBalance = parseFloat(currentBalanceStr);
    
    if (currentBalance < amountNum) return createApiEnvelope({ error: { message: "Insufficient balance" } }, request.id);

    const newFromBalance = (currentBalance - amountNum).toString();
    const targetCurrentBalanceStr = await kv.get<string>(targetBalanceKey) || "0";
    const newToBalance = (parseFloat(targetCurrentBalanceStr) + amountNum).toString();

    await kv.set(balanceKey, newFromBalance);
    await kv.set(targetBalanceKey, newToBalance);

    // Ledger intents
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
    await opsRepo.logEvent({
      channel: "wallet",
      severity: "info",
      source: "withdrawal",
      kind: "intent_created",
      userId: ctx.user.id,
      txIntentId: intent.id,
      token,
      message: `Withdrawal intent created for ${amount} ${token}`,
    });

    return createApiEnvelope({ intent }, request.id);
  });
}
