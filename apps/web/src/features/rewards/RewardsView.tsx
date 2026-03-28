import { Link } from "react-router-dom";
import React from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Zap,
  Calendar,
  Star,
  ChevronRight,
  LayoutGrid,
  TrendingUp,
  Wallet,
  Settings,
  Gift,
  CheckCircle2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function RewardsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const rewardsQuery = useQuery({
    queryKey: ['rewards-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/rewards/summary');
      const data = await res.json();
      return data.data;
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch('/api/v1/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards-summary'] });
    },
  });

  const campaigns = rewardsQuery.data?.catalog?.campaigns || [];

  const dailyRewards = [
    { day: 1, amount: '0.1 億', status: 'CLAIMED' },
    { day: 2, amount: '0.2 億', status: 'AVAILABLE' },
    { day: 3, amount: '0.5 億', status: 'LOCKED' },
    { day: 4, amount: '1.0 億', status: 'LOCKED' },
    { day: 5, amount: '2.0 億', status: 'LOCKED' },
    { day: 6, amount: '5.0 億', status: 'LOCKED' },
    { day: 7, amount: '10 億', status: 'LOCKED' },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <Gift className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('vault.vip_bonus')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-10">
        {/* Elite Badge */}
        <section className="flex flex-col items-center justify-center pt-4">
           <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="w-32 h-32 rounded-full bg-[#1a1919] border-4 border-[#fcc025] flex items-center justify-center shadow-[0_0_50px_rgba(252,192,37,0.2)]"
              >
                 <Star size={64} fill="#fcc025" className="text-[#fcc025]" />
              </motion.div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#fcc025] text-black px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest whitespace-nowrap shadow-xl">
                 Platinum IV
              </div>
           </div>
           <p className="mt-8 text-[10px] font-bold text-[#adaaaa] uppercase tracking-[0.3em]">VIP TIER PROGRESS / 貴賓等級進度</p>
           <div className="w-full h-1.5 bg-[#1a1919] rounded-full mt-4 overflow-hidden border border-[#494847]/20">
              <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} transition={{ duration: 2 }} className="h-full bg-[#fcc025] shadow-[0_0_10px_#fcc025]" />
           </div>
           <div className="w-full flex justify-between mt-2 text-[9px] font-black uppercase text-[#494847]">
              <span>Gold</span>
              <span>Platinum</span>
           </div>
        </section>

        {/* Daily Rewards */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <Calendar size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">DAILY REWARDS / 每日獎勵</h3>
           </div>
           <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
              {dailyRewards.map(r => (
                <div key={r.day} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  r.status === 'CLAIMED' ? 'bg-emerald-500/5 border-emerald-500/20 opacity-40' :
                  r.status === 'AVAILABLE' ? 'bg-[#fcc025]/10 border-[#fcc025] shadow-[0_0_20px_rgba(252,192,37,0.1)]' :
                  'bg-[#1a1919] border-[#494847]/10'
                }`}>
                   <span className="text-[8px] font-black uppercase text-[#adaaaa]">Day {r.day}</span>
                   <div className="text-xs font-black italic">{r.amount}</div>
                   {r.status === 'CLAIMED' && <CheckCircle2 size={12} className="text-emerald-500" />}
                   {r.status === 'AVAILABLE' && (
                     <button className="bg-[#fcc025] text-black text-[7px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">Claim</button>
                   )}
                </div>
              ))}
           </div>
        </section>

        {/* Active Quests */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 px-2">
              <Zap size={16} className="text-[#adaaaa]" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">ACTIVE QUESTS / 進行中任務</h3>
           </div>
           <div className="space-y-4">
              {campaigns.map((c: any) => (
                <div key={c.id} className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 flex items-center justify-between group hover:bg-[#201f1f] transition-all">
                   <div className="space-y-2 flex-1">
                      <h4 className="text-sm font-bold uppercase tracking-tight text-white group-hover:text-[#fcc025] transition-colors">{c.title}</h4>
                      <p className="text-[9px] font-bold text-[#fcc025] uppercase tracking-widest">Reward: {c.rewards.tokens} ZXC</p>
                      <div className="w-48 h-1 bg-[#0e0e0e] rounded-full overflow-hidden mt-4">
                         <div className="h-full w-1/2 bg-[#fcc025]/50" />
                      </div>
                   </div>
                   <button
                     onClick={() => claimMutation.mutate(c.id)}
                     className="bg-[#fcc025] text-black px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors"
                   >
                      {t('support.send_protocol')}
                   </button>
                </div>
              ))}
           </div>
        </section>
      </main>

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-2xl border-t border-[#494847]/15 h-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex justify-around items-center h-full max-w-2xl mx-auto px-4">
              <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                  <LayoutGrid size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.casino')}</span>
              </Link>
              <Link to="/app/market" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                  <TrendingUp size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.market')}</span>
              </Link>
              <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                  <Wallet size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.vault')}</span>
              </Link>
              <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] hover:text-white transition-all">
                  <Settings size={24} className="mb-1" />
                  <span className="font-bold uppercase tracking-[0.1em] text-[10px]">{t('nav.settings')}</span>
              </Link>
          </div>
      </nav>
    </div>
  );
}
