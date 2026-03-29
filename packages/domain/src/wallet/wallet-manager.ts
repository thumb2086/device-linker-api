import { WalletAccount, WalletAccountSchema, TokenSymbol, TxIntent, TxIntentSchema, TxIntentStatus } from "@repo/shared";

export interface WalletLedgerEntry {
  id: string;
  address: string;
  token: TokenSymbol;
  type: string;
  amount: string;
  status?: string;
  createdAt: string | Date;
  meta?: Record<string, unknown> | null;
}

export interface WalletSummary {
  address: string;
  balances: Record<TokenSymbol, string>;
  totalBalance: string;
  recentTransactions: Array<{
    id: string;
    type: string;
    token: TokenSymbol;
    amount: string;
    status: string;
    createdAt: string;
    counterparty?: string | null;
  }>;
}

export interface WalletDomain {
  createAccount(userId: string, token: TokenSymbol): WalletAccount;
  createTxIntent(userId: string, token: TokenSymbol, type: TxIntent["type"], amount: string, requestId?: string): TxIntent;
  createSettlementIntent(userId: string, token: TokenSymbol, betAmount: string, payoutAmount: string, game: string, roundId: string, requestId?: string): { betIntent: TxIntent; payoutIntent: TxIntent | null };
  processTxIntent(intent: TxIntent, status: TxIntentStatus, txHash?: string, error?: string): TxIntent;
  buildSummary(address: string, balances: Record<TokenSymbol, string>, ledger: WalletLedgerEntry[]): WalletSummary;
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

  buildSummary(address: string, balances: Record<TokenSymbol, string>, ledger: WalletLedgerEntry[]): WalletSummary {
    const zxc = parseFloat(balances.ZXC || "0");
    const yjc = parseFloat(balances.YJC || "0");
    const totalBalance = (zxc + yjc).toFixed(4);

    const recentTransactions = [...ledger]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        token: entry.token,
        amount: entry.amount,
        status: entry.status || "confirmed",
        createdAt: new Date(entry.createdAt).toISOString(),
        counterparty:
          entry.meta && typeof entry.meta.counterparty === "string" ? entry.meta.counterparty : null,
      }));

    return {
      address,
      balances,
      totalBalance,
      recentTransactions,
    };
  }
}
