import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, CUSTODY_REGISTER_BONUS } from "@repo/shared";
import { IdentityManager, AuthManager } from "@repo/domain";
import {
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

  typedFastify.post("/create-session", async (request) => {
    try {
      const sessionId = `sess_${randomUUID().slice(0, 12)}`;
      const session = identityManager.createPendingSession(sessionId, {});
      await sessionRepo.saveSession(session);
      // Optional: keep kv for short term but don't fail if it hits limits
      try { await kv.set(`session:${sessionId}`, session, { ex: 3600 }); } catch (e) {}

      return createApiEnvelope({
        sessionId,
        deepLink: identityManager.buildDeepLink(sessionId),
        legacyDeepLink: identityManager.buildLegacyDeepLink(sessionId)
      }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });

  typedFastify.get("/status", {
    schema: { querystring: z.object({ sessionId: z.string() }) },
  }, async (request) => {
    const { sessionId } = request.query;
    // Prefer DB if KV is unreliable
    const session = await sessionRepo.getSessionById(sessionId);
    if (!session) return createApiEnvelope({ status: "expired" }, request.id);
    return createApiEnvelope({ status: session.status, address: session.address }, request.id);
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
    const { username, password, platform, clientType, deviceId, appVersion } = request.body;
    const result = await authManager.loginCustody({
      username,
      password,
      platform,
      clientType,
      deviceId,
      appVersion
    });
    if (!result.success) return createApiEnvelope(null, request.id, false, result.error?.message);
    return createApiEnvelope(result, request.id);
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
  });

  typedFastify.get("/me", {
    schema: {
      querystring: z.object({ sessionId: z.string().optional() }).optional(),
    },
  }, async (request) => {
    const sessionId = (request.query as any)?.sessionId;
    if (!sessionId) return createApiEnvelope({ user: null }, request.id);

    const session = await sessionRepo.getSessionById(sessionId);
    if (!session || session.status !== "authorized") {
      return createApiEnvelope({ user: null }, request.id);
    }

    const user = await userRepo.getUserById(session.userId);
    const balance = await walletRepo.getBalance(session.address);
    const totalBet = "0";

    return createApiEnvelope({
      user,
      address: session.address,
      mode: session.mode,
      username: session.accountId,
      balance,
      totalBet,
    }, request.id);
  });
}
