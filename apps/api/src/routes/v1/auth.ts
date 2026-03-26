import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { IdentityManager } from "@repo/domain";
import { kv } from "@repo/infrastructure";

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();

  typedFastify.post("/create-session", async (request) => {
    const sessionId = `sess_${crypto.randomUUID().slice(0, 8)}`;
    // Set initial session state in KV
    await kv.set(`session:${sessionId}`, { status: "pending", createdAt: Date.now() }, { ex: 600 });
    return createApiEnvelope({ sessionId }, request.id);
  });

  typedFastify.get("/status", {
    schema: {
      querystring: z.object({
        sessionId: z.string(),
      }),
    },
  }, async (request) => {
    const { sessionId } = request.query;
    const sessionData: any = await kv.get(`session:${sessionId}`);

    if (!sessionData) {
      return createApiEnvelope({ status: "expired" }, request.id);
    }

    return createApiEnvelope({ status: sessionData.status, address: sessionData.address }, request.id);
  });

  typedFastify.post("/authorize", {
    schema: {
      body: z.object({
        address: z.string().length(42),
        sessionId: z.string(),
      }),
    },
  }, async (request) => {
    const { address, sessionId } = request.body;
    const user = identityManager.createUser(address);

    // Update session state in KV to authorized
    await kv.set(`session:${sessionId}`, {
      status: "authorized",
      address,
      authorizedAt: Date.now()
    }, { ex: 3600 });

    return createApiEnvelope({ user, sessionId }, request.id);
  });

  typedFastify.get("/me", {
    schema: {
      querystring: z.object({
        sessionId: z.string().optional(),
      }).optional(),
    }
  }, async (request) => {
    // In a real app, we'd check the session from cookie or header
    // For now, allow optional sessionId query for testing
    const sessionId = (request.query as any)?.sessionId;
    if (sessionId) {
      const sessionData: any = await kv.get(`session:${sessionId}`);
      if (sessionData?.status === "authorized") {
        const user = identityManager.createUser(sessionData.address);
        return createApiEnvelope({ user }, request.id);
      }
    }
    return createApiEnvelope({ user: null }, request.id);
  });
}
