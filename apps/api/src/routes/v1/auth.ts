import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { IdentityManager } from "@repo/domain";
import { UserRepository, OpsRepository } from "@repo/infrastructure";

export async function authRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();

  typedFastify.post("/authorize", {
    schema: {
      body: z.object({
        address: z.string().length(42),
        sessionId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { address, sessionId } = request.body;
    const user = identityManager.createUser(address);
    return createApiEnvelope({ user, sessionId }, request.id);
  });

  typedFastify.get("/me", async (request) => {
    return createApiEnvelope({ user: null }, request.id);
  });
}
