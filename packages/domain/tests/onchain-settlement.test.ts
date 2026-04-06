import { describe, expect, it, vi } from 'vitest';
import {
  OnchainSettlementManager,
  OnchainWalletManager,
  SettlementError,
  SettlementManager,
  WalletManager,
  requestTokenToSymbol,
  tokenSymbolToOnchainKey,
} from '../src/index.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADDRESS = '0x1111111111111111111111111111111111111111';

type RuntimeMode = {
  payoutFails?: boolean;
  payoutReverts?: boolean;
};

class MemoryWalletRepo {
  intents = new Map<string, any>();
  attempts: any[] = [];
  receipts: any[] = [];

  async saveTxIntent(intent: any) {
    this.intents.set(intent.id, intent);
  }

  async getPendingIntents() {
    return [...this.intents.values()].filter((intent) => intent.status === 'pending');
  }

  async saveTxAttempt(attempt: any) {
    this.attempts.push(attempt);
  }

  async saveTxReceipt(receipt: any) {
    this.receipts.push(receipt);
  }
}

class MockChainClient {
  private nextBet = 1;
  private nextPayout = 1;

  constructor(private mode: RuntimeMode = {}) {}

  getWalletAddress() {
    return '0x9999999999999999999999999999999999999999';
  }

  async getDecimals() {
    return 18;
  }

  parseUnits(amount: string) {
    return amount;
  }

  async adminTransfer() {
    return { hash: `0xbet${this.nextBet++}` };
  }

  async transfer() {
    if (this.mode.payoutFails) {
      throw new Error('mock payout failed');
    }
    return { hash: `0xpayout${this.nextPayout++}` };
  }

  async waitForReceipt(hash: string) {
    const isPayout = hash.startsWith('0xpayout');
    const reverted = isPayout ? this.mode.payoutReverts : false;
    return {
      status: reverted ? 0 : 1,
      blockNumber: 123,
      gasUsed: 456n,
    };
  }
}

describe('Onchain settlement', () => {
  it('maps request and domain tokens explicitly', () => {
    expect(requestTokenToSymbol('zhixi')).toBe('ZXC');
    expect(requestTokenToSymbol('yjc')).toBe('YJC');
    expect(tokenSymbolToOnchainKey('ZXC')).toBe('zhixi');
    expect(tokenSymbolToOnchainKey('YJC')).toBe('yjc');
    expect(() => tokenSymbolToOnchainKey('ZHIXI' as any)).toThrow(/UNSUPPORTED_TOKEN/);
  });

  it('confirms bet intents immediately for settled losing rounds', async () => {
    const walletManager = new WalletManager();
    const settlementManager = new SettlementManager(walletManager);
    const onchainWallet = new OnchainWalletManager();
    const walletRepo = new MemoryWalletRepo();
    const chainClient = new MockChainClient();
    const vipManager = { hasVip2: vi.fn().mockResolvedValue(false) };

    vi.spyOn(onchainWallet, 'getRuntimeConfig').mockReturnValue({
      rpcUrl: 'http://localhost:8545',
      adminPrivateKey: '0xabc',
      tokens: {
        zhixi: {
          key: 'zhixi',
          symbol: 'ZXC',
          contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          lossPoolAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          enabled: true,
        },
        yjc: {
          key: 'yjc',
          symbol: 'YJC',
          contractAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
          lossPoolAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
          enabled: true,
        },
      },
    });

    const manager = new OnchainSettlementManager(
      settlementManager,
      walletManager,
      onchainWallet,
      vipManager as any,
      walletRepo as any,
      chainClient as any
    );

    const result = await manager.settleGame({
      userId: USER_ID,
      address: ADDRESS,
      game: 'coinflip',
      token: 'ZXC',
      betAmount: '10',
      payoutAmount: '0',
      roundId: 'round-lose',
      requestId: 'req-lose',
    });

    expect(result.betTxHash).toBe('0xbet1');
    expect(result.payoutTxHash).toBeUndefined();
    expect(await walletRepo.getPendingIntents()).toHaveLength(0);

    const intents = [...walletRepo.intents.values()];
    expect(intents).toHaveLength(1);
    expect(intents[0].status).toBe('confirmed');
    expect(intents[0].token).toBe('ZXC');
  });

  it('marks payout intent failed while preserving confirmed bet intent', async () => {
    const walletManager = new WalletManager();
    const settlementManager = new SettlementManager(walletManager);
    const onchainWallet = new OnchainWalletManager();
    const walletRepo = new MemoryWalletRepo();
    const chainClient = new MockChainClient({ payoutFails: true });
    const vipManager = { hasVip2: vi.fn().mockResolvedValue(false) };

    vi.spyOn(onchainWallet, 'getRuntimeConfig').mockReturnValue({
      rpcUrl: 'http://localhost:8545',
      adminPrivateKey: '0xabc',
      tokens: {
        zhixi: {
          key: 'zhixi',
          symbol: 'ZXC',
          contractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          lossPoolAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          enabled: true,
        },
        yjc: {
          key: 'yjc',
          symbol: 'YJC',
          contractAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
          lossPoolAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
          enabled: true,
        },
      },
    });

    const manager = new OnchainSettlementManager(
      settlementManager,
      walletManager,
      onchainWallet,
      vipManager as any,
      walletRepo as any,
      chainClient as any
    );

    await expect(() =>
      manager.settleGame({
        userId: USER_ID,
        address: ADDRESS,
        game: 'poker',
        token: 'YJC',
        betAmount: '10',
        payoutAmount: '20',
        roundId: 'round-payout-fail',
        requestId: 'req-payout-fail',
      })
    ).rejects.toBeInstanceOf(SettlementError);

    expect(await walletRepo.getPendingIntents()).toHaveLength(0);

    const intents = [...walletRepo.intents.values()];
    expect(intents).toHaveLength(2);

    const betIntent = intents.find((intent) => intent.type === 'bet');
    const payoutIntent = intents.find((intent) => intent.type === 'payout');

    expect(betIntent?.status).toBe('confirmed');
    expect(betIntent?.token).toBe('YJC');
    expect(payoutIntent?.status).toBe('failed');
    expect(payoutIntent?.error).toContain('mock payout failed');
  });
});
