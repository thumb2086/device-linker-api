import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell,
  ChevronRight,
  Crown,
  Dice5,
  History,
  LayoutGrid,
  Megaphone,
  Package,
  Settings as SettingsIcon,
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
    title: '子熙模擬器',
    operatorIdentified: '操作者已識別',
    anonymous: '匿名操作者',
    encryptionActive: '加密已啟用：AES-256',
    totalAssets: '總資產',
    casinoFloor: '娛樂大廳',
    activeSimulation: '活躍模擬',
    marketTerminal: '市場終端',
    liveFeed: '即時走勢',
    announcements: '公告中心',
    newAlerts: '3 則新通知',
    rankings: '排行榜',
    globalSector: '全域排名',
    wallet: '錢包',
    secured: '已保護',
    activity: '最新動態',
    recentTraces: '最新追蹤',
    withdrawalSuccess: '提領已成功',
    loginDetected: '偵測到新登入：192.168.1.1',
    inventory: '背包',
    items: '14 項物品',
    vipProtocol: 'VIP 機制',
    eliteRank: '菁英等級',
    tierActive: '等階 4 啟用中',
    multiplier: '1.5x 倍率加成生效中',
    adminOverride: '管理中心',
    authorizedOnly: '限授權操作',
    adminSummary: '系統設定與管理工具',
    systemSecure: '系統安全',
    vipLevels: 'VIP 等級說明',
    vipSubtitle: '等級特權一覽',
    gameOdds: '遊戲機率',
    oddsSubtitle: 'RTP 與公平性說明',
    itemsCatalog: '物品圖鑑',
    itemsSubtitle: '道具稀有度說明',
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
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#fcc025]" />
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
            to="/app/inventory"
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
            to="/app/info"
            icon={Crown}
            title={isZh ? '資訊中心' : 'Information Center'}
            subtitle={isZh ? '說明與指南' : 'Guides & Information'}
            border
          >
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-[#494847]/20 bg-[#262626] p-3 transition-colors hover:border-[#fcc025]/40">
                <Crown className="h-5 w-5 text-[#fcc025]" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white">{isZh ? 'VIP 等級說明' : 'VIP Levels'}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                    {isZh ? zh.tierActive : 'Tier 4 Active'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#adaaaa]" />
              </div>
              
              <div className="flex items-center gap-3 rounded-lg border border-[#494847]/20 bg-[#262626] p-3 transition-colors hover:border-emerald-400/40">
                <Dice5 className="h-5 w-5 text-emerald-400" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white">{isZh ? '遊戲機率' : 'Game Odds'}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                    {isZh ? 'RTP 與公平性' : 'RTP & Fairness'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#adaaaa]" />
              </div>
              
              <div className="flex items-center gap-3 rounded-lg border border-[#494847]/20 bg-[#262626] p-3 transition-colors hover:border-purple-400/40">
                <Package className="h-5 w-5 text-purple-400" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-white">{isZh ? '物品圖鑑' : 'Items Catalog'}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
                    {isZh ? '收藏品與道具' : 'Collectibles & Items'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#adaaaa]" />
              </div>
            </div>
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
              <div className="h-1 w-1 animate-pulse rounded-full bg-[#fcc025]" />
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
