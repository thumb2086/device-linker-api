// apps/api/src/utils/game-settlement.ts
// Unified game settlement wrapper for on-chain integration

import { randomUUID } from "crypto";
import {
  WalletManager,
  SettlementManager,
  OnchainWalletManager,
  OnchainSettlementManager,
  assertVipBetLimit,
  VipManager,
  IdentityManager,
} from "@repo/domain";
import {
  WalletRepository,
  OpsRepository,
  GameRepository,
  SessionRepository,
  UserRepository,
  ChainClient,
  kv,
} from "@repo/infrastructure";
import type { Game, TokenSymbol } from "@repo/shared";

export interface SettlementContext {
  userId: string;
  address: string;
  game: Game;
  token: TokenSymbol;
  betAmount: string;
  payoutAmount: string;
  roundId: string;
  requestId: string;
}

export interface SettlementResult {
  success: boolean;
  finalPayout: number;
  feeAmount: number;
  isWin: boolean;
  betTxHash?: string;
  payoutTxHash?: string;
  balanceBefore: string;
  balanceAfter: string;
  error?: { code: string; message: string };
}

export class GameSettlementWrapper {
  private walletManager: WalletManager;
  private settlementManager: SettlementManager;
  private onchainWallet: OnchainWalletManager;
  private onchainSettlement: OnchainSettlementManager;
  private vipManager: VipManager;
  private identityManager: IdentityManager;
  private walletRepo: WalletRepository;
  private opsRepo: OpsRepository;
  private gameRepo: GameRepository;
  private sessionRepo: SessionRepository;
  private userRepo: UserRepository;

  constructor() {
    this.walletManager = new WalletManager();
    this.settlementManager = new SettlementManager(this.walletManager);
    this.onchainWallet = new OnchainWalletManager();
    this.vipManager = new VipManager();
    this.identityManager = new IdentityManager();
    this.walletRepo = new WalletRepository();
    this.opsRepo = new OpsRepository();
    this.gameRepo = new GameRepository();
    this.sessionRepo = new SessionRepository();
    this.userRepo = new UserRepository();

    this.onchainSettlement = new OnchainSettlementManager(
      this.settlementManager,
      this.walletManager,
      this.onchainWallet,
      this.vipManager,
      this.walletRepo,
      null // ChainClient auto-initializes from config
    );
  }

  private getBalanceKey(token: "zhixi" | "yjc", address: string): string {
    return token === "yjc" ? `balance_yjc:${address}` : `balance:${address}`;
  }

  /**
   * Read legacy mirror balance from KV.
   */
  async getMirrorBalance(address: string, token: "zhixi" | "yjc"): Promise<string | null> {
    const key = this.getBalanceKey(token, address);
    const balance = await kv.get<string>(key);
    return balance ?? null;
  }

  /**
   * Keep the legacy KV balance in sync with the balance source used by game routes.
   */
  async setBalance(address: string, token: "zhixi" | "yjc", balance: string): Promise<void> {
    const key = this.getBalanceKey(token, address);
    await kv.set(key, balance);
  }

  /**
   * Resolve the playable balance using the same source priority as wallet summary:
   * on-chain when available, otherwise DB wallet, then legacy KV mirror.
   * The resolved balance is also backfilled into DB/KV so later steps see the same value.
   */
  async getBalance(address: string, token: "zhixi" | "yjc"): Promise<string> {
    const normalizedAddress = address.toLowerCase();
    const dbBalance = await this.walletRepo.getBalance(normalizedAddress, token);
    const mirrorBalance = await this.getMirrorBalance(normalizedAddress, token);

    let resolvedBalance = dbBalance || "0";

    try {
      const runtime = this.onchainWallet.getRuntimeConfig();
      const tokenRuntime = runtime.tokens[token];
      if (tokenRuntime?.enabled && runtime.rpcUrl && runtime.adminPrivateKey) {
        const client = new ChainClient(runtime.rpcUrl, runtime.adminPrivateKey);
        const decimals = await client.getDecimals(tokenRuntime.contractAddress, 18);
        const rawBalance = await client.getBalance(normalizedAddress, tokenRuntime.contractAddress);
        resolvedBalance = client.formatUnits(rawBalance, decimals);
      } else if (Number(dbBalance || 0) <= 0 && mirrorBalance !== null) {
        resolvedBalance = mirrorBalance;
      }
    } catch {
      if (Number(dbBalance || 0) <= 0 && mirrorBalance !== null) {
        resolvedBalance = mirrorBalance;
      }
    }

    if (resolvedBalance !== dbBalance) {
      await this.walletRepo.updateBalance(normalizedAddress, resolvedBalance, token);
    }
    if (resolvedBalance !== mirrorBalance) {
      await this.setBalance(normalizedAddress, token, resolvedBalance);
    }

    return resolvedBalance || "0";
  }

  /**
   * Validate bet and deduct balance from KV
   */
  async validateAndDeductBalance(
    address: string,
    token: "zhixi" | "yjc",
    betAmount: string,
    totalBetKey?: string
  ): Promise<{ success: boolean; balanceBefore: string; balanceAfter: string; error?: { code: string; message: string } }> {
    const amountNum = parseFloat(betAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return {
        success: false,
        balanceBefore: "0",
        balanceAfter: "0",
        error: { code: "INVALID_AMOUNT", message: "Invalid bet amount" }
      };
    }

    // VIP & Bet Limit Check
    if (totalBetKey) {
      const totalBetStr = await kv.get<string>(totalBetKey) || "0";
      try {
        assertVipBetLimit(betAmount, totalBetStr);
      } catch (e: any) {
        return {
          success: false,
          balanceBefore: "0",
          balanceAfter: "0",
          error: { code: "LIMIT_EXCEEDED", message: e.message }
        };
      }
    }

    // Balance Check
    const balanceBefore = await this.getBalance(address, token);
    const currentBalance = parseFloat(balanceBefore);

    if (currentBalance < amountNum) {
      return {
        success: false,
        balanceBefore,
        balanceAfter: balanceBefore,
        error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance" }
      };
    }

    // Deduct Bet
    const balanceAfter = (currentBalance - amountNum).toString();
    await this.setBalance(address, token, balanceAfter);

    return { success: true, balanceBefore, balanceAfter };
  }

  /**
   * Execute on-chain settlement
   */
  async executeSettlement(ctx: SettlementContext): Promise<SettlementResult> {
    try {
      const result = await this.onchainSettlement.settleGame({
        userId: ctx.userId,
        address: ctx.address,
        game: ctx.game,
        token: ctx.token,
        betAmount: ctx.betAmount,
        payoutAmount: ctx.payoutAmount,
        roundId: ctx.roundId,
        requestId: ctx.requestId,
      });

      return {
        success: true,
        finalPayout: result.finalPayout,
        feeAmount: result.feeAmount,
        isWin: result.settlement.isWin,
        betTxHash: result.betTxHash,
        payoutTxHash: result.payoutTxHash,
        balanceBefore: "0", // Will be set by caller
        balanceAfter: "0",  // Will be set by caller
      };
    } catch (error: any) {
      return {
        success: false,
        finalPayout: 0,
        feeAmount: 0,
        isWin: false,
        balanceBefore: "0",
        balanceAfter: "0",
        error: { code: "SETTLEMENT_ERROR", message: error.message }
      };
    }
  }

  /**
   * Credit payout to KV balance
   */
  async creditPayout(
    address: string,
    token: "zhixi" | "yjc",
    currentBalance: string,
    payout: number
  ): Promise<string> {
    const finalBalance = (parseFloat(currentBalance) + payout).toString();
    await this.setBalance(address, token, finalBalance);
    return finalBalance;
  }

  /**
   * Update total bet tracking
   */
  async updateTotalBet(address: string, betAmount: number): Promise<void> {
    const key = `total_bet:${address}`;
    const current = parseFloat(await kv.get<string>(key) || "0");
    await kv.set(key, (current + betAmount).toString());
  }

  /**
   * Rollback balance on error
   */
  async rollbackBalance(
    address: string,
    token: "zhixi" | "yjc",
    originalBalance: string
  ): Promise<void> {
    await this.setBalance(address, token, originalBalance);
  }

  /**
   * Log game event
   */
  async logGameEvent(params: {
    game: string;
    userId: string;
    address: string;
    amount: string;
    payout: string;
    fee: string;
    isWin: boolean;
    multiplier: number;
    betTxHash?: string;
    payoutTxHash?: string;
    roundId: string;
  }): Promise<void> {
    await this.opsRepo.logEvent({
      channel: "game",
      severity: "info",
      source: params.game,
      kind: "play_completed",
      userId: params.userId,
      address: params.address,
      game: params.game,
      amount: params.amount,
      payout: params.payout,
      fee: params.fee,
      isWin: params.isWin,
      message: `User played ${params.game}: bet ${params.amount}, payout ${params.payout} (${params.multiplier}x), fee ${params.fee}`,
      meta: {
        roundId: params.roundId,
        betTxHash: params.betTxHash,
        payoutTxHash: params.payoutTxHash,
      },
    });
  }

  /**
   * Save round to game repository
   */
  async saveRound(game: string, roundId: string, result: any): Promise<void> {
    const gameManager = await import("@repo/domain/games/game-manager.js").then(m => new m.GameManager());
    await this.gameRepo.saveRound(gameManager.settleRound({ id: roundId, game } as any, result));
  }
}

// Singleton instance
export const gameSettlement = new GameSettlementWrapper();
