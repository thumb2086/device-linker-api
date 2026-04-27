import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Copy,
  Gift,
  History,
  QrCode,
  Repeat2,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useUserStore } from '../../store/useUserStore';
import AppBottomNav from '../../components/AppBottomNav';
import { useWallet } from './useWallet';
import { resolvePreferredBalance } from '../../utils/balance';

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
  const { t, i18n } = useTranslation();
  const { amountDisplay } = usePreferencesStore();
  const { balance: syncedBalance, address: userAddress } = useUserStore();
  const { summary, airdrop, transfer, convert } = useWallet();
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferToken, setTransferToken] = useState<'zhixi' | 'yjc'>('zhixi');
  const [convertAmount, setConvertAmount] = useState('');
  const [copied, setCopied] = useState(false);

  const myAddress = userAddress || '';
  const qrSrc = myAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(myAddress)}`
    : '';

  const handleCopyAddress = async () => {
    if (!myAddress) return;
    try {
      await navigator.clipboard.writeText(myAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore — clipboard API may be blocked in some environments */
    }
  };

  const isZh = i18n.language.startsWith('zh');
  const numberMode = amountDisplay === 'full' ? 'full' : 'short';
  const walletSummary = summary.data?.summary;
  const assets = summary.data?.assets;
  const onchain = summary.data?.onchain;
  const canClaimAirdrop = summary.data?.canClaimAirdrop ?? true;
  const nextAirdropAt = summary.data?.nextAirdropAt;
  const zxcBalance = resolvePreferredBalance({
    onchainBalance: onchain?.zxc?.balance,
    onchainAvailable: onchain?.zxc?.available,
    walletBalance: walletSummary?.balances?.ZXC,
    fallbackBalance: syncedBalance,
  });
  const yjcBalance = resolvePreferredBalance({
    onchainBalance: onchain?.yjc?.balance,
    onchainAvailable: onchain?.yjc?.available,
    walletBalance: walletSummary?.balances?.YJC,
  });
  const marketNetWorth = assets?.market?.overlayNetWorth || assets?.market?.netWorth || '0';
  const walletOnlyTotal = (Number(zxcBalance || 0) + Number(yjcBalance || 0)).toFixed(4);
  const totalBalance = (Number(walletOnlyTotal) + Number(marketNetWorth || 0)).toFixed(4);

  const zh = {
    wallet: '\u9322\u5305',
    market: '\u5e02\u5834',
    zxc: '\u5b50\u7199\u5e63',
    yjc: '\u4f51\u6229\u5e63',
    dailyAirdrop: '\u6bcf\u65e5\u7a7a\u6295',
    nextAvailable: '\u4e0b\u6b21\u53ef\u9818\u6642\u9593\uff1a',
    airdropNow: '\u53ef\u7acb\u5373\u9818\u53d6',
    claiming: '\u9818\u53d6\u4e2d',
    claimAirdrop: '\u9818\u53d6\u7a7a\u6295',
    transfer: '\u8f49\u5e33',
    recipient: '\u6536\u6b3e\u5730\u5740',
    amount: '\u6578\u91cf',
    sending: '\u8f49\u5e33\u4e2d',
    sendTransfer: '\u9001\u51fa\u8f49\u5e33',
    convert: 'ZXC \u514c\u63db YJC',
    convertAmount: '\u8f38\u5165 ZXC \u6578\u91cf',
    converting: '\u514c\u63db\u4e2d',
    startConvert: '\u958b\u59cb\u514c\u63db',
    zxcOnchain: 'ZXC \u93c8\u4e0a\u9918\u984d',
    yjcOnchain: 'YJC \u93c8\u4e0a\u9918\u984d',
    adminSigner: '\u7ba1\u7406\u54e1\u7c3d\u7f72\u5730\u5740',
    notConfigured: '\u672a\u8a2d\u5b9a',
    loading: '\u8f09\u5165\u4e2d...',
    noTransactions: '\u76ee\u524d\u6c92\u6709\u4ea4\u6613\u7d00\u9304',
  };

  const nextAirdropLabel = useMemo(() => {
    if (!nextAirdropAt || canClaimAirdrop) return isZh ? zh.airdropNow : 'Available now';
    return new Date(nextAirdropAt).toLocaleString('zh-TW');
  }, [canClaimAirdrop, nextAirdropAt, isZh]);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-40 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="app-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <WalletIcon className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('vault.title')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/app/swap" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#fcc025]">
              Swap
            </Link>
            <Link to="/app/transactions" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
              Public Feed
            </Link>
          </div>
        </div>
      </header>

      <main className="app-shell flex flex-col gap-6 pt-24">
        <section className="rounded-[2rem] border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] p-8 shadow-[0_0_50px_rgba(252,192,37,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#adaaaa]">{t('vault.total_assets')}</p>
          <p className="mt-4 text-5xl font-black italic tracking-tighter text-[#fcc025]">
            {formatNumber(totalBalance, numberMode)}
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#adaaaa]">
            <span>{isZh ? zh.wallet : 'Wallet'} {formatNumber(walletOnlyTotal, numberMode)}</span>
            <span>{isZh ? zh.market : 'Market'} {formatNumber(marketNetWorth, numberMode)}</span>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <AssetCard label={isZh ? zh.zxc : 'ZiXi Coin'} value={formatNumber(zxcBalance, numberMode)} token="ZXC" />
            <AssetCard label={isZh ? zh.yjc : 'YouJian Coin'} value={formatNumber(yjcBalance, numberMode)} token="YJC" />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <Gift className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">{isZh ? zh.dailyAirdrop : 'Daily Airdrop'}</h2>
              </div>
              <p className="mt-3 text-sm font-bold text-[#adaaaa]">
                {isZh ? zh.nextAvailable : 'Next available: '}{nextAirdropLabel}
              </p>
              <button
                type="button"
                disabled={!canClaimAirdrop || airdrop.isPending}
                onClick={() => airdrop.mutate()}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#fcc025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownCircle size={16} />
                {airdrop.isPending ? (isZh ? zh.claiming : 'Claiming') : (isZh ? zh.claimAirdrop : 'Claim Airdrop')}
              </button>
            </div>

            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <Repeat2 className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">{isZh ? zh.transfer : 'Transfer'}</h2>
              </div>
              <div className="mt-4 grid gap-3">
                <input
                  value={transferTo}
                  onChange={(event) => setTransferTo(event.target.value)}
                  placeholder={isZh ? zh.recipient : 'Recipient address'}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none focus:border-[#fcc025]/40"
                />
                <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                  <input
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    placeholder={isZh ? zh.amount : 'Amount'}
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
                  {transfer.isPending ? (isZh ? zh.sending : 'Sending') : (isZh ? zh.sendTransfer : 'Send Transfer')}
                </button>
              </div>
            </div>

            {myAddress && (
              <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
                <div className="flex items-center gap-3">
                  <QrCode className="text-[#fcc025]" size={18} />
                  <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                    {isZh ? '匯入資金（他人匯入你的雲端錢包）' : 'Receive funds'}
                  </h2>
                </div>
                <div className="mt-4 flex flex-col items-stretch gap-4 md:flex-row md:items-center">
                  <div className="rounded-xl bg-white p-3 self-start">
                    <img src={qrSrc} alt="wallet address QR" width={160} height={160} />
                  </div>
                  <div className="flex flex-1 flex-col gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
                      {isZh ? '收款地址' : 'Receive address'}
                    </p>
                    <p className="break-all rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold text-white">
                      {myAddress}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#fcc025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black"
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied
                        ? (isZh ? '已複製' : 'Copied')
                        : (isZh ? '複製錢包地址' : 'Copy address')}
                    </button>
                    <p className="text-[11px] text-[#adaaaa]">
                      {isZh
                        ? '把上面地址或 QR 給對方，對方轉帳後你的餘額會自動刷新。'
                        : 'Share this address or QR with the sender. Your balance refreshes automatically.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <Repeat2 className="text-[#fcc025]" size={18} />
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                  {isZh ? zh.convert : 'Convert ZXC to YJC'}
                </h2>
              </div>
              <p className="mt-3 text-sm font-bold text-[#adaaaa]">100,000,000 ZXC = 1 YJC</p>
              <div className="mt-4 grid gap-3">
                <input
                  value={convertAmount}
                  onChange={(event) => setConvertAmount(event.target.value)}
                  placeholder={isZh ? zh.convertAmount : 'ZXC amount'}
                  className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none focus:border-[#fcc025]/40"
                />
                <button
                  type="button"
                  disabled={!convertAmount || convert.isPending}
                  onClick={() => convert.mutate({ zxcAmount: convertAmount })}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#fcc025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Repeat2 size={16} />
                  {convert.isPending ? (isZh ? zh.converting : 'Converting') : (isZh ? zh.startConvert : 'Convert')}
                </button>
                <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4 text-xs font-bold text-[#adaaaa]">
                  <div>{isZh ? zh.zxcOnchain : 'ZXC on-chain'}: {formatNumber(zxcBalance, numberMode)}</div>
                  <div className="mt-1">{isZh ? zh.yjcOnchain : 'YJC on-chain'}: {formatNumber(yjcBalance, numberMode)}</div>
                  <div className="mt-1">{isZh ? zh.adminSigner : 'Admin signer'}: {onchain?.adminAddress || (isZh ? zh.notConfigured : 'not configured')}</div>
                </div>
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <History size={16} className="text-[#adaaaa]" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">{t('vault.transactions')}</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.isLoading && <div className="text-sm text-[#adaaaa]">{isZh ? zh.loading : 'Loading...'}</div>}
              {!summary.isLoading && walletSummary?.recentTransactions?.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">
                  {isZh ? zh.noTransactions : 'No transactions yet'}
                </div>
              )}
              {walletSummary?.recentTransactions?.map((tx: any) => {
                const positive = tx.type === 'airdrop' || tx.type === 'transfer_in';
                return (
                  <div key={tx.id} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-white">{tx.type.replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#adaaaa]">
                          {new Date(tx.createdAt).toLocaleString('zh-TW')}
                        </p>
                        {tx.counterparty && <p className="mt-1 text-[10px] font-bold text-[#adaaaa]">{tx.counterparty}</p>}
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-black italic tracking-tight ${positive ? 'text-emerald-400' : 'text-[#ff7351]'}`}>
                          {positive ? '+' : '-'}
                          {formatNumber(tx.amount, numberMode)} {tx.token}
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

      <AppBottomNav current="wallet" />
    </div>
  );
}
