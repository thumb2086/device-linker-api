// apps/api/src/routes/v1/leaderboard.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { LeaderboardManager } from "@repo/domain/leaderboard/leaderboard-manager.js";
import * as schema from "@repo/infrastructure/db/schema.js";
import { requireDb } from "@repo/infrastructure/db/index.js";

export async function leaderboardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Helper to get context and address
  const getAddressFromRequest = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return undefined;
    
    const db = await requireDb();
    const session = await db.query.sessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, sessionId)
    });
    
    if (!session || session.status !== "authorized") return undefined;
    return session.address;
  };

  // GET /api/v1/leaderboard?type=all&limit=50&periodId=optional
  typedFastify.get("/", {
    schema: {
      querystring: z.object({
        type: z.enum(["all", "week", "month", "season", "asset"]).default("all"),
        limit: z.coerce.number().min(1).max(100).default(50),
        periodId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    },
  }, async (request) => {
    const { type, limit, periodId } = request.query as {
      type: "all" | "week" | "month" | "season" | "asset";
      limit: number;
      periodId?: string;
    };
    
    const selfAddress = await getAddressFromRequest(request);

    try {
      const db = await requireDb();
      const manager = new LeaderboardManager(db);

      if (type === "asset") {
        const includeMarketAssets = process.env.ASSET_LEADERBOARD_INCLUDE_MARKET === "true";
        const result = await manager.getAssetLeaderboard(selfAddress, limit, includeMarketAssets);
        return createApiEnvelope({ success: true, data: result }, request.id);
      }

      const result = await manager.getBetLeaderboard(
        type,
        selfAddress,
        limit,
        periodId
      );
      return createApiEnvelope({ success: true, data: result }, request.id);
    } catch (err: any) {
      console.error("[leaderboard] error:", err);
      return createApiEnvelope(
        { success: false, error: { code: "INTERNAL_ERROR", message: err.message } },
        request.id
      );
    }
  });
}
