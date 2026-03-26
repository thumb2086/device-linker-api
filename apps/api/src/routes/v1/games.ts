// apps/api/src/routes/v1/games.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { 
  GameManager, 
  RoomManager, 
  WalletManager, 
  SettlementManager, 
  IdentityManager,
  getVipLevel,
  assertVipBetLimit
} from "@repo/domain";
import { 
  WalletRepository, 
  OpsRepository, 
  GameRepository, 
  SessionRepository, 
  UserRepository, 
  kv 
} from "@repo/infrastructure";

export async function gameRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const gameManager = new GameManager();
  const walletManager = new WalletManager();
  const roomManager = new RoomManager();
  const settlementManager = new SettlementManager(walletManager);
  const identityManager = new IdentityManager();
  
  const walletRepo = new WalletRepository();
  const gameRepo = new GameRepository();
  const opsRepo = new OpsRepository();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();

  // Helper to get context
  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  // ─── Play Game (Bet & Settle) ─────────────────────────────────────────────

  typedFastify.post("/:game/play", {
    schema: {
      params: z.object({ game: z.string() }),
      body: z.object({
        sessionId: z.string(),
        amount: z.string(),
        token: z.enum(["zhixi", "yjc"]).optional().default("zhixi"),
        action: z.any().optional(), // For game specific data (selection, numbers, etc)
      }),
    },
  }, async (request) => {
    const { game } = request.params;
    const { amount, token, action } = request.body;
    const amountNum = parseFloat(amount);

    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, request.id);

    const address = ctx.session.address;
    const userId = ctx.user.id;

    // 1. VIP & Bet Limit Check
    const totalBetStr = await kv.get<string>(`total_bet:${address}`) || "0";
    try {
      assertVipBetLimit(amount, totalBetStr);
    } catch (e: any) {
      return createApiEnvelope({ error: { code: "LIMIT_EXCEEDED", message: e.message } }, request.id);
    }

    // 2. Balance Check
    const balanceKey = token === "yjc" ? `balance_yjc:${address}` : `balance:${address}`;
    const currentBalanceStr = await kv.get<string>(balanceKey) || "0";
    const currentBalance = parseFloat(currentBalanceStr);
    if (currentBalance < amountNum) {
      return createApiEnvelope({ error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance" } }, request.id);
    }

    // 3. Deduct Bet (Immediate)
    const afterBetBalance = (currentBalance - amountNum).toString();
    await kv.set(balanceKey, afterBetBalance);

    // 4. Resolve Game Logic
    const roundId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let gameResult: any = null;

    try {
      switch (game) {
        case "slots": gameResult = gameManager.resolveSlots(amountNum, roundId); break;
        case "coinflip": gameResult = gameManager.resolveCoinflip(action?.selection || "heads", roundId); break;
        case "roulette": gameResult = gameManager.resolveRoulette(action?.bets || [], roundId); break;
        case "horse": gameResult = gameManager.resolveHorseRace(action?.horseId || 1, roundId); break;
        case "sicbo": gameResult = gameManager.resolveSicbo(action?.bets || [], roundId); break;
        case "bingo": gameResult = gameManager.resolveBingo(action?.numbers || [], roundId); break;
        case "duel": gameResult = gameManager.resolveDuel(action?.p1Selection, action?.p2Selection, roundId); break;
        case "blackjack": gameResult = gameManager.resolveBlackjack(action?.type, action?.state, roundId); break;
        case "dragon": gameResult = gameManager.resolveDragonTiger(action?.type, action?.state, roundId); break;
        case "crash": gameResult = gameManager.resolveCrash(action?.elapsed || 0, roundId); break;
        case "poker": gameResult = gameManager.resolvePoker(action?.type, action?.state, roundId); break;
        case "bluffdice": gameResult = gameManager.resolveBluffdice(action?.type, action?.state, roundId); break;
        default: throw new Error(`Unsupported game: ${game}`);
      }
    } catch (e: any) {
       // Rollback balance on logic error
       await kv.set(balanceKey, currentBalanceStr);
       return createApiEnvelope({ error: { code: "GAME_ERROR", message: e.message } }, request.id);
    }

    // 5. Calculate Payout
    const multiplier = gameResult.totalPayoutMultiplier !== undefined ? gameResult.totalPayoutMultiplier : (gameResult.multiplier || 0);
    const payoutAmountNum = amountNum * multiplier;
    const payoutAmount = payoutAmountNum.toString();

    // 6. Create Settlement Record
    const settlement = settlementManager.createSettlement(
      roundId, userId, address, game, token.toUpperCase() as any, amount, payoutAmount, request.id
    );

    // 7. Credit Payout & Update Total Bet
    const finalBalance = (parseFloat(afterBetBalance) + payoutAmountNum).toString();
    await kv.set(balanceKey, finalBalance);
    
    const newTotalBet = (parseFloat(totalBetStr) + amountNum).toString();
    await kv.set(`total_bet:${address}`, newTotalBet);

    // 8. Persistence & Logging
    const { betIntent, payoutIntent } = settlementManager.generateIntents(settlement, request.id);
    await walletRepo.saveTxIntent(betIntent);
    if (payoutIntent) await walletRepo.saveTxIntent(payoutIntent);
    
    await gameRepo.saveRound(gameManager.settleRound({ id: roundId, game } as any, gameResult));
    
    await opsRepo.logEvent({
      channel: "game",
      severity: "info",
      source: game,
      kind: "play_completed",
      userId,
      address,
      game,
      amount,
      payout: payoutAmount,
      isWin: settlement.isWin,
      message: `User played ${game}: bet ${amount}, payout ${payoutAmount} (${multiplier}x)`
    });

    return createApiEnvelope({
      roundId,
      result: gameResult,
      balance: finalBalance,
      isWin: settlement.isWin,
      multiplier
    }, request.id);
  });

  // ─── Room Management ──────────────────────────────────────────────────────

  typedFastify.get("/rooms", {
    schema: {
        querystring: z.object({ game: z.string().optional() })
    }
  }, async (request) => {
      const { game } = request.query as any;
      const rooms = await roomManager.getRooms(game);
      return createApiEnvelope({ rooms }, request.id);
  });
}
