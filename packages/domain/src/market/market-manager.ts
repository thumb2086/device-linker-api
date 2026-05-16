// packages/domain/src/market/market-manager.ts
// 從 main/lib/market.js 完整移植（775 行的市場模擬引擎）

export const BANK_ANNUAL_RATE = 0.02;
export const LOAN_ANNUAL_RATE = 0.04;
export const MAX_LEVERAGE = 20;
export const MIN_FUTURES_MARGIN = 10;
export const MARKET_TICK_MS = 30_000;
export const STOCK_FEE_RATE = 0.001;
export const FUTURES_FEE_RATE = 0.0008;
export const MAX_HISTORY_ITEMS = 80;
export const DEFAULT_STARTING_CASH = 100_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MARKET_HISTORY_POINTS = 48;
const MONEY_EPSILON = 0.000001;

export interface MarketSymbolMeta {
  name: string;
  type: "stock" | "crypto" | "commodity";
  sector: string;
  basePrice: number;
  volatility: number;
  phase: number;
}

export interface MarketSymbolQuote extends MarketSymbolMeta {
  symbol: string;
  price: number;
  prevPrice: number;
  changePct: number;
}

export interface MarketSnapshot {
  generatedAt: number;
  generatedAtIso: string;
  tick: number;
  tickMs: number;
  marketVolatilityPct: number;
  marketIndex: number;
  marketTrendPct: number;
  marketTrendLabel: string;
  fearGreedIndex: number;
  advancers: number;
  decliners: number;
  sectorSummary: { sector: string; avgChangePct: number }[];
  symbols: Record<string, MarketSymbolQuote>;
  history: Record<string, number[]>;
  marketHistory: { index: number[] };
}

export interface StockHolding {
  qty: number;
  avgPrice: number;
}

export interface FuturesPosition {
  id: string;
  symbol: string;
  side: "long" | "short";
  leverage: number;
  margin: number;
  quantity: number;
  entryPrice: number;
  notional: number;
  openedAt: number;
  liquidationPrice: number;
}

export interface MarketAccount {
  version: number;
  createdAt: string;
  updatedAt: string;
  cash: number;
  bankBalance: number;
  bankInterestAccrued: number;
  loanPrincipal: number;
  loanInterestAccrued: number;
  stockHoldings: Record<string, StockHolding>;
  futuresPositions: FuturesPosition[];
  history: any[];
  bankUpdatedAt: number;
  loanUpdatedAt: number;
  lastSettledAt: number;
}

export const MARKET_SYMBOLS: Record<string, MarketSymbolMeta> = {
  AAPL: { name: "Apple", type: "stock", sector: "tech", basePrice: 185, volatility: 0.035, phase: 3 },
  NVDA: { name: "NVIDIA", type: "stock", sector: "tech", basePrice: 920, volatility: 0.055, phase: 11 },
  TSLA: { name: "Tesla", type: "stock", sector: "ev", basePrice: 215, volatility: 0.075, phase: 17 },
  MSFT: { name: "Microsoft", type: "stock", sector: "tech", basePrice: 410, volatility: 0.028, phase: 23 },
  AMD: { name: "AMD", type: "stock", sector: "tech", basePrice: 192, volatility: 0.061, phase: 31 },
  META: { name: "Meta", type: "stock", sector: "tech", basePrice: 505, volatility: 0.039, phase: 37 },
  JPM: { name: "JPMorgan", type: "stock", sector: "finance", basePrice: 202, volatility: 0.024, phase: 41 },
  BAC: { name: "Bank of America", type: "stock", sector: "finance", basePrice: 38, volatility: 0.026, phase: 43 },
  XOM: { name: "ExxonMobil", type: "stock", sector: "energy", basePrice: 112, volatility: 0.029, phase: 47 },
  CVX: { name: "Chevron", type: "stock", sector: "energy", basePrice: 155, volatility: 0.027, phase: 53 },
  WMT: { name: "Walmart", type: "stock", sector: "consumer", basePrice: 63, volatility: 0.019, phase: 59 },
  COST: { name: "Costco", type: "stock", sector: "consumer", basePrice: 742, volatility: 0.022, phase: 61 },
  NFLX: { name: "Netflix", type: "stock", sector: "media", basePrice: 618, volatility: 0.041, phase: 67 },
  ORCL: { name: "Oracle", type: "stock", sector: "tech", basePrice: 132, volatility: 0.025, phase: 71 },
  TSM: { name: "TSMC", type: "stock", sector: "tech", basePrice: 146, volatility: 0.034, phase: 73 },
  BTC: { name: "Bitcoin", type: "crypto", sector: "crypto", basePrice: 68_000, volatility: 0.095, phase: 79 },
  ETH: { name: "Ethereum", type: "crypto", sector: "crypto", basePrice: 3_600, volatility: 0.085, phase: 83 },
  GOLD: { name: "Gold", type: "commodity", sector: "commodity", basePrice: 2_050, volatility: 0.018, phase: 89 },
  SILVER: { name: "Silver", type: "commodity", sector: "commodity", basePrice: 24.5, volatility: 0.023, phase: 97 },
};

const TRADEABLE_STOCKS = new Set(
  Object.keys(MARKET_SYMBOLS).filter((s) => MARKET_SYMBOLS[s].type === "stock")
);
const TRADEABLE_FUTURES = new Set(Object.keys(MARKET_SYMBOLS));

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function hashInt(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
function toPositiveNumber(value: unknown, fallback = 0): number {
  const n = toNumber(value, fallback);
  return n > 0 ? n : fallback;
}
function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function nowIso(ts: number): string {
  return new Date(ts).toISOString();
}

// ─── Market Price Engine ──────────────────────────────────────────────────────

function getMarketPulse(tick: number): number {
  const noise = ((hashInt(`market:pulse:${tick}`) % 2001) - 1000) / 1000;
  return clamp(
    Math.sin(tick / 14.5) * 0.042 + Math.cos(tick / 33.5) * 0.031 + noise * 0.018,
    -0.14, 0.14
  );
}

function getSectorPulse(sector: string, tick: number): number {
  const phase = hashInt(`market:sector:${sector}`) % 73;
  const wave = Math.sin((tick + phase) / 8.5) * 0.024;
  const drift = Math.cos((tick + phase) / 25.5) * 0.018;
  const noise = (((hashInt(`market:${sector}:${tick}`) % 1601) - 800) / 800) * 0.012;
  return clamp(wave + drift + noise, -0.09, 0.09);
}

function priceForTick(symbol: string, tick: number): number {
  const meta = MARKET_SYMBOLS[symbol];
  if (!meta) throw new Error(`unknown symbol: ${symbol}`);
  const noise = ((hashInt(`market:${symbol}:${tick}`) % 2001) - 1000) / 1000;
  const multiplier =
    1 +
    getMarketPulse(tick) +
    getSectorPulse(meta.sector, tick) +
    Math.sin((tick + meta.phase) / 6.5) * meta.volatility +
    Math.cos((tick + meta.phase) / 18.5) * meta.volatility * 0.9 +
    noise * meta.volatility * 0.45;
  return round(clamp(meta.basePrice * multiplier, meta.basePrice * 0.18, meta.basePrice * 6.2), 4);
}

function trendLabel(changePct: number): string {
  if (changePct >= 1.8) return "強勢多頭";
  if (changePct >= 0.45) return "偏多";
  if (changePct <= -1.8) return "急跌";
  if (changePct <= -0.45) return "偏空";
  return "震盪";
}

function liquidationPrice(position: Pick<FuturesPosition, "side" | "entryPrice" | "leverage">): number {
  const { side, entryPrice: entry, leverage } = position;
  const safetyFactor = 0.96;
  if (side === "short") return round(entry * (1 + (1 / leverage) * safetyFactor), 4);
  return round(entry * (1 - (1 / leverage) * safetyFactor), 4);
}

function positionPnl(position: FuturesPosition, currentPrice: number): number {
  const { quantity: qty, entryPrice: entry, side } = position;
  if (!qty || !entry) return 0;
  return side === "short"
    ? round((entry - currentPrice) * qty, 6)
    : round((currentPrice - entry) * qty, 6);
}

function createSummary(entry: any): string {
  if (entry.summary) return entry.summary;
  const amount = entry.amount !== undefined ? round(entry.amount, 2) : null;
  const net = entry.net !== undefined ? round(entry.net, 2) : null;
  const total = entry.total !== undefined ? round(entry.total, 2) : null;
  switch (entry.type) {
    case "stock_buy": return `買入 ${entry.symbol} ${entry.quantity} 股，成交 ${entry.price}，支出 ${total} 子熙幣`;
    case "stock_sell": return `賣出 ${entry.symbol} ${entry.quantity} 股，成交 ${entry.price}，回收 ${net} 子熙幣`;
    case "futures_open": return `開啟 ${entry.symbol} ${entry.side === "short" ? "空單" : "多單"} ${entry.leverage}x，保證金 ${entry.margin} 子熙幣`;
    case "futures_close": return `平倉 ${entry.symbol}，損益 ${entry.pnl} 子熙幣`;
    case "futures_liquidated": return `${entry.symbol} 爆倉，損失 ${entry.margin} 子熙幣`;
    case "bank_deposit": return `存入銀行 ${amount} 子熙幣`;
    case "bank_withdraw": return `自銀行提領 ${amount} 子熙幣`;
    case "loan_borrow": return `貸款 ${amount} 子熙幣`;
    case "loan_repay": return `償還貸款 ${amount} 子熙幣`;
    default: return entry.type || "市場操作";
  }
}

function appendHistory(account: MarketAccount, entry: any): void {
  const next = { at: nowIso(Date.now()), ...entry };
  next.summary = createSummary(next);
  account.history = [next, ...account.history].slice(0, MAX_HISTORY_ITEMS);
}

function requireAmount(value: unknown, fieldName = "amount"): number {
  const amount = toNumber(value, NaN);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${fieldName} 必須大於 0`);
  return round(amount, 6);
}
function requireSymbol(value: unknown, allowed: Set<string>): string {
  const symbol = String(value || "").trim().toUpperCase();
  if (!allowed.has(symbol)) throw new Error(`不支援的標的：${symbol || "(空白)"}`);
  return symbol;
}

// ─── Settlement helpers ───────────────────────────────────────────────────────

function settleBankAndLoan(account: MarketAccount, nowTs: number): void {
  const ts = toNumber(nowTs, Date.now());
  const bankDeltaMs = Math.max(0, ts - toNumber(account.bankUpdatedAt, ts));
  if (account.bankBalance > 0 && bankDeltaMs > 0) {
    const interest = account.bankBalance * BANK_ANNUAL_RATE * (bankDeltaMs / YEAR_MS);
    account.bankBalance = round(account.bankBalance + interest, 6);
    account.bankInterestAccrued = round(account.bankInterestAccrued + interest, 6);
  }
  account.bankUpdatedAt = ts;
  const loanDeltaMs = Math.max(0, ts - toNumber(account.loanUpdatedAt, ts));
  if (account.loanPrincipal > 0 && loanDeltaMs > 0) {
    const interest = account.loanPrincipal * LOAN_ANNUAL_RATE * (loanDeltaMs / YEAR_MS);
    account.loanPrincipal = round(account.loanPrincipal + interest, 6);
    account.loanInterestAccrued = round(account.loanInterestAccrued + interest, 6);
  }
  account.loanUpdatedAt = ts;
  account.lastSettledAt = ts;
  account.updatedAt = nowIso(ts);
}

// ─── Public API ────────────────────────────────────────────────────────────────

export class MarketManager {
  // ─── Account ────────────────────────────────────────────────────────────────

  createDefaultAccount(nowTs = Date.now(), startingCash = DEFAULT_STARTING_CASH): MarketAccount {
    const ts = toNumber(nowTs, Date.now());
    return {
      version: 2, createdAt: nowIso(ts), updatedAt: nowIso(ts),
      cash: round(toNumber(startingCash, DEFAULT_STARTING_CASH), 6),
      bankBalance: 0, bankInterestAccrued: 0,
      loanPrincipal: 0, loanInterestAccrued: 0,
      stockHoldings: {}, futuresPositions: [], history: [],
      bankUpdatedAt: ts, loanUpdatedAt: ts, lastSettledAt: ts,
    };
  }

  normalizeAccount(raw: unknown, nowTs = Date.now()): MarketAccount {
    const ts = toNumber(nowTs, Date.now());
    if (!raw || typeof raw !== "object") return this.createDefaultAccount(ts);
    const r = raw as any;

    const stockHoldings: Record<string, StockHolding> = {};
    for (const [symbol, holding] of Object.entries(r.stockHoldings || {})) {
      if (!TRADEABLE_STOCKS.has(symbol)) continue;
      const h = holding as any;
      const qty = typeof h === "number" ? toNumber(h, 0) : toNumber(h?.qty, 0);
      if (qty > 0) stockHoldings[symbol] = { qty: round(qty, 6), avgPrice: round(toNumber(h?.avgPrice, 0), 6) };
    }

    const futuresPositions: FuturesPosition[] = (Array.isArray(r.futuresPositions) ? r.futuresPositions : [])
      .map((pos: any) => ({
        id: String(pos.id || ""),
        symbol: String(pos.symbol || "").toUpperCase(),
        side: pos.side === "short" ? "short" : "long",
        leverage: clamp(Math.floor(toPositiveNumber(pos.leverage, 1)), 1, MAX_LEVERAGE),
        margin: round(toPositiveNumber(pos.margin, 0), 6),
        quantity: round(toPositiveNumber(pos.quantity, 0), 8),
        entryPrice: round(toPositiveNumber(pos.entryPrice, 0), 6),
        notional: round(toPositiveNumber(pos.notional, 0), 6),
        openedAt: toNumber(pos.openedAt, ts),
        liquidationPrice: round(toPositiveNumber(pos.liquidationPrice, 0), 6),
      } as FuturesPosition))
      .filter((p: FuturesPosition) => p.id && TRADEABLE_FUTURES.has(p.symbol) && p.margin > 0 && p.quantity > 0);

    return {
      version: 2,
      createdAt: r.createdAt || nowIso(ts),
      updatedAt: nowIso(ts),
      cash: round(toNumber(r.cash, DEFAULT_STARTING_CASH), 6),
      bankBalance: round(toNumber(r.bankBalance, 0), 6),
      bankInterestAccrued: round(toNumber(r.bankInterestAccrued, 0), 6),
      loanPrincipal: round(toNumber(r.loanPrincipal, 0), 6),
      loanInterestAccrued: round(toNumber(r.loanInterestAccrued, 0), 6),
      stockHoldings, futuresPositions,
      history: (Array.isArray(r.history) ? r.history.slice(0, MAX_HISTORY_ITEMS) : []).map((e: any) => ({ ...e, summary: createSummary(e || {}) })),
      bankUpdatedAt: toNumber(r.bankUpdatedAt, ts),
      loanUpdatedAt: toNumber(r.loanUpdatedAt, ts),
      lastSettledAt: toNumber(r.lastSettledAt, ts),
    };
  }

  // ─── Market Snapshot ────────────────────────────────────────────────────────

  buildSnapshot(nowTs = Date.now()): MarketSnapshot {
    const ts = toNumber(nowTs, Date.now());
    const tick = Math.floor(ts / MARKET_TICK_MS);
    const symbols: Record<string, MarketSymbolQuote> = {};
    const history: Record<string, number[]> = {};
    const sectorBuckets: Record<string, { sector: string; totalChangePct: number; count: number }> = {};
    let moveAccumulator = 0, advancers = 0, decliners = 0;

    for (const symbol of Object.keys(MARKET_SYMBOLS)) {
      const meta = MARKET_SYMBOLS[symbol];
      const price = priceForTick(symbol, tick);
      const prevPrice = priceForTick(symbol, tick - 1);
      const changePct = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
      const prices: number[] = [];
      for (let t = tick - (MARKET_HISTORY_POINTS - 1); t <= tick; t++) prices.push(priceForTick(symbol, t));
      history[symbol] = prices;
      symbols[symbol] = { symbol, ...meta, price, prevPrice, changePct: round(changePct, 4) };
      if (!sectorBuckets[meta.sector]) sectorBuckets[meta.sector] = { sector: meta.sector, totalChangePct: 0, count: 0 };
      sectorBuckets[meta.sector].totalChangePct += changePct;
      sectorBuckets[meta.sector].count++;
      moveAccumulator += Math.abs(changePct);
      if (changePct > 0) advancers++; else if (changePct < 0) decliners++;
    }

    const symbolKeys = Object.keys(MARKET_SYMBOLS);
    const marketIndexHistory: number[] = [];
    for (let pi = 0; pi < MARKET_HISTORY_POINTS; pi++) {
      let totalRatio = 0;
      for (const symbol of symbolKeys) {
        const meta = MARKET_SYMBOLS[symbol];
        const price = Number((history[symbol] || [])[pi] || meta.basePrice);
        totalRatio += meta.basePrice > 0 ? price / meta.basePrice : 1;
      }
      marketIndexHistory.push(round((symbolKeys.length > 0 ? totalRatio / symbolKeys.length : 1) * 100, 4));
    }

    const currentIdx = marketIndexHistory.at(-1) ?? 100;
    const prevIdx = marketIndexHistory.at(-2) ?? currentIdx;
    const marketTrendPct = prevIdx > 0 ? round(((currentIdx - prevIdx) / prevIdx) * 100, 4) : 0;

    return {
      generatedAt: ts, generatedAtIso: nowIso(ts), tick, tickMs: MARKET_TICK_MS,
      marketVolatilityPct: round(symbolKeys.length > 0 ? moveAccumulator / symbolKeys.length : 0, 4),
      marketIndex: round(currentIdx, 4), marketTrendPct,
      marketTrendLabel: trendLabel(marketTrendPct),
      fearGreedIndex: hashInt(`fg:${tick}`) % 101,
      advancers, decliners,
      sectorSummary: Object.values(sectorBuckets).map((b) => ({ sector: b.sector, avgChangePct: round(b.count > 0 ? b.totalChangePct / b.count : 0, 4) })).sort((a, b) => b.avgChangePct - a.avgChangePct),
      symbols, history, marketHistory: { index: marketIndexHistory },
    };
  }

  // ─── Trading ─────────────────────────────────────────────────────────────────

  settleLiquidations(account: MarketAccount, market: MarketSnapshot, nowTs = Date.now()) {
    settleBankAndLoan(account, nowTs);
    const survivors: FuturesPosition[] = [];
    const events: any[] = [];
    for (const pos of account.futuresPositions) {
      const quote = market.symbols[pos.symbol];
      if (!quote) { survivors.push(pos); continue; }
      const pnl = positionPnl(pos, quote.price);
      if (pnl <= -(pos.margin * 0.99)) {
        events.push({ type: "liquidated", positionId: pos.id, symbol: pos.symbol, side: pos.side, marginLost: round(pos.margin, 6), markPrice: quote.price, estimatedPnl: pnl });
        appendHistory(account, { type: "futures_liquidated", symbol: pos.symbol, side: pos.side, margin: round(pos.margin, 6), markPrice: quote.price, pnl });
        continue;
      }
      survivors.push(pos);
    }
    account.futuresPositions = survivors;
    return events;
  }

  buyStock(account: MarketAccount, market: MarketSnapshot, symbolInput: unknown, quantityInput: unknown) {
    const symbol = requireSymbol(symbolInput, TRADEABLE_STOCKS);
    const quantity = requireAmount(quantityInput, "quantity");
    const quote = market.symbols[symbol];
    const gross = round(quantity * quote.price, 6);
    const fee = round(gross * STOCK_FEE_RATE, 6);
    const total = round(gross + fee, 6);
    if (account.cash < total) throw new Error("可用子熙幣不足");
    account.cash = round(account.cash - total, 6);
    const cur = account.stockHoldings[symbol] || { qty: 0, avgPrice: 0 };
    const prevQty = toNumber(cur.qty, 0);
    const prevCost = round(prevQty * toNumber(cur.avgPrice, 0), 6);
    const newQty = round(prevQty + quantity, 6);
    const newAvgPrice = newQty > 0 ? round((prevCost + total) / newQty, 6) : 0;
    account.stockHoldings[symbol] = { qty: newQty, avgPrice: newAvgPrice };
    appendHistory(account, { type: "stock_buy", symbol, quantity, price: quote.price, fee, total, avgPrice: newAvgPrice });
    return { symbol, quantity, price: quote.price, fee, total };
  }

  sellStock(account: MarketAccount, market: MarketSnapshot, symbolInput: unknown, quantityInput: unknown) {
    const symbol = requireSymbol(symbolInput, TRADEABLE_STOCKS);
    const quantity = requireAmount(quantityInput, "quantity");
    const holding = account.stockHoldings[symbol] || { qty: 0, avgPrice: 0 };
    if (toNumber(holding.qty, 0) < quantity) throw new Error(`${symbol} 持股不足`);
    const quote = market.symbols[symbol];
    const gross = round(quantity * quote.price, 6);
    const fee = round(gross * STOCK_FEE_RATE, 6);
    const net = round(gross - fee, 6);
    account.cash = round(account.cash + net, 6);
    const remainingQty = round(toNumber(holding.qty, 0) - quantity, 6);
    if (remainingQty <= 0) delete account.stockHoldings[symbol];
    else account.stockHoldings[symbol] = { qty: remainingQty, avgPrice: toNumber(holding.avgPrice, 0) };
    appendHistory(account, { type: "stock_sell", symbol, quantity, price: quote.price, fee, net, avgPrice: holding.avgPrice });
    return { symbol, quantity, price: quote.price, fee, net };
  }

  openFutures(account: MarketAccount, market: MarketSnapshot, payload: { symbol: unknown; side?: string; margin: unknown; leverage: unknown; maxMargin?: number }) {
    const symbol = requireSymbol(payload.symbol, TRADEABLE_FUTURES);
    const side = payload.side === "short" ? "short" : "long";
    const margin = requireAmount(payload.margin, "margin");
    const leverage = clamp(Math.floor(requireAmount(payload.leverage, "leverage")), 1, MAX_LEVERAGE);
    if (margin < MIN_FUTURES_MARGIN) throw new Error(`期貨最小保證金為 ${MIN_FUTURES_MARGIN}`);
    if (payload.maxMargin && margin > payload.maxMargin) throw new Error(`保證金上限為 ${round(payload.maxMargin, 2).toLocaleString()} 子熙幣`);
    if (account.cash < margin) throw new Error("可用子熙幣不足");
    const quote = market.symbols[symbol];
    const notional = round(margin * leverage, 6);
    const quantity = round(notional / quote.price, 8);
    const fee = round(notional * FUTURES_FEE_RATE, 6);
    if (quantity <= 0) throw new Error("下單數量無效");
    if (account.cash < margin + fee) throw new Error("可用子熙幣不足支付保證金與手續費");
    account.cash = round(account.cash - margin - fee, 6);
    const openedAt = Date.now();
    const id = `fut_${openedAt}_${hashInt(`${symbol}:${openedAt}:${Math.random()}`).toString().slice(-6)}`;
    const pos: FuturesPosition = { id, symbol, side, leverage, margin, quantity, notional, entryPrice: quote.price, liquidationPrice: liquidationPrice({ side, entryPrice: quote.price, leverage }), openedAt };
    account.futuresPositions.push(pos);
    appendHistory(account, { type: "futures_open", id, symbol, side, leverage, margin, price: quote.price, fee });
    return { id, symbol, side, leverage, margin, entryPrice: quote.price, liquidationPrice: pos.liquidationPrice, fee };
  }

  closeFutures(account: MarketAccount, market: MarketSnapshot, positionId: string) {
    const idx = account.futuresPositions.findIndex((p) => p.id === positionId);
    if (idx < 0) throw new Error("找不到期貨倉位");
    const pos = account.futuresPositions[idx];
    const quote = market.symbols[pos.symbol];
    if (!quote) throw new Error("標的行情不存在");
    const pnl = positionPnl(pos, quote.price);
    const realized = round(Math.max(-pos.margin, pnl), 6);
    const refund = round(Math.max(0, pos.margin + realized), 6);
    const fee = round(pos.notional * FUTURES_FEE_RATE, 6);
    account.futuresPositions.splice(idx, 1);
    account.cash = round(account.cash + refund - fee, 6);
    appendHistory(account, { type: "futures_close", id: pos.id, symbol: pos.symbol, side: pos.side, closePrice: quote.price, pnl: realized, fee });
    return { id: pos.id, symbol: pos.symbol, side: pos.side, closePrice: quote.price, realizedPnl: realized, refund, fee };
  }

  bankDeposit(account: MarketAccount, amountInput: unknown) {
    const amount = requireAmount(amountInput, "amount");
    if (account.cash + MONEY_EPSILON < amount) throw new Error("可用子熙幣不足");
    account.cash = round(account.cash - amount, 6);
    account.bankBalance = round(account.bankBalance + amount, 6);
    appendHistory(account, { type: "bank_deposit", amount });
    return { amount };
  }

  bankWithdraw(account: MarketAccount, amountInput: unknown) {
    const amount = requireAmount(amountInput, "amount");
    if (account.bankBalance + MONEY_EPSILON < amount) throw new Error("銀行餘額不足");
    const withdrawAmount = round(Math.min(amount, account.bankBalance), 6);
    account.bankBalance = round(account.bankBalance - withdrawAmount, 6);
    account.cash = round(account.cash + withdrawAmount, 6);
    appendHistory(account, { type: "bank_withdraw", amount: withdrawAmount });
    return { amount: withdrawAmount };
  }

  borrowLoan(account: MarketAccount, market: MarketSnapshot, amountInput: unknown) {
    const amount = requireAmount(amountInput, "amount");
    const summary = this.buildAccountSummary(account, market);
    const maxBorrow = round(Math.max(0, summary.netWorth * 0.6 - account.loanPrincipal), 6);
    if (maxBorrow <= 0) throw new Error("目前資產不足以繼續貸款");
    if (amount > maxBorrow) throw new Error(`目前最多可貸 ${maxBorrow.toFixed(2)}`);
    account.loanPrincipal = round(account.loanPrincipal + amount, 6);
    account.cash = round(account.cash + amount, 6);
    appendHistory(account, { type: "loan_borrow", amount });
    return { amount, maxBorrow };
  }

  repayLoan(account: MarketAccount, amountInput: unknown) {
    const amount = requireAmount(amountInput, "amount");
    const payAmount = round(Math.min(amount, account.cash + MONEY_EPSILON, account.loanPrincipal + MONEY_EPSILON), 6);
    if (payAmount <= 0) throw new Error("沒有可償還的貸款");
    account.cash = round(account.cash - payAmount, 6);
    account.loanPrincipal = round(account.loanPrincipal - payAmount, 6);
    appendHistory(account, { type: "loan_repay", amount: payAmount });
    return { amount: payAmount, remainingLoan: account.loanPrincipal };
  }

  buildAccountSummary(account: MarketAccount, market: MarketSnapshot) {
    let stockValue = 0;
    const stockPositions: any[] = [];
    for (const [symbol, holding] of Object.entries(account.stockHoldings)) {
      const qty = toNumber(holding.qty, 0);
      if (qty <= 0) continue;
      const quote = market.symbols[symbol];
      if (!quote) continue;
      const avgPrice = round(toNumber(holding.avgPrice, 0), 6);
      const value = round(qty * quote.price, 6);
      stockValue += value;
      stockPositions.push({ symbol, name: MARKET_SYMBOLS[symbol]?.name, sector: MARKET_SYMBOLS[symbol]?.sector, quantity: round(qty, 6), avgPrice, price: quote.price, marketValue: value, unrealizedPnl: round((quote.price - avgPrice) * qty, 6), roiPct: avgPrice > 0 ? round(((quote.price - avgPrice) / avgPrice) * 100, 4) : 0, dayChangePct: round(quote.changePct, 4) });
    }

    let totalFuturesUnrealized = 0, totalUsedMargin = 0;
    const futuresPositions: any[] = [];
    for (const pos of account.futuresPositions) {
      const quote = market.symbols[pos.symbol];
      if (!quote) continue;
      const unrealizedPnl = positionPnl(pos, quote.price);
      totalFuturesUnrealized += unrealizedPnl;
      totalUsedMargin += pos.margin;
      futuresPositions.push({ ...pos, markPrice: quote.price, symbolName: MARKET_SYMBOLS[pos.symbol]?.name || pos.symbol, unrealizedPnl: round(unrealizedPnl, 6), roiPct: pos.margin > 0 ? round((unrealizedPnl / pos.margin) * 100, 3) : 0 });
    }

    const cash = round(account.cash, 6);
    const bankBalance = round(account.bankBalance, 6);
    const loanPrincipal = round(account.loanPrincipal, 6);
    const netWorth = round(cash + bankBalance + stockValue + totalFuturesUnrealized - loanPrincipal, 6);
    return { cash, bankBalance, loanPrincipal, stockValue: round(stockValue, 6), futuresUnrealizedPnl: round(totalFuturesUnrealized, 6), usedFuturesMargin: round(totalUsedMargin, 6), netWorth, maxBorrow: round(Math.max(0, netWorth * 0.6 - loanPrincipal), 6), bankInterestAccrued: round(account.bankInterestAccrued, 6), loanInterestAccrued: round(account.loanInterestAccrued, 6), stockPositions, futuresPositions, history: account.history.slice(0, 24) };
  }
}
