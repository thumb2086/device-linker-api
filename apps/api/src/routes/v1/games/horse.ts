// apps/api/src/routes/v1/games/horse.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";

const HORSES = [
  { id: 1, name: "赤焰", multiplier: 1.8 },
  { id: 2, name: "雷霆", multiplier: 2.2 },
  { id: 3, name: "幻影", multiplier: 2.9 },
  { id: 4, name: "夜刃", multiplier: 4.0 },
  { id: 5, name: "霜牙", multiplier: 5.8 },
  { id: 6, name: "流星", multiplier: 8.5 }
];

export async function horseRoutes(fastify: FastifyInstance) {
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

  typedFastify.get("/horses", async (request) => {
    return createApiEnvelope({ success: true, data: HORSES }, request.id);
  });

  typedFastify.post("/play", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        betAmount: z.number().min(1).max(1_000_000),
        horseId: z.number().min(1).max(6),
      }),
    },
  }, async (request) => {
    const { betAmount, horseId } = request.body as { sessionId: string; betAmount: number; horseId: number };

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

    const roundId = `horse_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const gameResult = gameManager.resolveHorseRace(horseId, roundId);
    
    const isWin = gameResult.isWin;
    const payout = isWin ? betAmount * gameResult.multiplier : 0;

    try {
      const db = await requireDb();
      const manager = new GameSessionManager(db);
      
      const session = await manager.recordGame({
        userId,
        address,
        game: "horse",
        betAmount,
        gameResult: {
          result: isWin ? "win" : "lose",
          payout,
          meta: { 
            selectedHorse: horseId,
            winnerId: gameResult.winnerId,
            winnerName: gameResult.winnerName,
          },
        },
      });

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          selectedHorse: horseId,
          winnerId: gameResult.winnerId,
          winnerName: gameResult.winnerName,
          result: isWin ? "win" : "lose",
          payout,
          betAmount,
          multiplier: gameResult.multiplier,
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
    const history = await manager.getHistory(address, "horse", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
