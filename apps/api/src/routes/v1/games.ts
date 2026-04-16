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
  OnchainSettlementManager,
  OnchainWalletManager,
  IdentityManager,
  assertVipBetLimit,
  VipManager
} from "@repo/domain";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { 
  WalletRepository, 
  OpsRepository, 
  GameRepository, 
  SessionRepository, 
  UserRepository, 
  kv 
} from "@repo/infrastructure";
import { playShootDragonGateRound } from "./games/shoot-dragon-gate-shared.js";

// Helper function for dragon/shoot_dragon_gate game
function resolveDragonGame(action: any, betAmount: number) {
  const CARDS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const CARD_VALUES: Record<string, number> = {
    A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
  };
  
  const drawCard = () => CARDS[Math.floor(Math.random() * CARDS.length)];
  
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
  let multiplier = 0;

  if (isGate) {
    result = "draw";
    payout = betAmount; // refund
    multiplier = 1;
  } else if (mv > lo && mv < hi) {
    result = "win";
    payout = betAmount * 2; // 1:1 payout
    multiplier = 2;
  } else {
    result = "lose";
    payout = 0;
    multiplier = 0;
  }

  return {
    left,
    right,
    mid,
    lo,
    hi,
    result,
    payout,
    multiplier,
    isWin: result === "win",
    totalPayoutMultiplier: multiplier,
  };
}

export async function gameRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  // Initialize repositories first (needed by managers)
  const walletRepo = new WalletRepository();
  const gameRepo = new GameRepository();
  const opsRepo = new OpsRepository();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  
  const gameManager = new GameManager();
  const walletManager = new WalletManager();
  const roomManager = new RoomManager();
  const settlementManager = new SettlementManager(walletManager);
  const onchainWallet = new OnchainWalletManager();
  const onchainSettlement = new OnchainSettlementManager(
    settlementManager,
    walletManager,
    onchainWallet,
    null as any, // VipManager placeholder - fee calculation will use default tier
    walletRepo   // WalletRepository for saving tx attempts and receipts
  );
  const identityManager = new IdentityManager();

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

    if (game !== "dragon") {
      return createApiEnvelope(
        { code: "DEPRECATED_ROUTE", message: `Use /api/v1/games/${game}/play` },
        request.id,
        false,
        "DEPRECATED_ROUTE"
      );
    }

    try {
      const result = await playShootDragonGateRound({
        userId,
        address,
        betAmount: amountNum,
        token,
        requestId: request.id,
      });

      if (!result.ok) {
        return createApiEnvelope({ code: "SETTLEMENT_ERROR", message: result.error }, request.id, false, result.error);
      }

      return createApiEnvelope(result.data, request.id);
    } catch (error: any) {
      return createApiEnvelope(
        { code: "SETTLEMENT_ERROR", message: error?.message || "Dragon settlement failed" },
        request.id,
        false,
        error?.message || "Dragon settlement failed"
      );
    }

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
    const now = Date.now();
    const COINFLIP_ROUND_MS = 15000;
    const isCoinflip = game === 'coinflip';
    const roundId = isCoinflip 
      ? Math.floor(now / COINFLIP_ROUND_MS).toString()  // Use same logic as frontend for coinflip
      : `game_${now}_${Math.random().toString(36).slice(2, 7)}`;
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
        case "crash": gameResult = gameManager.resolveCrash(action?.elapsed || 0, roundId); break;
        case "poker": gameResult = gameManager.resolvePoker(action?.type, action?.state, roundId); break;
        case "bluffdice": gameResult = gameManager.resolveBluffdice(action?.type, action?.state, roundId, amountNum); break;
        case "shoot_dragon_gate":
        case "dragon":
          // Handle dragon/shoot_dragon_gate game
          const dragonResult = resolveDragonGame(action, amountNum);
          gameResult = dragonResult;
          break;
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

    // 6. Unified Onchain Settlement
    let settlementResult;
    try {
      settlementResult = await onchainSettlement.settleGame({
        userId,
        address,
        game: game as any,
        token: token.toUpperCase() as any,
        betAmount: amount,
        payoutAmount,
        roundId,
        requestId: request.id
      });
    } catch (error: any) {
      // Rollback on settlement error
      await kv.set(balanceKey, currentBalanceStr);
      return createApiEnvelope({ 
        error: { code: "SETTLEMENT_ERROR", message: error.message } 
      }, request.id);
    }

    const finalPayout = settlementResult.finalPayout;
    const feeAmount = settlementResult.feeAmount;

    // 7. Record game session to database (for leaderboard & history)
    try {
      const db = await requireDb();
      const sessionManager = new GameSessionManager(db);
      
      const isWin = settlementResult.settlement.isWin;
      
      await sessionManager.recordGame({
        userId,
        address,
        game: game as any,
        betAmount: amountNum,
        gameResult: {
          result: isWin ? "win" : "lose",
          payout: finalPayout,
          meta: { 
            ...gameResult,
            roundId,
            multiplier,
            fee: feeAmount,
            token,
            betTxHash: settlementResult.betTxHash,
            payoutTxHash: settlementResult.payoutTxHash
          },
        },
      });
    } catch (err: any) {
      // Log error but don't fail the request - game already settled on-chain
      await opsRepo.logEvent({
        channel: "game",
        severity: "error",
        source: game,
        kind: "record_game_failed",
        userId,
        address,
        game,
        message: `Failed to record game session: ${err.message}`,
        meta: { roundId, error: err.message }
      });
    }

    // 8. Credit Payout & Update Total Bet
    const finalBalance = (parseFloat(afterBetBalance) + finalPayout).toString();
    await kv.set(balanceKey, finalBalance);
    
    const newTotalBet = (parseFloat(totalBetStr) + amountNum).toString();
    await kv.set(`total_bet:${address}`, newTotalBet);

    // 9. Persistence & Logging
    const { betIntent, payoutIntent } = settlementManager.generateIntents(settlementResult.settlement, request.id);
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
      payout: finalPayout.toString(),
      fee: feeAmount.toString(),
      isWin: settlementResult.settlement.isWin,
      message: `User played ${game}: bet ${amount}, payout ${finalPayout} (${multiplier}x), fee ${feeAmount}`
    });

    return createApiEnvelope({
      roundId,
      result: gameResult,
      balance: finalBalance,
      isWin: settlementResult.settlement.isWin,
      multiplier,
      fee: feeAmount,
      betTxHash: settlementResult.betTxHash,
      payoutTxHash: settlementResult.payoutTxHash
    }, request.id);
  });

  // ─── Room Management ──────────────────────────────────────────────────────


  typedFastify.post("/rooms/join", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        roomId: z.string(),
      }),
    },
  }, async (request) => {
    const { roomId } = request.body as { sessionId: string; roomId: string };
    const ctx = await getContext(request);
    if (!ctx || !ctx.user || !ctx.session?.address) {
      return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED: Invalid session");
    }

    const vipManager = new VipManager();
    const tier = await vipManager.getYjcVipTierByAddress(ctx.session.address);
    const vipLevel = tier.key === "vip2" ? 2 : tier.key === "vip1" ? 1 : 0;

    try {
      const room = await roomManager.joinRoom(roomId, {
        userId: ctx.user.id,
        displayName: ctx.user.username || ctx.user.displayName || `玩家${ctx.user.id.slice(0, 4)}`,
        avatar: "🧑",
        vipLevel,
      });

      // 補位機器人：若房間人數偏低，補到 70%
      await roomManager.fillWithBots(roomId);
      const hydrated = (await roomManager.getRooms()).find((r) => r.id === roomId) || room;

      return createApiEnvelope({ success: true, room: hydrated }, request.id);
    } catch (error: any) {
      return createApiEnvelope({ success: false }, request.id, false, error?.message || "JOIN_ROOM_FAILED");
    }
  });

  typedFastify.post("/rooms/leave", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        roomId: z.string(),
      }),
    },
  }, async (request) => {
    const { roomId } = request.body as { sessionId: string; roomId: string };
    const ctx = await getContext(request);
    if (!ctx || !ctx.user) {
      return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED: Invalid session");
    }

    await roomManager.leaveRoom(roomId, ctx.user.id);
    const rooms = await roomManager.getRooms();
    const room = rooms.find((r) => r.id === roomId) || null;
    return createApiEnvelope({ success: true, room }, request.id);
  });

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
