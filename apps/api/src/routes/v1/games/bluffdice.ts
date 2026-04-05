// apps/api/src/routes/v1/games/bluffdice.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";

export async function bluffdiceRoutes(fastify: FastifyInstance) {
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
        action: z.string().default("roll"),
      }),
    },
  }, async (request) => {
    const { betAmount, action } = request.body as { 
      sessionId: string; 
      betAmount: number; 
      action: string;
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

    const roundId = `bluffdice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const gameResult = gameManager.resolveBluffdice(action, {}, roundId);
    
    // Bluff dice is a skill game, for now simple implementation
    // Win if total > 15
    const isWin = gameResult.total > 15;
    const payout = isWin ? betAmount * 2 : 0;

    try {
      const db = await requireDb();
      const manager = new GameSessionManager(db);
      
      const session = await manager.recordGame({
        userId,
        address,
        game: "bluffdice",
        betAmount,
        gameResult: {
          result: isWin ? "win" : "lose",
          payout,
          meta: { 
            dice: gameResult.dice,
            total: gameResult.total,
          },
        },
      });

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          dice: gameResult.dice,
          total: gameResult.total,
          result: isWin ? "win" : "lose",
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
    const history = await manager.getHistory(address, "bluffdice", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
