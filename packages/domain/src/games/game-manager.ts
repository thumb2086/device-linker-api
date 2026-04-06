import { GameRound, GameRoundSchema, GameAction, GameActionSchema } from "@repo/shared";

export interface GameDomain {
  createRound(game: string, externalRoundId: string, opensAt: Date, closesAt: Date, bettingClosesAt: Date): GameRound;
  lockRound(round: GameRound): GameRound;
  settleRound(round: GameRound, result: any): GameRound;
  failRound(round: GameRound, error: string): GameRound;
  createAction(userId: string, roundId: string, game: string, amount: string, token: "ZXC" | "YJC", payload: any): GameAction;
  resolveCoinflip(selection: string, seed: string, bias?: number): { winner: string; isWin: boolean; multiplier: number };
  resolveRoulette(bets: any[], seed: string, bias?: number): { winningNumber: number; color: string; totalPayoutMultiplier: number };
  resolveHorseRace(horseId: number, seed: string, bias?: number): { winnerId: number; winnerName: string; isWin: boolean; multiplier: number };
  resolveSlots(betAmount: number, seed: string, bias?: number): { symbols: string[]; multiplier: number; payout: number };
  resolveSicbo(bets: any[], seed: string, bias?: number): { dice: number[]; total: number; isBig: boolean; totalPayoutMultiplier: number };
  resolveBingo(selectedNumbers: number[], seed: string, bias?: number): { winningNumbers: number[]; matches: number[]; multiplier: number };
  resolveDuel(p1Selection: string, p2Selection: string, seed: string): { winner: 1 | 2 | 0 };
  resolveBlackjack(action: 'start' | 'hit' | 'stand', state: any, seed: string, bias?: number): any;
  resolveDragonTiger(action: 'gate' | 'shoot', state: any, seed: string, bias?: number): any;
  resolveCrash(elapsedSeconds: number, seed: string, bias?: number): { multiplier: number; crashed: boolean; crashPoint: number };
  resolvePoker(action: 'deal' | 'hold', state: any, seed: string, betAmount?: number): { hand: string; handRank: number; isWin: boolean; multiplier: number; payout: number; cards: any[] };
  resolveBluffdice(action: 'bet' | 'call', state: any, seed: string, betAmount?: number): { dice: number[]; total: number; isWin: boolean; multiplier: number; payout: number };
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

  private _applyBias(hash: number, bias: number = 0): number {
      // If bias > 0, it increases the chance of a "better" outcome for the player
      // This is a simple implementation: shift the hash slightly
      if (bias === 0) return hash;
      const shift = Math.floor(bias * 1000000);
      return (hash + shift) >>> 0;
  }

  resolveCoinflip(selection: string, seed: string, bias: number = 0): { winner: string; isWin: boolean; multiplier: number } {
    let hash = this._fnv1a32(seed);
    if (bias !== 0) {
        // Adjust hash so that it favors 'selection'
        const isHeadsSelected = selection === 'heads';
        const rawWinner = hash % 2 === 0 ? 'heads' : 'tails';
        if (rawWinner !== selection && (this._fnv1a32(seed + ':bias') % 100 < bias * 100)) {
            hash = isHeadsSelected ? 0 : 1; // Force win
        }
    }
    const winner = hash % 2 === 0 ? "heads" : "tails";
    const isWin = selection === winner;
    return { winner, isWin, multiplier: isWin ? 1.96 : 0 };
  }

  resolveRoulette(bets: any[], seed: string, bias: number = 0): { winningNumber: number; color: string; totalPayoutMultiplier: number } {
    let hash = this._fnv1a32(seed);
    let winningNumber = hash % 37;

    // Bias logic for roulette would be complex if trying to favor a specific bet.
    // For now, keep it simple or skip bias for multi-bet games.

    const color = winningNumber === 0 ? "green" : ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(winningNumber) ? "red" : "black");

    let totalPayoutMultiplier = 0;
    for (const bet of bets) {
      if (bet.type === "number" && Number(bet.value) === winningNumber) totalPayoutMultiplier += 35;
      if (bet.type === "color" && bet.value === color) totalPayoutMultiplier += 2;
      if (bet.type === "parity") {
         const isOdd = winningNumber % 2 !== 0;
         if (bet.value === "odd" && isOdd) totalPayoutMultiplier += 2;
         if (bet.value === "even" && !isOdd && winningNumber !== 0) totalPayoutMultiplier += 2;
      }
    }
    return { winningNumber, color, totalPayoutMultiplier };
  }

  resolveHorseRace(horseId: number, seed: string, bias: number = 0): { winnerId: number; winnerName: string; isWin: boolean; multiplier: number } {
    const HORSES = [
      { id: 1, name: "赤焰", multiplier: 1.8 },
      { id: 2, name: "雷霆", multiplier: 2.2 },
      { id: 3, name: "幻影", multiplier: 2.9 },
      { id: 4, name: "夜刃", multiplier: 4.0 },
      { id: 5, name: "霜牙", multiplier: 5.8 },
      { id: 6, name: "流星", multiplier: 8.5 }
    ];
    let hash = this._fnv1a32(seed);
    let winnerIndex = hash % HORSES.length;

    if (bias > 0 && HORSES[winnerIndex].id !== horseId) {
        if ((this._fnv1a32(seed + ':bias') % 100) < bias * 100) {
            winnerIndex = HORSES.findIndex(h => h.id === horseId);
        }
    }

    const winner = HORSES[winnerIndex];
    const isWin = horseId === winner.id;
    return {
      winnerId: winner.id,
      winnerName: winner.name,
      isWin,
      multiplier: isWin ? winner.multiplier : 0,
    };
  }

  resolveSlots(betAmount: number, seed: string, bias: number = 0): { symbols: string[]; multiplier: number; payout: number } {
    const symbols = ["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣"];
    let hash = this._fnv1a32(seed);

    // Very simplified slots bias: force a win if bias hits
    if (bias > 0 && (this._fnv1a32(seed + ':bias') % 100 < bias * 100)) {
        const winSymbolIdx = hash % symbols.length;
        return {
            symbols: [symbols[winSymbolIdx], symbols[winSymbolIdx], symbols[winSymbolIdx]],
            multiplier: symbols[winSymbolIdx] === "7️⃣" ? 50 : 10,
            payout: betAmount * (symbols[winSymbolIdx] === "7️⃣" ? 50 : 10)
        };
    }

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

  resolveSicbo(bets: any[], seed: string, bias: number = 0): { dice: number[]; total: number; isBig: boolean; totalPayoutMultiplier: number } {
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
      if (bet.type === "total" && bet.value === total) totalPayoutMultiplier += 6;
    }

    return { dice, total, isBig, totalPayoutMultiplier };
  }

  resolveBingo(selectedNumbers: number[], seed: string, bias: number = 0): { winningNumbers: number[]; matches: number[]; multiplier: number } {
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
    return { winner: 0 };
  }

  resolveBlackjack(action: 'start' | 'hit' | 'stand', state: any, seed: string, bias: number = 0) {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    const drawCard = (index: number) => {
        let hash = this._fnv1a32(`${seed}:${index}`);
        // Optional bias here
        return {
            rank: ranks[hash % ranks.length],
            suit: suits[Math.floor(hash / ranks.length) % suits.length]
        };
    };

    const calcTotal = (cards: any[]) => {
        let total = 0;
        let aces = 0;
        for (const card of cards) {
            if (card.hidden) continue;
            if (card.rank === 'A') { total += 11; aces++; }
            else if (['J', 'Q', 'K'].includes(card.rank)) total += 10;
            else total += parseInt(card.rank);
        }
        while (total > 21 && aces > 0) { total -= 10; aces--; }
        return total;
    };

    if (action === 'start') {
        const playerCards = [drawCard(0), drawCard(1)];
        const dealerCards = [drawCard(2), { ...drawCard(3), hidden: true }];
        const playerTotal = calcTotal(playerCards);
        const status = playerTotal === 21 ? 'settled' : 'in_progress';
        return {
            playerCards,
            dealerCards,
            playerTotal,
            dealerTotal: calcTotal(dealerCards),
            status,
            isWin: playerTotal === 21,
            multiplier: playerTotal === 21 ? 1.5 : 0
        };
    }

    if (action === 'hit') {
        const playerCards = [...state.playerCards, drawCard(state.playerCards.length + 2)];
        const playerTotal = calcTotal(playerCards);
        const status = playerTotal >= 21 ? 'settled' : 'in_progress';
        return {
            ...state,
            playerCards,
            playerTotal,
            status,
            isWin: playerTotal === 21,
            multiplier: playerTotal === 21 ? 1 : 0,
            reason: playerTotal > 21 ? 'Bust' : undefined
        };
    }

    if (action === 'stand') {
        let dealerCards = state.dealerCards.map((c: any) => ({ ...c, hidden: false }));
        let dealerTotal = calcTotal(dealerCards);
        let i = 4;
        while (dealerTotal < 17) {
            dealerCards.push(drawCard(state.playerCards.length + i++));
            dealerTotal = calcTotal(dealerCards);
        }
        const playerTotal = state.playerTotal;
        const isWin = dealerTotal > 21 || playerTotal > dealerTotal;
        const isPush = playerTotal === dealerTotal;
        return {
            ...state,
            dealerCards,
            dealerTotal,
            status: 'settled',
            isWin,
            isPush,
            multiplier: isWin ? 1 : 0
        };
    }
  }

  resolveDragonTiger(action: 'gate' | 'shoot', state: any, seed: string, bias: number = 0) {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const getRankValue = (rank: string) => ranks.indexOf(rank) + 1;

    const drawCard = (index: number) => {
        const hash = this._fnv1a32(`${seed}:${index}`);
        return {
            rank: ranks[hash % ranks.length],
            suit: suits[Math.floor(hash / ranks.length) % suits.length]
        };
    };

    if (action === 'gate') {
        const left = drawCard(0);
        const right = drawCard(1);
        const lVal = getRankValue(left.rank);
        const rVal = getRankValue(right.rank);
        const range = Math.abs(lVal - rVal);
        return {
            gate: { left, right },
            multiplier: range === 0 ? 0 : parseFloat((12 / range).toFixed(2)),
            requiresSideGuess: range === 0
        };
    }

    if (action === 'shoot') {
        const shot = drawCard(2);
        const sVal = getRankValue(shot.rank);
        const lVal = getRankValue(state.gate.left.rank);
        const rVal = getRankValue(state.gate.right.rank);
        const min = Math.min(lVal, rVal);
        const max = Math.max(lVal, rVal);

        let resultType = 'lose';
        if (sVal > min && sVal < max) resultType = 'win';
        else if (sVal === min || sVal === max) resultType = 'pillar';

        return {
            ...state,
            shot,
            resultType,
            isWin: resultType === 'win'
        };
    }
  }

  resolveCrash(elapsedSeconds: number, seed: string, bias: number = 0) {
    const hash = this._fnv1a32(seed);
    const crashPoint = Math.max(1.0, 0.99 / (1 - (hash % 1000000 / 1000000)) ** 0.05);
    const currentMultiplier = Math.pow(Math.E, 0.08 * elapsedSeconds);
    return {
        multiplier: currentMultiplier,
        crashed: currentMultiplier >= crashPoint,
        crashPoint
    };
  }

  resolvePoker(action: 'deal' | 'hold', state: any, seed: string, betAmount: number = 100): { hand: string; handRank: number; isWin: boolean; multiplier: number; payout: number; cards: any[] } {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    const drawCard = (index: number) => {
        const hash = this._fnv1a32(`${seed}:${index}`);
        return {
            rank: ranks[hash % ranks.length],
            suit: suits[Math.floor(hash / ranks.length) % suits.length]
        };
    };
    
    // Deal 5 cards for simplified poker
    const cards = Array.from({ length: 5 }, (_, i) => drawCard(i));
    
    // Evaluate hand
    const rankCounts: Record<string, number> = {};
    const suitCounts: Record<string, number> = {};
    cards.forEach(c => {
        rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });
    
    const counts = Object.values(rankCounts);
    const isFlush = Object.values(suitCounts).some(c => c >= 5);
    const isStraight = this._checkStraight(Object.keys(rankCounts).map(r => ranks.indexOf(r)));
    
    let hand = 'High Card';
    let handRank = 1;
    let multiplier = 0;
    
    if (isFlush && isStraight && cards.some(c => c.rank === 'A')) {
        hand = 'Royal Flush'; handRank = 10; multiplier = 100;
    } else if (isFlush && isStraight) {
        hand = 'Straight Flush'; handRank = 9; multiplier = 50;
    } else if (counts.includes(4)) {
        hand = 'Four of a Kind'; handRank = 8; multiplier = 20;
    } else if (counts.includes(3) && counts.includes(2)) {
        hand = 'Full House'; handRank = 7; multiplier = 10;
    } else if (isFlush) {
        hand = 'Flush'; handRank = 6; multiplier = 6;
    } else if (isStraight) {
        hand = 'Straight'; handRank = 5; multiplier = 4;
    } else if (counts.includes(3)) {
        hand = 'Three of a Kind'; handRank = 4; multiplier = 3;
    } else if (counts.filter(c => c === 2).length === 2) {
        hand = 'Two Pair'; handRank = 3; multiplier = 2;
    } else if (counts.includes(2)) {
        hand = 'One Pair'; handRank = 2; multiplier = 1;
    }
    
    return {
        hand,
        handRank,
        isWin: multiplier > 0,
        multiplier,
        payout: betAmount * multiplier,
        cards
    };
  }

  private _checkStraight(rankIndices: number[]): boolean {
    if (rankIndices.length < 5) return false;
    const sorted = [...new Set(rankIndices)].sort((a, b) => a - b);
    if (sorted.length < 5) return false;
    // Check for 5 consecutive
    for (let i = 0; i <= sorted.length - 5; i++) {
        if (sorted[i + 4] - sorted[i] === 4) return true;
    }
    // Check for A-2-3-4-5 straight (A=12, so check 0,1,2,3,12)
    if (sorted.includes(12) && sorted.includes(0) && sorted.includes(1) && sorted.includes(2) && sorted.includes(3)) {
        return true;
    }
    return false;
  }

  resolveBluffdice(action: 'bet' | 'call', state: any, seed: string, betAmount: number = 100): { dice: number[]; total: number; isWin: boolean; multiplier: number; payout: number } {
    const hash = this._fnv1a32(seed + action);
    const dice = [
        (hash % 6) + 1,
        (Math.floor(hash / 6) % 6) + 1,
        (Math.floor(hash / 36) % 6) + 1,
        (Math.floor(hash / 216) % 6) + 1,
        (Math.floor(hash / 1296) % 6) + 1,
    ];
    const total = dice.reduce((a, b) => a + b, 0);
    
    // Bluffdice payout: exact match = 5x, within 2 = 2x, within 4 = 1x, else 0
    let multiplier = 0;
    if (action === 'bet' && state?.predictedTotal) {
        const diff = Math.abs(total - state.predictedTotal);
        if (diff === 0) multiplier = 5;
        else if (diff <= 2) multiplier = 2;
        else if (diff <= 4) multiplier = 1;
    }
    
    return {
        dice,
        total,
        isWin: multiplier > 0,
        multiplier,
        payout: betAmount * multiplier
    };
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
