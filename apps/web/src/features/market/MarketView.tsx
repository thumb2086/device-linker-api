import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  CircleDollarSign,
  LineChart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import AppBottomNav from '../../components/AppBottomNav';
import { useMarket } from './useMarket';

type Quote = {
  symbol: string;
  name: string;
  price: number;
  type: string;
  sector: string;
  changePct: number;
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const path = useMemo(() => {
    if (!values.length) return '';
    const width = 180;
    const height = 56;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * width;
        const y = height - ((value - min) / range) * (height - 8) - 4;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [values]);

  if (!path) return null;

  return (
    <svg viewBox="0 0 180 56" className="h-14 w-full overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export default function MarketView() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const { amountDisplay } = usePreferencesStore();
  const { snapshot, account, execute } = useMarket();
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [tradeQuantity, setTradeQuantity] = useState('1');
  const [cashMoveAmount, setCashMoveAmount] = useState('1000');

  const zh = {
    publicFeed: '\u516c\u958b\u52d5\u614b',
    marketPulse: '\u5e02\u5834\u8108\u52d5',
    marketIndex: '\u5e02\u5834\u6307\u6578',
    trend: '\u8d70\u52e2',
    fearGreed: '\u6062\u61fc\u6307\u6578',
    account: '\u5e33\u6236',
    netWorth: '\u6de8\u503c',
    cash: '\u73fe\u91d1',
    bank: '\u9280\u884c',
    symbols: '\u6a19\u7684\u5217\u8868',
    executionPanel: '\u57f7\u884c\u9762\u677f',
    quantityPlaceholder: '\u4ea4\u6613\u6578\u91cf',
    buy: '\u8cb7\u5165',
    sell: '\u8ce3\u51fa',
    cashMovePlaceholder: '\u8f38\u5165\u91d1\u984d',
    bankDeposit: '\u5b58\u5165\u9280\u884c',
    bankWithdraw: '\u63d0\u9818\u9280\u884c',
    noPositions: '\u5c1a\u7121\u6301\u5009\u7d00\u9304',
    recentActivity: '\u6700\u65b0\u64cd\u4f5c',
    noActivity: '\u5c1a\u7121\u5e02\u5834\u64cd\u4f5c\u7d00\u9304',
    units: '\u80a1',
    quantity: '\u6578\u91cf',
    type: '\u985e\u578b',
    sector: '\u677f\u584a',
  };

  const numberMode = amountDisplay === 'full' ? 'full' : 'short';
  const marketSnapshot = snapshot.data;
  const summary = account.data;
  const symbols = useMemo(() => Object.values(marketSnapshot?.symbols || {}) as Quote[], [marketSnapshot]);
  const stockSymbols = useMemo(() => symbols.filter((quote) => quote.type === 'stock'), [symbols]);
  const selectedQuote = marketSnapshot?.symbols?.[selectedSymbol] as Quote | undefined;
  const historyBySymbol = marketSnapshot?.history || {};

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('market.title')}</h1>
          </div>
          <Link to="/app/transactions" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
            {isZh ? zh.publicFeed : 'Public Feed'}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-24">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl lg:col-span-2">
            <div className="flex items-center gap-3">
              <CircleDollarSign className="text-[#fcc025]" size={18} />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                {isZh ? zh.marketPulse : 'Market Pulse'}
              </h2>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">
                  {isZh ? zh.marketIndex : 'Market Index'}
                </p>
                <p className="mt-2 text-3xl font-black italic tracking-tight text-[#fcc025]">
                  {formatNumber(marketSnapshot?.marketIndex || 0, numberMode)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">
                  {isZh ? zh.trend : 'Trend'}
                </p>
                <p
                  className={`mt-2 text-2xl font-black italic tracking-tight ${
                    (marketSnapshot?.marketTrendPct || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff7351]'
                  }`}
                >
                  {(marketSnapshot?.marketTrendPct || 0) >= 0 ? '+' : ''}
                  {(marketSnapshot?.marketTrendPct || 0).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">
                  {isZh ? zh.fearGreed : 'Fear & Greed'}
                </p>
                <p className="mt-2 text-2xl font-black italic tracking-tight text-white">
                  {marketSnapshot?.fearGreedIndex ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <Wallet className="text-[#fcc025]" size={18} />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                {isZh ? zh.account : 'Account'}
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
                  {isZh ? zh.netWorth : 'Net Worth'}
                </p>
                <p className="mt-1 text-2xl font-black italic tracking-tight text-[#fcc025]">
                  {formatNumber(summary?.netWorth || 0, numberMode)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
                    {isZh ? zh.cash : 'Cash'}
                  </p>
                  <p className="mt-1 text-lg font-black text-white">{formatNumber(summary?.cash || 0, numberMode)}</p>
                </div>
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
                    {isZh ? zh.bank : 'Bank'}
                  </p>
                  <p className="mt-1 text-lg font-black text-white">{formatNumber(summary?.bankBalance || 0, numberMode)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <BarChart3 className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                  {isZh ? zh.symbols : 'Symbols'}
                </h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {stockSymbols.map((quote) => (
                  <button
                    key={quote.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(quote.symbol)}
                    className={`rounded-[1.6rem] border p-5 text-left transition-all ${
                      selectedSymbol === quote.symbol
                        ? 'border-[#fcc025]/55 bg-[#121212] shadow-[0_0_24px_rgba(252,192,37,0.08)]'
                        : 'border-[#494847]/10 bg-[#141414] hover:border-[#fcc025]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white">{quote.symbol}</p>
                        <p className="mt-1 text-[13px] text-[#aeb7c9]">{quote.name}</p>
                      </div>
                      {(quote.changePct || 0) >= 0 ? (
                        <TrendingUp className="text-emerald-400" size={16} />
                      ) : (
                        <TrendingDown className="text-[#ff7351]" size={16} />
                      )}
                    </div>
                    <p className="mt-5 text-[2rem] font-black italic leading-none tracking-tight text-[#fcc025]">
                      {Number(quote.price || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 3,
                        maximumFractionDigits: 3,
                      })}
                    </p>
                    <p
                      className={`mt-2 text-[14px] font-black tracking-tight ${
                        (quote.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff7351]'
                      }`}
                    >
                      {(quote.changePct || 0) >= 0 ? '+' : ''}
                      {quote.changePct.toFixed(2)}%
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#232323] px-3 py-1 text-[10px] font-bold text-[#aeb7c9]">
                        {isZh ? zh.type : 'Type'} <span className="ml-1 text-white">{quote.type}</span>
                      </span>
                      <span className="rounded-full bg-[#232323] px-3 py-1 text-[10px] font-bold text-[#aeb7c9]">
                        {isZh ? zh.sector : 'Sector'} <span className="ml-1 text-white">{quote.sector}</span>
                      </span>
                    </div>
                    <div className="mt-5 overflow-hidden rounded-xl border border-[#494847]/10 bg-[#101010] px-3 py-2">
                      <Sparkline
                        values={(historyBySymbol[quote.symbol] || []) as number[]}
                        color={(quote.changePct || 0) >= 0 ? '#00f59b' : '#ff6d6d'}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <LineChart className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                  {isZh ? zh.executionPanel : 'Execution Panel'}
                </h2>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                <select
                  value={selectedSymbol}
                  onChange={(event) => setSelectedSymbol(event.target.value)}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                >
                  {stockSymbols.map((quote) => (
                    <option key={quote.symbol} value={quote.symbol}>
                      {quote.symbol}
                    </option>
                  ))}
                </select>
                <input
                  value={tradeQuantity}
                  onChange={(event) => setTradeQuantity(event.target.value)}
                  placeholder={isZh ? zh.quantityPlaceholder : 'Trade quantity'}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'stock_buy', symbol: selectedSymbol, quantity: tradeQuantity })}
                  className="rounded-2xl bg-[#fcc025] px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-black disabled:opacity-50"
                >
                  {isZh ? zh.buy : 'Buy'} {selectedQuote?.symbol || selectedSymbol}
                </button>
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'stock_sell', symbol: selectedSymbol, quantity: tradeQuantity })}
                  className="rounded-2xl bg-[#ff7351] px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-white disabled:opacity-50"
                >
                  {isZh ? zh.sell : 'Sell'} {selectedQuote?.symbol || selectedSymbol}
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
                <input
                  value={cashMoveAmount}
                  onChange={(event) => setCashMoveAmount(event.target.value)}
                  placeholder={isZh ? zh.cashMovePlaceholder : 'Amount'}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                />
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'bank_deposit', amount: cashMoveAmount })}
                  className="rounded-2xl border border-[#494847]/20 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black disabled:opacity-50"
                >
                  {isZh ? zh.bankDeposit : 'Deposit to Bank'}
                </button>
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'bank_withdraw', amount: cashMoveAmount })}
                  className="rounded-2xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white disabled:opacity-50"
                >
                  {isZh ? zh.bankWithdraw : 'Withdraw from Bank'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">{t('market.portfolio')}</h2>
              <div className="mt-4 space-y-3">
                {summary?.stockPositions?.length ? (
                  summary.stockPositions.map((position: any) => (
                    <div key={position.symbol} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white">{position.symbol}</p>
                          <p className="text-[10px] font-bold text-[#adaaaa]">
                            {isZh ? zh.quantity : 'Qty'} {position.quantity} {isZh ? zh.units : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-black text-[#fcc025]">{formatNumber(position.marketValue, numberMode)}</p>
                          <p
                            className={`text-[10px] font-black ${
                              (position.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff7351]'
                            }`}
                          >
                            {(position.unrealizedPnl || 0) >= 0 ? '+' : ''}
                            {formatNumber(position.unrealizedPnl || 0, numberMode)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">
                    {isZh ? zh.noPositions : 'No open positions'}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                {isZh ? zh.recentActivity : 'Recent Activity'}
              </h2>
              <div className="mt-4 space-y-3">
                {summary?.history?.length ? (
                  summary.history.map((entry: any, index: number) => (
                    <div key={`${entry.at}-${index}`} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white">{entry.summary || entry.type}</p>
                      <p className="mt-1 text-[10px] font-bold text-[#adaaaa]">{new Date(entry.at).toLocaleString('zh-TW')}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">
                    {isZh ? zh.noActivity : 'No market activity yet'}
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      <AppBottomNav current="market" />
    </div>
  );
}
