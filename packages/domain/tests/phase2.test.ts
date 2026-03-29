import { describe, expect, it } from 'vitest';
import { SettingsManager } from '../src/identity/settings-manager.js';
import { WalletManager } from '../src/wallet/wallet-manager.js';
import { TransactionManager } from '../src/transactions/transaction-manager.js';
import { MarketManager } from '../src/market/market-manager.js';

const createUserRepo = (soundPrefs?: Record<string, unknown>) => {
  let profile = { soundPrefs: soundPrefs || null };
  return {
    async saveUser() {},
    async getUserByAddress() { return null; },
    async getUserById() { return { id: 'user-1', address: '0xabc' }; },
    async getUserProfile() { return profile; },
    async saveUserProfile(_: string, data: any) {
      profile = { ...profile, ...data };
    },
  };
};

describe('Phase 2 Domain Logic', () => {
  it('normalizes and persists user settings', async () => {
    const repo = createUserRepo({ volume: 0.6, bgmEnabled: false });
    const manager = new SettingsManager(repo as any);

    const initial = await manager.getSettings('user-1');
    expect(initial.masterVolume).toBe(0.6);
    expect(initial.bgmEnabled).toBe(false);
    expect(initial.sfxVolume).toBe(0.6);

    const next = await manager.saveSettings('user-1', { amountDisplay: 'full', danmuEnabled: false, bgmVolume: 0.2 });
    expect(next.amountDisplay).toBe('full');
    expect(next.danmuEnabled).toBe(false);
    expect(next.bgmVolume).toBe(0.2);
  });

  it('builds wallet summary from balances and ledger entries', () => {
    const manager = new WalletManager();
    const summary = manager.buildSummary('0xabc', { ZXC: '1500', YJC: '20' }, [
      { id: '2', address: '0xabc', token: 'YJC', type: 'transfer_out', amount: '3', createdAt: '2026-03-29T09:00:00.000Z' },
      { id: '1', address: '0xabc', token: 'ZXC', type: 'airdrop', amount: '1000', createdAt: '2026-03-29T10:00:00.000Z' },
    ]);

    expect(summary.totalBalance).toBe('1520.0000');
    expect(summary.recentTransactions[0].id).toBe('1');
  });

  it('sorts public wallet and market transactions by newest first', () => {
    const manager = new TransactionManager();
    const feed = manager.buildPublicFeed(
      [{ id: 'wallet-1', address: '0x1234567890abcdef', token: 'ZXC', type: 'airdrop', amount: 500, createdAt: '2026-03-29T08:00:00.000Z' }],
      [{ id: 'market-1', address: '0x1234567890abcdef', type: 'stock_buy', symbol: 'BTC', quantity: 2, price: 100, amount: 200, createdAt: '2026-03-29T09:00:00.000Z' }],
      10
    );

    expect(feed[0].scope).toBe('market');
    expect(feed[1].scope).toBe('wallet');
    expect(feed[0].maskedAddress).toContain('...');
  });

  it('keeps market account operations internally consistent', () => {
    const manager = new MarketManager();
    const snapshot = manager.buildSnapshot(Date.parse('2026-03-29T00:00:00.000Z'));
    const account = manager.createDefaultAccount(Date.parse('2026-03-29T00:00:00.000Z'), 200000);

    const buy = manager.buyStock(account, snapshot, 'AAPL', 10);
    expect(buy.quantity).toBe(10);
    expect(account.stockHoldings.AAPL.qty).toBe(10);

    const deposit = manager.bankDeposit(account, 5000);
    expect(deposit.amount).toBe(5000);
    expect(account.bankBalance).toBe(5000);

    const summary = manager.buildAccountSummary(account, snapshot);
    expect(summary.cash).toBeLessThan(200000);
    expect(summary.bankBalance).toBe(5000);
  });
});
