import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, CUSTODY_REGISTER_BONUS } from "@repo/shared";
import { IdentityManager, AuthManager } from "@repo/domain";
import { kv, SessionRepository, UserRepository } from "@repo/infrastructure";
import { randomUUID } from "crypto";

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const authManager = new AuthManager(userRepo, sessionRepo, kv);

  typedFastify.post("/create-session", async (request) => {
    try {
      const sessionId = `sess_${randomUUID().slice(0, 12)}`;
      const session = identityManager.createPendingSession(sessionId, {});
      await sessionRepo.saveSession(session);
      await kv.set(`session:${sessionId}`, session, { ex: 3600 });

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
    const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
    if (!session) return createApiEnvelope({ status: "expired" }, request.id);
    return createApiEnvelope({ status: session.status, address: session.address }, request.id);
  });

  typedFastify.post("/custody/login", {
    schema: { body: z.object({ username: z.string(), password: z.string() }) },
  }, async (request) => {
    const result = await authManager.loginCustody(request.body);
    if (!result.success) return createApiEnvelope(null, request.id, false, result.error?.message);
    return createApiEnvelope(result, request.id);
  });
}
