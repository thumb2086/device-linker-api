import { WalletAccount, WalletAccountSchema, TokenSymbol, TxIntent, TxIntentSchema, TxIntentStatus } from "@repo/shared";

export interface WalletDomain {
  createAccount(userId: string, token: TokenSymbol): WalletAccount;
  createTxIntent(userId: string, token: TokenSymbol, type: TxIntent["type"], amount: string, requestId?: string): TxIntent;
  createSettlementIntent(userId: string, token: TokenSymbol, betAmount: string, payoutAmount: string, game: string, roundId: string, requestId?: string): { betIntent: TxIntent; payoutIntent: TxIntent | null };
  processTxIntent(intent: TxIntent, status: TxIntentStatus, txHash?: string, error?: string): TxIntent;
}

export class WalletManager implements WalletDomain {
  createAccount(userId: string, token: TokenSymbol): WalletAccount {
    return WalletAccountSchema.parse({
      id: crypto.randomUUID(),
      userId,
      token,
      balance: "0",
      lockedBalance: "0",
      updatedAt: new Date(),
    });
  }

  createTxIntent(userId: string, token: TokenSymbol, type: TxIntent["type"], amount: string, requestId?: string): TxIntent {
    const now = new Date();
    return TxIntentSchema.parse({
      id: crypto.randomUUID(),
      userId,
      token,
      type,
      amount,
      status: "pending",
      requestId,
      createdAt: now,
      updatedAt: now,
    });
  }

  createSettlementIntent(userId: string, token: TokenSymbol, betAmount: string, payoutAmount: string, game: string, roundId: string, requestId?: string): { betIntent: TxIntent; payoutIntent: TxIntent | null } {
    const betIntent = this.createTxIntent(userId, token, "bet", betAmount, requestId);
    betIntent.game = game;
    betIntent.roundId = roundId;

    let payoutIntent = null;
    if (parseFloat(payoutAmount) > 0) {
      payoutIntent = this.createTxIntent(userId, token, "payout", payoutAmount, requestId);
      payoutIntent.game = game;
      payoutIntent.roundId = roundId;
    }

    return { betIntent, payoutIntent };
  }

  processTxIntent(intent: TxIntent, status: TxIntentStatus, txHash?: string, error?: string): TxIntent {
    return TxIntentSchema.parse({
      ...intent,
      status,
      txHash: txHash || intent.txHash,
      error: error || intent.error,
      updatedAt: new Date(),
    });
  }
}
