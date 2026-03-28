import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, CUSTODY_REGISTER_BONUS } from "@repo/shared";
import { IdentityManager, AuthManager } from "@repo/domain";
import { kv, SessionRepository, UserRepository } from "@repo/infrastructure";
import crypto from "crypto";

const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

function getSafeBody(req: any): Record<string, any> {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return typeof req.body === "object" ? req.body : {};
}

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const authManager = new AuthManager(userRepo, sessionRepo, kv);

  // ─── Create Session (QR Login) ────────────────────────────────────────────

  typedFastify.post("/create-session", {
    schema: {
      body: z.object({
        ttl: z.union([z.number(), z.string(), z.null()]).optional(),
        platform: z.string().optional(),
        clientType: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional(),
      }).optional(),
    },
  }, async (request) => {
    const body = getSafeBody(request);
    const ttlSeconds = identityManager.parseSessionTTL(body.ttl);
    const sessionId = `sess_${crypto.randomUUID().slice(0, 16).replace(/-/g, "")}`;

    const session = identityManager.createPendingSession(sessionId, {
      ttlSeconds,
      platform: body.platform,
      clientType: body.clientType,
      deviceId: body.deviceId,
      appVersion: body.appVersion,
    });

    await sessionRepo.saveSession({ ...session, createdAt: new Date(), expiresAt: session.expiresAt ? new Date(session.expiresAt) : null });
    await kv.set(`session:${sessionId}`, session, { ex: ttlSeconds ?? 600 });

    const deepLink = identityManager.buildDeepLink(sessionId);
    const legacyDeepLink = identityManager.buildLegacyDeepLink(sessionId);

    return createApiEnvelope({ sessionId, deepLink, legacyDeepLink }, request.id);
  });

  // ─── Session Status ────────────────────────────────────────────────────────

  typedFastify.get("/status", {
    schema: {
      querystring: z.object({ sessionId: z.string() }),
    },
  }, async (request) => {
    const { sessionId } = request.query;
    const kvSession = await kv.get<any>(`session:${sessionId}`);
    if (kvSession) {
      return createApiEnvelope({ status: kvSession.status, address: kvSession.address, mode: kvSession.mode }, request.id);
    }
    const session = await sessionRepo.getSessionById(sessionId);
    if (!session || (session.expiresAt && new Date() > new Date(session.expiresAt))) {
      return createApiEnvelope({ status: "expired" }, request.id);
    }
    return createApiEnvelope({ status: session.status, address: session.address, mode: session.mode }, request.id);
  });

  // ─── Authorize (wallet sign) ───────────────────────────────────────────────

  typedFastify.post("/authorize", {
    schema: {
      body: z.object({
        address: z.string(),
        sessionId: z.string(),
        publicKey: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { address, sessionId, publicKey } = request.body;
    const normalizedAddress = identityManager.tryNormalizeAddress(address);
    if (!normalizedAddress) {
      return createApiEnvelope(null, request.id, false, "Invalid address");
    }

    const session = await sessionRepo.getSessionById(sessionId);
    if (!session) {
      return createApiEnvelope(null, request.id, false, "Session not found");
    }

    const blacklisted = await kv.get<any>(`blacklist:${normalizedAddress}`);
    if (blacklisted) {
      return createApiEnvelope(null, request.id, false, "Address is blacklisted");
    }

    let user = await userRepo.getUserByAddress(normalizedAddress);
    if (!user) {
      user = { id: crypto.randomUUID(), address: normalizedAddress, createdAt: new Date(), updatedAt: new Date() };
      await userRepo.saveUser(user);
    }

    const updatedSession = identityManager.createAuthorizedSession(sessionId, normalizedAddress, publicKey || "0x", {
      mode: "live",
      ttlSeconds: 86400,
    });

    await sessionRepo.saveSession({ ...updatedSession, userId: user.id, authorizedAt: new Date() });
    await kv.set(`session:${sessionId}`, updatedSession, { ex: 86400 });

    return createApiEnvelope({ user, sessionId }, request.id);
  });

  // ─── Custody Register ──────────────────────────────────────────────────────

  typedFastify.post("/custody/register", {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
      }),
    },
  }, async (request) => {
    const { username, password } = request.body;
    const result = await authManager.registerCustody({
        username,
        password,
        bonusAmount: CUSTODY_REGISTER_BONUS
    });

    if (!result.success) {
        return createApiEnvelope(null, request.id, false, result.error?.message || "Registration failed");
    }

    return createApiEnvelope(result, request.id);
  });

  // ─── Custody Login ─────────────────────────────────────────────────────────

  typedFastify.post("/custody/login", {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
      }),
    },
  }, async (request) => {
    const { username, password } = request.body;
    const result = await authManager.loginCustody({ username, password });

    if (!result.success) {
        return createApiEnvelope(null, request.id, false, result.error?.message || "Login failed");
    }

    return createApiEnvelope(result, request.id);
  });

  // ─── Get Me ────────────────────────────────────────────────────────────────

  typedFastify.get("/me", {
    schema: {
      querystring: z.object({ sessionId: z.string().optional() }).optional(),
    },
  }, async (request) => {
    const sessionId = (request.query as any)?.sessionId;
    if (!sessionId) return createApiEnvelope({ user: null }, request.id);

    const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
    if (!session || session.status !== "authorized") {
      return createApiEnvelope({ user: null }, request.id);
    }

    const user = await userRepo.getUserById(session.userId);
    const balance = await kv.get<string>(`balance:${session.address}`) || "0";
    const totalBet = await kv.get<string>(`total_bet:${session.address}`) || "0";

    return createApiEnvelope({
      user,
      address: session.address,
      mode: session.mode,
      username: session.accountId,
      balance,
      totalBet,
    }, request.id);
  });

  // ─── Logout ────────────────────────────────────────────────────────────────

  typedFastify.post("/logout", {
    schema: {
      body: z.object({ sessionId: z.string() }),
    },
  }, async (request) => {
    await authManager.logout(request.body.sessionId);
    return createApiEnvelope({ success: true }, request.id);
  });
}
