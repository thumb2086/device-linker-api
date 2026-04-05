import { useState, useMemo } from 'react';
import { Crown, Timer, Trophy, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useUserStore } from '../../store/useUserStore';
import { useLeaderboard, type LeaderboardType } from '../../hooks/useLeaderboard';
import AppBottomNav from '../../components/AppBottomNav';

const FILTER_MAP: Record<string, LeaderboardType> = {
  'WEEKLY': 'week',
  'MONTHLY': 'month',
  'SEASON': 'season',
  'ALL-TIME': 'all',
};

const FILTER_LABELS = ['WEEKLY', 'MONTHLY', 'SEASON', 'ALL-TIME'];

// Generate avatar URL from address or name
const getAvatarUrl = (seed: string) => {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
};

// Get display name from entry
const getDisplayName = (entry: { displayName: string | null; address: string }) => {
  return entry.displayName || `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`;
};

// Format time remaining until end of week/month/season
const getTimeRemaining = (type: LeaderboardType): string => {
  const now = new Date();
  let end: Date;

  switch (type) {
    case 'week': {
      // End of current week (Sunday 23:59:59)
      end = new Date(now);
      const day = end.getUTCDay();
      const daysUntilSunday = 7 - day;
      end.setUTCDate(end.getUTCDate() + daysUntilSunday);
      end.setUTCHours(23, 59, 59, 999);
      break;
    }
    case 'month': {
      // End of current month
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      break;
    }
    case 'season': {
      // End of current quarter
      const quarter = Math.floor(now.getUTCMonth() / 3);
      end = new Date(Date.UTC(now.getUTCFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999));
      break;
    }
    default:
      return '';
  }

  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return '0D 0H 0M';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${days}D ${hours}H ${minutes}M`;
};

export default function LeaderboardView() {
  const { t } = useTranslation();
  const { address } = useUserStore();
  const [filter, setFilter] = useState('WEEKLY');

  const currentType = FILTER_MAP[filter];
  const { data, isLoading, error } = useLeaderboard(currentType, 50);

  // Get top 3 and other players from real data
  const { topThree, otherPlayers, selfEntry } = useMemo(() => {
    if (!data?.entries) return { topThree: [], otherPlayers: [], selfEntry: null };

    const entries = data.entries;
    const top3 = entries.slice(0, 3);
    const others = entries.slice(3);

    // Find self in entries or use selfRank
    const self = data.selfRank || entries.find(e => e.address.toLowerCase() === address?.toLowerCase());

    return {
      topThree: top3.map((e) => ({
        rank: e.rank,
        name: getDisplayName(e),
        winnings: e.amount,
        avatar: getAvatarUrl(e.displayName || e.address),
        isSelf: e.address.toLowerCase() === address?.toLowerCase(),
      })),
      otherPlayers: others.map(e => ({
        rank: e.rank,
        name: getDisplayName(e),
        winnings: e.amount,
        isSelf: e.address.toLowerCase() === address?.toLowerCase(),
      })),
      selfEntry: self ? {
        rank: self.rank,
        name: getDisplayName(self),
        winnings: self.amount,
      } : null,
    };
  }, [data, address]);

  // Reorder top 3 for visual layout (2nd, 1st, 3rd)
  const orderedTopThree = useMemo(() => {
    if (topThree.length < 3) return topThree;
    return [topThree[1], topThree[0], topThree[2]].filter(Boolean);
  }, [topThree]);

  const timeRemaining = useMemo(() => getTimeRemaining(currentType), [currentType]);

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
        {/* Loading State */}
        {isLoading && (
          <section className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#fcc025]" />
            <p className="mt-4 text-sm text-[#adaaaa]">{t('common.loading')}</p>
          </section>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <section className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-red-400">{t('common.error')}</p>
            <p className="mt-2 text-xs text-[#adaaaa]">{error.message}</p>
          </section>
        )}

        {/* Data Loaded */}
        {!isLoading && !error && (
          <>
            <section className="flex flex-col items-center justify-center space-y-2">
              <div className="flex items-center gap-2 text-[#fcc025] opacity-60">
                <Timer size={14} />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                  {currentType === 'all' ? t('leaderboard.all_time') : t('leaderboard.time_remaining')}
                </span>
              </div>
              <div className="text-3xl font-black italic tracking-tighter text-white shadow-[0_0_30px_rgba(252,192,37,0.1)]">
                {currentType === 'all' ? '∞' : timeRemaining}
              </div>
            </section>

            {/* Top 3 Podium */}
            <section className="flex items-end justify-center gap-4 pt-10">
              {/* 2nd Place */}
              {orderedTopThree[0] && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="overflow-hidden rounded-2xl border-2 border-slate-400 h-16 w-16">
                      <img src={orderedTopThree[0].avatar} alt={orderedTopThree[0].name} />
                    </div>
                    <div className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black bg-slate-400 text-black">
                      {orderedTopThree[0].rank}
                    </div>
                  </div>
                  <div className="flex h-24 w-20 flex-col items-center justify-center rounded-t-xl border-t border-slate-400/30 bg-gradient-to-t from-[#1a1919] to-slate-400/20 p-2 text-center">
                    <p className="w-full truncate text-[9px] font-black uppercase text-white">{orderedTopThree[0].name}</p>
                    <p className="mt-1 text-[10px] font-black text-slate-400">
                      {formatNumber(orderedTopThree[0].winnings, 'short')} ZXC
                    </p>
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {orderedTopThree[1] && (
                <div className="-translate-y-4 flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="absolute left-1/2 top-[-2.5rem] -translate-x-1/2 text-[#fcc025]">
                      <Crown size={32} fill="currentColor" />
                    </div>
                    <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-[#fcc025] shadow-[0_0_40px_rgba(252,192,37,0.3)]">
                      <img src={orderedTopThree[1].avatar} alt={orderedTopThree[1].name} />
                    </div>
                    <div className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-[#fcc025] text-sm font-black text-black">
                      1
                    </div>
                  </div>
                  <div className="flex h-32 w-28 flex-col items-center justify-center rounded-t-2xl border-t border-[#fcc025]/30 bg-gradient-to-t from-[#1a1919] to-[#fcc025]/20 p-4 text-center">
                    <p className="w-full truncate text-[11px] font-black uppercase text-white">{orderedTopThree[1].name}</p>
                    <p className="mt-1 text-sm font-black text-[#fcc025]">{formatNumber(orderedTopThree[1].winnings, 'short')} ZXC</p>
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {orderedTopThree[2] && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="overflow-hidden rounded-2xl border-2 border-amber-800 h-16 w-16">
                      <img src={orderedTopThree[2].avatar} alt={orderedTopThree[2].name} />
                    </div>
                    <div className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black bg-amber-800 text-white">
                      {orderedTopThree[2].rank}
                    </div>
                  </div>
                  <div className="flex h-20 w-20 flex-col items-center justify-center rounded-t-xl border-t border-amber-800/30 bg-gradient-to-t from-[#1a1919] to-amber-800/20 p-2 text-center">
                    <p className="w-full truncate text-[9px] font-black uppercase text-white">{orderedTopThree[2].name}</p>
                    <p className="mt-1 text-[10px] font-black text-amber-800">
                      {formatNumber(orderedTopThree[2].winnings, 'short')} ZXC
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Filter Tabs */}
            <div className="flex rounded-xl border border-[#494847]/20 bg-[#1a1919] p-1.5 overflow-x-auto">
              {FILTER_LABELS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setFilter(entry)}
                  className={`flex-1 rounded-lg py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap px-2 ${
                    filter === entry ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>

            {/* Other Players List */}
            <section className="space-y-3">
              {otherPlayers.map((player) => (
                <div
                  key={player.rank}
                  className={`group flex items-center justify-between rounded-xl border p-4 transition-all hover:bg-[#201f1f] ${
                    player.isSelf
                      ? 'border-[#fcc025] bg-[#1a1919] shadow-[0_0_30px_rgba(252,192,37,0.1)]'
                      : 'border-[#494847]/10 bg-[#1a1919]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-6 text-[10px] font-black ${player.isSelf ? 'text-[#fcc025]' : 'text-[#494847]'}`}>
                      {player.rank}
                    </span>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold uppercase ${
                      player.isSelf
                        ? 'border border-[#fcc025]/30 bg-[#262626] text-[#fcc025]'
                        : 'bg-[#262626] text-white'
                    }`}>
                      {player.name.charAt(0)}
                    </div>
                    <div>
                      <p className={`text-[11px] font-black uppercase ${player.isSelf ? 'text-[#fcc025]' : 'text-white'}`}>
                        {player.name}
                      </p>
                      {player.isSelf && (
                        <p className="text-[9px] font-bold uppercase tracking-tighter text-[#adaaaa]">
                          {t('leaderboard.you')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black italic tracking-tighter ${player.isSelf ? 'text-[#fcc025]' : 'text-white'}`}>
                      {formatNumber(player.winnings, 'short')} ZXC
                    </p>
                  </div>
                </div>
              ))}

              {/* Self Entry (if not in otherPlayers) */}
              {selfEntry && !otherPlayers.find(p => p.isSelf) && (
                <div className="relative flex items-center justify-between overflow-hidden rounded-xl border-2 border-[#fcc025] bg-[#1a1919] p-5 shadow-[0_0_30px_rgba(252,192,37,0.1)]">
                  <div className="absolute right-0 top-0 p-2">
                    <span className="rounded-sm bg-[#fcc025] px-1.5 py-0.5 text-[8px] font-black uppercase text-black">
                      {t('leaderboard.you')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="w-6 text-[11px] font-black text-[#fcc025]">{selfEntry.rank}</span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#fcc025]/30 bg-[#262626] text-xs font-bold uppercase text-[#fcc025]">
                      {selfEntry.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase text-white">{selfEntry.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black italic tracking-tighter text-[#fcc025]">
                      {formatNumber(selfEntry.winnings, 'short')} ZXC
                    </p>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {otherPlayers.length === 0 && !selfEntry && (
                <div className="py-10 text-center">
                  <p className="text-[#adaaaa] text-sm">{t('leaderboard.no_data')}</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
