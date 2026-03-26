import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { OpsRepository } from "@repo/infrastructure";

export async function adminRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const opsRepo = new OpsRepository();

  typedFastify.get("/ops/health", async (request) => {
    return createApiEnvelope({ status: "ok" }, request.id);
  });

  typedFastify.get("/ops/events", async (request) => {
    // In real implementation, query opsEvents table
    return createApiEnvelope({ events: [] }, request.id);
  });
}
