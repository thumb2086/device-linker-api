import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { ProfileManager } from "@repo/domain";
import { UserRepository, SessionRepository, kv } from "@repo/infrastructure";

export async function profileRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const userRepo = new UserRepository();
  const sessionRepo = new SessionRepository();
  const profileManager = new ProfileManager(userRepo, sessionRepo);

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
}
