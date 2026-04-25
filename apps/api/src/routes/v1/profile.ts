import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { ProfileManager, SettingsManager, SoundManager } from "@repo/domain";
import { UserRepository, SessionRepository } from "@repo/infrastructure";

export async function profileRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const profileManager = new ProfileManager(userRepo, sessionRepo);
  const settingsManager = new SettingsManager(userRepo);
  const soundManager = new SoundManager(userRepo);
  const prefsSchema = z.object({
    amountDisplay: z.enum(["compact", "full"]).optional(),
    danmuEnabled: z.boolean().optional(),
    masterVolume: z.number().min(0).max(1).optional(),
    bgmEnabled: z.boolean().optional(),
    bgmVolume: z.number().min(0).max(1).optional(),
    sfxEnabled: z.boolean().optional(),
    sfxVolume: z.number().min(0).max(1).optional(),
  });

  typedFastify.post("/set-username", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        username: z.string().min(2).max(20)
      })
    }
  }, async (request) => {
    const { sessionId, username } = request.body;
    const session = await sessionRepo.getSessionById(sessionId);

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
    const session = await sessionRepo.getSessionById(sessionId);
    if (!session || !session.userId) return createApiEnvelope(null, request.id, false, "Unauthorized");

    try {
        return createApiEnvelope(await soundManager.getPrefs(session.userId), request.id);
    } catch (e) {
        return createApiEnvelope(null, request.id, false, "Failed to load sound prefs");
    }
  });

  typedFastify.post("/sound-prefs", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        prefs: z.object({
          masterVolume: z.number().min(0).max(1).optional(),
          bgmEnabled: z.boolean().optional(),
          bgmVolume: z.number().min(0).max(1).optional(),
          sfxEnabled: z.boolean().optional(),
          sfxVolume: z.number().min(0).max(1).optional(),
          volume: z.number().min(0).max(1).optional()
        })
      })
    }
  }, async (request) => {
    const { sessionId, prefs } = request.body;
    const session = await sessionRepo.getSessionById(sessionId);
    if (!session || !session.userId) return createApiEnvelope(null, request.id, false, "Unauthorized");
    const nextPrefs = await soundManager.savePrefs(session.userId, prefs);
    return createApiEnvelope(nextPrefs, request.id);
  });

  typedFastify.get("/prefs", {
    schema: {
      querystring: z.object({
        sessionId: z.string()
      })
    }
  }, async (request) => {
    try {
      const { sessionId } = request.query;
      const session = await sessionRepo.getSessionById(sessionId);
      if (!session || !session.userId) return createApiEnvelope(null, request.id, false, "Unauthorized");

      const user = await userRepo.getUserById(session.userId);
      const prefs = await settingsManager.getSettings(session.userId);
      return createApiEnvelope({
        displayName: user?.displayName || null,
        prefs,
      }, request.id);
    } catch (err: any) {
      console.error("[profile/prefs] GET error:", err);
      return createApiEnvelope(null, request.id, false, "Failed to load preferences: " + (err.message || "Unknown error"));
    }
  });

  typedFastify.post("/prefs", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        prefs: prefsSchema,
      }),
    },
  }, async (request) => {
    try {
      const { sessionId, prefs } = request.body;
      const session = await sessionRepo.getSessionById(sessionId);
      if (!session || !session.userId) return createApiEnvelope(null, request.id, false, "Unauthorized");
      const nextPrefs = await settingsManager.saveSettings(session.userId, prefs);
      return createApiEnvelope(nextPrefs, request.id);
    } catch (err: any) {
      console.error("[profile/prefs] POST error:", err);
      return createApiEnvelope(null, request.id, false, "Failed to save preferences: " + (err.message || "Unknown error"));
    }
  });
}
