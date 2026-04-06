// apps/api/src/routes/v1/games/blackjack.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";
import { gameSettlement } from "../../../utils/game-settlement.js";

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
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const { betAmount, action, state, token } = request.body as { 
      sessionId: string; 
      betAmount: number; 
      action: "start" | "hit" | "stand";
      state?: any;
      token: "zhixi" | "yjc";
    };
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

    const roundId = `blackjack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const gameResult = gameManager.resolveBlackjack(action, state, roundId);
    
    // Only record settled games
    if (gameResult.status === "settled") {
      const isWin = gameResult.isWin;
      const isPush = gameResult.isPush;
      const payout = isPush ? betAmount : (isWin ? betAmount * (gameResult.multiplier || 1) : 0);
      const payoutStr = payout.toString();
      const result = isPush ? "draw" : (isWin ? "win" : "lose");

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
        // 2. Execute on-chain settlement
        const settlement = await gameSettlement.executeSettlement({
          userId,
          address,
          game: "blackjack",
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
          game: "blackjack",
          betAmount,
          gameResult: {
            result,
            payout: settlement.finalPayout,
            meta: { 
              playerCards: gameResult.playerCards,
              dealerCards: gameResult.dealerCards,
              playerTotal: gameResult.playerTotal,
              dealerTotal: gameResult.dealerTotal,
              reason: gameResult.reason,
              betTxHash: settlement.betTxHash,
              payoutTxHash: settlement.payoutTxHash,
              fee: settlement.feeAmount,
            },
          },
        });

        // 6. Log event
        await gameSettlement.logGameEvent({
          game: "blackjack",
          userId,
          address,
          amount: amountStr,
          payout: settlement.finalPayout.toString(),
          fee: settlement.feeAmount.toString(),
          isWin: settlement.isWin,
          multiplier: gameResult.multiplier || 1,
          betTxHash: settlement.betTxHash,
          payoutTxHash: settlement.payoutTxHash,
          roundId,
        });

        // 7. Save round
        await gameSettlement.saveRound("blackjack", roundId, gameResult);

        return createApiEnvelope({
          success: true,
          data: {
            sessionId: session.id,
            roundId,
            ...gameResult,
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
    const history = await manager.getHistory(address, "blackjack", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
