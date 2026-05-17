import { useMemo, useState, useEffect } from 'react';
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


type MarketActionParams =
  | { type: 'stock_buy' | 'stock_sell'; symbol: string; quantity: string }
  | { type: 'bank_deposit' | 'bank_withdraw'; amount: string };

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [tradeQuantity, setTradeQuantity] = useState('1');
  const [cashMoveAmount, setCashMoveAmount] = useState('1000');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (actionNotice) { const t = setTimeout(() => setActionNotice(null), 3000); return () => clearTimeout(t); }
  }, [actionNotice]);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('market.title')}</h1>
          </div>
          <Link to="/app/transactions" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
            {t('market.public_feed')}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-24">
        {actionNotice && (
          <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-[#1a1919] border shadow-lg shadow-black/50 text-sm font-bold animate-[fadeIn_0.3s_ease-out] whitespace-nowrap ${
            actionNotice.type === 'success'
              ? 'border-emerald-400/40 text-emerald-300'
              : 'border-red-400/40 text-red-400'
          }`}>
            {actionNotice.type === 'success' ? '✅ ' : '❌ '}{actionNotice.message}
          </div>
        )}
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl lg:col-span-2">
            <div className="flex items-center gap-3">
              <CircleDollarSign className="text-[#fcc025]" size={18} />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                {t('market.market_pulse')}
              </h2>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">
                  {t('market.market_index')}
                </p>
                <p className="mt-2 text-3xl font-black italic tracking-tight text-[#fcc025]">
                  {formatNumber(marketSnapshot?.marketIndex || 0, numberMode)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adaaaa]">
                  {t('market.trend')}
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
                  {t('market.fear_greed')}
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
                {t('market.account')}
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
                  {t('market.net_worth')}
                </p>
                <p className="mt-1 text-2xl font-black italic tracking-tight text-[#fcc025]">
                  {formatNumber(summary?.netWorth || 0, numberMode)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
                    {t('market.cash')}
                  </p>
                  <p className="mt-1 text-lg font-black text-white">{formatNumber(summary?.cash || 0, numberMode)}</p>
                </div>
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#adaaaa]">
                    {t('market.bank')}
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
                <LineChart className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                  {t('market.execution_panel')}
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
                  placeholder={t('market.quantity_placeholder')}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => runAction({ type: 'stock_buy', symbol: selectedSymbol, quantity: tradeQuantity }, t('market.buy_success'))}
                  className="rounded-2xl bg-[#fcc025] px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-black disabled:opacity-50"
                >
                  {t('market.buy')} {selectedQuote?.symbol || selectedSymbol}
                </button>
                <button
                  type="button"
                  disabled={execute.isPending}
                  onClick={() => runAction({ type: 'stock_sell', symbol: selectedSymbol, quantity: tradeQuantity }, t('market.sell_success'))}
                  className="rounded-2xl bg-[#ff7351] px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-white disabled:opacity-50"
                >
                  {t('market.sell')} {selectedQuote?.symbol || selectedSymbol}
                </button>
              </div>

              <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                銀行存款 / 提款已移至主控台
              </div>
            </div>

            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <BarChart3 className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                  {t('market.symbols')}
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
                        {t('market.type')} <span className="ml-1 text-white">{quote.type}</span>
                      </span>
                      <span className="rounded-full bg-[#232323] px-3 py-1 text-[10px] font-bold text-[#aeb7c9]">
                        {t('market.sector')} <span className="ml-1 text-white">{quote.sector}</span>
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
                            {t('market.quantity')} {position.quantity} {t('market.units')}
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
                    {t('market.no_positions')}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                {t('market.recent_activity')}
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
                    {t('market.no_activity')}
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
