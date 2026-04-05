// apps/api/src/routes/v1/games/crash.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";

export async function crashRoutes(fastify: FastifyInstance) {
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
        elapsedSeconds: z.number().min(0).default(0),
        cashout: z.boolean().default(false),
      }),
    },
  }, async (request) => {
    const { betAmount, elapsedSeconds, cashout } = request.body as { 
      sessionId: string; 
      betAmount: number; 
      elapsedSeconds: number;
      cashout: boolean;
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

    const roundId = `crash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const gameResult = gameManager.resolveCrash(elapsedSeconds, roundId);
    
    // Player wins if they cash out before crash
    const isWin = cashout && !gameResult.crashed;
    const isLose = gameResult.crashed || (!cashout && gameResult.crashed);
    const payout = isWin ? betAmount * gameResult.multiplier : (isLose ? 0 : 0);
    const result = isWin ? "win" : (isLose ? "lose" : "draw");

    // Only record settled games
    if (cashout || gameResult.crashed) {
      try {
        const db = await requireDb();
        const manager = new GameSessionManager(db);
        
        const session = await manager.recordGame({
          userId,
          address,
          game: "crash",
          betAmount,
          gameResult: {
            result,
            payout,
            meta: { 
              multiplier: gameResult.multiplier,
              crashed: gameResult.crashed,
              crashPoint: gameResult.crashPoint,
              elapsedSeconds,
              cashout,
            },
          },
        });

        return createApiEnvelope({
          success: true,
          data: {
            sessionId: session.id,
            multiplier: gameResult.multiplier,
            crashed: gameResult.crashed,
            crashPoint: gameResult.crashPoint,
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

    // Return intermediate state
    return createApiEnvelope({
      success: true,
      data: {
        multiplier: gameResult.multiplier,
        crashed: gameResult.crashed,
        crashPoint: gameResult.crashPoint,
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
    const history = await manager.getHistory(address, "crash", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
