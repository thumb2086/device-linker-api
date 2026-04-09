import { requestTokenToSymbol, type RequestTokenKey } from "@repo/domain";
import { GameSessionManager } from "@repo/domain/games/game-session-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";
import { gameSettlement } from "../../../utils/game-settlement.js";

const CARDS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const CARD_VALUES: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

export type DragonGateCard = typeof CARDS[number];
export type DragonGateOpenCards = {
  left: DragonGateCard;
  right: DragonGateCard;
};

function drawCard(): string {
  return CARDS[Math.floor(Math.random() * CARDS.length)];
}

export async function playShootDragonGateRound(params: {
  userId: string;
  address: string;
  betAmount: number;
  token: RequestTokenKey;
  requestId: string;
  openCards?: DragonGateOpenCards;
}) {
  const { userId, address, betAmount, token, requestId, openCards } = params;
  const amountStr = betAmount.toString();
  const roundId = `dragon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const validation = await gameSettlement.validateAndDeductBalance(
    address,
    token,
    amountStr,
    `total_bet:${address}`
  );

  if (!validation.success) {
    return {
      ok: false as const,
      error: validation.error?.message || "Validation failed",
    };
  }

  try {
    const left = openCards?.left ?? drawCard();
    const right = openCards?.right ?? drawCard();
    const lv = CARD_VALUES[left];
    const rv = CARD_VALUES[right];
    const lo = Math.min(lv, rv);
    const hi = Math.max(lv, rv);
    const isGate = lo === hi;

    const mid = drawCard();
    const mv = CARD_VALUES[mid];

    let result: "win" | "lose" | "draw";
    let payout: number;

    if (isGate) {
      result = "draw";
      payout = betAmount;
    } else if (mv > lo && mv < hi) {
      result = "win";
      payout = betAmount * 2;
    } else {
      result = "lose";
      payout = 0;
    }

    const settlement = await gameSettlement.executeSettlement({
      userId,
      address,
      game: "shoot_dragon_gate",
      token: requestTokenToSymbol(token),
      betAmount: amountStr,
      payoutAmount: payout.toString(),
      roundId,
      requestId,
    });

    if (!settlement.success) {
      await gameSettlement.rollbackBalance(address, token, validation.balanceBefore);
      return {
        ok: false as const,
        error: settlement.error?.message || "Settlement failed",
      };
    }

    const finalBalance = await gameSettlement.creditPayout(
      address,
      token,
      validation.balanceAfter,
      settlement.finalPayout
    );

    await gameSettlement.updateTotalBet(address, betAmount);

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

    await gameSettlement.saveRound("shoot_dragon_gate", roundId, { left, right, mid, lo, hi, result });

    return {
      ok: true as const,
      data: {
        sessionId: session.id,
        roundId,
        cards: { left, right, mid },
        left,
        right,
        mid,
        lo,
        hi,
        result,
        payout: settlement.finalPayout,
        betAmount,
        fee: settlement.feeAmount,
        balance: finalBalance,
        betTxHash: settlement.betTxHash,
        payoutTxHash: settlement.payoutTxHash,
      },
    };
  } catch (err) {
    await gameSettlement.rollbackBalance(address, token, validation.balanceBefore);
    throw err;
  }
}
