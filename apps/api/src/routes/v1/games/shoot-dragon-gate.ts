// apps/api/src/routes/v1/games/shoot-dragon-gate.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { gameSettlement } from "../../../utils/game-settlement.js";

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
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const { betAmount, token } = request.body as { sessionId: string; betAmount: number; token: "zhixi" | "yjc" };
    const amountStr = betAmount.toString();

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

    const roundId = `dragon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Validate and deduct balance
    const validation = await gameSettlement.validateAndDeductBalance(
      address,
      token,
      amountStr,
      `total_bet:${address}`
    );

    if (!validation.success) {
      return createApiEnvelope(
        { success: false },
        request.id,
        false,
        validation.error?.message || "Validation failed"
      );
    }

    try {
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
      const payoutStr = payout.toString();

      // 2. Execute on-chain settlement
      const settlement = await gameSettlement.executeSettlement({
        userId,
        address,
        game: "shoot_dragon_gate",
        token: token.toUpperCase() as "ZXC" | "YJC",
        betAmount: amountStr,
        payoutAmount: payoutStr,
        roundId,
        requestId: request.id,
      });

      if (!settlement.success) {
        // Rollback balance on settlement error
        await gameSettlement.rollbackBalance(address, token, validation.balanceBefore);
        return createApiEnvelope(
          { success: false },
          request.id,
          false,
          settlement.error?.message || "Settlement failed"
        );
      }

      // 3. Credit payout to balance
      const finalBalance = await gameSettlement.creditPayout(
        address,
        token,
        validation.balanceAfter,
        settlement.finalPayout
      );

      // 4. Update total bet
      await gameSettlement.updateTotalBet(address, betAmount);

      // 5. Record game session
      const db = await requireDb();
      const sessionManager = new GameSessionManager(db);
      const session = await sessionManager.recordGame({
        userId,
        address,
        game: "shoot_dragon_gate",
        betAmount,
        gameResult: {
          result,
          payout: settlement.finalPayout,
          meta: { 
            left, 
            right, 
            mid, 
            lo, 
            hi,
            betTxHash: settlement.betTxHash,
            payoutTxHash: settlement.payoutTxHash,
            fee: settlement.feeAmount,
          },
        },
      });

      // 6. Log event
      await gameSettlement.logGameEvent({
        game: "shoot_dragon_gate",
        userId,
        address,
        amount: amountStr,
        payout: settlement.finalPayout.toString(),
        fee: settlement.feeAmount.toString(),
        isWin: result === "win",
        multiplier: 2,
        betTxHash: settlement.betTxHash,
        payoutTxHash: settlement.payoutTxHash,
        roundId,
      });

      // 7. Save round
      await gameSettlement.saveRound("shoot_dragon_gate", roundId, { left, right, mid, lo, hi, result });

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          roundId,
          cards: { left, right, mid },
          result,
          payout: settlement.finalPayout,
          betAmount,
          fee: settlement.feeAmount,
          balance: finalBalance,
          betTxHash: settlement.betTxHash,
          payoutTxHash: settlement.payoutTxHash,
        }
      }, request.id);

    } catch (err: any) {
      // Rollback on any unexpected error
      await gameSettlement.rollbackBalance(address, token, validation.balanceBefore);
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
