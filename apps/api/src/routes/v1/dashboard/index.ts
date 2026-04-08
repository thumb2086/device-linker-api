import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { DashboardService } from "@repo/on-chain";
import { createApiEnvelope } from "@repo/shared";

const querySchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  address: z.string().optional(),
  gameType: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(20),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function dashboardRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();
  const dashboard = new DashboardService();

  typed.get("/transactions", { schema: { querystring: querySchema } }, async (request) => {
    const q = request.query as z.infer<typeof querySchema>;
    const status = Array.isArray(q.status) ? q.status : (q.status ? [q.status] : undefined);

    const result = await dashboard.getTransactions({
      status,
      userAddress: q.address,
      gameType: q.gameType,
      startDate: q.startDate ? new Date(q.startDate) : undefined,
      endDate: q.endDate ? new Date(q.endDate) : undefined,
      page: q.page,
      limit: q.limit,
    });

    return createApiEnvelope({ success: true, data: result }, request.id);
  });

  typed.get("/summary", {
    schema: { querystring: z.object({ address: z.string().optional() }) },
  }, async (request) => {
    const { address } = request.query as { address?: string };
    const summary = await dashboard.getSummary(address);
    return createApiEnvelope({ success: true, data: summary }, request.id);
  });
}
