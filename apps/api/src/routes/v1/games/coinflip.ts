// apps/api/src/routes/v1/games/coinflip.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { GameManager } from "@repo/domain/games/game-manager.js";
import { gameSettlement } from "../../../utils/game-settlement.js";

export async function coinflipRoutes(fastify: FastifyInstance) {
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
        selection: z.enum(["heads", "tails"]).default("heads"),
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
      }),
    },
  }, async (request) => {
    const { betAmount, selection, token } = request.body as { sessionId: string; betAmount: number; selection: "heads" | "tails"; token: "zhixi" | "yjc" };
    const amountStr = betAmount.toString();

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

    const roundId = `coinflip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Validate and deduct balance
    const validation = await gameSettlement.validateAndDeductBalance(
      address,
      token,
      amountStr,
      `total_bet:${address}`
    );

    if (!validation.success) {
      return createApiEnvelope(
        { success: false, error: validation.error },
        request.id
      );
    }

    try {
      // 2. Resolve game
      const gameResult = gameManager.resolveCoinflip(selection, roundId);
      const isWin = gameResult.isWin;
      const payout = isWin ? betAmount * gameResult.multiplier : 0;
      const payoutStr = payout.toString();

      // 3. Execute on-chain settlement
      const settlement = await gameSettlement.executeSettlement({
        userId,
        address,
        game: "coinflip",
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
          { success: false, error: settlement.error },
          request.id
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
        game: "coinflip",
        betAmount,
        gameResult: {
          result: settlement.isWin ? "win" : "lose",
          payout: settlement.finalPayout,
          meta: { 
            winner: gameResult.winner, 
            selection,
            betTxHash: settlement.betTxHash,
            payoutTxHash: settlement.payoutTxHash,
            fee: settlement.feeAmount,
          },
        },
      });

      // 7. Log event
      await gameSettlement.logGameEvent({
        game: "coinflip",
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

      // 8. Save round
      await gameSettlement.saveRound("coinflip", roundId, gameResult);

      return createApiEnvelope({
        success: true,
        data: {
          sessionId: session.id,
          roundId,
          selection,
          winner: gameResult.winner,
          result: settlement.isWin ? "win" : "lose",
          payout: settlement.finalPayout,
          betAmount,
          multiplier: gameResult.multiplier,
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
    const history = await manager.getHistory(address, "coinflip", 20);
    
    return createApiEnvelope({ success: true, data: history }, request.id);
  });
}
