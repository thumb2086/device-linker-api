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
