import { randomUUID } from "crypto";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { IdentityManager, OnchainWalletManager, WalletManager } from "@repo/domain";
import {
  ChainClient,
  OpsRepository,
  SessionRepository,
  UserRepository,
  WalletRepository,
  kv,
} from "@repo/infrastructure";

type WalletTokenKey = "zhixi" | "yjc";

const ZXC_PER_YJC = 100_000_000;

function tokenToSymbol(token: WalletTokenKey): "ZXC" | "YJC" {
  return token === "yjc" ? "YJC" : "ZXC";
}

function parseAmountText(rawAmount: unknown): string {
  const amount = String(rawAmount ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("Invalid amount");
  if (Number(amount) <= 0) throw new Error("Amount must be greater than 0");
  return amount;
}

export async function walletRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const walletManager = new WalletManager();
  const onchainManager = new OnchainWalletManager();
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
    if (!user) return null;
    return { session, user };
  };

  const getChainClient = () => {
    const runtime = onchainManager.getRuntimeConfig();
    if (!runtime.rpcUrl || !runtime.adminPrivateKey) {
      throw new Error("On-chain runtime is not configured");
    }
    return { runtime, client: new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey) };
  };

  const getLegacyBalance = async (address: string, token: WalletTokenKey) => {
    const key = token === "yjc" ? `balance_yjc:${address}` : `balance:${address}`;
    const raw = await kv.get<string | number>(key);
    if (raw === null || raw === undefined) return null;
    return String(raw);
  };

  const getTokenRuntime = async (token: WalletTokenKey) => {
    const { runtime, client } = getChainClient();
    const tokenRuntime = runtime.tokens[token];
    if (!tokenRuntime.enabled) {
      throw new Error(`${tokenToSymbol(token)} on-chain contract is not configured`);
    }
    const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
    return { runtime, client, tokenRuntime, decimals };
  };

  const syncBalanceIfKnownUser = async (address: string, token: WalletTokenKey, balance: string) => {
    const user = await userRepo.getUserByAddress(address);
    if (!user) return null;
    await walletRepo.updateBalance(address, balance, token);
    return user;
  };

  const saveAttempt = async (params: {
    txIntentId: string;
    attemptNumber: number;
    status: string;
    txHash?: string | null;
    error?: string | null;
    errorCode?: string | null;
    broadcastAt?: Date | null;
    confirmedAt?: Date | null;
  }) => {
    await walletRepo.saveTxAttempt({
      id: randomUUID(),
      txIntentId: params.txIntentId,
      attemptNumber: params.attemptNumber,
      status: params.status,
      txHash: params.txHash || null,
      error: params.error || null,
      errorCode: params.errorCode || null,
      broadcastAt: params.broadcastAt || null,
      confirmedAt: params.confirmedAt || null,
      createdAt: new Date(),
    });
  };

  const saveReceipt = async (txIntentId: string, txHash: string, receipt: any, status: "confirmed" | "reverted") => {
    await walletRepo.saveTxReceipt({
      id: randomUUID(),
      txIntentId,
      txHash,
      blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
      status,
      gasUsed: receipt?.gasUsed ? String(receipt.gasUsed) : null,
      confirmedAt: new Date(),
    });
  };

  typedFastify.get("/summary", {
    schema: {
      querystring: z.object({
        sessionId: z.string(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const address = ctx.session.address;
    const [dbZxcBalance, dbYjcBalance, legacyZxcBalance, legacyYjcBalance, ledger, lastAirdrop] = await Promise.all([
      walletRepo.getBalance(address, "zhixi"),
      walletRepo.getBalance(address, "yjc"),
      getLegacyBalance(address, "zhixi"),
      getLegacyBalance(address, "yjc"),
      walletRepo.listLedgerEntries({ address, limit: 25 }),
      kv.get<number>(`last_airdrop:${address}`),
    ]);

    const initialZxcBalance = Number(dbZxcBalance || 0) === 0 && legacyZxcBalance !== null
      ? legacyZxcBalance
      : dbZxcBalance;
    const initialYjcBalance = Number(dbYjcBalance || 0) === 0 && legacyYjcBalance !== null
      ? legacyYjcBalance
      : dbYjcBalance;

    if (initialZxcBalance !== dbZxcBalance && Number(initialZxcBalance || 0) > 0) {
      await walletRepo.updateBalance(address, initialZxcBalance, "zhixi");
    }
    if (initialYjcBalance !== dbYjcBalance && Number(initialYjcBalance || 0) > 0) {
      await walletRepo.updateBalance(address, initialYjcBalance, "yjc");
    }

    let balances = { ZXC: initialZxcBalance, YJC: initialYjcBalance };
    const onchain = {
      available: false,
      adminAddress: null as string | null,
      conversionRateZxcPerYjc: ZXC_PER_YJC,
      zxc: {
        available: false,
        balance: initialZxcBalance,
        decimals: 18,
        contractAddress: null as string | null,
        error: null as string | null,
      },
      yjc: {
        available: false,
        balance: initialYjcBalance,
        decimals: 18,
        contractAddress: null as string | null,
        error: null as string | null,
      },
    };

    try {
      const { runtime, client } = getChainClient();
      onchain.adminAddress = client.getWalletAddress();
      onchain.available = Object.values(runtime.tokens).some((token) => token.enabled);

      const tokenFetches = (["zhixi", "yjc"] as WalletTokenKey[]).map(async (token) => {
        const tokenRuntime = runtime.tokens[token];
        if (!tokenRuntime.enabled) return;

        try {
          const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
          const rawBalance = await client.getBalance(address, tokenRuntime.contractAddress);
          const balance = client.formatUnits(rawBalance, decimals);
          await syncBalanceIfKnownUser(address, token, balance);

          if (token === "zhixi") {
            balances.ZXC = balance;
            onchain.zxc = {
              available: true,
              balance,
              decimals,
              contractAddress: tokenRuntime.contractAddress,
              error: null,
            };
          } else {
            balances.YJC = balance;
            onchain.yjc = {
              available: true,
              balance,
              decimals,
              contractAddress: tokenRuntime.contractAddress,
              error: null,
            };
          }
        } catch (error: any) {
          const message = error?.message || "On-chain balance fetch failed";
          if (token === "zhixi") {
            onchain.zxc.error = message;
            onchain.zxc.contractAddress = tokenRuntime.contractAddress;
          } else {
            onchain.yjc.error = message;
            onchain.yjc.contractAddress = tokenRuntime.contractAddress;
          }
        }
      });

      await Promise.all(tokenFetches);
    } catch (error: any) {
      onchain.available = false;
      onchain.zxc.error = error?.message || "On-chain runtime unavailable";
      onchain.yjc.error = error?.message || "On-chain runtime unavailable";
    }

    const nextAirdropAt = lastAirdrop ? lastAirdrop + 24 * 60 * 60 * 1000 : null;
    const summary = walletManager.buildSummary(address, balances, ledger.map((entry: any) => ({
      ...entry,
      token: tokenToSymbol(entry.token === "yjc" ? "yjc" : "zhixi"),
      amount: String(entry.amount),
    })));

    return createApiEnvelope({
      summary,
      onchain,
      canClaimAirdrop: !nextAirdropAt || Date.now() >= nextAirdropAt,
      nextAirdropAt,
    }, request.id);
  });

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
      meta: { rewardEth },
    });

    return createApiEnvelope({ reward: rewardEth, balance: newBalance }, request.id);
  });

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

    try {
      const { to, token } = request.body;
      const amount = parseAmountText(request.body.amount);
      const fromAddress = ctx.session.address;
      const toAddress = identityManager.tryNormalizeAddress(to);

      if (!toAddress) return createApiEnvelope({ error: { message: "Invalid recipient address" } }, request.id);
      if (fromAddress === toAddress) return createApiEnvelope({ error: { message: "Cannot transfer to self" } }, request.id);

      const { client, tokenRuntime, decimals } = await getTokenRuntime(token);
      const amountWei = client.parseUnits(amount, decimals);
      const fromBalanceWeiBefore = await client.getBalance(fromAddress, tokenRuntime.contractAddress);
      if (fromBalanceWeiBefore < amountWei) {
        return createApiEnvelope({ error: { message: "Insufficient on-chain balance" } }, request.id);
      }

      const toBalanceWeiBefore = await client.getBalance(toAddress, tokenRuntime.contractAddress);
      const intent: any = walletManager.createTxIntent(ctx.user.id, tokenToSymbol(token), "transfer", amount);
      intent.address = fromAddress;
      intent.contractAddress = tokenRuntime.contractAddress;
      intent.meta = { toAddress, mode: "admin_transfer", decimals };
      await walletRepo.saveTxIntent(intent);

      let txHash: string | null = null;
      try {
        const tx = await client.adminTransfer(fromAddress, toAddress, amountWei, tokenRuntime.contractAddress);
        txHash = tx.hash;
        await saveAttempt({
          txIntentId: intent.id,
          attemptNumber: 1,
          status: "broadcasting",
          txHash,
          broadcastAt: new Date(),
        });

        const receipt = await tx.wait();
        const reverted = !receipt || receipt.status !== 1;
        await saveAttempt({
          txIntentId: intent.id,
          attemptNumber: 1,
          status: reverted ? "reverted" : "confirmed",
          txHash,
          confirmedAt: new Date(),
        });
        await saveReceipt(intent.id, txHash, receipt, reverted ? "reverted" : "confirmed");

        if (reverted) {
          await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "reverted", txHash, "Transaction reverted"));
          return createApiEnvelope({ error: { message: "Transaction reverted on-chain" } }, request.id);
        }

        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "confirmed", txHash));

        const [fromBalanceWeiAfter, toBalanceWeiAfter] = await Promise.all([
          client.getBalance(fromAddress, tokenRuntime.contractAddress),
          client.getBalance(toAddress, tokenRuntime.contractAddress),
        ]);
        const fromBalanceBefore = client.formatUnits(fromBalanceWeiBefore, decimals);
        const fromBalanceAfter = client.formatUnits(fromBalanceWeiAfter, decimals);
        const toBalanceBefore = client.formatUnits(toBalanceWeiBefore, decimals);
        const toBalanceAfter = client.formatUnits(toBalanceWeiAfter, decimals);

        await Promise.all([
          syncBalanceIfKnownUser(fromAddress, token, fromBalanceAfter),
          syncBalanceIfKnownUser(toAddress, token, toBalanceAfter),
        ]);

        await walletRepo.saveLedgerEntry({
          id: randomUUID(),
          userId: ctx.user.id,
          address: fromAddress,
          token,
          type: "transfer_out",
          amount,
          balanceBefore: fromBalanceBefore,
          balanceAfter: fromBalanceAfter,
          txIntentId: intent.id,
          txHash,
          meta: { counterparty: toAddress, mode: "admin_transfer" },
          createdAt: new Date(),
        });

        const recipientUser = await userRepo.getUserByAddress(toAddress);
        if (recipientUser) {
          await walletRepo.saveLedgerEntry({
            id: randomUUID(),
            userId: recipientUser.id,
            address: toAddress,
            token,
            type: "transfer_in",
            amount,
            balanceBefore: toBalanceBefore,
            balanceAfter: toBalanceAfter,
            txIntentId: intent.id,
            txHash,
            meta: { counterparty: fromAddress, mode: "admin_transfer" },
            createdAt: new Date(),
          });
        }

        await opsRepo.logEvent({
          channel: "wallet",
          severity: "info",
          source: "transfer",
          kind: "transfer_confirmed",
          userId: ctx.user.id,
          address: fromAddress,
          token,
          txIntentId: intent.id,
          txHash,
          message: `Admin transfer of ${amount} ${tokenToSymbol(token)} from ${fromAddress} to ${toAddress}`,
          meta: { toAddress, contractAddress: tokenRuntime.contractAddress },
        });

        return createApiEnvelope({ success: true, txHash, fromBalance: fromBalanceAfter }, request.id);
      } catch (error: any) {
        await saveAttempt({
          txIntentId: intent.id,
          attemptNumber: 1,
          status: "failed",
          txHash,
          error: error?.message || "Transfer failed",
          errorCode: "TX_BROADCAST_ERROR",
          confirmedAt: new Date(),
        });
        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "failed", txHash || undefined, error?.message || "Transfer failed"));
        throw error;
      }
    } catch (error: any) {
      await opsRepo.logEvent({
        channel: "wallet",
        severity: "error",
        source: "transfer",
        kind: "transfer_failed",
        userId: ctx.user.id,
        address: ctx.session.address,
        message: error?.message || "Transfer failed",
        errorCode: "TRANSFER_FAILED",
      });
      return createApiEnvelope({ error: { message: error?.message || "Transfer failed" } }, request.id);
    }
  });

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

    try {
      const { token } = request.body;
      const amount = parseAmountText(request.body.amount);
      const fromAddress = ctx.session.address;
      const { client, tokenRuntime, decimals } = await getTokenRuntime(token);

      const treasuryAddress = tokenRuntime.lossPoolAddress || client.getWalletAddress();
      if (!treasuryAddress) {
        return createApiEnvelope({ error: { message: "Treasury address is not configured" } }, request.id);
      }

      const amountWei = client.parseUnits(amount, decimals);
      const balanceWeiBefore = await client.getBalance(fromAddress, tokenRuntime.contractAddress);
      if (balanceWeiBefore < amountWei) {
        return createApiEnvelope({ error: { message: "Insufficient on-chain balance" } }, request.id);
      }

      const intent: any = walletManager.createTxIntent(ctx.user.id, tokenToSymbol(token), "withdrawal", amount);
      intent.address = fromAddress;
      intent.contractAddress = tokenRuntime.contractAddress;
      intent.meta = { treasuryAddress, mode: "admin_transfer", decimals };
      await walletRepo.saveTxIntent(intent);

      let txHash: string | null = null;
      try {
        const tx = await client.adminTransfer(fromAddress, treasuryAddress, amountWei, tokenRuntime.contractAddress);
        txHash = tx.hash;
        await saveAttempt({
          txIntentId: intent.id,
          attemptNumber: 1,
          status: "broadcasting",
          txHash,
          broadcastAt: new Date(),
        });

        const receipt = await tx.wait();
        const reverted = !receipt || receipt.status !== 1;
        await saveAttempt({
          txIntentId: intent.id,
          attemptNumber: 1,
          status: reverted ? "reverted" : "confirmed",
          txHash,
          confirmedAt: new Date(),
        });
        await saveReceipt(intent.id, txHash, receipt, reverted ? "reverted" : "confirmed");

        if (reverted) {
          await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "reverted", txHash, "Transaction reverted"));
          return createApiEnvelope({ error: { message: "Withdrawal reverted on-chain" } }, request.id);
        }

        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "confirmed", txHash));

        const balanceAfter = client.formatUnits(
          await client.getBalance(fromAddress, tokenRuntime.contractAddress),
          decimals
        );
        await syncBalanceIfKnownUser(fromAddress, token, balanceAfter);

        await walletRepo.saveLedgerEntry({
          id: randomUUID(),
          userId: ctx.user.id,
          address: fromAddress,
          token,
          type: "withdrawal",
          amount,
          balanceBefore: client.formatUnits(balanceWeiBefore, decimals),
          balanceAfter,
          txIntentId: intent.id,
          txHash,
          meta: { treasuryAddress, status: "confirmed", mode: "admin_transfer" },
          createdAt: new Date(),
        });

        return createApiEnvelope({ intent: { ...intent, txHash, status: "confirmed" }, txHash, balance: balanceAfter }, request.id);
      } catch (error: any) {
        await saveAttempt({
          txIntentId: intent.id,
          attemptNumber: 1,
          status: "failed",
          txHash,
          error: error?.message || "Withdrawal failed",
          errorCode: "TX_BROADCAST_ERROR",
          confirmedAt: new Date(),
        });
        await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "failed", txHash || undefined, error?.message || "Withdrawal failed"));
        throw error;
      }
    } catch (error: any) {
      return createApiEnvelope({ error: { message: error?.message || "Withdrawal failed" } }, request.id);
    }
  });

  typedFastify.post("/convert", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        zxcAmount: z.string(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const conversionId = randomUUID();
    let debitIntent: any = null;
    let mintIntent: any = null;

    try {
      const zxcAmountText = parseAmountText(request.body.zxcAmount);
      const conversion = onchainManager.convertZxcToYjc(zxcAmountText);
      if (conversion.yjcAmount <= 0) {
        return createApiEnvelope({ error: { message: `At least ${ZXC_PER_YJC} ZXC is required to convert` } }, request.id);
      }

      const { runtime, client } = getChainClient();
      const zxcRuntime = runtime.tokens.zhixi;
      const yjcRuntime = runtime.tokens.yjc;
      if (!zxcRuntime.enabled || !yjcRuntime.enabled) {
        return createApiEnvelope({ error: { message: "ZXC/YJC on-chain conversion is not configured" } }, request.id);
      }

      const [zxcDecimals, yjcDecimals] = await Promise.all([
        client.getDecimals(zxcRuntime.contractAddress, 18),
        client.getDecimals(yjcRuntime.contractAddress, 18),
      ]);

      const requiredZxc = String(conversion.requiredZxc);
      const yjcAmount = String(conversion.yjcAmount);
      const requiredZxcWei = client.parseUnits(requiredZxc, zxcDecimals);
      const yjcAmountWei = client.parseUnits(yjcAmount, yjcDecimals);
      const address = ctx.session.address;

      const [zxcBalanceWeiBefore, yjcBalanceWeiBefore] = await Promise.all([
        client.getBalance(address, zxcRuntime.contractAddress),
        client.getBalance(address, yjcRuntime.contractAddress),
      ]);
      if (zxcBalanceWeiBefore < requiredZxcWei) {
        return createApiEnvelope({ error: { message: "Insufficient ZXC balance for conversion" } }, request.id);
      }

      debitIntent = walletManager.createTxIntent(ctx.user.id, "ZXC", "withdrawal", requiredZxc);
      mintIntent = walletManager.createTxIntent(ctx.user.id, "YJC", "deposit", yjcAmount);
      debitIntent.amount = requiredZxc;
      debitIntent.address = address;
      debitIntent.contractAddress = zxcRuntime.contractAddress;
      debitIntent.meta = { conversionId, yjcAmount, treasuryAddress: zxcRuntime.lossPoolAddress, mode: "zxc_to_yjc", decimals: zxcDecimals };

      mintIntent.amount = yjcAmount;
      mintIntent.address = address;
      mintIntent.contractAddress = yjcRuntime.contractAddress;
      mintIntent.meta = { conversionId, requiredZxc, mode: "zxc_to_yjc_mint", decimals: yjcDecimals };

      await walletRepo.saveTxIntent(debitIntent);
      await walletRepo.saveTxIntent(mintIntent);

      const treasuryAddress = zxcRuntime.lossPoolAddress || client.getWalletAddress();
      let debitTxHash: string | null = null;
      let mintTxHash: string | null = null;

      const debitTx = await client.adminTransfer(address, treasuryAddress, requiredZxcWei, zxcRuntime.contractAddress);
      debitTxHash = debitTx.hash;
      debitIntent.txHash = debitTxHash;
      await saveAttempt({
        txIntentId: debitIntent.id,
        attemptNumber: 1,
        status: "broadcasting",
        txHash: debitTxHash,
        broadcastAt: new Date(),
      });

      const debitReceipt = await debitTx.wait();
      const debitReverted = !debitReceipt || debitReceipt.status !== 1;
      await saveAttempt({
        txIntentId: debitIntent.id,
        attemptNumber: 1,
        status: debitReverted ? "reverted" : "confirmed",
        txHash: debitTxHash,
        confirmedAt: new Date(),
      });
      await saveReceipt(debitIntent.id, debitTxHash, debitReceipt, debitReverted ? "reverted" : "confirmed");
      if (debitReverted) {
        await walletRepo.saveTxIntent(walletManager.processTxIntent(debitIntent, "reverted", debitTxHash, "Conversion debit reverted"));
        await walletRepo.saveTxIntent(walletManager.processTxIntent(mintIntent, "failed", undefined, "Conversion debit reverted"));
        return createApiEnvelope({ error: { message: "Conversion debit reverted on-chain" } }, request.id);
      }
      await walletRepo.saveTxIntent(walletManager.processTxIntent(debitIntent, "confirmed", debitTxHash));

      try {
        const mintTx = await client.mint(address, yjcAmountWei, yjcRuntime.contractAddress);
        mintTxHash = mintTx.hash;
        mintIntent.txHash = mintTxHash;
        await saveAttempt({
          txIntentId: mintIntent.id,
          attemptNumber: 1,
          status: "broadcasting",
          txHash: mintTxHash,
          broadcastAt: new Date(),
        });

        const mintReceipt = await mintTx.wait();
        const mintReverted = !mintReceipt || mintReceipt.status !== 1;
        await saveAttempt({
          txIntentId: mintIntent.id,
          attemptNumber: 1,
          status: mintReverted ? "reverted" : "confirmed",
          txHash: mintTxHash,
          confirmedAt: new Date(),
        });
        await saveReceipt(mintIntent.id, mintTxHash, mintReceipt, mintReverted ? "reverted" : "confirmed");

        if (mintReverted) {
          await walletRepo.saveTxIntent(walletManager.processTxIntent(mintIntent, "reverted", mintTxHash, "Conversion mint reverted"));
          return createApiEnvelope({
            error: {
              message: "ZXC debit succeeded but YJC mint reverted; reconciliation is required",
            },
            partial: {
              conversionId,
              debitTxHash,
              mintTxHash,
            },
          }, request.id);
        }

        await walletRepo.saveTxIntent(walletManager.processTxIntent(mintIntent, "confirmed", mintTxHash));

        const [zxcBalanceWeiAfter, yjcBalanceWeiAfter] = await Promise.all([
          client.getBalance(address, zxcRuntime.contractAddress),
          client.getBalance(address, yjcRuntime.contractAddress),
        ]);
        const zxcBalanceAfter = client.formatUnits(zxcBalanceWeiAfter, zxcDecimals);
        const yjcBalanceAfter = client.formatUnits(yjcBalanceWeiAfter, yjcDecimals);

        await Promise.all([
          syncBalanceIfKnownUser(address, "zhixi", zxcBalanceAfter),
          syncBalanceIfKnownUser(address, "yjc", yjcBalanceAfter),
        ]);

        await walletRepo.saveLedgerEntry({
          id: randomUUID(),
          userId: ctx.user.id,
          address,
          token: "zhixi",
          type: "conversion_out",
          amount: requiredZxc,
          balanceBefore: client.formatUnits(zxcBalanceWeiBefore, zxcDecimals),
          balanceAfter: zxcBalanceAfter,
          txIntentId: debitIntent.id,
          txHash: debitTxHash,
          meta: { conversionId, yjcAmount, treasuryAddress },
          createdAt: new Date(),
        });
        await walletRepo.saveLedgerEntry({
          id: randomUUID(),
          userId: ctx.user.id,
          address,
          token: "yjc",
          type: "conversion_in",
          amount: yjcAmount,
          balanceBefore: client.formatUnits(yjcBalanceWeiBefore, yjcDecimals),
          balanceAfter: yjcBalanceAfter,
          txIntentId: mintIntent.id,
          txHash: mintTxHash,
          meta: { conversionId, requiredZxc },
          createdAt: new Date(),
        });

        await opsRepo.logEvent({
          channel: "wallet",
          severity: "info",
          source: "convert",
          kind: "zxc_to_yjc_confirmed",
          userId: ctx.user.id,
          address,
          txIntentId: mintIntent.id,
          txHash: mintTxHash,
          message: `Converted ${requiredZxc} ZXC to ${yjcAmount} YJC`,
          meta: { conversionId, debitTxHash, mintTxHash, requiredZxc, yjcAmount },
        });

        return createApiEnvelope({
          success: true,
          conversionId,
          requiredZxc,
          yjcAmount,
          debitTxHash,
          mintTxHash,
          balances: {
            zxc: zxcBalanceAfter,
            yjc: yjcBalanceAfter,
          },
        }, request.id);
      } catch (error: any) {
        await saveAttempt({
          txIntentId: mintIntent.id,
          attemptNumber: 1,
          status: "failed",
          txHash: mintTxHash,
          error: error?.message || "Conversion mint failed",
          errorCode: "TX_BROADCAST_ERROR",
          confirmedAt: new Date(),
        });
        await walletRepo.saveTxIntent(walletManager.processTxIntent(mintIntent, "failed", mintTxHash || undefined, error?.message || "Conversion mint failed"));
        throw error;
      }
    } catch (error: any) {
      if (debitIntent?.id && !debitIntent.txHash) {
        await walletRepo.saveTxIntent(walletManager.processTxIntent(debitIntent, "failed", undefined, error?.message || "Conversion failed"));
      }
      if (mintIntent?.id && !mintIntent.txHash) {
        await walletRepo.saveTxIntent(walletManager.processTxIntent(mintIntent, "failed", undefined, error?.message || "Conversion failed"));
      }
      return createApiEnvelope({ error: { message: error?.message || "Conversion failed" } }, request.id);
    }
  });
}
