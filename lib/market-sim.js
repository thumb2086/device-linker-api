import { hashInt } from "./auto-round.js";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MARKET_TICK_MS = 30000;
const STOCK_FEE_RATE = 0.001;
const FUTURES_FEE_RATE = 0.0008;
const MAX_HISTORY_ITEMS = 80;
const MONEY_EPSILON = 0.000001;
const MARKET_HISTORY_POINTS = 48;

export const BANK_ANNUAL_RATE = 0.02;
export const LOAN_ANNUAL_RATE = 0.04;
export const MAX_LEVERAGE = 20;
export const MIN_FUTURES_MARGIN = 10;

export const MARKET_SYMBOLS = {
    AAPL: { name: "Apple", type: "stock", basePrice: 185, volatility: 0.035, phase: 3 },
    NVDA: { name: "NVIDIA", type: "stock", basePrice: 920, volatility: 0.055, phase: 11 },
    TSLA: { name: "Tesla", type: "stock", basePrice: 215, volatility: 0.075, phase: 17 },
    MSFT: { name: "Microsoft", type: "stock", basePrice: 410, volatility: 0.028, phase: 23 },
    BTC: { name: "Bitcoin", type: "crypto", basePrice: 68000, volatility: 0.095, phase: 29 },
    GOLD: { name: "Gold", type: "commodity", basePrice: 2050, volatility: 0.018, phase: 37 }
};

const TRADEABLE_STOCKS = new Set(Object.keys(MARKET_SYMBOLS).filter((symbol) => MARKET_SYMBOLS[symbol].type === "stock"));
const TRADEABLE_FUTURES = new Set(Object.keys(MARKET_SYMBOLS));

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toPositiveNumber(value, fallback = 0) {
    const num = toNumber(value, fallback);
    return num > 0 ? num : fallback;
}

function round(value, digits = 6) {
    const num = toNumber(value, 0);
    const factor = 10 ** digits;
    return Math.round(num * factor) / factor;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function nowIso(ts) {
    return new Date(ts).toISOString();
}

function priceForTick(symbol, tick) {
    const meta = MARKET_SYMBOLS[symbol];
    if (!meta) throw new Error(`unknown symbol: ${symbol}`);

    const noise = ((hashInt(`market:${symbol}:${tick}`) % 2001) - 1000) / 1000;
    const mediumTrend = Math.sin((tick + meta.phase) / 6.5) * meta.volatility;
    const longTrend = Math.cos((tick + meta.phase) / 18.5) * meta.volatility * 0.9;
    const shock = noise * meta.volatility * 0.55;

    const multiplier = 1 + mediumTrend + longTrend + shock;
    const minPrice = meta.basePrice * 0.22;
    const maxPrice = meta.basePrice * 4.5;

    return round(clamp(meta.basePrice * multiplier, minPrice, maxPrice), 4);
}

function liquidationPrice(position) {
    const entry = toPositiveNumber(position.entryPrice, 0);
    const leverage = clamp(Math.floor(toPositiveNumber(position.leverage, 1)), 1, MAX_LEVERAGE);

    // 預留少量 buffer，避免浮點誤差觸發過早清算
    const safety = 0.96;
    if (position.side === "short") {
        return round(entry * (1 + (1 / leverage) * safety), 4);
    }
    return round(entry * (1 - (1 / leverage) * safety), 4);
}

function positionPnl(position, currentPrice) {
    const qty = toPositiveNumber(position.quantity, 0);
    const entry = toPositiveNumber(position.entryPrice, 0);
    const side = position.side === "short" ? "short" : "long";

    if (!qty || !entry) return 0;

    if (side === "short") {
        return round((entry - currentPrice) * qty, 6);
    }
    return round((currentPrice - entry) * qty, 6);
}

export function createDefaultMarketAccount(nowTs = Date.now(), startingCash = 0) {
    const ts = toNumber(nowTs, Date.now());
    return {
        version: 1,
        createdAt: nowIso(ts),
        updatedAt: nowIso(ts),
        cash: round(toNumber(startingCash, 0), 6),
        bankBalance: 0,
        bankInterestAccrued: 0,
        loanPrincipal: 0,
        loanInterestAccrued: 0,
        stockHoldings: {},
        futuresPositions: [],
        history: [],
        bankUpdatedAt: ts,
        loanUpdatedAt: ts,
        lastSettledAt: ts
    };
}

export function normalizeMarketAccount(raw, nowTs = Date.now()) {
    const ts = toNumber(nowTs, Date.now());
    if (!raw || typeof raw !== "object") return createDefaultMarketAccount(ts);

    const stockHoldings = {};
    const holdings = raw.stockHoldings || {};
    for (const symbol of Object.keys(holdings)) {
        if (!TRADEABLE_STOCKS.has(symbol)) continue;
        const rawHolding = holdings[symbol];
        if (typeof rawHolding === "number") {
            const qty = toNumber(rawHolding, 0);
            if (qty > 0) {
                stockHoldings[symbol] = {
                    qty: round(qty, 6),
                    avgPrice: 0
                };
            }
            continue;
        }
        if (rawHolding && typeof rawHolding === "object") {
            const qty = toNumber(rawHolding.qty, 0);
            const avgPrice = toNumber(rawHolding.avgPrice, 0);
            if (qty > 0) {
                stockHoldings[symbol] = {
                    qty: round(qty, 6),
                    avgPrice: round(avgPrice, 6)
                };
            }
        }
    }

    const futuresPositions = Array.isArray(raw.futuresPositions)
        ? raw.futuresPositions
            .map((pos) => ({
                id: String(pos.id || ""),
                symbol: String(pos.symbol || "").toUpperCase(),
                side: pos.side === "short" ? "short" : "long",
                leverage: clamp(Math.floor(toPositiveNumber(pos.leverage, 1)), 1, MAX_LEVERAGE),
                margin: round(toPositiveNumber(pos.margin, 0), 6),
                quantity: round(toPositiveNumber(pos.quantity, 0), 8),
                entryPrice: round(toPositiveNumber(pos.entryPrice, 0), 6),
                notional: round(toPositiveNumber(pos.notional, 0), 6),
                openedAt: toNumber(pos.openedAt, ts),
                liquidationPrice: round(toPositiveNumber(pos.liquidationPrice, 0), 6)
            }))
            .filter((pos) => pos.id && TRADEABLE_FUTURES.has(pos.symbol) && pos.margin > 0 && pos.quantity > 0 && pos.entryPrice > 0)
        : [];

    const history = Array.isArray(raw.history) ? raw.history.slice(0, MAX_HISTORY_ITEMS) : [];

    return {
        version: 1,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(ts),
        updatedAt: nowIso(ts),
        cash: round(toNumber(raw.cash, 100000), 6),
        bankBalance: round(toNumber(raw.bankBalance, 0), 6),
        bankInterestAccrued: round(toNumber(raw.bankInterestAccrued, 0), 6),
        loanPrincipal: round(toNumber(raw.loanPrincipal, 0), 6),
        loanInterestAccrued: round(toNumber(raw.loanInterestAccrued, 0), 6),
        stockHoldings,
        futuresPositions,
        history,
        bankUpdatedAt: toNumber(raw.bankUpdatedAt, ts),
        loanUpdatedAt: toNumber(raw.loanUpdatedAt, ts),
        lastSettledAt: toNumber(raw.lastSettledAt, ts)
    };
}

export function buildMarketSnapshot(nowTs = Date.now()) {
    const ts = toNumber(nowTs, Date.now());
    const tick = Math.floor(ts / MARKET_TICK_MS);

    const symbols = {};
    let moveAccumulator = 0;
    let symbolCount = 0;

    for (const symbol of Object.keys(MARKET_SYMBOLS)) {
        const price = priceForTick(symbol, tick);
        const prevPrice = priceForTick(symbol, tick - 1);
        const changePct = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

        symbols[symbol] = {
            symbol,
            name: MARKET_SYMBOLS[symbol].name,
            type: MARKET_SYMBOLS[symbol].type,
            price,
            prevPrice,
            changePct: round(changePct, 4)
        };

        moveAccumulator += Math.abs(changePct);
        symbolCount += 1;
    }

    const avgMove = symbolCount > 0 ? moveAccumulator / symbolCount : 0;
    const fearGreed = hashInt(`fg:${tick}`) % 101;
    const history = {};

    for (const symbol of Object.keys(MARKET_SYMBOLS)) {
        const prices = [];
        const startTick = tick - (MARKET_HISTORY_POINTS - 1);
        for (let t = startTick; t <= tick; t += 1) {
            prices.push(priceForTick(symbol, t));
        }
        history[symbol] = prices;
    }

    return {
        generatedAt: ts,
        generatedAtIso: nowIso(ts),
        tick,
        tickMs: MARKET_TICK_MS,
        marketVolatilityPct: round(avgMove, 4),
        fearGreedIndex: fearGreed,
        symbols,
        history
    };
}

function appendHistory(account, entry) {
    const next = {
        at: nowIso(Date.now()),
        ...entry
    };

    account.history = [next, ...(account.history || [])].slice(0, MAX_HISTORY_ITEMS);
}

function settleBankAndLoan(account, nowTs) {
    const ts = toNumber(nowTs, Date.now());

    const bankDeltaMs = Math.max(0, ts - toNumber(account.bankUpdatedAt, ts));
    if (account.bankBalance > 0 && bankDeltaMs > 0) {
        const bankInterest = account.bankBalance * BANK_ANNUAL_RATE * (bankDeltaMs / YEAR_MS);
        account.bankBalance = round(account.bankBalance + bankInterest, 6);
        account.bankInterestAccrued = round(account.bankInterestAccrued + bankInterest, 6);
    }
    account.bankUpdatedAt = ts;

    const loanDeltaMs = Math.max(0, ts - toNumber(account.loanUpdatedAt, ts));
    if (account.loanPrincipal > 0 && loanDeltaMs > 0) {
        const loanInterest = account.loanPrincipal * LOAN_ANNUAL_RATE * (loanDeltaMs / YEAR_MS);
        account.loanPrincipal = round(account.loanPrincipal + loanInterest, 6);
        account.loanInterestAccrued = round(account.loanInterestAccrued + loanInterest, 6);
    }
    account.loanUpdatedAt = ts;

    account.lastSettledAt = ts;
    account.updatedAt = nowIso(ts);
}

export function settleLiquidations(account, market, nowTs = Date.now()) {
    settleBankAndLoan(account, nowTs);

    const survivors = [];
    const events = [];

    for (const position of account.futuresPositions) {
        const quote = market.symbols[position.symbol];
        if (!quote) {
            survivors.push(position);
            continue;
        }

        const pnl = positionPnl(position, quote.price);
        if (pnl <= -(position.margin * 0.99)) {
            events.push({
                type: "liquidated",
                positionId: position.id,
                symbol: position.symbol,
                side: position.side,
                marginLost: round(position.margin, 6),
                markPrice: quote.price,
                estimatedPnl: pnl
            });

            appendHistory(account, {
                type: "futures_liquidated",
                symbol: position.symbol,
                side: position.side,
                margin: round(position.margin, 6),
                markPrice: quote.price,
                pnl: pnl
            });
            continue;
        }

        survivors.push(position);
    }

    account.futuresPositions = survivors;
    return events;
}

function requireAmount(value, fieldName = "amount") {
    const amount = toNumber(value, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`${fieldName} 必須是正數`);
    }
    return round(amount, 6);
}

function requireSymbol(value, allowed) {
    const symbol = String(value || "").trim().toUpperCase();
    if (!allowed.has(symbol)) {
        throw new Error(`不支援的標的: ${symbol || "(空值)"}`);
    }
    return symbol;
}

export function buyStock(account, market, symbolInput, quantityInput) {
    const symbol = requireSymbol(symbolInput, TRADEABLE_STOCKS);
    const quantity = requireAmount(quantityInput, "quantity");
    const quote = market.symbols[symbol];
    const gross = round(quantity * quote.price, 6);
    const fee = round(gross * STOCK_FEE_RATE, 6);
    const total = round(gross + fee, 6);

    if (account.cash < total) {
        throw new Error("可用資金不足，無法買入股票");
    }

    account.cash = round(account.cash - total, 6);
    const currentHolding = account.stockHoldings[symbol] || { qty: 0, avgPrice: 0 };
    const prevQty = toNumber(currentHolding.qty, 0);
    const prevCost = round(prevQty * toNumber(currentHolding.avgPrice, 0), 6);
    const newQty = round(prevQty + quantity, 6);
    const newAvgPrice = newQty > 0 ? round((prevCost + total) / newQty, 6) : 0;
    account.stockHoldings[symbol] = {
        qty: newQty,
        avgPrice: newAvgPrice
    };

    appendHistory(account, {
        type: "stock_buy",
        symbol,
        quantity,
        price: quote.price,
        fee,
        total,
        avgPrice: newAvgPrice
    });

    return {
        symbol,
        quantity,
        price: quote.price,
        fee,
        total
    };
}

export function sellStock(account, market, symbolInput, quantityInput) {
    const symbol = requireSymbol(symbolInput, TRADEABLE_STOCKS);
    const quantity = requireAmount(quantityInput, "quantity");
    const holding = account.stockHoldings[symbol] || { qty: 0, avgPrice: 0 };
    const holdingQty = toNumber(holding.qty, 0);

    if (holdingQty < quantity) {
        throw new Error("持股數量不足，無法賣出");
    }

    const quote = market.symbols[symbol];
    const gross = round(quantity * quote.price, 6);
    const fee = round(gross * STOCK_FEE_RATE, 6);
    const net = round(gross - fee, 6);

    account.cash = round(account.cash + net, 6);
    const remainingQty = round(holdingQty - quantity, 6);
    if (remainingQty <= 0) {
        delete account.stockHoldings[symbol];
    } else {
        account.stockHoldings[symbol] = {
            qty: remainingQty,
            avgPrice: toNumber(holding.avgPrice, 0)
        };
    }

    appendHistory(account, {
        type: "stock_sell",
        symbol,
        quantity,
        price: quote.price,
        fee,
        net,
        avgPrice: holding.avgPrice
    });

    return {
        symbol,
        quantity,
        price: quote.price,
        fee,
        net
    };
}

export function openFutures(account, market, payload = {}) {
    const symbol = requireSymbol(payload.symbol, TRADEABLE_FUTURES);
    const side = payload.side === "short" ? "short" : "long";
    const margin = requireAmount(payload.margin, "margin");
    const leverage = clamp(Math.floor(requireAmount(payload.leverage, "leverage")), 1, MAX_LEVERAGE);
    const maxMargin = toPositiveNumber(payload.maxMargin, 0);

    if (margin < MIN_FUTURES_MARGIN) {
        throw new Error(`期貨保證金至少 ${MIN_FUTURES_MARGIN}`);
    }
    if (maxMargin > 0 && margin > maxMargin) {
        throw new Error(`目前會員等級期貨單筆上限為 ${round(maxMargin, 2).toLocaleString()} ZXC`);
    }
    if (account.cash < margin) {
        throw new Error("可用資金不足，無法開倉");
    }

    const quote = market.symbols[symbol];
    const notional = round(margin * leverage, 6);
    const quantity = round(notional / quote.price, 8);
    const fee = round(notional * FUTURES_FEE_RATE, 6);

    if (quantity <= 0) {
        throw new Error("開倉數量過小");
    }
    if (account.cash < margin + fee) {
        throw new Error("可用資金不足（含手續費）");
    }

    account.cash = round(account.cash - margin, 6);

    const openedAt = Date.now();
    const id = `fut_${openedAt}_${String(hashInt(`${symbol}:${openedAt}:${Math.random()}`)).slice(-6)}`;
    const position = {
        id,
        symbol,
        side,
        leverage,
        margin,
        quantity,
        notional,
        entryPrice: quote.price,
        liquidationPrice: liquidationPrice({ side, entryPrice: quote.price, leverage }),
        openedAt
    };

    account.futuresPositions.push(position);

    if (fee > 0) {
        account.cash = round(account.cash - fee, 6);
    }

    appendHistory(account, {
        type: "futures_open",
        id,
        symbol,
        side,
        leverage,
        margin,
        price: quote.price,
        fee
    });

    return {
        id,
        symbol,
        side,
        leverage,
        margin,
        entryPrice: quote.price,
        liquidationPrice: position.liquidationPrice,
        fee
    };
}

export function closeFutures(account, market, positionIdInput) {
    const positionId = String(positionIdInput || "").trim();
    if (!positionId) throw new Error("positionId 缺失");

    const index = account.futuresPositions.findIndex((item) => item.id === positionId);
    if (index < 0) throw new Error("找不到該期貨倉位");

    const position = account.futuresPositions[index];
    const quote = market.symbols[position.symbol];
    if (!quote) throw new Error("市場資料缺失，請重試");

    const pnl = positionPnl(position, quote.price);
    const realized = round(Math.max(-position.margin, pnl), 6);
    const refund = round(Math.max(0, position.margin + realized), 6);
    const fee = round(position.notional * FUTURES_FEE_RATE, 6);

    account.futuresPositions.splice(index, 1);
    account.cash = round(account.cash + refund - fee, 6);

    appendHistory(account, {
        type: "futures_close",
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        closePrice: quote.price,
        pnl: realized,
        fee
    });

    return {
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        closePrice: quote.price,
        realizedPnl: realized,
        refund,
        fee
    };
}

export function bankDeposit(account, amountInput) {
    const amount = requireAmount(amountInput, "amount");
    if (account.cash + MONEY_EPSILON < amount) throw new Error("可用資金不足，無法存款");

    account.cash = round(account.cash - amount, 6);
    account.bankBalance = round(account.bankBalance + amount, 6);

    appendHistory(account, {
        type: "bank_deposit",
        amount
    });

    return { amount };
}

export function bankWithdraw(account, amountInput) {
    const amount = requireAmount(amountInput, "amount");
    if (account.bankBalance + MONEY_EPSILON < amount) throw new Error("銀行存款不足");

    const withdrawAmount = round(Math.min(amount, account.bankBalance), 6);
    account.bankBalance = round(account.bankBalance - withdrawAmount, 6);
    account.cash = round(account.cash + withdrawAmount, 6);

    appendHistory(account, {
        type: "bank_withdraw",
        amount: withdrawAmount
    });

    return { amount: withdrawAmount };
}

export function borrowLoan(account, market, amountInput) {
    const amount = requireAmount(amountInput, "amount");
    const summaryBefore = buildAccountSummary(account, market);
    const maxBorrow = round(Math.max(0, summaryBefore.netWorth * 0.6 - account.loanPrincipal), 6);

    if (maxBorrow <= 0) {
        throw new Error("目前淨值不足，無法新增貸款");
    }
    if (amount > maxBorrow) {
        throw new Error(`可借上限為 ${maxBorrow.toFixed(2)}`);
    }

    account.loanPrincipal = round(account.loanPrincipal + amount, 6);
    account.cash = round(account.cash + amount, 6);

    appendHistory(account, {
        type: "loan_borrow",
        amount
    });

    return {
        amount,
        maxBorrow
    };
}

export function repayLoan(account, amountInput) {
    const amount = requireAmount(amountInput, "amount");
    const payAmount = round(Math.min(amount, account.cash + MONEY_EPSILON, account.loanPrincipal + MONEY_EPSILON), 6);

    if (payAmount <= 0) {
        throw new Error("目前沒有可還款金額");
    }

    account.cash = round(account.cash - payAmount, 6);
    account.loanPrincipal = round(account.loanPrincipal - payAmount, 6);

    appendHistory(account, {
        type: "loan_repay",
        amount: payAmount
    });

    return {
        amount: payAmount,
        remainingLoan: account.loanPrincipal
    };
}

export function buildAccountSummary(account, market) {
    const stockPositions = [];
    let stockValue = 0;

    for (const symbol of Object.keys(account.stockHoldings)) {
        const holding = account.stockHoldings[symbol] || { qty: 0, avgPrice: 0 };
        const qty = toNumber(holding.qty, 0);
        if (qty <= 0) continue;

        const quote = market.symbols[symbol];
        if (!quote) continue;

        const value = round(qty * quote.price, 6);
        stockValue += value;
        stockPositions.push({
            symbol,
            quantity: round(qty, 6),
            avgPrice: round(toNumber(holding.avgPrice, 0), 6),
            price: quote.price,
            marketValue: value
        });
    }

    const futuresPositions = [];
    let totalFuturesUnrealized = 0;
    let totalUsedMargin = 0;

    for (const position of account.futuresPositions) {
        const quote = market.symbols[position.symbol];
        if (!quote) continue;

        const unrealizedPnl = positionPnl(position, quote.price);
        totalFuturesUnrealized += unrealizedPnl;
        totalUsedMargin += position.margin;

        futuresPositions.push({
            ...position,
            markPrice: quote.price,
            unrealizedPnl: round(unrealizedPnl, 6),
            roiPct: position.margin > 0 ? round((unrealizedPnl / position.margin) * 100, 3) : 0
        });
    }

    const cash = round(account.cash, 6);
    const bankBalance = round(account.bankBalance, 6);
    const loanPrincipal = round(account.loanPrincipal, 6);

    const netWorth = round(cash + bankBalance + stockValue + totalFuturesUnrealized - loanPrincipal, 6);
    const maxBorrow = round(Math.max(0, netWorth * 0.6 - loanPrincipal), 6);

    return {
        cash,
        bankBalance,
        loanPrincipal,
        stockValue: round(stockValue, 6),
        futuresUnrealizedPnl: round(totalFuturesUnrealized, 6),
        usedFuturesMargin: round(totalUsedMargin, 6),
        netWorth,
        maxBorrow,
        bankInterestAccrued: round(account.bankInterestAccrued, 6),
        loanInterestAccrued: round(account.loanInterestAccrued, 6),
        stockPositions,
        futuresPositions,
        history: Array.isArray(account.history) ? account.history.slice(0, 20) : []
    };
}
