export interface WalletTransactionRecord {
  id: string;
  address: string;
  token: string;
  type: string;
  amount: number;
  status?: string | null;
  createdAt: string | Date;
  meta?: Record<string, unknown> | null;
}

export interface MarketTransactionRecord {
  id: string;
  address: string;
  type: string;
  symbol?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null;
  fee?: number | null;
  pnl?: number | null;
  createdAt: string | Date;
  meta?: Record<string, unknown> | null;
}

export interface WalletIntentRecord {
  id: string;
  address: string;
  token: string;
  type: string;
  status?: string | null;
  amount?: number | null;
  createdAt: string | Date;
}

export interface PublicTransactionItem {
  id: string;
  scope: "wallet" | "market";
  kind: string;
  address: string;
  maskedAddress: string;
  token?: string | null;
  symbol?: string | null;
  amount?: number | null;
  quantity?: number | null;
  price?: number | null;
  fee?: number | null;
  pnl?: number | null;
  status: string;
  summary: string;
  createdAt: string;
}

export interface PublicTransactionStats {
  totalTransactions: number;
  overallSuccessRate: number | null;
  walletExecutionSuccessRate: number | null;
  marketWinRate: number | null;
  successfulTransactions: number;
  failedTransactions: number;
  scoredTransactions: number;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

function maskAddress(address: string): string {
  if (!address) return "unknown";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function round(value: unknown, digits = 6): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function percent(successes: number, total: number): number | null {
  if (total <= 0) return null;
  return round((successes / total) * 100, 2);
}

function walletSummary(tx: WalletTransactionRecord): string {
  const amount = round(tx.amount, 4);
  const token = (tx.token || "").toUpperCase() || "TOKEN";
  switch (tx.type) {
    case "airdrop":
      return `Airdrop ${amount} ${token}`;
    case "transfer_out":
      return `Transfer out ${amount} ${token}`;
    case "transfer_in":
      return `Transfer in ${amount} ${token}`;
    case "withdrawal":
      return `Withdrawal ${amount} ${token}`;
    default:
      return `${tx.type} ${amount} ${token}`;
  }
}

function marketSummary(tx: MarketTransactionRecord): string {
  const symbol = tx.symbol || "MARKET";
  switch (tx.type) {
    case "stock_buy":
      return `Bought ${round(tx.quantity, 4)} ${symbol}`;
    case "stock_sell":
      return `Sold ${round(tx.quantity, 4)} ${symbol}`;
    case "bank_deposit":
      return `Bank deposit ${round(tx.amount, 2)}`;
    case "bank_withdraw":
      return `Bank withdraw ${round(tx.amount, 2)}`;
    case "loan_borrow":
      return `Loan borrow ${round(tx.amount, 2)}`;
    case "loan_repay":
      return `Loan repay ${round(tx.amount, 2)}`;
    case "futures_open":
      return `Opened ${symbol} futures`;
    case "futures_close":
      return `Closed ${symbol} futures`;
    default:
      return tx.type;
  }
}

export class TransactionManager {
  buildPublicStats(
    walletIntents: WalletIntentRecord[],
    marketTransactions: MarketTransactionRecord[],
    totalTransactions: number
  ): PublicTransactionStats {
    const finalizedWalletIntents = walletIntents.filter((intent) =>
      ["confirmed", "failed", "reverted"].includes(String(intent.status || "").toLowerCase())
    );
    const walletSuccesses = finalizedWalletIntents.filter((intent) => String(intent.status || "").toLowerCase() === "confirmed").length;

    const scoredMarketTransactions = marketTransactions.filter((tx) =>
      ["stock_sell", "futures_close"].includes(tx.type) && round(tx.pnl, 6) !== null
    );
    const marketSuccesses = scoredMarketTransactions.filter((tx) => (round(tx.pnl, 6) || 0) >= 0).length;

    const successfulTransactions = walletSuccesses + marketSuccesses;
    const failedTransactions = (finalizedWalletIntents.length - walletSuccesses) + (scoredMarketTransactions.length - marketSuccesses);
    const scoredTransactions = finalizedWalletIntents.length + scoredMarketTransactions.length;

    return {
      totalTransactions,
      overallSuccessRate: percent(successfulTransactions, scoredTransactions),
      walletExecutionSuccessRate: percent(walletSuccesses, finalizedWalletIntents.length),
      marketWinRate: percent(marketSuccesses, scoredMarketTransactions.length),
      successfulTransactions,
      failedTransactions,
      scoredTransactions,
    };
  }

  buildPublicFeed(
    walletTransactions: WalletTransactionRecord[],
    marketTransactions: MarketTransactionRecord[],
    limit = 50
  ): PublicTransactionItem[] {
    const walletItems = walletTransactions.map<PublicTransactionItem>((tx) => ({
      id: `wallet:${tx.id}`,
      scope: "wallet",
      kind: tx.type,
      address: tx.address,
      maskedAddress: maskAddress(tx.address),
      token: tx.token?.toUpperCase() || null,
      amount: round(tx.amount, 6),
      status: tx.status || "confirmed",
      summary: walletSummary(tx),
      createdAt: toIso(tx.createdAt),
    }));

    const marketItems = marketTransactions.map<PublicTransactionItem>((tx) => ({
      id: `market:${tx.id}`,
      scope: "market",
      kind: tx.type,
      address: tx.address,
      maskedAddress: maskAddress(tx.address),
      symbol: tx.symbol || null,
      amount: round(tx.amount, 6),
      quantity: round(tx.quantity, 6),
      price: round(tx.price, 6),
      fee: round(tx.fee, 6),
      pnl: round(tx.pnl, 6),
      status: "confirmed",
      summary: marketSummary(tx),
      createdAt: toIso(tx.createdAt),
    }));

    return [...walletItems, ...marketItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }
}
