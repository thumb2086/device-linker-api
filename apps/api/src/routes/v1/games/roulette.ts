// apps/api/src/routes/v1/games/roulette.ts
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
  type: z.enum(["number", "color", "parity"]),
  value: z.union([z.number(), z.string()]),
  amount: z.number().optional(),
});

export async function rouletteRoutes(fastify: FastifyInstance) {
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
    const roundInfo = getRoundInfo('roulette');
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
      const winningNumber = hashInt(`roulette:${roundInfo.roundId}`) % 37; // 0-36
      const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(winningNumber);
      const isBlack = winningNumber !== 0 && !isRed;
      const color = winningNumber === 0 ? 'green' : (isRed ? 'red' : 'black');
      
      // Calculate payout based on bets
      let totalPayoutMultiplier = 0;
      for (const bet of bets) {
        if (bet.type === 'number' && bet.value === winningNumber) {
          totalPayoutMultiplier += 36; // 35:1 payout + 1x original bet
        } else if (bet.type === 'color' && bet.value === color) {
          totalPayoutMultiplier += 2; // 1:1 payout
        } else if (bet.type === 'parity') {
          const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
          const isOdd = winningNumber !== 0 && winningNumber % 2 === 1;
          if ((bet.value === 'even' && isEven) || (bet.value === 'odd' && isOdd)) {
            totalPayoutMultiplier += 2; // 1:1 payout
          }
        }
      }
      
      const isWin = totalPayoutMultiplier > 0;
      const payout = isWin ? betAmount * totalPayoutMultiplier : 0;
      const payoutStr = payout.toString();

      // 3. Execute on-chain settlement
      const settlement = await gameSettlement.executeSettlement({
        userId,
        address,
        game: "roulette",
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
        game: "roulette",
        betAmount,
        gameResult: {
          result: settlement.isWin ? "win" : "lose",
          payout: settlement.finalPayout,
          meta: { 
            winningNumber, 
            color,
            bets,
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
        game: "roulette",
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
      await gameSettlement.saveRound("roulette", roundId, {
        winningNumber,
        color,
        isWin,
        roundInfo,
      });

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          roundId: roundInfo.roundId,
          winningNumber,
          color,
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
    const history = await manager.getHistory(address, "roulette", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
