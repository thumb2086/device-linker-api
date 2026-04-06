import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, CUSTODY_REGISTER_BONUS } from "@repo/shared";
import { IdentityManager, AuthManager, OnchainWalletManager, WalletManager } from "@repo/domain";
import {
  ChainClient,
  kv,
  SessionRepository,
  UserRepository,
  CustodyRepository,
  WalletRepository
} from "@repo/infrastructure";
import { randomUUID } from "crypto";

const TREASURY_TARGET_BALANCE = "10000000000000";

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const onchainManager = new OnchainWalletManager();
  const walletManager = new WalletManager();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const custodyRepo = new CustodyRepository();
  const walletRepo = new WalletRepository();

  const authManager = new AuthManager(
    userRepo,
    sessionRepo,
    custodyRepo,
    walletRepo,
    kv
  );

  const getLegacyBalance = async (address: string, token: "zhixi" | "yjc" = "zhixi") => {
    const key = token === "yjc" ? `balance_yjc:${address}` : `balance:${address}`;
    const raw = await kv.get<string | number>(key);
    if (raw === null || raw === undefined) return null;
    return String(raw);
  };

  const getLiveZhixiBalance = async (address: string) => {
    let balance = await walletRepo.getBalance(address, "zhixi");
    if (Number(balance || 0) === 0) {
      const legacyBalance = await getLegacyBalance(address, "zhixi");
      if (legacyBalance !== null && Number(legacyBalance || 0) > 0) {
        balance = legacyBalance;
        await walletRepo.updateBalance(address, legacyBalance, "zhixi");
      }
    }

    try {
      const runtime = onchainManager.getRuntimeConfig();
      const tokenRuntime = runtime.tokens.zhixi;
      if (!runtime.rpcUrl || !runtime.adminPrivateKey || !tokenRuntime.enabled) {
        return balance || "0";
      }

      const client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
      const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
      const onchainBalance = client.formatUnits(
        await client.getBalance(address, tokenRuntime.contractAddress),
        decimals
      );
      await walletRepo.updateBalance(address, onchainBalance, "zhixi");
      return onchainBalance;
    } catch {
      return balance || "0";
    }
  };

  const saveAttempt = async (params: {
    txIntentId: string;
    status: string;
    txHash?: string | null;
    error?: string | null;
    errorCode?: string | null;
    confirmedAt?: Date | null;
  }) => {
    await walletRepo.saveTxAttempt({
      id: randomUUID(),
      txIntentId: params.txIntentId,
      attemptNumber: 1,
      status: params.status,
      txHash: params.txHash || null,
      error: params.error || null,
      errorCode: params.errorCode || null,
      broadcastAt: new Date(),
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

  const ensureTreasuryLiquidity = async (params: {
    client: ChainClient;
    contractAddress: string;
    treasuryAddress: string;
    decimals: number;
    requiredAmountWei: bigint;
  }) => {
    const { client, contractAddress, treasuryAddress, decimals, requiredAmountWei } = params;
    const treasuryBalanceBefore = await client.getBalance(treasuryAddress, contractAddress);
    if (treasuryBalanceBefore >= requiredAmountWei) {
      return {
        treasuryBalanceBefore,
        treasuryBalanceAfter: treasuryBalanceBefore,
        topupTxHash: null as string | null,
      };
    }

    const targetBalanceWei = client.parseUnits(TREASURY_TARGET_BALANCE, decimals);
    const refillTargetWei = targetBalanceWei > requiredAmountWei ? targetBalanceWei : requiredAmountWei;
    const refillAmountWei = refillTargetWei - treasuryBalanceBefore;
    if (refillAmountWei <= 0n) {
      return {
        treasuryBalanceBefore,
        treasuryBalanceAfter: treasuryBalanceBefore,
        topupTxHash: null as string | null,
      };
    }

    const topupTx = await client.mint(treasuryAddress, refillAmountWei, contractAddress);
    const topupReceipt = await topupTx.wait();
    if (!topupReceipt || topupReceipt.status !== 1) {
      throw new Error("TREASURY_TOPUP_REVERTED");
    }

    const treasuryBalanceAfter = await client.getBalance(treasuryAddress, contractAddress);
    if (treasuryBalanceAfter < requiredAmountWei) {
      throw new Error("TREASURY_INSUFFICIENT_AFTER_TOPUP");
    }

    return {
      treasuryBalanceBefore,
      treasuryBalanceAfter,
      topupTxHash: topupTx.hash,
    };
  };

  const grantRegisterBonus = async (params: {
    userId: string;
    address: string;
    username: string;
    amount: string;
    requestId: string;
  }) => {
    const { userId, address, username, amount, requestId } = params;
    const runtime = onchainManager.getRuntimeConfig();
    const tokenRuntime = runtime.tokens.zhixi;

    if (!runtime.rpcUrl || !runtime.adminPrivateKey || !tokenRuntime.enabled) {
      await walletRepo.updateBalance(address, amount, "zhixi");
      return {
        granted: true,
        mode: "db_fallback" as const,
        txHash: null,
        balance: amount,
      };
    }

    const client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
    const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
    const onchainBalanceBefore = await client.getBalance(address, tokenRuntime.contractAddress);
    if (onchainBalanceBefore > 0n) {
      const balance = client.formatUnits(onchainBalanceBefore, decimals);
      await walletRepo.updateBalance(address, balance, "zhixi");
      return {
        granted: false,
        mode: "already_funded" as const,
        txHash: null,
        balance,
      };
    }

    const treasuryAddress = tokenRuntime.lossPoolAddress || client.getWalletAddress();
    if (!treasuryAddress) {
      throw new Error("REGISTER_BONUS_TREASURY_MISSING");
    }

    const amountWei = client.parseUnits(amount, decimals);
    await ensureTreasuryLiquidity({
      client,
      contractAddress: tokenRuntime.contractAddress,
      treasuryAddress,
      decimals,
      requiredAmountWei: amountWei,
    });

    const intent: any = walletManager.createTxIntent(userId, "ZXC", "deposit", amount, requestId);
    intent.address = address;
    intent.contractAddress = tokenRuntime.contractAddress;
    intent.meta = {
      source: "register_bonus",
      username,
      mode: "admin_transfer",
      treasuryAddress,
      decimals,
    };
    await walletRepo.saveTxIntent(intent);

    let txHash: string | null = null;
    try {
      const tx = await client.adminTransfer(
        treasuryAddress,
        address,
        amountWei,
        tokenRuntime.contractAddress
      );
      txHash = tx.hash;
      await saveAttempt({
        txIntentId: intent.id,
        status: "broadcasting",
        txHash,
      });

      const receipt = await tx.wait();
      const reverted = !receipt || receipt.status !== 1;
      await saveAttempt({
        txIntentId: intent.id,
        status: reverted ? "reverted" : "confirmed",
        txHash,
        confirmedAt: new Date(),
      });
      await saveReceipt(intent.id, txHash, receipt, reverted ? "reverted" : "confirmed");

      if (reverted) {
        await walletRepo.saveTxIntent(
          walletManager.processTxIntent(intent, "reverted", txHash, "Register bonus reverted")
        );
        return {
          granted: false,
          mode: "admin_transfer" as const,
          txHash,
          error: "REGISTER_BONUS_REVERTED",
        };
      }

      await walletRepo.saveTxIntent(walletManager.processTxIntent(intent, "confirmed", txHash));
      const balanceAfter = client.formatUnits(
        await client.getBalance(address, tokenRuntime.contractAddress),
        decimals
      );
      await walletRepo.updateBalance(address, balanceAfter, "zhixi");
      await walletRepo.saveLedgerEntry({
        id: randomUUID(),
        userId,
        address,
        token: "zhixi",
        type: "register_bonus",
        amount,
        balanceBefore: client.formatUnits(onchainBalanceBefore, decimals),
        balanceAfter,
        txIntentId: intent.id,
        txHash,
        meta: {
          source: "register_bonus",
          username,
          mode: "admin_transfer",
          treasuryAddress,
        },
        createdAt: new Date(),
      });

      return {
        granted: true,
        mode: "admin_transfer" as const,
        txHash,
        balance: balanceAfter,
      };
    } catch (error: any) {
      await saveAttempt({
        txIntentId: intent.id,
        status: "failed",
        txHash,
        error: error?.message || "Register bonus failed",
        errorCode: "TX_BROADCAST_ERROR",
        confirmedAt: new Date(),
      });
      await walletRepo.saveTxIntent(
        walletManager.processTxIntent(
          intent,
          "failed",
          txHash || undefined,
          error?.message || "Register bonus failed"
        )
      );

      return {
        granted: false,
        mode: "admin_transfer" as const,
        txHash,
        error: error?.message || "Register bonus failed",
      };
    }
  };

  typedFastify.post("/create-session", async (request) => {
    try {
      const sessionId = `sess_${randomUUID().slice(0, 12)}`;
      const session = identityManager.createPendingSession(sessionId, {});
      await sessionRepo.saveSession(session);

      return createApiEnvelope({
        sessionId,
        deepLink: identityManager.buildDeepLink(sessionId),
        legacyDeepLink: identityManager.buildLegacyDeepLink(sessionId)
      }, request.id);
    } catch (e: any) {
      console.error(e);
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });

  typedFastify.get("/status", {
    schema: { querystring: z.object({ sessionId: z.string() }) },
  }, async (request) => {
    const { sessionId } = request.query;
    const session = await sessionRepo.getSessionById(sessionId);
    if (!session) return createApiEnvelope({ status: "expired" }, request.id);
    return createApiEnvelope({ status: session.status, address: session.address, publicKey: session.publicKey }, request.id);
  });

  typedFastify.post("/custody/login", {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
        platform: z.string().optional(),
        clientType: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional()
      })
    },
  }, async (request) => {
    try {
        const { username, password, platform, clientType, deviceId, appVersion } = request.body;
        const result = await authManager.loginCustody({
          username,
          password,
          platform,
          clientType,
          deviceId,
          appVersion
        });
        if (!result.success) {
          console.error("custody_login_failed", result.debug || result.error);
          return createApiEnvelope(null, request.id, false, result.error?.message);
        }
        return createApiEnvelope(result, request.id);
    } catch (e: any) {
        console.error(e);
        return createApiEnvelope(null, request.id, false, "INTERNAL_SERVER_ERROR");
    }
  });

  typedFastify.post("/custody/register", {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
        platform: z.string().optional(),
        clientType: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional()
      })
    },
  }, async (request) => {
    try {
        const { username, password, platform, clientType, deviceId, appVersion } = request.body;
        const result = await authManager.registerCustody({
          username,
          password,
          platform,
          clientType,
          deviceId,
          appVersion,
          bonusAmount: CUSTODY_REGISTER_BONUS
        });
        if (!result.success) return createApiEnvelope(null, request.id, false, result.error?.message);
        const registerBonus = result.user?.id && result.address
          ? await grantRegisterBonus({
              userId: result.user.id,
              address: result.address,
              username,
              amount: CUSTODY_REGISTER_BONUS,
              requestId: request.id,
            })
          : null;
        return createApiEnvelope({ ...result, registerBonus }, request.id);
    } catch (e: any) {
        console.error(e);
        return createApiEnvelope(null, request.id, false, "INTERNAL_SERVER_ERROR");
    }
  });

  typedFastify.get("/me", {
    schema: {
      querystring: z.object({ sessionId: z.string().optional() }).optional(),
    },
  }, async (request) => {
    try {
        const sessionId = (request.query as any)?.sessionId;
        if (!sessionId) return createApiEnvelope({ user: null }, request.id);

        const session = await sessionRepo.getSessionById(sessionId);
        if (!session || session.status !== "authorized") {
          return createApiEnvelope({ user: null }, request.id);
        }

        const user = await userRepo.getUserById(session.userId);
        const balance = await getLiveZhixiBalance(session.address);
        const totalBet = String(await kv.get<string | number>(`total_bet:${session.address}`) || "0");

        return createApiEnvelope({
          user,
          address: session.address,
          mode: session.mode,
          username: session.accountId,
          balance,
          totalBet,
        }, request.id);
    } catch (e: any) {
        console.error(e);
        return createApiEnvelope(null, request.id, false, "INTERNAL_SERVER_ERROR");
    }
  });
}
