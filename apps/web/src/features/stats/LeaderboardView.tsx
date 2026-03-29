import React, { useState } from 'react';
import { Crown, Timer, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useUserStore } from '../../store/useUserStore';
import AppBottomNav from '../../components/AppBottomNav';

const TOP_THREE = [
  { rank: 1, name: 'KRONOS_X', winnings: 1248.5, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kronos' },
  { rank: 2, name: 'CYBER_PUNK', winnings: 942.1, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Cyber' },
  { rank: 3, name: 'NEON_SOUL', winnings: 856.4, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Neon' },
];

const OTHER_PLAYERS = [
  { rank: 4, name: 'BIT_LORD', winnings: 642.1, winRate: 72.4 },
  { rank: 5, name: 'DATA_MINER', winnings: 589.0, winRate: 68.1 },
  { rank: 6, name: 'SIM_CHAMP', winnings: 412.5, winRate: 64.2 },
  { rank: 7, name: 'ZERO_COOL', winnings: 398.2, winRate: 61.5 },
];

export default function LeaderboardView() {
  const { t } = useTranslation();
  const { address } = useUserStore();
  const [filter, setFilter] = useState('WEEKLY');
  const currentUserLabel = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'OPERATOR_X';

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Trophy className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              {t('leaderboard.title')}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-10 px-6 pt-24">
        <section className="flex flex-col items-center justify-center space-y-2">
          <div className="flex items-center gap-2 text-[#fcc025] opacity-60">
            <Timer size={14} />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('leaderboard.season_ends')}</span>
          </div>
          <div className="text-3xl font-black italic tracking-tighter text-white shadow-[0_0_30px_rgba(252,192,37,0.1)]">
            2D 14H 30M 12S
          </div>
        </section>

        <section className="flex items-end justify-center gap-4 pt-10">
          {TOP_THREE.slice(1).map((player, index) => (
            <div key={player.rank} className={`flex flex-col items-center space-y-4 ${index === 0 ? '' : ''}`}>
              <div className="relative">
                <div
                  className={`overflow-hidden rounded-2xl border-2 ${
                    player.rank === 2 ? 'border-slate-400' : 'border-amber-800'
                  } ${player.rank === 2 ? 'h-16 w-16' : 'h-16 w-16'}`}
                >
                  <img src={player.avatar} alt={player.name} />
                </div>
                <div
                  className={`absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                    player.rank === 2 ? 'bg-slate-400 text-black' : 'bg-amber-800 text-white'
                  }`}
                >
                  {player.rank}
                </div>
              </div>
              <div
                className={`flex ${player.rank === 2 ? 'h-24 w-20' : 'h-20 w-20'} flex-col items-center justify-center rounded-t-xl border-t p-2 text-center ${
                  player.rank === 2
                    ? 'border-slate-400/30 bg-gradient-to-t from-[#1a1919] to-slate-400/20'
                    : 'border-amber-800/30 bg-gradient-to-t from-[#1a1919] to-amber-800/20'
                }`}
              >
                <p className="w-full truncate text-[9px] font-black uppercase text-white">{player.name}</p>
                <p className={`mt-1 text-[10px] font-black ${player.rank === 2 ? 'text-slate-400' : 'text-amber-800'}`}>
                  {formatNumber(player.winnings, 'short')} ZXC
                </p>
              </div>
            </div>
          ))}

          <div className="-translate-y-4 flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="absolute left-1/2 top-[-2.5rem] -translate-x-1/2 text-[#fcc025]">
                <Crown size={32} fill="currentColor" />
              </div>
              <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-[#fcc025] shadow-[0_0_40px_rgba(252,192,37,0.3)]">
                <img src={TOP_THREE[0].avatar} alt={TOP_THREE[0].name} />
              </div>
              <div className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-[#fcc025] text-sm font-black text-black">
                1
              </div>
            </div>
            <div className="flex h-32 w-28 flex-col items-center justify-center rounded-t-2xl border-t border-[#fcc025]/30 bg-gradient-to-t from-[#1a1919] to-[#fcc025]/20 p-4 text-center">
              <p className="w-full truncate text-[11px] font-black uppercase text-white">{TOP_THREE[0].name}</p>
              <p className="mt-1 text-sm font-black text-[#fcc025]">{formatNumber(TOP_THREE[0].winnings, 'short')} ZXC</p>
            </div>
          </div>
        </section>

        <div className="flex rounded-xl border border-[#494847]/20 bg-[#1a1919] p-1.5">
          {['DAILY', 'WEEKLY', 'ALL-TIME'].map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setFilter(entry)}
              className={`flex-1 rounded-lg py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                filter === entry ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'
              }`}
            >
              {entry}
            </button>
          ))}
        </div>

        <section className="space-y-3">
          {OTHER_PLAYERS.map((player) => (
            <div
              key={player.rank}
              className="group flex items-center justify-between rounded-xl border border-[#494847]/10 bg-[#1a1919] p-4 transition-all hover:bg-[#201f1f]"
            >
              <div className="flex items-center gap-4">
                <span className="w-6 text-[10px] font-black text-[#494847]">{player.rank}</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#262626] text-xs font-bold uppercase text-white">
                  {player.name.charAt(0)}
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase text-white">{player.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-tighter text-[#adaaaa]">
                    {t('leaderboard.win_rate')}: {player.winRate}%
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black italic tracking-tighter text-white">
                  {formatNumber(player.winnings, 'short')} ZXC
                </p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-[#fcc025]">SIM_ACTIVE</p>
              </div>
            </div>
          ))}

          <div className="relative flex items-center justify-between overflow-hidden rounded-xl border-2 border-[#fcc025] bg-[#1a1919] p-5 shadow-[0_0_30px_rgba(252,192,37,0.1)]">
            <div className="absolute right-0 top-0 p-2">
              <span className="rounded-sm bg-[#fcc025] px-1.5 py-0.5 text-[8px] font-black uppercase text-black">YOU</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-6 text-[11px] font-black text-[#fcc025]">128</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#fcc025]/30 bg-[#262626] text-xs font-bold uppercase text-[#fcc025]">
                ME
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-white">{currentUserLabel}</p>
                <p className="text-[9px] font-bold uppercase tracking-tighter text-[#adaaaa]">
                  {t('leaderboard.win_rate')}: 58.2%
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-black italic tracking-tighter text-[#fcc025]">12.5 ZXC</p>
            </div>
          </div>
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
