import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  CircleDollarSign,
  LayoutGrid,
  LineChart,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useMarket } from './useMarket';

export default function MarketView() {
  const { t } = useTranslation();
  const { amountDisplay } = usePreferencesStore();
  const { snapshot, account, execute } = useMarket();
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [tradeQuantity, setTradeQuantity] = useState('1');
  const [cashMoveAmount, setCashMoveAmount] = useState('1000');

  const numberMode = amountDisplay === 'full' ? 'full' : 'short';
  const marketSnapshot = snapshot.data;
  const summary = account.data;
  const symbols = useMemo(() => Object.values(marketSnapshot?.symbols || {}), [marketSnapshot]);
  const stockSymbols = useMemo(() => symbols.filter((quote: any) => quote.type === 'stock'), [symbols]);
  const selectedQuote = marketSnapshot?.symbols?.[selectedSymbol];

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('market.title')}</h1>
          </div>
          <Link to="/app/transactions" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
            Public Feed
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-24">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl lg:col-span-2">
            <div className="flex items-center gap-3">
              <CircleDollarSign className="text-[#fcc025]" size={18} />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Market Pulse</h2>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">Market Index</p>
                <p className="mt-2 text-3xl font-black italic tracking-tight text-[#fcc025]">
                  {formatNumber(marketSnapshot?.marketIndex || 0, numberMode)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">Trend</p>
                <p className={`mt-2 text-2xl font-black italic tracking-tight ${(marketSnapshot?.marketTrendPct || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff7351]'}`}>
                  {(marketSnapshot?.marketTrendPct || 0) >= 0 ? '+' : ''}{(marketSnapshot?.marketTrendPct || 0).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">Fear & Greed</p>
                <p className="mt-2 text-2xl font-black italic tracking-tight text-white">{marketSnapshot?.fearGreedIndex ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <Wallet className="text-[#fcc025]" size={18} />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Account</h2>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">Net Worth</p>
                <p className="mt-1 text-2xl font-black italic tracking-tight text-[#fcc025]">
                  {formatNumber(summary?.netWorth || 0, numberMode)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">Cash</p>
                  <p className="mt-1 text-lg font-black text-white">{formatNumber(summary?.cash || 0, numberMode)}</p>
                </div>
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">Bank</p>
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
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Symbols</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {stockSymbols.slice(0, 10).map((quote: any) => (
                  <button
                    key={quote.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(quote.symbol)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      selectedSymbol === quote.symbol
                        ? 'border-[#fcc025]/40 bg-[#0e0e0e]'
                        : 'border-[#494847]/10 bg-[#141414] hover:border-[#fcc025]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white">{quote.symbol}</p>
                        <p className="text-[10px] font-bold text-[#adaaaa]">{quote.name}</p>
                      </div>
                      {(quote.changePct || 0) >= 0 ? <TrendingUp className="text-emerald-400" size={16} /> : <TrendingDown className="text-[#ff7351]" size={16} />}
                    </div>
                    <p className="mt-3 text-xl font-black italic tracking-tight text-[#fcc025]">
                      {formatNumber(quote.price, numberMode)}
                    </p>
                    <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${(quote.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff7351]'}`}>
                      {(quote.changePct || 0) >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <LineChart className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Execution Panel</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                <select
                  value={selectedSymbol}
                  onChange={(event) => setSelectedSymbol(event.target.value)}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                >
                  {stockSymbols.map((quote: any) => (
                    <option key={quote.symbol} value={quote.symbol}>
                      {quote.symbol}
                    </option>
                  ))}
                </select>
                <input
                  value={tradeQuantity}
                  onChange={(event) => setTradeQuantity(event.target.value)}
                  placeholder="數量"
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
                  買入 {selectedQuote?.symbol || selectedSymbol}
                </button>
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'stock_sell', symbol: selectedSymbol, quantity: tradeQuantity })}
                  className="rounded-2xl bg-[#ff7351] px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-white disabled:opacity-50"
                >
                  賣出 {selectedQuote?.symbol || selectedSymbol}
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
                <input
                  value={cashMoveAmount}
                  onChange={(event) => setCashMoveAmount(event.target.value)}
                  placeholder="銀行金額"
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                />
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'bank_deposit', amount: cashMoveAmount })}
                  className="rounded-2xl border border-[#494847]/20 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black disabled:opacity-50"
                >
                  存入銀行
                </button>
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => execute.mutate({ type: 'bank_withdraw', amount: cashMoveAmount })}
                  className="rounded-2xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white disabled:opacity-50"
                >
                  提領銀行
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">{t('market.portfolio')}</h2>
              <div className="mt-4 space-y-3">
                {summary?.stockPositions?.length ? summary.stockPositions.map((position: any) => (
                  <div key={position.symbol} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white">{position.symbol}</p>
                        <p className="text-[10px] font-bold text-[#adaaaa]">Qty {position.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-black text-[#fcc025]">{formatNumber(position.marketValue, numberMode)}</p>
                        <p className={`text-[10px] font-black ${(position.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-[#ff7351]'}`}>
                          {(position.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatNumber(position.unrealizedPnl || 0, numberMode)}
                        </p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">目前沒有持倉</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Recent Activity</h2>
              <div className="mt-4 space-y-3">
                {summary?.history?.length ? summary.history.map((entry: any, index: number) => (
                  <div key={`${entry.at}-${index}`} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-white">{entry.summary || entry.type}</p>
                    <p className="mt-1 text-[10px] font-bold text-[#adaaaa]">{new Date(entry.at).toLocaleString('zh-TW')}</p>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">尚無市場操作紀錄</div>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 h-20 w-full border-t border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-around px-4">
          <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <LayoutGrid size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.casino')}</span>
          </Link>
          <Link to="/app/market" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
            <TrendingUp size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.market')}</span>
          </Link>
          <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <Wallet size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.vault')}</span>
          </Link>
          <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <Settings size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.settings')}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
