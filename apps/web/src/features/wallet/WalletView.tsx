import { Link } from 'react-router-dom';
import React, { useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  History,
  LayoutGrid,
  Repeat2,
  Settings as SettingsIcon,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useWallet } from './useWallet';

function AssetCard({
  label,
  value,
  token,
}: {
  label: string;
  value: string;
  token: string;
}) {
  return (
    <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-5 shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">{label}</p>
      <div className="mt-3 flex items-end justify-between">
        <p className="text-3xl font-black italic tracking-tight text-[#fcc025]">{value}</p>
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">{token}</span>
      </div>
    </div>
  );
}

export default function WalletView() {
  const { t } = useTranslation();
  const { amountDisplay } = usePreferencesStore();
  const { summary, airdrop, transfer } = useWallet();
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferToken, setTransferToken] = useState<'zhixi' | 'yjc'>('zhixi');

  const numberMode = amountDisplay === 'full' ? 'full' : 'short';
  const walletSummary = summary.data?.summary;
  const canClaimAirdrop = summary.data?.canClaimAirdrop ?? true;
  const nextAirdropAt = summary.data?.nextAirdropAt;
  const zxcBalance = walletSummary?.balances?.ZXC || '0';
  const yjcBalance = walletSummary?.balances?.YJC || '0';

  const nextAirdropLabel = useMemo(() => {
    if (!nextAirdropAt || canClaimAirdrop) return '可立即領取';
    return new Date(nextAirdropAt).toLocaleString('zh-TW');
  }, [canClaimAirdrop, nextAirdropAt]);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <WalletIcon className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('vault.title')}</h1>
          </div>
          <Link to="/app/transactions" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
            Public Feed
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 pt-24">
        <section className="rounded-[2rem] border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] p-8 shadow-[0_0_50px_rgba(252,192,37,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#adaaaa]">{t('vault.total_assets')}</p>
          <p className="mt-4 text-5xl font-black italic tracking-tighter text-[#fcc025]">
            {formatNumber(walletSummary?.totalBalance || 0, numberMode)}
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <AssetCard label="子熙幣" value={formatNumber(zxcBalance, numberMode)} token="ZXC" />
            <AssetCard label="佑戩幣" value={formatNumber(yjcBalance, numberMode)} token="YJC" />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <Gift className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Daily Airdrop</h2>
              </div>
              <p className="mt-3 text-sm font-bold text-[#adaaaa]">下一次可領取時間：{nextAirdropLabel}</p>
              <button
                type="button"
                disabled={!canClaimAirdrop || airdrop.isPending}
                onClick={() => airdrop.mutate()}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#fcc025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownCircle size={16} />
                {airdrop.isPending ? '處理中' : '領取空投'}
              </button>
            </div>

            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <Repeat2 className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Transfer</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <input
                  value={transferTo}
                  onChange={(event) => setTransferTo(event.target.value)}
                  placeholder="接收地址"
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none focus:border-[#fcc025]/40"
                />
                <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                  <input
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    placeholder="金額"
                    className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none focus:border-[#fcc025]/40"
                  />
                  <select
                    value={transferToken}
                    onChange={(event) => setTransferToken(event.target.value as 'zhixi' | 'yjc')}
                    className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none"
                  >
                    <option value="zhixi">ZXC</option>
                    <option value="yjc">YJC</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={!transferTo || !transferAmount || transfer.isPending}
                  onClick={() => transfer.mutate({ to: transferTo, amount: transferAmount, token: transferToken })}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowUpCircle size={16} />
                  {transfer.isPending ? '送出中' : '送出轉帳'}
                </button>
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <History size={16} className="text-[#adaaaa]" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">{t('vault.transactions')}</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.isLoading && <div className="text-sm text-[#adaaaa]">載入中...</div>}
              {!summary.isLoading && walletSummary?.recentTransactions?.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">尚無交易紀錄</div>
              )}
              {walletSummary?.recentTransactions?.map((tx) => {
                const positive = tx.type === 'airdrop' || tx.type === 'transfer_in';
                return (
                  <div key={tx.id} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-white">{tx.type.replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#adaaaa]">
                          {new Date(tx.createdAt).toLocaleString('zh-TW')}
                        </p>
                        {tx.counterparty && (
                          <p className="mt-1 text-[10px] font-bold text-[#adaaaa]">{tx.counterparty}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-black italic tracking-tight ${positive ? 'text-emerald-400' : 'text-[#ff7351]'}`}>
                          {positive ? '+' : '-'}{formatNumber(tx.amount, numberMode)} {tx.token}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#adaaaa]">{tx.status}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 h-20 w-full border-t border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-around px-4">
          <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <LayoutGrid size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.casino')}</span>
          </Link>
          <Link to="/app/market" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <TrendingUp size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.market')}</span>
          </Link>
          <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
            <WalletIcon size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.vault')}</span>
          </Link>
          <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <SettingsIcon size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.settings')}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
