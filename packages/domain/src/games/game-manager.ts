import { GameRound, GameRoundSchema, GameRoundStatus, GameAction, GameActionSchema } from "@repo/shared";

export interface GameDomain {
  createRound(game: string, externalRoundId: string, opensAt: Date, closesAt: Date, bettingClosesAt: Date): GameRound;
  lockRound(round: GameRound): GameRound;
  settleRound(round: GameRound, result: any): GameRound;
  failRound(round: GameRound, error: string): GameRound;
  createAction(userId: string, roundId: string, game: string, amount: string, token: "ZXC" | "YJC", payload: any): GameAction;
  resolveCoinflip(selection: string, seed: string): { winner: string; isWin: boolean; multiplier: number };
}

export class GameManager implements GameDomain {
  createRound(game: string, externalRoundId: string, opensAt: Date, closesAt: Date, bettingClosesAt: Date): GameRound {
    const now = new Date();
    return GameRoundSchema.parse({
      id: crypto.randomUUID(),
      game,
      externalRoundId,
      status: "betting",
      result: null,
      opensAt,
      closesAt,
      bettingClosesAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  lockRound(round: GameRound): GameRound {
    return GameRoundSchema.parse({
      ...round,
      status: "locked",
      updatedAt: new Date(),
    });
  }

  settleRound(round: GameRound, result: any): GameRound {
    return GameRoundSchema.parse({
      ...round,
      status: "settled",
      result,
      updatedAt: new Date(),
    });
  }

  failRound(round: GameRound, error: string): GameRound {
    return GameRoundSchema.parse({
      ...round,
      status: "failed",
      updatedAt: new Date(),
    });
  }

  createAction(userId: string, roundId: string, game: string, amount: string, token: "ZXC" | "YJC", payload: any): GameAction {
    const now = new Date();
    return GameActionSchema.parse({
      id: crypto.randomUUID(),
      userId,
      roundId,
      game,
      type: "bet",
      payload,
      amount,
      token,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  resolveCoinflip(selection: string, seed: string): { winner: string; isWin: boolean; multiplier: number } {
    // Simple deterministic resolve based on seed
    const hash = selection.length + seed.length; // Mock hash
    const winner = hash % 2 === 0 ? "heads" : "tails";
    const isWin = selection === winner;
    return {
      winner,
      isWin,
      multiplier: isWin ? 1.96 : 0,
    };
  }
}
