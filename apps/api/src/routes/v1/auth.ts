import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { IdentityManager } from "@repo/domain";
import { kv, SessionRepository, UserRepository } from "@repo/infrastructure";

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();

  typedFastify.post("/create-session", async (request) => {
    const sessionId = `sess_${crypto.randomUUID().slice(0, 16).replace(/-/g, '')}`;

    const session = {
      id: sessionId,
      status: "pending",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600 * 1000)
    };

    await sessionRepo.saveSession(session);
    // Backward compatibility with polling if needed via KV
    await kv.set(`session:${sessionId}`, session, { ex: 600 });

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
    const session = await sessionRepo.getSessionById(sessionId);

    if (!session || new Date() > session.expiresAt) {
      return createApiEnvelope({ status: "expired" }, request.id);
    }

    return createApiEnvelope({ status: session.status, address: session.address }, request.id);
  });

  typedFastify.post("/authorize", {
    schema: {
      body: z.object({
        address: z.string().length(42),
        sessionId: z.string(),
        publicKey: z.string().optional()
      }),
    },
  }, async (request) => {
    const { address, sessionId, publicKey } = request.body;

    const session = await sessionRepo.getSessionById(sessionId);
    if (!session) {
        return createApiEnvelope({ error: { message: "Session not found" } }, request.id);
    }

    let user = await userRepo.getUserByAddress(address);
    if (!user) {
      user = identityManager.createUser(address);
      await userRepo.saveUser(user);
    }

    const updatedSession = {
      ...session,
      status: "authorized",
      userId: user.id,
      address,
      publicKey: publicKey || "0x",
      expiresAt: new Date(Date.now() + 86400 * 1000)
    };

    await sessionRepo.saveSession(updatedSession);
    await kv.set(`session:${sessionId}`, updatedSession, { ex: 86400 });

    return createApiEnvelope({ user, sessionId }, request.id);
  });

  // Managed login (bypass QR)
  typedFastify.post("/login/managed", {
    schema: {
        body: z.object({
            address: z.string().length(42),
            key: z.string()
        })
    }
  }, async (request) => {
      const { address } = request.body;
      const sessionId = `sess_managed_${crypto.randomUUID().slice(0, 8)}`;

      let user = await userRepo.getUserByAddress(address);
      if (!user) {
        user = identityManager.createUser(address);
        await userRepo.saveUser(user);
      }

      const session = {
          id: sessionId,
          userId: user.id,
          status: "authorized",
          address,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400 * 1000)
      };

      await sessionRepo.saveSession(session);
      await kv.set(`session:${sessionId}`, session, { ex: 86400 });

      return createApiEnvelope({ user, sessionId }, request.id);
  });

  typedFastify.get("/me", {
    schema: {
      querystring: z.object({
        sessionId: z.string().optional(),
      }).optional(),
    }
  }, async (request) => {
    const sessionId = (request.query as any)?.sessionId;
    if (sessionId) {
      const session = await sessionRepo.getSessionById(sessionId);
      if (session?.status === "authorized" && session.userId) {
        const user = await userRepo.getUserById(session.userId);
        return createApiEnvelope({ user }, request.id);
      }
    }
    return createApiEnvelope({ user: null }, request.id);
  });
}
