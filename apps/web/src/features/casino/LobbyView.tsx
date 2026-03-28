import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../store/api";
import { motion } from "framer-motion";
import { Zap, Trophy, Megaphone, TrendingUp, Wallet, ShoppingBag, Users, Activity, Settings as SettingsIcon, LogOut } from "lucide-react";
import { formatNumber } from "@repo/shared";
import { useUserStore } from "../../store/useUserStore";

const GAMES = [
  { id: 'coinflip', name: '擲硬幣', icon: '🪙' },
  { id: 'roulette', name: '輪盤', icon: '🎡' },
  { id: 'horse', name: '賽馬', icon: '🏇' },
  { id: 'slots', name: '老虎機', icon: '🎰' },
  { id: 'blackjack', name: '21點', icon: '🃏' },
  { id: 'dragon', name: '龍虎', icon: '🐉' },
  { id: 'sicbo', name: '骰寶', icon: '🎲' },
  { id: 'bingo', name: '賓果', icon: '🎱' },
  { id: 'crash', name: '暴漲', icon: '📈' },
  { id: 'duel', name: '對決', icon: '⚔️' },
  { id: 'poker', name: '德州', icon: '🏙️' },
  { id: 'bluffdice', name: '吹牛', icon: '🎲' }
];

export const LobbyView: React.FC = () => {
    const { address, balance } = useUserStore();
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        api.get('/api/v1/stats/health').then(res => setStats(res.data.stats)).catch(() => {});
    }, []);

    const NavCard = ({ to, icon: Icon, title, subtitle, color = "amber" }: any) => (
      <Link to={to} className="group relative overflow-hidden bg-[#141414] hover:bg-[#1a1a1a] border border-neutral-800 p-8 rounded-[2.5rem] shadow-xl transition-all hover:-translate-y-2 active:scale-95 flex flex-col items-center text-center">
        <div className={`w-16 h-16 bg-${color}-500/10 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
          <Icon size={32} className={`text-${color}-500 fill-current`} />
        </div>
        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">{title}</h3>
        <p className="text-[10px] text-neutral-500 font-bold mt-2 uppercase tracking-widest leading-relaxed">{subtitle}</p>
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Icon size={64} className={`text-${color}-500`} />
        </div>
        <div className="mt-6">
           <span className={`text-[10px] font-black bg-${color}-500/10 text-${color}-500 px-4 py-1.5 rounded-full border border-${color}-500/20 uppercase tracking-widest`}>開放中 OPEN</span>
        </div>
      </Link>
    );

    return (
        <div className="space-y-10 pb-20 font-sans text-white">
            {/* User Info Bar */}
            <section className="bg-black/50 backdrop-blur-md border border-neutral-800 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />

                <header className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.4em] mb-2">使用者名稱 USERNAME</span>
                        <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{address?.slice(0, 10)}...</h2>
                    </div>
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.4em] mb-2">等級 LEVEL</span>
                        <div className="flex items-center gap-2">
                             <Trophy size={18} className="text-amber-500" />
                             <h2 className="text-xl font-black text-amber-500 italic tracking-tighter uppercase">至尊等級 | 單注上限 2 億 子熙幣</h2>
                        </div>
                    </div>
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.4em] mb-2">餘額 BALANCE</span>
                        <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">{formatNumber(balance || 0)} <span className="text-sm text-neutral-500 not-italic">億</span></h2>
                    </div>
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.4em] mb-2">累計押注 TOTAL BET</span>
                        <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">27.82 <span className="text-sm text-neutral-500 not-italic">億</span></h2>
                    </div>
                </header>
            </section>

            {/* Main Menu Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NavCard to="/app/announcement" icon={Megaphone} title="公告中心" subtitle="查看最新公告、維護通知與系統更新" color="rose" />
                <NavCard to="/app/leaderboard" icon={Trophy} title="排行榜" subtitle="查看押注總額與淨資產排行榜" color="amber" />
                <NavCard to="/app/casino/lobby" icon={Zap} title="子熙賭場" subtitle="猜硬幣、老虎機、輪盤、二十一點、賽馬、射龍門" color="emerald" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NavCard to="/app/market" icon={TrendingUp} title="金融市場" subtitle="比特幣與主要加密貨幣即時交易" color="blue" />
                <NavCard to="/app/wallet" icon={Wallet} title="資金中心" subtitle="匯入、匯出、空投與代幣領取" color="emerald" />
                <NavCard to="/app/rewards" icon={ShoppingBag} title="活動與商店" subtitle="領取活動獎勵、購買道具與特等獎" color="rose" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <NavCard to="/app/inventory" icon={Users} title="我的背包" subtitle="查看已擁有的道具、頭像與頭像框" color="amber" />
                <NavCard to="/app/vip" icon={ShieldCheck} title="VIP 中心" subtitle="查看 VIP 等級特權與專屬福利" color="blue" />
                <NavCard to="/app/admin" icon={Activity} title="維運工具" subtitle="系統監控、管理功能與後台操作" color="neutral" />
            </div>

            {/* Footer Stats */}
            <footer className="bg-black border border-neutral-900 p-10 rounded-[3rem] flex flex-col md:flex-row justify-between items-center gap-8 shadow-2xl">
                <div className="flex items-center gap-10">
                    <div className="text-center md:text-left">
                        <div className="text-[10px] font-black text-neutral-700 uppercase tracking-[0.3em] mb-2">TOTAL ONLINE</div>
                        <div className="text-3xl font-black text-white italic tracking-tighter uppercase">1,248 <span className="text-sm not-italic">Players</span></div>
                    </div>
                    <div className="text-center md:text-left">
                        <div className="text-[10px] font-black text-neutral-700 uppercase tracking-[0.3em] mb-2">SYSTEM UPTIME</div>
                        <div className="text-3xl font-black text-amber-500 italic tracking-tighter uppercase">99.98%</div>
                    </div>
                </div>
                <div className="flex gap-4">
                    <Link to="/app/wallet" className="px-10 py-5 bg-neutral-900 hover:bg-neutral-800 text-white font-black uppercase italic tracking-tighter rounded-[1.5rem] border border-neutral-800 transition-all">Deposit</Link>
                    <Link to="/app/market" className="px-10 py-5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase italic tracking-tighter rounded-[1.5rem] shadow-xl shadow-amber-500/20 transition-all">Market</Link>
                </div>
            </footer>
        </div>
    );
};
