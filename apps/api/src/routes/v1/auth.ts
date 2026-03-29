import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, CUSTODY_REGISTER_BONUS } from "@repo/shared";
import { IdentityManager, AuthManager, OnchainWalletManager } from "@repo/domain";
import {
  ChainClient,
  kv,
  SessionRepository,
  UserRepository,
  CustodyRepository,
  WalletRepository
} from "@repo/infrastructure";
import { randomUUID } from "crypto";

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const onchainManager = new OnchainWalletManager();
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
        return createApiEnvelope(result, request.id);
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
