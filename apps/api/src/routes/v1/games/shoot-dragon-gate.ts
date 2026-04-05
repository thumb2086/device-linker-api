// apps/api/src/routes/v1/games/shoot-dragon-gate.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";

const CARDS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const CARD_VALUES: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

function drawCard(): string {
  return CARDS[Math.floor(Math.random() * CARDS.length)];
}

export async function shootDragonGateRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Helper to get context from session
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

  // POST /api/v1/games/shoot-dragon-gate/play
  typedFastify.post("/play", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        betAmount: z.number().min(1).max(1_000_000),
      }),
    },
  }, async (request) => {
    const { betAmount } = request.body as { sessionId: string; betAmount: number };

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

    // Draw two side cards
    const left = drawCard();
    const right = drawCard();
    const lv = CARD_VALUES[left];
    const rv = CARD_VALUES[right];

    // Ensure left < right (if equal, treat as gate)
    const lo = Math.min(lv, rv);
    const hi = Math.max(lv, rv);
    const isGate = lo === hi;

    // Middle card
    const mid = drawCard();
    const mv = CARD_VALUES[mid];

    let result: "win" | "lose" | "draw";
    let payout: number;

    if (isGate) {
      result = "draw";
      payout = betAmount; // refund
    } else if (mv > lo && mv < hi) {
      result = "win";
      payout = betAmount * 2; // 1:1 payout
    } else {
      result = "lose";
      payout = 0;
    }

    try {
      const db = await requireDb();
      const manager = new GameSessionManager(db);
      
      const session = await manager.recordGame({
        userId,
        address,
        game: "shoot_dragon_gate",
        betAmount,
        gameResult: {
          result,
          payout,
          meta: { left, right, mid, lo, hi },
        },
      });

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          cards: { left, right, mid },
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
  });

  // GET /api/v1/games/shoot-dragon-gate/history
  typedFastify.get("/history", {
    schema: {
      querystring: z.object({
        sessionId: z.string(),
      }),
    },
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
    const history = await manager.getHistory(address, "shoot_dragon_gate", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
