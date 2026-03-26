import { describe, it, expect } from 'vitest';
import { GameManager } from '../src/games/game-manager';
import { IdentityManager } from '../src/identity/identity-manager';

describe('Domain Logic', () => {
  const gameManager = new GameManager();
  const identityManager = new IdentityManager();

  describe('GameManager', () => {
    it('should resolve blackjack hit', () => {
      const start = gameManager.resolveBlackjack('start', null, 'bj-seed');
      expect(start.playerCards).toHaveLength(2);
      expect(start.dealerCards).toHaveLength(2);

      const hit = gameManager.resolveBlackjack('hit', start, 'bj-seed');
      expect(hit.playerCards).toHaveLength(3);
    });

    it('should resolve dragon tiger gate', () => {
      const gate = gameManager.resolveDragonTiger('gate', null, 'dt-seed');
      expect(gate.gate.left).toBeDefined();
      expect(gate.gate.right).toBeDefined();
    });

    it('should resolve crash point', () => {
      const res = gameManager.resolveCrash(5, 'crash-seed');
      expect(res.crashPoint).toBeGreaterThan(1);
      expect(typeof res.crashed).toBe('boolean');
    });

    it('should apply win bias to coinflip', () => {
        // Find a seed that results in a loss for 'heads'
        let seed = 'test-seed';
        let res = gameManager.resolveCoinflip('heads', seed, 0);
        while (res.winner === 'heads') {
            seed += '1';
            res = gameManager.resolveCoinflip('heads', seed, 0);
        }

        // Now apply 100% bias
        const biasedRes = gameManager.resolveCoinflip('heads', seed, 1.0);
        expect(biasedRes.winner).toBe('heads');
        expect(biasedRes.isWin).toBe(true);
    });
  });

  describe('IdentityManager', () => {
    it('should calculate VIP levels correctly', () => {
      expect(identityManager.calculateVipLevel(0).label).toBe('普通會員');
      expect(identityManager.calculateVipLevel(2_000_000).label).toBe('黃金會員');
    });

    it('should calculate YJC VIP level', () => {
      expect(identityManager.calculateYjcVipLevel(0)).toBeNull();
      expect(identityManager.calculateYjcVipLevel(10).key).toBe('vip1');
      expect(identityManager.calculateYjcVipLevel(5000).key).toBe('vip2');
    });
  });
});
