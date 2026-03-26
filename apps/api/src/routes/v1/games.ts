import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameManager } from "@repo/domain";
import { WalletRepository, OpsRepository } from "@repo/infrastructure";

export async function gameRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const gameManager = new GameManager();
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.post("/:game/rounds", {
    schema: {
      params: z.object({
        game: z.string(),
      }),
    },
  }, async (request) => {
    const { game } = request.params;
    const now = new Date();
    const round = gameManager.createRound(
      game,
      `ext_${Date.now()}`,
      now,
      new Date(now.getTime() + 30000),
      new Date(now.getTime() + 25000)
    );
    return createApiEnvelope({ round }, request.id);
  });

  typedFastify.post("/:game/rounds/:roundId/actions", {
    schema: {
      params: z.object({
        game: z.string(),
        roundId: z.string().uuid(),
      }),
      body: z.object({
        type: z.enum(["bet"]),
        amount: z.string(),
        token: z.enum(["ZXC", "YJC"]),
        payload: z.any(),
      }),
    },
  }, async (request) => {
    const { game, roundId } = request.params;
    const { type, amount, token, payload } = request.body;
    const action = gameManager.createAction(mockUserId, roundId, game, amount, token, payload);

    // Logic to resolve and create intent
    let result: any = null;
    if (game === "coinflip") {
      result = gameManager.resolveCoinflip(payload.selection, roundId);
    } else if (game === "slots") {
      result = gameManager.resolveSlots(parseFloat(amount), roundId);
    } else if (game === "horse") {
      result = gameManager.resolveHorseRace(payload.horseId, roundId);
    } else if (game === "sicbo") {
      result = gameManager.resolveSicbo(payload.bets || [], roundId);
    } else if (game === "bingo") {
      result = gameManager.resolveBingo(payload.numbers || [], roundId);
    } else if (game === "roulette") {
      result = gameManager.resolveRoulette(payload.bets || [], roundId);
    }

    // Persist result (simplified: actual payout would create tx_intents)
    try {
        await opsRepo.logEvent({
            channel: "game",
            severity: "info",
            source: game,
            kind: "round_settled",
            userId: mockUserId,
            game,
            roundId,
            requestId: request.id,
            message: `Game ${game} settled with result: ${JSON.stringify(result)}`,
            meta: result
        });
    } catch (err) {
        fastify.log.error(err);
    }

    return createApiEnvelope({ action, result }, request.id);
  });
}
