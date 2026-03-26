import { GameRound, GameRoundSchema, GameRoundStatus, GameAction, GameActionSchema } from "@repo/shared";

export interface GameDomain {
  createRound(game: string, externalRoundId: string, opensAt: Date, closesAt: Date, bettingClosesAt: Date): GameRound;
  lockRound(round: GameRound): GameRound;
  settleRound(round: GameRound, result: any): GameRound;
  failRound(round: GameRound, error: string): GameRound;
  createAction(userId: string, roundId: string, game: string, amount: string, token: "ZXC" | "YJC", payload: any): GameAction;
  resolveCoinflip(selection: string, seed: string): { winner: string; isWin: boolean; multiplier: number };
  resolveRoulette(bets: any[], seed: string): { winningNumber: number; color: string; totalPayoutMultiplier: number };
  resolveHorseRace(horseId: number, seed: string): { winnerId: number; winnerName: string; isWin: boolean; multiplier: number };
  resolveSlots(betAmount: number, seed: string): { symbols: string[]; multiplier: number; payout: number };
  resolveSicbo(bets: any[], seed: string): { dice: number[]; total: number; isBig: boolean; totalPayoutMultiplier: number };
  resolveBingo(selectedNumbers: number[], seed: string): { winningNumbers: number[]; matches: number[]; multiplier: number };
  resolveDuel(p1Selection: string, p2Selection: string, seed: string): { winner: 1 | 2 | 0 };
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
    const hash = this._fnv1a32(seed);
    const winner = hash % 2 === 0 ? "heads" : "tails";
    const isWin = selection === winner;
    return { winner, isWin, multiplier: isWin ? 1.96 : 0 };
  }

  resolveRoulette(bets: any[], seed: string): { winningNumber: number; color: string; totalPayoutMultiplier: number } {
    const hash = this._fnv1a32(seed);
    const winningNumber = hash % 37;
    const color = winningNumber === 0 ? "green" : ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(winningNumber) ? "red" : "black");

    // Simplified payout calculation
    let totalPayoutMultiplier = 0;
    for (const bet of bets) {
      if (bet.type === "number" && bet.value === winningNumber) totalPayoutMultiplier += 35;
      if (bet.type === "color" && bet.value === color) totalPayoutMultiplier += 2;
    }
    return { winningNumber, color, totalPayoutMultiplier };
  }

  resolveHorseRace(horseId: number, seed: string): { winnerId: number; winnerName: string; isWin: boolean; multiplier: number } {
    const HORSES = [
      { id: 1, name: "赤焰", multiplier: 1.8 },
      { id: 2, name: "雷霆", multiplier: 2.2 },
      { id: 3, name: "幻影", multiplier: 2.9 },
      { id: 4, name: "夜刃", multiplier: 4.0 },
      { id: 5, name: "霜牙", multiplier: 5.8 },
      { id: 6, name: "流星", multiplier: 8.5 }
    ];
    const hash = this._fnv1a32(seed);
    const winnerIndex = hash % HORSES.length;
    const winner = HORSES[winnerIndex];
    const isWin = horseId === winner.id;
    return {
      winnerId: winner.id,
      winnerName: winner.name,
      isWin,
      multiplier: isWin ? winner.multiplier : 0,
    };
  }

  resolveSlots(betAmount: number, seed: string): { symbols: string[]; multiplier: number; payout: number } {
    const symbols = ["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣"];
    const hash = this._fnv1a32(seed);
    const result = [
      symbols[hash % symbols.length],
      symbols[Math.floor(hash / symbols.length) % symbols.length],
      symbols[Math.floor(hash / (symbols.length * symbols.length)) % symbols.length]
    ];

    let multiplier = 0;
    if (result[0] === result[1] && result[1] === result[2]) {
      multiplier = result[0] === "7️⃣" ? 50 : 10;
    } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
      multiplier = 2;
    }

    return {
      symbols: result,
      multiplier,
      payout: betAmount * multiplier
    };
  }

  resolveSicbo(bets: any[], seed: string): { dice: number[]; total: number; isBig: boolean; totalPayoutMultiplier: number } {
    const hash = this._fnv1a32(seed);
    const dice = [
      (hash % 6) + 1,
      (Math.floor(hash / 6) % 6) + 1,
      (Math.floor(hash / 36) % 6) + 1
    ];
    const total = dice.reduce((a, b) => a + b, 0);
    const isBig = total >= 11 && total <= 17;
    const isSmall = total >= 4 && total <= 10;

    let totalPayoutMultiplier = 0;
    for (const bet of bets) {
      if (bet.type === "big" && isBig) totalPayoutMultiplier += 2;
      if (bet.type === "small" && isSmall) totalPayoutMultiplier += 2;
      if (bet.type === "total" && bet.value === total) totalPayoutMultiplier += 6; // simplified
    }

    return { dice, total, isBig, totalPayoutMultiplier };
  }

  resolveBingo(selectedNumbers: number[], seed: string): { winningNumbers: number[]; matches: number[]; multiplier: number } {
    const hash = this._fnv1a32(seed);
    const winningNumbers: number[] = [];
    let currentHash = hash;
    while (winningNumbers.length < 5) {
      const num = (currentHash % 75) + 1;
      if (!winningNumbers.includes(num)) winningNumbers.push(num);
      currentHash = Math.imul(currentHash, 0x5deece66d) + 0xb;
    }

    const matches = selectedNumbers.filter(n => winningNumbers.includes(n));
    let multiplier = 0;
    if (matches.length === 5) multiplier = 100;
    else if (matches.length === 4) multiplier = 20;
    else if (matches.length === 3) multiplier = 5;

    return { winningNumbers, matches, multiplier };
  }

  resolveDuel(p1Selection: string, p2Selection: string, seed: string): { winner: 1 | 2 | 0 } {
    const hash = this._fnv1a32(seed);
    const result = hash % 2 === 0 ? "heads" : "tails";
    if (p1Selection === result && p2Selection !== result) return { winner: 1 };
    if (p2Selection === result && p1Selection !== result) return { winner: 2 };
    return { winner: 0 }; // Tie or both wrong
  }

  private _fnv1a32(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
