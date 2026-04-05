// apps/api/src/routes/v1/games/blackjack.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";

export async function blackjackRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const gameManager = new GameManager();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const db = await requireDb();
    const session = await db.query.sessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, sessionId)
    });
    if (!session || session.status !== "authorized") return null;
    const user = await db.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.id, session.userId)
    });
    return { session, user };
  };

  typedFastify.post("/play", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        betAmount: z.number().min(1).max(1_000_000),
        action: z.enum(["start", "hit", "stand"]),
        state: z.any().optional(),
      }),
    },
  }, async (request) => {
    const { betAmount, action, state } = request.body as { 
      sessionId: string; 
      betAmount: number; 
      action: "start" | "hit" | "stand";
      state?: any;
    };

    const ctx = await getContext(request);
    if (!ctx || !ctx.user) {
      return createApiEnvelope(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } },
        request.id
      );
    }

    const address = ctx.session.address;
    const userId = ctx.user.id;
    if (!address) {
      return createApiEnvelope(
        { success: false, error: { code: "USER_NOT_FOUND", message: "Address not found" } },
        request.id
      );
    }

    const roundId = `blackjack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const gameResult = gameManager.resolveBlackjack(action, state, roundId);
    
    // Only record game when settled
    if (gameResult.status === "settled") {
      const isWin = gameResult.isWin;
      const isPush = gameResult.isPush;
      const payout = isPush ? betAmount : (isWin ? betAmount * (gameResult.multiplier || 1) : 0);
      const result = isPush ? "draw" : (isWin ? "win" : "lose");

      try {
        const db = await requireDb();
        const manager = new GameSessionManager(db);
        
        const session = await manager.recordGame({
          userId,
          address,
          game: "blackjack",
          betAmount,
          gameResult: {
            result,
            payout,
            meta: { 
              playerCards: gameResult.playerCards,
              dealerCards: gameResult.dealerCards,
              playerTotal: gameResult.playerTotal,
              dealerTotal: gameResult.dealerTotal,
              reason: gameResult.reason,
            },
          },
        });

        return createApiEnvelope({
          success: true,
          data: {
            sessionId: session.id,
            ...gameResult,
            result,
            payout,
            betAmount,
          }
        }, request.id);
      } catch (err: any) {
        if (err.message === "INSUFFICIENT_BALANCE") {
          return createApiEnvelope(
            { success: false, error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance" } },
            request.id
          );
        }
        throw err;
      }
    }

    // For in_progress games, just return the state without recording
    return createApiEnvelope({
      success: true,
      data: {
        ...gameResult,
        betAmount,
      }
    }, request.id);
  });

  typedFastify.get("/history", {
    schema: { querystring: z.object({ sessionId: z.string() }) },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx || !ctx.user) {
      return createApiEnvelope(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } },
        request.id
      );
    }

    const address = ctx.session.address;
    if (!address) {
      return createApiEnvelope(
        { success: false, error: { code: "USER_NOT_FOUND", message: "Address not found" } },
        request.id
      );
    }

    const db = await requireDb();
    const manager = new GameSessionManager(db);
    const history = await manager.getHistory(address, "blackjack", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
