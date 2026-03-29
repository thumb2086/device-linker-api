import { Link } from "react-router-dom";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Crown,
  Timer,
  ChevronRight,
  Medal
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useUserStore } from '../../store/useUserStore';
import AppBottomNav from '../../components/AppBottomNav';

export default function LeaderboardView() {
  const { t } = useTranslation();
  const { address } = useUserStore();
  const [filter, setFilter] = useState('WEEKLY');

  const top3 = [
    { rank: 1, name: 'KRONOS_X', winnings: 1248.5, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kronos' },
    { rank: 2, name: 'CYBER_PUNK', winnings: 942.1, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Cyber' },
    { rank: 3, name: 'NEON_SOUL', winnings: 856.4, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Neon' },
  ];

  const others = [
    { rank: 4, name: 'BIT_LORD', winnings: 642.1, winRate: 72.4 },
    { rank: 5, name: 'DATA_MINER', winnings: 589.0, winRate: 68.1 },
    { rank: 6, name: 'SIM_CHAMP', winnings: 412.5, winRate: 64.2 },
    { rank: 7, name: 'ZERO_COOL', winnings: 398.2, winRate: 61.5 },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <Trophy className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('leaderboard.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-10">
        {/* Countdown */}
        <section className="flex flex-col items-center justify-center space-y-2">
           <div className="flex items-center gap-2 text-[#fcc025] opacity-60">
              <Timer size={14} />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('leaderboard.season_ends')}</span>
           </div>
           <div className="text-3xl font-black italic tracking-tighter text-white shadow-[0_0_30px_rgba(252,192,37,0.1)]">
              2D 14H 30M 12S
           </div>
        </section>

        {/* Podium */}
        <section className="flex items-end justify-center gap-4 pt-10">
           {/* Rank 2 */}
           <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                 <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-slate-400">
                    <img src={top3[1].avatar} alt={top3[1].name} />
                 </div>
                 <div className="absolute -top-3 -left-3 bg-slate-400 text-black w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs">2</div>
              </div>
              <div className="h-24 w-20 bg-gradient-to-t from-[#1a1919] to-slate-400/20 rounded-t-xl border-t border-slate-400/30 flex flex-col items-center justify-center p-2 text-center">
                 <p className="text-[9px] font-black uppercase text-white truncate w-full">{top3[1].name}</p>
                 <p className="text-[10px] font-black text-slate-400 mt-1">{top3[1].winnings}B</p>
              </div>
           </div>

           {/* Rank 1 */}
           <div className="flex flex-col items-center space-y-4 -translate-y-4">
              <div className="relative">
                 <motion.div
                   animate={{ y: [0, -5, 0] }}
                   transition={{ duration: 2, repeat: Infinity }}
                   className="absolute -top-10 left-1/2 -translate-x-1/2 text-[#fcc025]"
                 >
                    <Crown size={32} fill="currentColor" />
                 </motion.div>
                 <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-[#fcc025] shadow-[0_0_40px_rgba(252,192,37,0.3)]">
                    <img src={top3[0].avatar} alt={top3[0].name} />
                 </div>
                 <div className="absolute -top-3 -left-3 bg-[#fcc025] text-black w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm">1</div>
              </div>
              <div className="h-32 w-28 bg-gradient-to-t from-[#1a1919] to-[#fcc025]/20 rounded-t-2xl border-t border-[#fcc025]/30 flex flex-col items-center justify-center p-4 text-center">
                 <p className="text-[11px] font-black uppercase text-white truncate w-full">{top3[0].name}</p>
                 <p className="text-sm font-black text-[#fcc025] mt-1">{top3[0].winnings}B</p>
              </div>
           </div>

           {/* Rank 3 */}
           <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                 <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-amber-800">
                    <img src={top3[2].avatar} alt={top3[2].name} />
                 </div>
                 <div className="absolute -top-3 -left-3 bg-amber-800 text-white w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs">3</div>
              </div>
              <div className="h-20 w-20 bg-gradient-to-t from-[#1a1919] to-amber-800/20 rounded-t-xl border-t border-amber-800/30 flex flex-col items-center justify-center p-2 text-center">
                 <p className="text-[9px] font-black uppercase text-white truncate w-full">{top3[2].name}</p>
                 <p className="text-[10px] font-black text-amber-800 mt-1">{top3[2].winnings}B</p>
              </div>
           </div>
        </section>

        {/* Filters */}
        <div className="flex bg-[#1a1919] p-1.5 rounded-xl border border-[#494847]/20">
           {['DAILY', 'WEEKLY', 'ALL-TIME'].map(f => (
             <button
               key={f}
               onClick={() => setFilter(f)}
               className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${filter === f ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'}`}
             >
                {f}
             </button>
           ))}
        </div>

        {/* List */}
        <section className="space-y-3">
           {others.map(player => (
             <div key={player.rank} className="bg-[#1a1919] rounded-xl p-4 border border-[#494847]/10 flex items-center justify-between group hover:bg-[#201f1f] transition-all">
                <div className="flex items-center gap-4">
                   <span className="w-6 text-[10px] font-black text-[#494847]">{player.rank}</span>
                   <div className="w-10 h-10 rounded-lg bg-[#262626] flex items-center justify-center text-white font-bold text-xs uppercase">
                      {player.name.charAt(0)}
                   </div>
                   <div>
                      <p className="text-[11px] font-black uppercase text-white">{player.name}</p>
                      <p className="text-[9px] font-bold text-[#adaaaa] uppercase tracking-tighter">{t('leaderboard.win_rate')}: {player.winRate}%</p>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-sm font-black italic text-white tracking-tighter">{player.winnings} 億</p>
                   <p className="text-[8px] font-bold text-[#fcc025] uppercase tracking-widest mt-1">SIM_ACTIVE</p>
                </div>
             </div>
           ))}

           {/* User Rank Stick */}
           <div className="bg-[#1a1919] rounded-xl p-5 border-2 border-[#fcc025] flex items-center justify-between shadow-[0_0_30px_rgba(252,192,37,0.1)] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2">
                 <span className="bg-[#fcc025] text-black text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase">YOU</span>
              </div>
              <div className="flex items-center gap-4">
                 <span className="w-6 text-[11px] font-black text-[#fcc025]">128</span>
                 <div className="w-10 h-10 rounded-lg bg-[#262626] border border-[#fcc025]/30 flex items-center justify-center text-[#fcc025] font-bold text-xs uppercase">
                    ME
                 </div>
                 <div>
                    <p className="text-[11px] font-black uppercase text-white">OPERATOR_X</p>
                    <p className="text-[9px] font-bold text-[#adaaaa] uppercase tracking-tighter">{t('leaderboard.win_rate')}: 58.2%</p>
                 </div>
              </div>
              <div className="text-right">
                 <p className="text-sm font-black italic text-[#fcc025] tracking-tighter">12.5 億</p>
              </div>
           </div>
        </section>
      </main>

      {/* Bottom Nav Bar */}
      <AppBottomNav current="none" />
    </div>
  );
}
