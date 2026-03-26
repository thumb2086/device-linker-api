import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { IdentityManager, RewardManager } from "@repo/domain";
import { OpsRepository } from "@repo/infrastructure";

export async function meRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const identityManager = new IdentityManager();
  const rewardManager = new RewardManager();
  const opsRepo = new OpsRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/inventory", async (request) => {
    // Mock inventory
    const inventory = [
        { itemId: "box_01", name: "稀有寶箱", qty: 2, icon: "🎁" },
        { itemId: "buff_01", name: "獲利翻倍 (15m)", qty: 1, icon: "⚡" }
    ];
    return createApiEnvelope({ inventory }, request.id);
  });

  typedFastify.post("/use-item", {
    schema: {
        body: z.object({
            itemId: z.string()
        })
    }
  }, async (request) => {
      const { itemId } = request.body;
      // Simulation: logging the use
      await opsRepo.logEvent({
          channel: "inventory",
          severity: "info",
          source: "me_api",
          kind: "item_used",
          userId: mockUserId,
          message: `User used item ${itemId}`,
          meta: { itemId }
      });
      return createApiEnvelope({ success: true, message: `已使用 ${itemId}` }, request.id);
  });

  typedFastify.get("/profile", async (request) => {
    const profile = {
        address: "0x123...456",
        displayName: "賭神",
        level: 42,
        vipLevel: "VIP 1",
        totalBet: "1500000",
        equippedTitle: "傳傳奇玩家",
        equippedAvatar: "👤"
    };
    return createApiEnvelope({ profile }, request.id);
  });
}
