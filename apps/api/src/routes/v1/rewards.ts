import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { RewardManager } from "@repo/domain";
import { MetaRepository, OpsRepository } from "@repo/infrastructure";

export async function rewardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const rewardManager = new RewardManager();
  const metaRepo = new MetaRepository();
  const opsRepo = new OpsRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/summary", async (request) => {
    // Mock summary for now
    const catalog = {
        titles: [
            { id: "legend", name: "傳奇賭神", price: "50000000", rarity: "legendary" },
            { id: "whale", name: "大鯨魚", price: "10000000", rarity: "epic" }
        ],
        campaigns: [
            { id: "daily", title: "每日登入", rewards: { tokens: "100" } }
        ]
    };
    return createApiEnvelope({ catalog }, request.id);
  });

  typedFastify.post("/claim", {
    schema: {
        body: z.object({
            campaignId: z.string()
        })
    }
  }, async (request) => {
      const { campaignId } = request.body;
      const grant = rewardManager.grantReward(mockUserId, "daily_bonus", "item");
      await metaRepo.saveRewardGrant(grant);
      await opsRepo.logEvent({
          channel: "rewards",
          severity: "info",
          source: "rewards_api",
          kind: "campaign_claimed",
          userId: mockUserId,
          message: `User claimed campaign ${campaignId}`,
          meta: { campaignId }
      });
      return createApiEnvelope({ success: true, grant }, request.id);
  });
}
