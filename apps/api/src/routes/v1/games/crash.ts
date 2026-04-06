// apps/api/src/routes/v1/games/crash.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";
import { gameSettlement } from "../../../utils/game-settlement.js";

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
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const { betAmount, elapsedSeconds, cashout, token } = request.body as { 
      sessionId: string; 
      betAmount: number; 
      elapsedSeconds: number;
      cashout: boolean;
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

    const roundId = `crash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const gameResult = gameManager.resolveCrash(elapsedSeconds, roundId);
    
    // Player wins if they cash out before crash
    const isWin = cashout && !gameResult.crashed;
    const isLose = gameResult.crashed || (!cashout && gameResult.crashed);
    const payout = isWin ? betAmount * gameResult.multiplier : 0;
    const payoutStr = payout.toString();
    const result = isWin ? "win" : (isLose ? "lose" : "draw");

    // Only record settled games
    if (cashout || gameResult.crashed) {
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
          game: "crash",
          token: token === "yjc" ? "YJC" : "ZXC",
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
          game: "crash",
          betAmount,
          gameResult: {
            result,
            payout: settlement.finalPayout,
            meta: { 
              multiplier: gameResult.multiplier,
              crashed: gameResult.crashed,
              crashPoint: gameResult.crashPoint,
              elapsedSeconds,
              cashout,
              betTxHash: settlement.betTxHash,
              payoutTxHash: settlement.payoutTxHash,
              fee: settlement.feeAmount,
            },
          },
        });

        // 6. Log event
        await gameSettlement.logGameEvent({
          game: "crash",
          userId,
          address,
          amount: amountStr,
          payout: settlement.finalPayout.toString(),
          fee: settlement.feeAmount.toString(),
          isWin: settlement.isWin,
          multiplier: gameResult.multiplier,
          betTxHash: settlement.betTxHash,
          payoutTxHash: settlement.payoutTxHash,
          roundId,
        });

        // 7. Save round
        await gameSettlement.saveRound("crash", roundId, gameResult);

        return createApiEnvelope({
          success: true,
          data: {
            sessionId: session.id,
            roundId,
            multiplier: gameResult.multiplier,
            crashed: gameResult.crashed,
            crashPoint: gameResult.crashPoint,
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

    // Return intermediate state
    return createApiEnvelope({
      success: true,
      data: {
        roundId,
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
    const history = await manager.getHistory(address, "crash", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
