import { describe, it, expect } from 'vitest';
import { GameManager } from '../src/games/game-manager';

describe('GameManager', () => {
  const manager = new GameManager();

  it('should resolve coinflip deterministically', () => {
    const res1 = manager.resolveCoinflip('heads', 'seed1');
    const res2 = manager.resolveCoinflip('heads', 'seed1');
    const res3 = manager.resolveCoinflip('heads', 'seed2');

    expect(res1).toEqual(res2);
    expect(res1.winner).toBeDefined();
    expect(typeof res1.isWin).toBe('boolean');
  });

  it('should resolve roulette correctly', () => {
    const seed = 'roulette-seed';
    const result = manager.resolveRoulette([{ type: 'number', value: 32 }], seed);

    expect(result.winningNumber).toBeGreaterThanOrEqual(0);
    expect(result.winningNumber).toBeLessThanOrEqual(36);
    expect(['red', 'black', 'green']).toContain(result.color);
  });

  it('should resolve horse race correctly', () => {
    const result = manager.resolveHorseRace(1, 'horse-seed');
    expect(result.winnerId).toBeGreaterThanOrEqual(1);
    expect(result.winnerId).toBeLessThanOrEqual(6);
    expect(typeof result.isWin).toBe('boolean');
  });
});
