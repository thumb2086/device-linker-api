import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { CUSTODY_REGISTER_BONUS } from "@repo/shared";
import { IdentityManager } from "@repo/domain";
import { kv, SessionRepository, UserRepository } from "@repo/infrastructure";

const CUSTODY_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

function getSafeBody(req: any): Record<string, any> {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return typeof req.body === "object" ? req.body : {};
}

function custodyUserKey(username: string) {
  return `custody_user:${username}`;
}

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();

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
    // Try KV first for speed
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
        platform: z.string().optional(),
        clientType: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { address, sessionId, publicKey, platform, clientType, deviceId, appVersion } = request.body;

    const normalizedAddress = identityManager.tryNormalizeAddress(address);
    if (!normalizedAddress) {
      return createApiEnvelope({ error: { code: "INVALID_ADDRESS", message: "Invalid address" } }, request.id);
    }

    const session = await sessionRepo.getSessionById(sessionId);
    if (!session) {
      return createApiEnvelope({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } }, request.id);
    }

    // Blacklist check
    const blacklisted = await kv.get<any>(`blacklist:${normalizedAddress}`);
    if (blacklisted) {
      return createApiEnvelope({ error: { code: "BLACKLISTED", message: "This address is not permitted" } }, request.id);
    }

    let user = await userRepo.getUserByAddress(normalizedAddress);
    if (!user) {
      user = (identityManager as any).createUser?.(normalizedAddress) ?? {
        id: crypto.randomUUID(),
        address: normalizedAddress,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await userRepo.saveUser(user);
    }

    const updatedSession = identityManager.createAuthorizedSession(sessionId, normalizedAddress, publicKey || "0x", {
      mode: "live",
      platform,
      clientType,
      deviceId,
      appVersion,
      ttlSeconds: 86400,
    });

    await sessionRepo.saveSession({ ...updatedSession, userId: user.id, authorizedAt: new Date(), createdAt: new Date(), expiresAt: updatedSession.expiresAt ? new Date(updatedSession.expiresAt) : null });
    await kv.set(`session:${sessionId}`, updatedSession, { ex: 86400 });

    return createApiEnvelope({ user, sessionId }, request.id);
  });

  // ─── Custody Register ──────────────────────────────────────────────────────

  typedFastify.post("/custody/register", {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
        platform: z.string().optional(),
        clientType: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { username, password, platform, clientType, deviceId, appVersion } = request.body;
    const normalizedUsername = String(username || "").trim().toLowerCase();

    if (!CUSTODY_USERNAME_REGEX.test(normalizedUsername)) {
      return createApiEnvelope({ error: { code: "INVALID_USERNAME", message: "Invalid username format (3-32 alphanumeric + underscore)" } }, request.id);
    }

    const validationError = identityManager.validatePassword(password);
    if (validationError) {
      return createApiEnvelope({ error: { code: "INVALID_PASSWORD", message: validationError } }, request.id);
    }

    const existingKV = await kv.get<any>(custodyUserKey(normalizedUsername));
    if (existingKV) {
      return createApiEnvelope({ error: { code: "USERNAME_TAKEN", message: "Username already taken" } }, request.id);
    }

    const custodyUser = identityManager.createCustodyUser(normalizedUsername, password);
    await kv.set(custodyUserKey(normalizedUsername), { ...custodyUser, username: normalizedUsername });

    // Seed balance with register bonus
    const bonusKey = `balance:${custodyUser.address}`;
    const existing = await kv.get<string>(bonusKey);
    if (!existing) {
      await kv.set(bonusKey, CUSTODY_REGISTER_BONUS);
    }

    // Upsert user record
    let user = await userRepo.getUserByAddress(custodyUser.address);
    if (!user) {
      user = { id: crypto.randomUUID(), address: custodyUser.address, createdAt: new Date(), updatedAt: new Date() } as any;
      await userRepo.saveUser(user);
    }

    const sessionId = `sess_custody_${crypto.randomUUID().slice(0, 12)}`;
    const session = identityManager.createAuthorizedSession(sessionId, custodyUser.address, custodyUser.publicKey, {
      mode: "custody",
      accountId: normalizedUsername,
      platform,
      clientType,
      deviceId,
      appVersion,
      ttlSeconds: 86400,
    });

    await sessionRepo.saveSession({ ...session, userId: user!.id, authorizedAt: new Date(), createdAt: new Date(), expiresAt: session.expiresAt ? new Date(session.expiresAt) : null });
    await kv.set(`session:${sessionId}`, session, { ex: 86400 });

    return createApiEnvelope({
      sessionId,
      address: custodyUser.address,
      username: normalizedUsername,
      bonus: CUSTODY_REGISTER_BONUS,
    }, request.id);
  });

  // ─── Custody Login ─────────────────────────────────────────────────────────

  typedFastify.post("/custody/login", {
    schema: {
      body: z.object({
        username: z.string(),
        password: z.string(),
        platform: z.string().optional(),
        clientType: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { username, password, platform, clientType, deviceId, appVersion } = request.body;
    const normalizedUsername = String(username || "").trim().toLowerCase();

    if (!CUSTODY_USERNAME_REGEX.test(normalizedUsername)) {
      return createApiEnvelope({ error: { code: "INVALID_USERNAME", message: "Invalid credentials" } }, request.id);
    }

    const custodyUser = await kv.get<any>(custodyUserKey(normalizedUsername));
    if (!custodyUser || !custodyUser.address) {
      return createApiEnvelope({ error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } }, request.id);
    }

    const completed = identityManager.ensureCustodyPublicKey(custodyUser);
    const verified = identityManager.verifyCustodyPassword(completed, password);
    if (!verified) {
      return createApiEnvelope({ error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } }, request.id);
    }

    // Blacklist check
    const blacklisted = await kv.get<any>(`blacklist:${completed.address}`);
    if (blacklisted) {
      return createApiEnvelope({ error: { code: "BLACKLISTED", message: "This account is restricted" } }, request.id);
    }

    let user = await userRepo.getUserByAddress(completed.address);
    if (!user) {
      user = { id: crypto.randomUUID(), address: completed.address, createdAt: new Date(), updatedAt: new Date() } as any;
      await userRepo.saveUser(user!);
    }

    const sessionId = `sess_custody_${crypto.randomUUID().slice(0, 12)}`;
    const session = identityManager.createAuthorizedSession(sessionId, completed.address, completed.publicKey, {
      mode: "custody",
      accountId: normalizedUsername,
      platform,
      clientType,
      deviceId,
      appVersion,
      ttlSeconds: 86400,
    });

    await sessionRepo.saveSession({ ...session, userId: user!.id, authorizedAt: new Date(), createdAt: new Date(), expiresAt: session.expiresAt ? new Date(session.expiresAt) : null });
    await kv.set(`session:${sessionId}`, session, { ex: 86400 });

    return createApiEnvelope({ sessionId, address: completed.address, username: normalizedUsername }, request.id);
  });

  // ─── Change Custody Password ───────────────────────────────────────────────

  typedFastify.post("/custody/change-password", {
    schema: {
      body: z.object({
        username: z.string(),
        currentPassword: z.string(),
        newPassword: z.string(),
      }),
    },
  }, async (request) => {
    const { username, currentPassword, newPassword } = request.body;
    const normalizedUsername = String(username || "").trim().toLowerCase();

    const custodyUser = await kv.get<any>(custodyUserKey(normalizedUsername));
    if (!custodyUser) {
      return createApiEnvelope({ error: { code: "NOT_FOUND", message: "Account not found" } }, request.id);
    }

    const verified = identityManager.verifyCustodyPassword(custodyUser, currentPassword);
    if (!verified) {
      return createApiEnvelope({ error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect" } }, request.id);
    }

    const validationError = identityManager.validatePassword(newPassword);
    if (validationError) {
      return createApiEnvelope({ error: { code: "INVALID_PASSWORD", message: validationError } }, request.id);
    }

    const updated = identityManager.resetCustodyPassword(custodyUser, newPassword);
    await kv.set(custodyUserKey(normalizedUsername), { ...updated, username: normalizedUsername });

    return createApiEnvelope({ success: true, message: "Password updated" }, request.id);
  });

  // ─── Get Me ────────────────────────────────────────────────────────────────

  typedFastify.get("/me", {
    schema: {
      querystring: z.object({ sessionId: z.string().optional() }).optional(),
    },
  }, async (request) => {
    const sessionId = (request.query as any)?.sessionId;
    if (!sessionId) return createApiEnvelope({ user: null }, request.id);

    const kvSession = await kv.get<any>(`session:${sessionId}`);
    const session = kvSession || await sessionRepo.getSessionById(sessionId);

    if (!session || session.status !== "authorized") {
      return createApiEnvelope({ user: null }, request.id);
    }

    const user = session.userId ? await userRepo.getUserById(session.userId) : null;
    const totalBet = await kv.get<string>(`total_bet:${session.address}`) || "0";
    const balance = await kv.get<string>(`balance:${session.address}`) || "0";

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
    const { sessionId } = request.body;
    await kv.del(`session:${sessionId}`);
    const session = await sessionRepo.getSessionById(sessionId);
    if (session) {
      await sessionRepo.saveSession({ ...session, status: "expired" });
    }
    return createApiEnvelope({ success: true }, request.id);
  });
}
