// apps/api/src/routes/v1/vip.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, LEVEL_TIERS } from "@repo/shared";
import { VipManager } from "@repo/domain/levels/vip-manager.js";
import * as schema from "@repo/infrastructure/db/schema.js";
import { requireDb } from "@repo/infrastructure/db/index.js";

export async function vipRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Helper to get address from session
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

  // GET /api/v1/vip/me - Get own VIP status (auth required)
  typedFastify.get("/me", {
    schema: {
      querystring: z.object({
        sessionId: z.string(),
      }),
    },
  }, async (request) => {
    const { sessionId } = request.query as { sessionId: string };
    
    const db = await requireDb();
    const session = await db.query.sessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, sessionId)
    });
    
    if (!session || session.status !== "authorized") {
      return createApiEnvelope(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } },
        request.id
      );
    }

    const address = session.address;
    if (!address) {
      return createApiEnvelope(
        { success: false, error: { code: "USER_NOT_FOUND", message: "Address not found" } },
        request.id
      );
    }

    const vipManager = new VipManager();
    const status = await vipManager.getVipStatus(address);
    
    if (!status) {
      return createApiEnvelope(
        { success: false, error: { code: "USER_NOT_FOUND", message: "VIP status not found" } },
        request.id
      );
    }

    return createApiEnvelope({ success: true, data: status }, request.id);
  });

  // GET /api/v1/vip/:address - Get public VIP info for address
  typedFastify.get("/:address", {
    schema: {
      params: z.object({
        address: z.string(),
      }),
    },
  }, async (request) => {
    const { address } = request.params as { address: string };

    const db = await requireDb();
    const vipManager = new VipManager();
    const level = await vipManager.getVipLevel(address);

    return createApiEnvelope({
      success: true,
      data: {
        level: level.threshold,
        label: level.label,
        danmakuColor: level.danmakuColor ?? "#a0a0a0",
        danmakuPriority: level.danmakuPriority ?? 0,
      }
    }, request.id);
  });

  // GET /api/v1/vip/levels - Get full level table
  typedFastify.get("/levels", async (request) => {
    return createApiEnvelope({
      success: true,
      data: LEVEL_TIERS
    }, request.id);
  });
}
