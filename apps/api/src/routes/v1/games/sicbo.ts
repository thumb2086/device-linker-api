// apps/api/src/routes/v1/games/sicbo.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";
import { getRoundInfo, hashInt } from "@repo/domain/games/auto-round.js";
import { gameSettlement } from "../../../utils/game-settlement.js";

const BetSchema = z.object({
  type: z.enum(["big", "small", "total"]),
  value: z.number().optional(),
});

export async function sicboRoutes(fastify: FastifyInstance) {
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
        bets: z.array(BetSchema),
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const { betAmount, bets, token } = request.body as { sessionId: string; betAmount: number; bets: any[]; token: "zhixi" | "yjc" };

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

    // Get auto-round info (统一分局)
    const roundInfo = getRoundInfo('sicbo');
    if (!roundInfo.isBettingOpen) {
      return createApiEnvelope(
        { 
          success: false, 
          roundId: roundInfo.roundId,
          closesAt: roundInfo.closesAt,
          bettingClosesAt: roundInfo.bettingClosesAt,
        },
        request.id,
        false,
        "本局开奖中，请等待下一局"
      );
    }

    const roundId = String(roundInfo.roundId);
    const amountStr = betAmount.toString();

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
      // 2. Resolve game using deterministic hash based on roundId
      // Generate 3 dice (1-6 each)
      const seed = hashInt(`sicbo:${roundInfo.roundId}`);
      const dice1 = ((seed & 0xFF) % 6) + 1;
      const dice2 = ((seed >> 8) & 0xFF) % 6 + 1;
      const dice3 = ((seed >> 16) & 0xFF) % 6 + 1;
      const dice = [dice1, dice2, dice3];
      const total = dice1 + dice2 + dice3;
      const isBig = total >= 11 && total <= 17;
      
      // Calculate payout based on bets
      let totalPayoutMultiplier = 0;
      for (const bet of bets) {
        if (bet.type === 'big' && isBig) {
          totalPayoutMultiplier += 2; // 1:1 payout
        } else if (bet.type === 'small' && total >= 4 && total <= 10) {
          totalPayoutMultiplier += 2; // 1:1 payout
        } else if (bet.type === 'total' && bet.value === total) {
          // Payout varies based on the total value
          const totalPayouts: Record<number, number> = {
            4: 60, 5: 30, 6: 18, 7: 12, 8: 8, 9: 7, 10: 6,
            11: 6, 12: 7, 13: 8, 14: 12, 15: 18, 16: 30, 17: 60
          };
          totalPayoutMultiplier += totalPayouts[total] || 6;
        }
      }
      
      const isWin = totalPayoutMultiplier > 0;
      const payout = isWin ? betAmount * totalPayoutMultiplier : 0;
      const payoutStr = payout.toString();

      // 3. Execute on-chain settlement
      const settlement = await gameSettlement.executeSettlement({
        userId,
        address,
        game: "sicbo",
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

      // 4. Credit payout to balance
      const finalBalance = await gameSettlement.creditPayout(
        address,
        token,
        validation.balanceAfter,
        settlement.finalPayout
      );

      // 5. Update total bet
      await gameSettlement.updateTotalBet(address, betAmount);

      // 6. Record game session
      const db = await requireDb();
      const sessionManager = new GameSessionManager(db);
      const session = await sessionManager.recordGame({
        userId,
        address,
        game: "sicbo",
        betAmount,
        gameResult: {
          result: settlement.isWin ? "win" : "lose",
          payout: settlement.finalPayout,
          meta: { 
            dice,
            total,
            isBig,
            betTxHash: settlement.betTxHash,
            payoutTxHash: settlement.payoutTxHash,
            fee: settlement.feeAmount,
            roundId: roundInfo.roundId,
            closesAt: roundInfo.closesAt,
          },
        },
      });

      // 7. Log event
      await gameSettlement.logGameEvent({
        game: "sicbo",
        userId,
        address,
        amount: amountStr,
        payout: settlement.finalPayout.toString(),
        fee: settlement.feeAmount.toString(),
        isWin: settlement.isWin,
        multiplier: totalPayoutMultiplier,
        betTxHash: settlement.betTxHash,
        payoutTxHash: settlement.payoutTxHash,
        roundId,
      });

      // 8. Save round
      await gameSettlement.saveRound("sicbo", roundId, {
        dice,
        total,
        isBig,
        isWin,
        roundInfo,
      });

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          roundId: roundInfo.roundId,
          dice,
          total,
          isBig,
          result: settlement.isWin ? "win" : "lose",
          payout: settlement.finalPayout,
          betAmount,
          multiplier: totalPayoutMultiplier,
          fee: settlement.feeAmount,
          balance: finalBalance,
          betTxHash: settlement.betTxHash,
          payoutTxHash: settlement.payoutTxHash,
          closesAt: roundInfo.closesAt,
          bettingClosesAt: roundInfo.bettingClosesAt,
        }
      }, request.id);

    } catch (err: any) {
      // Rollback on any unexpected error
      await gameSettlement.rollbackBalance(address, token, validation.balanceBefore);
      throw err;
    }
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
    const history = await manager.getHistory(address, "sicbo", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
