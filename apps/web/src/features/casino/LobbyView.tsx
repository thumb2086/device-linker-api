import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell,
  History,
  LayoutGrid,
  Megaphone,
  Settings as SettingsIcon,
  ShieldCheck,
  Trophy,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useUserStore } from '../../store/useUserStore';
import AppBottomNav from '../../components/AppBottomNav';
import { useWallet } from '../wallet/useWallet';
import { resolvePreferredBalance } from '../../utils/balance';

function GlassCard({
  to,
  icon: Icon,
  title,
  value,
  subtitle,
  border = false,
  children,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value?: string;
  subtitle?: string;
  border?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`rounded-xl bg-[#1a1919] p-6 transition-all hover:bg-[#262626] active:scale-95 ${
        border ? 'border-l-4 border-l-[#fcc025]/40' : 'border border-[#494847]/10'
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#494847]/20 bg-[#262626] transition-colors">
          <Icon className="h-6 w-6 text-[#fcc025]" />
        </div>
        {subtitle && <span className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">{subtitle}</span>}
      </div>
      <h4 className="mb-2 text-lg font-bold uppercase tracking-tight text-white">{title}</h4>
      {value && <div className="mb-1 text-2xl font-bold uppercase italic tracking-tighter text-white">{value}</div>}
      {children}
    </Link>
  );
}

export default function LobbyView() {
  const { username, address, balance } = useUserStore();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const { summary } = useWallet();
  const liveBalance = resolvePreferredBalance({
    onchainBalance: summary.data?.onchain?.zxc?.balance,
    onchainAvailable: summary.data?.onchain?.zxc?.available,
    walletBalance: summary.data?.summary?.balances?.ZXC,
    fallbackBalance: balance,
  });

  const zh = {
    title: '\u5b50\u7199\u6a21\u64ec\u5668',
    operatorIdentified: '\u64cd\u4f5c\u54e1\u5df2\u8b58\u5225',
    anonymous: '\u533f\u540d\u64cd\u4f5c\u54e1',
    encryptionActive: '\u52a0\u5bc6\u5df2\u555f\u7528\uff1aAES-256',
    totalAssets: '\u7e3d\u8cc7\u7522',
    casinoFloor: '\u5a1b\u6a02\u5927\u5ef3',
    activeSimulation: '\u6d3b\u8e8d\u6a21\u64ec',
    marketTerminal: '\u5e02\u5834\u7d42\u7aef',
    liveFeed: '\u5373\u6642\u8d70\u52e2',
    announcements: '\u516c\u544a\u4e2d\u5fc3',
    newAlerts: '3 \u5247\u65b0\u901a\u77e5',
    rankings: '\u6392\u884c\u699c',
    globalSector: '\u5168\u57df\u6392\u540d',
    wallet: '\u9322\u5305',
    secured: '\u5df2\u4fdd\u8b77',
    activity: '\u6700\u65b0\u52d5\u614b',
    recentTraces: '\u6700\u65b0\u8ffd\u8e64',
    withdrawalSuccess: '\u63d0\u9818\u5df2\u6210\u529f',
    loginDetected: '\u5075\u6e2c\u5230\u65b0\u767b\u5165\uff1a192.168.1.1',
    inventory: '\u80cc\u5305',
    items: '14 \u9805\u7269\u54c1',
    vipProtocol: 'VIP \u6a5f\u5236',
    eliteRank: '\u83c1\u82f1\u7b49\u7d1a',
    tierActive: '\u7b49\u968e 4 \u555f\u7528\u4e2d',
    multiplier: '1.5x \u500d\u7387\u52a0\u6210\u751f\u6548\u4e2d',
    adminOverride: '\u7ba1\u7406\u4e2d\u5fc3',
    authorizedOnly: '\u9650\u6388\u6b0a\u64cd\u4f5c',
    adminSummary: '\u7cfb\u7d71\u8a2d\u5b9a\u8207\u7ba1\u7406\u5de5\u5177',
    systemSecure: '\u7cfb\u7d71\u5b89\u5168',
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-24 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="app-shell flex items-center justify-between gap-4 py-4">
          <div className="min-w-0 flex items-center gap-4">
            <motion.div whileTap={{ scale: 0.9 }}>
              <LayoutGrid className="cursor-pointer text-[#fcc025]" />
            </motion.div>
            <h1 className="truncate text-xl font-extrabold uppercase italic tracking-tighter text-[#fcc025]">
              {isZh ? zh.title : 'ZiXi Simulator'}
            </h1>
          </div>
          <Link
            to="/app/settings"
            className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#fcc025]/20 shadow-[0_0_15px_rgba(252,192,37,0.1)]"
          >
            <img
              className="h-full w-full object-cover opacity-80"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBpYtYPXpLpsh0B4jeDEa_kksWMe2PpGKPXWScbGy-At5-Em7wzcfDWA8cQ9q422iOhMTcTEtaaOAixJdBRdNzsFWGKabd-JuGiJApAY-AHwfxrVd6ClRmZH5gGKn1IyL9iWEPxWWtLq1uhv_xhV23ANzCrcuFz_8p6N9PxAW0TQnV_eq5bHNgYynZU2AcBvOjJUKswDysFh-1Y1E8c5ubZuPaCtaUQq8SI1oKHhIFwUaLGZaWWXiwaFO4Pp8Zrp4C2lmllxJgfSJs"
              alt="Profile"
            />
          </Link>
        </div>
      </header>

      <main className="app-shell space-y-8 pt-24">
        <section className="relative overflow-hidden rounded-2xl border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] p-8 shadow-2xl">
          <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fcc025]/5 blur-[100px]" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#fcc025]">
                {isZh ? zh.operatorIdentified : 'Operator Identified'}
              </p>
              <h2 className="text-4xl font-extrabold uppercase italic tracking-tight">
                {username || (address ? address.slice(0, 8) : isZh ? zh.anonymous : 'ANONYMOUS')}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#fcc025] animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                  {isZh ? zh.encryptionActive : 'Encryption Active: AES-256'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                {isZh ? zh.totalAssets : 'Total Assets'}
              </p>
              <div className="text-5xl font-black uppercase italic tracking-tighter text-[#fcc025]">
                {formatNumber(liveBalance || 0)} <span className="text-lg not-italic text-white">ZXC</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <GlassCard
            to="/app/casino/lobby"
            icon={LayoutGrid}
            title={isZh ? zh.casinoFloor : 'Casino Floor'}
            value="12 Units"
            subtitle={isZh ? zh.activeSimulation : 'Active Simulation'}
          />
          <GlassCard
            to="/app/market"
            icon={TrendingUp}
            title={isZh ? zh.marketTerminal : 'Market Terminal'}
            value="BTC/USD +2.4%"
            subtitle={isZh ? zh.liveFeed : 'Live Feed'}
          />
          <GlassCard
            to="/app/announcement"
            icon={Megaphone}
            title={isZh ? zh.announcements : 'Announcements'}
            subtitle={isZh ? zh.newAlerts : '3 New Alerts'}
          >
            <div className="mt-4 space-y-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-[#494847]/30">
                <div className="h-full w-1/3 rounded-full bg-[#fcc025]" />
              </div>
            </div>
          </GlassCard>

          <GlassCard
            to="/app/leaderboard"
            icon={Trophy}
            title={isZh ? zh.rankings : 'Rankings'}
            value="#128"
            subtitle={isZh ? zh.globalSector : 'Global Sector'}
          />
          <GlassCard
            to="/app/wallet"
            icon={WalletIcon}
            title={isZh ? zh.wallet : 'Wallet'}
            value={`${formatNumber(liveBalance || 0)} ZXC`}
            subtitle={isZh ? zh.secured : 'Secured'}
            border
          />
          <GlassCard
            to="/app/transactions"
            icon={History}
            title={isZh ? zh.activity : 'Activity'}
            subtitle={isZh ? zh.recentTraces : 'Recent Traces'}
          >
            <div className="mt-4 space-y-2 text-[10px] font-bold uppercase tracking-wider text-[#adaaaa] opacity-80">
              <div className="flex gap-2">
                <span className="text-[#fcc025]">01</span>
                {isZh ? zh.withdrawalSuccess : 'Withdrawal Successful'}
              </div>
              <div className="flex gap-2">
                <span className="text-[#fcc025]">02</span>
                {isZh ? zh.loginDetected : 'New Login: 192.168.1.1'}
              </div>
            </div>
          </GlassCard>

          <GlassCard
            to="/app/backpack"
            icon={Bell}
            title={isZh ? zh.inventory : 'Inventory'}
            subtitle={isZh ? zh.items : '14 Items'}
          >
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-square rounded border border-[#494847]/20 bg-[#262626]" />
              ))}
            </div>
          </GlassCard>
          <GlassCard
            to="/app/vip"
            icon={ShieldCheck}
            title={isZh ? zh.vipProtocol : 'VIP Protocol'}
            subtitle={isZh ? zh.eliteRank : 'Elite Rank'}
          >
            <div className="mt-2 inline-block rounded border border-[#fcc025]/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#fcc025]">
              {isZh ? zh.tierActive : 'Tier 4 Active'}
            </div>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-tight text-[#adaaaa]">
              {isZh ? zh.multiplier : '1.5x Multiplier Enabled'}
            </p>
          </GlassCard>
          <GlassCard
            to="/app/admin"
            icon={SettingsIcon}
            title={isZh ? zh.adminOverride : 'Admin Override'}
            subtitle={isZh ? zh.authorizedOnly : 'Authorized Only'}
          >
            <p className="mt-2 text-[11px] font-bold uppercase tracking-tight text-[#adaaaa]">
              {isZh ? zh.adminSummary : 'System configuration and operator tools.'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-[#fcc025] animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#fcc025]">
                {isZh ? zh.systemSecure : 'System Secure'}
              </span>
            </div>
          </GlassCard>
        </section>
      </main>

      <AppBottomNav current="home" />
    </div>
  );
}
