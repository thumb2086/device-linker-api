import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { ProfileManager, SoundManager } from "@repo/domain";
import { UserRepository, SessionRepository, kv } from "@repo/infrastructure";

export async function profileRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const profileManager = new ProfileManager(userRepo, sessionRepo);
  const soundManager = new SoundManager(kv);

  typedFastify.post("/set-username", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        username: z.string().min(2).max(20)
      })
    }
  }, async (request) => {
    const { sessionId, username } = request.body;
    const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);

    if (!session || session.status !== "authorized") {
      return createApiEnvelope(null, request.id, false, "Unauthorized");
    }

    const result = await profileManager.setUsername(session.userId, username);
    if (!result.success) return createApiEnvelope(null, request.id, false, result.error);

    return createApiEnvelope({ success: true }, request.id);
  });

  typedFastify.get("/sound-prefs", {
    schema: {
      querystring: z.object({
        sessionId: z.string()
      })
    }
  }, async (request) => {
    const { sessionId } = request.query;
    const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
    if (!session || !session.userId) return createApiEnvelope(null, request.id, false, "Unauthorized");

    const prefs = await soundManager.getPrefs(session.userId);
    return createApiEnvelope(prefs, request.id);
  });

  typedFastify.post("/sound-prefs", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        prefs: z.object({
          bgmEnabled: z.boolean(),
          sfxEnabled: z.boolean(),
          volume: z.number().min(0).max(1)
        })
      })
    }
  }, async (request) => {
    const { sessionId, prefs } = request.body;
    const session = await kv.get<any>(`session:${sessionId}`) || await sessionRepo.getSessionById(sessionId);
    if (!session || !session.userId) return createApiEnvelope(null, request.id, false, "Unauthorized");

    await soundManager.savePrefs(session.userId, prefs);
    return createApiEnvelope({ success: true }, request.id);
  });
}
