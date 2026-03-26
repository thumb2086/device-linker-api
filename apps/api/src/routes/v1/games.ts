import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameManager, RoomManager, WalletManager } from "@repo/domain";
import { WalletRepository, OpsRepository, GameRepository } from "@repo/infrastructure";

export async function gameRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const gameManager = new GameManager();
  const walletManager = new WalletManager();
  const roomManager = new RoomManager();
  const walletRepo = new WalletRepository();
  const gameRepo = new GameRepository();
  const opsRepo = new OpsRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.post("/:game/rounds", {
    schema: {
      params: z.object({
        game: z.string(),
      }),
      body: z.object({
          amount: z.number().optional(),
          action: z.any().optional()
      }).optional()
    },
  }, async (request) => {
    const { game } = request.params;
    const body = request.body as any;
    const amount = body?.amount || 0;
    const payload = body?.action || {};

    const now = new Date();
    const roundId = `ext_${Date.now()}`;
    const round = gameManager.createRound(
      game,
      roundId,
      now,
      new Date(now.getTime() + 30000),
      new Date(now.getTime() + 25000)
    );

    // If it's a single-step game (slots, etc), resolve immediately
    let result: any = null;
    if (game === "slots") {
        result = gameManager.resolveSlots(amount, roundId);
    } else if (game === "coinflip" && amount > 0) {
        result = gameManager.resolveCoinflip(payload.selection, roundId);
    } else if (game === "bingo" && amount > 0) {
        result = gameManager.resolveBingo(payload.numbers || [], roundId);
    } else if (game === "sicbo" && amount > 0) {
        result = gameManager.resolveSicbo(payload.bets || [], roundId);
    } else if (game === "horse" && amount > 0) {
        result = gameManager.resolveHorseRace(payload.horseId, roundId);
    }

    if (result) {
        round.status = "settled";
        round.result = result;
        await gameRepo.saveRound(round);

        if (amount > 0) {
            const token = (body?.token as "ZXC" | "YJC") || "ZXC";
            const multiplier = result.totalPayoutMultiplier !== undefined ? result.totalPayoutMultiplier : (result.multiplier || 0);
            const payoutAmount = (amount * multiplier).toString();

            const { betIntent, payoutIntent } = walletManager.createSettlementIntent(
                mockUserId, token, amount.toString(), payoutAmount, game, round.id, request.id
            );

            await walletRepo.saveTxIntent(betIntent);
            if (payoutIntent) await walletRepo.saveTxIntent(payoutIntent);

            await opsRepo.logEvent({
                channel: "wallet",
                severity: "info",
                source: "game_settlement",
                kind: "settlement_created",
                userId: mockUserId,
                game,
                roundId: round.id,
                message: `Created settlement intents for ${game}: bet ${amount}, payout ${payoutAmount}`,
                meta: { betIntentId: betIntent.id, payoutIntentId: payoutIntent?.id }
            });
        }

        await opsRepo.logEvent({
            channel: "game",
            severity: "info",
            source: game,
            kind: "round_resolved",
            userId: mockUserId,
            game,
            roundId: round.id,
            message: `Game ${game} resolved with result: ${JSON.stringify(result)}`,
            meta: result
        });
    } else {
        await gameRepo.saveRound(round);
    }

    return createApiEnvelope({ round, roundId: round.externalRoundId, result }, request.id);
  });

  typedFastify.post("/:game/rounds/:roundId/actions", {
    schema: {
      params: z.object({
        game: z.string(),
        roundId: z.string(),
      }),
      body: z.object({
        type: z.string(),
        amount: z.string().optional(),
        token: z.enum(["ZXC", "YJC"]).optional(),
        payload: z.any().optional(),
      }),
    },
  }, async (request) => {
    const { game, roundId } = request.params;
    const { type, amount, token, payload } = request.body;

    // Logic for multi-step games like Blackjack
    let result: any = null;
    if (game === "blackjack") {
        // Mock state for now
        const mockState = { playerCards: [], dealerCards: [] };
        result = gameManager.resolveBlackjack(type as any, mockState, roundId);
    } else if (game === "dragon") {
        const mockState = { gate: { left: { rank: 'A' }, right: { rank: 'K' } } };
        result = gameManager.resolveDragonTiger(type as any, mockState, roundId);
    }

    await opsRepo.logEvent({
        channel: "game",
        severity: "info",
        source: game,
        kind: "action_processed",
        userId: mockUserId,
        game,
        roundId,
        message: `Action ${type} processed for ${game}`,
        meta: { type, payload, result }
    });

    return createApiEnvelope({ result }, request.id);
  });

  typedFastify.get("/rooms", {
    schema: {
        querystring: z.object({
            game: z.string().optional()
        })
    }
  }, async (request) => {
      const { game } = request.query as any;
      const rooms = await roomManager.getRooms(game);
      // Auto-fill for bots
      for (const r of rooms) {
          await roomManager.fillWithBots(r.id);
      }
      return createApiEnvelope({ rooms }, request.id);
  });

  typedFastify.post("/rooms/:roomId/join", {
      schema: {
          params: z.object({ roomId: z.string() })
      }
  }, async (request) => {
      const { roomId } = request.params;
      const room = await roomManager.joinRoom(roomId, {
          userId: mockUserId,
          displayName: "Guest",
          avatar: "👤",
          vipLevel: 2
      });
      return createApiEnvelope({ room }, request.id);
  });
}
