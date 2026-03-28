import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../store/api";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  TrendingUp,
  Wallet as WalletIcon,
  ShieldCheck,
  Megaphone,
  Trophy,
  History,
  Inventory,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  Bell
} from "lucide-react";
import { formatNumber } from "@repo/shared";
import { useUserStore } from "../../store/useUserStore";

export default function LobbyView() {
    const { address, balance, username } = useUserStore();
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        api.get('/api/v1/stats/health').then(res => setStats(res.data.stats)).catch(() => {});
    }, []);

    const GlassCard = ({ to, icon: Icon, title, value, subtitle, border = false, children }: any) => (
      <Link to={to} className={`glass-card bg-[#1a1919] rounded-xl p-6 group cursor-pointer transition-all hover:bg-[#262626] active:scale-95 ${border ? 'border-l-4 border-l-[#fcc025]/40' : 'border border-[#494847]/10'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#262626] flex items-center justify-center border border-[#494847]/20 group-hover:border-[#fcc025]/40 transition-colors">
            <Icon className="text-[#fcc025] w-6 h-6" />
          </div>
          {subtitle && <span className="text-[10px] font-bold text-[#adaaaa] tracking-widest uppercase">{subtitle}</span>}
        </div>
        <h4 className="text-white font-bold text-lg mb-2 tracking-tight uppercase">{title}</h4>
        {value && <div className="text-2xl font-bold text-white mb-1 uppercase tracking-tighter italic">{value}</div>}
        {children}
      </Link>
    );

    return (
        <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-24">
            {/* Top Bar */}
            <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
                <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-4">
                        <motion.div whileTap={{ scale: 0.9 }}>
                           <LayoutGrid className="text-[#fcc025] cursor-pointer" />
                        </motion.div>
                        <h1 className="font-extrabold tracking-tighter text-xl text-[#fcc025] uppercase italic">ZiXi Simulator</h1>
                    </div>
                    <Link to="/app/settings" className="w-10 h-10 rounded-full border border-[#fcc025]/20 overflow-hidden shadow-[0_0_15px_rgba(252,192,37,0.1)]">
                        <img
                            className="w-full h-full object-cover opacity-80"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBpYtYPXpLpsh0B4jeDEa_kksWMe2PpGKPXWScbGy-At5-Em7wzcfDWA8cQ9q422iOhMTcTEtaaOAixJdBRdNzsFWGKabd-JuGiJApAY-AHwfxrVd6ClRmZH5gGKn1IyL9iWEPxWWtLq1uhv_xhV23ANzCrcuFz_8p6N9PxAW0TQnV_eq5bHNgYynZU2AcBvOjJUKswDysFh-1Y1E8c5ubZuPaCtaUQq8SI1oKHhIFwUaLGZaWWXiwaFO4Pp8Zrp4C2lmllxJgfSJs"
                            alt="Profile"
                        />
                    </Link>
                </div>
            </header>

            <main className="pt-24 px-6 max-w-7xl mx-auto space-y-8">
                {/* Hero / Operator Status */}
                <section className="bg-gradient-to-br from-[#1a1919] to-[#0e0e0e] rounded-2xl p-8 border border-[#494847]/10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#fcc025]/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />

                    <div className="flex flex-col md:flex-row justify-between items-end gap-6 relative z-10">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-[#fcc025] tracking-[0.3em] uppercase">Operator Identified</p>
                            <h2 className="text-4xl font-extrabold tracking-tight uppercase italic">{username || (address ? address.slice(0, 8) : 'ANONYMOUS')}</h2>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="w-2 h-2 rounded-full bg-[#fcc025] animate-pulse" />
                                <span className="text-[10px] font-bold text-[#adaaaa] tracking-widest uppercase">Encryption Active: AES-256</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-[#adaaaa] tracking-widest uppercase mb-1">Total Assets</p>
                            <div className="text-5xl font-black text-[#fcc025] italic tracking-tighter uppercase">
                                {formatNumber(balance || 0)} <span className="text-lg not-italic text-white">億</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3x3 Grid Modules */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <GlassCard to="/app/casino/lobby" icon={LayoutGrid} title="Casino Floor" value="12 Units" subtitle="Active Simulation" />
                    <GlassCard to="/app/market" icon={TrendingUp} title="Market Terminal" value="BTC/USD +2.4%" subtitle="Live Feed" />
                    <GlassCard to="/app/announcement" icon={Megaphone} title="Announcements" subtitle="3 New Alerts">
                        <div className="mt-4 space-y-2">
                            <div className="h-1 w-full bg-[#494847]/30 rounded-full overflow-hidden">
                                <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="h-full w-1/3 bg-[#fcc025]" />
                            </div>
                        </div>
                    </GlassCard>

                    <GlassCard to="/app/leaderboard" icon={Trophy} title="Rankings" value="#128" subtitle="Global Sector" />
                    <GlassCard to="/app/wallet" icon={WalletIcon} title="Vault" value={`${formatNumber(balance || 0)} 億`} subtitle="Secured" border={true} />
                    <GlassCard to="/app/activity" icon={History} title="Activity" subtitle="Recent Traces">
                        <div className="mt-4 space-y-2 opacity-60 text-[10px] uppercase font-bold tracking-wider">
                            <div className="flex gap-2"><span className="text-[#fcc025]">●</span> Withdrawal Successful</div>
                            <div className="flex gap-2"><span className="text-[#fcc025]">●</span> New Login: 192.168.1.1</div>
                        </div>
                    </GlassCard>

                    <GlassCard to="/app/inventory" icon={Bell} title="Inventory" subtitle="14 Items">
                        <div className="grid grid-cols-4 gap-2 mt-4">
                            {[1,2,3,4].map(i => <div key={i} className="aspect-square rounded bg-[#262626] border border-[#494847]/20" />)}
                        </div>
                    </GlassCard>
                    <GlassCard to="/app/vip" icon={ShieldCheck} title="VIP Protocol" subtitle="Elite Rank">
                         <div className="mt-2 text-[10px] text-[#fcc025] font-bold tracking-widest uppercase border border-[#fcc025]/20 px-2 py-1 inline-block rounded">Tier 4 Active</div>
                         <p className="text-[#adaaaa] text-[11px] mt-3 uppercase tracking-tight font-bold">1.5x Multiplier Enabled</p>
                    </GlassCard>
                    <GlassCard to="/app/admin" icon={SettingsIcon} title="Admin Override" subtitle="Authorized Only">
                        <p className="text-[#adaaaa] text-[11px] mt-2 font-bold uppercase tracking-tight">System configuration and operator tools.</p>
                        <div className="mt-4 flex items-center gap-2">
                            <div className="h-1 w-1 rounded-full bg-[#fcc025] animate-pulse" />
                            <span className="text-[10px] text-[#fcc025] font-bold tracking-widest uppercase">System Secure</span>
                        </div>
                    </GlassCard>
                </section>
            </main>

            {/* Bottom Nav Bar */}
            <nav className="fixed bottom-0 left-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-2xl border-t border-[#494847]/15 h-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
                <div className="flex justify-around items-center h-full max-w-7xl mx-auto px-4">
                    <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
                        <LayoutGrid size={24} className="mb-1" />
                        <span className="font-bold uppercase tracking-[0.1em] text-[10px]">Lobby</span>
                    </Link>
                    <Link to="/app/market" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                        <TrendingUp size={24} className="mb-1" />
                        <span className="font-bold uppercase tracking-[0.1em] text-[10px]">Market</span>
                    </Link>
                    <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                        <WalletIcon size={24} className="mb-1" />
                        <span className="font-bold uppercase tracking-[0.1em] text-[10px]">Vault</span>
                    </Link>
                    <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                        <SettingsIcon size={24} className="mb-1" />
                        <span className="font-bold uppercase tracking-[0.1em] text-[10px]">Setup</span>
                    </Link>
                </div>
            </nav>
        </div>
    );
};
