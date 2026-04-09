// apps/api/src/routes/v1/games/shoot-dragon-gate.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { playShootDragonGateRound, type DragonGateCard } from "./shoot-dragon-gate-shared.js";

const CARD_FACES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const CARD_VALUES: Record<DragonGateCard, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

type PendingGate = {
  userId: string;
  left: DragonGateCard;
  right: DragonGateCard;
  openedAt: number;
};

const GATE_TTL_MS = 2 * 60 * 1000;
const pendingGates = new Map<string, PendingGate>();

function drawCard(): DragonGateCard {
  return CARD_FACES[Math.floor(Math.random() * CARD_FACES.length)];
}

function cleanupExpiredGates(now = Date.now()) {
  for (const [gateId, gate] of pendingGates.entries()) {
    if (now - gate.openedAt > GATE_TTL_MS) {
      pendingGates.delete(gateId);
    }
  }
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

  typedFastify.post("/open", {
    schema: {
      body: z.object({
        sessionId: z.string(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx || !ctx.user) {
      return createApiEnvelope(
        { success: false },
        request.id,
        false,
        "UNAUTHORIZED: Invalid session"
      );
    }

    cleanupExpiredGates();
    const left = drawCard();
    const right = drawCard();
    const lo = Math.min(CARD_VALUES[left], CARD_VALUES[right]);
    const hi = Math.max(CARD_VALUES[left], CARD_VALUES[right]);
    const diff = hi - lo;
    const multiplier = diff === 0 ? 0 : Number((12 / diff).toFixed(2));
    const gateId = `gate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    pendingGates.set(gateId, {
      userId: ctx.user.id,
      left,
      right,
      openedAt: Date.now(),
    });

    return createApiEnvelope({
      success: true,
      data: {
        gateId,
        left,
        right,
        lo,
        hi,
        multiplier,
        expiresAt: Date.now() + GATE_TTL_MS,
      },
    }, request.id);
  });

  // POST /api/v1/games/shoot-dragon-gate/play
  typedFastify.post("/play", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        betAmount: z.number().min(1).max(1_000_000),
        gateId: z.string().optional(),
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const { betAmount, token, gateId } = request.body as {
      sessionId: string;
      betAmount: number;
      gateId?: string;
      token: "zhixi" | "yjc";
    };

    const ctx = await getContext(request);
    if (!ctx || !ctx.user) {
      return createApiEnvelope(
        { success: false },
        request.id,
        false,
        "UNAUTHORIZED: Invalid session"
      );
    }

    const address = ctx.session.address;
    const userId = ctx.user.id;

    if (!address) {
      return createApiEnvelope(
        { success: false },
        request.id,
        false,
        "USER_NOT_FOUND: Address not found"
      );
    }

    cleanupExpiredGates();
    let openCards: { left: DragonGateCard; right: DragonGateCard } | undefined;
    if (gateId) {
      const pendingGate = pendingGates.get(gateId);
      if (!pendingGate || pendingGate.userId !== userId) {
        return createApiEnvelope(
          { success: false },
          request.id,
          false,
          "GATE_INVALID: Please open a new gate."
        );
      }
      openCards = { left: pendingGate.left, right: pendingGate.right };
      pendingGates.delete(gateId);
    }

    try {
      const result = await playShootDragonGateRound({
        userId,
        address,
        betAmount,
        token,
        requestId: request.id,
        openCards,
      });

      if (!result.ok) {
        return createApiEnvelope(
          { success: false },
          request.id,
          false,
          result.error
        );
      }

      return createApiEnvelope({
        success: true,
        data: result.data,
      }, request.id);
    } catch (err: any) {
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
        { success: false },
        request.id,
        false,
        "UNAUTHORIZED: Invalid session"
      );
    }

    const address = ctx.session.address;
    if (!address) {
      return createApiEnvelope(
        { success: false },
        request.id,
        false,
        "USER_NOT_FOUND: Address not found"
      );
    }

    const db = await requireDb();
    const manager = new GameSessionManager(db);
    const history = await manager.getHistory(address, "shoot_dragon_gate", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
