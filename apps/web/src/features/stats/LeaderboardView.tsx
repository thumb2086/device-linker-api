import { useMemo, useState } from 'react';
import { Crown, Loader2, Target, Timer, Trophy, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useUserStore } from '../../store/useUserStore';
import { useLeaderboard, type LeaderboardType } from '../../hooks/useLeaderboard';
import AppBottomNav from '../../components/AppBottomNav';

type LeaderboardCategory = 'winnings' | 'betting' | 'asset';
type FilterLabel = 'WEEKLY' | 'MONTHLY' | 'SEASON' | 'ALL-TIME';

const FILTER_MAP: Record<FilterLabel, LeaderboardType> = {
  WEEKLY: 'week',
  MONTHLY: 'month',
  SEASON: 'season',
  'ALL-TIME': 'all',
};

const FILTER_LABELS: FilterLabel[] = ['WEEKLY', 'MONTHLY', 'SEASON', 'ALL-TIME'];

const getAvatarUrl = (seed: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const getDisplayName = (entry: { displayName: string | null; address: string }) =>
  entry.displayName || `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`;

const getTimeRemaining = (type: LeaderboardType): string => {
  const now = new Date();
  let end: Date;

  switch (type) {
    case 'week': {
      end = new Date(now);
      const day = end.getUTCDay();
      const daysUntilSunday = (7 - day) % 7 || 7;
      end.setUTCDate(end.getUTCDate() + daysUntilSunday);
      end.setUTCHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
      break;
    case 'season': {
      const nextQuarterMonth = (Math.floor(now.getUTCMonth() / 3) + 1) * 3;
      end = new Date(Date.UTC(now.getUTCFullYear(), nextQuarterMonth, 1, 0, 0, 0, 0));
      break;
    }
    default:
      return '';
  }

  const diff = Math.max(0, end.getTime() - now.getTime());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `${days}D ${hours}H ${minutes}M`;
};

export default function LeaderboardView() {
  const { t } = useTranslation();
  const { address } = useUserStore();
  const [category, setCategory] = useState<LeaderboardCategory>('betting');
  const [filter, setFilter] = useState<FilterLabel>('ALL-TIME');

  const currentType: LeaderboardType = useMemo(() => {
    if (category === 'asset') return 'asset';
    if (category === 'winnings') return 'winnings';
    return FILTER_MAP[filter];
  }, [category, filter]);

  const { data, isLoading, error } = useLeaderboard(currentType, 50);

  const categoryTabs = [
    { id: 'winnings' as LeaderboardCategory, icon: Trophy, label: t('leaderboard.tabs.winnings') },
    { id: 'betting' as LeaderboardCategory, icon: Target, label: t('leaderboard.tabs.betting') },
    { id: 'asset' as LeaderboardCategory, icon: Wallet, label: t('leaderboard.tabs.asset') },
  ];

  const metricLabel = category === 'asset'
    ? t('leaderboard.tabs.asset')
    : category === 'winnings'
      ? t('leaderboard.tabs.winnings')
      : t('leaderboard.tabs.betting');

  const { topThree, otherPlayers, selfEntry } = useMemo(() => {
    const entries = data?.entries ?? [];
    const normalized = entries.map((entry) => ({
      rank: entry.rank,
      name: getDisplayName(entry),
      amount: Number(entry.amount ?? 0),
      avatar: getAvatarUrl(entry.displayName || entry.address),
      isSelf: entry.address.toLowerCase() === address?.toLowerCase(),
    }));

    const top = normalized.slice(0, 3);
    const others = normalized.slice(3);
    const rawSelf = data?.selfRank ?? entries.find((entry) => entry.address.toLowerCase() === address?.toLowerCase());

    return {
      topThree: top,
      otherPlayers: others,
      selfEntry: rawSelf
        ? {
            rank: rawSelf.rank,
            name: getDisplayName(rawSelf),
            amount: Number(rawSelf.amount ?? 0),
          }
        : null,
    };
  }, [address, data]);

  const orderedTopThree = useMemo(() => {
    if (topThree.length < 3) return topThree;
    return [topThree[1], topThree[0], topThree[2]].filter(Boolean);
  }, [topThree]);

  const showTimeRemaining = category !== 'asset' && category !== 'winnings' && currentType !== 'all';
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
        {isLoading && (
          <section className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#fcc025]" />
            <p className="mt-4 text-sm text-[#adaaaa]">{t('common.loading')}</p>
          </section>
        )}

        {error && !isLoading && (
          <section className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-red-400">{t('common.error')}</p>
            <p className="mt-2 text-xs text-[#adaaaa]">{error.message}</p>
          </section>
        )}

        {!isLoading && !error && (
          <>
            <section className="flex gap-2">
              {categoryTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setCategory(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 transition-all ${
                      category === tab.id
                        ? 'bg-[#fcc025] text-black'
                        : 'border border-[#494847]/20 bg-[#1a1919] text-[#adaaaa]'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-xs font-black">{tab.label}</span>
                  </button>
                );
              })}
            </section>

            <section className="flex flex-col items-center justify-center space-y-2">
              <div className="flex items-center gap-2 text-[#fcc025] opacity-60">
                <Timer size={14} />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                  {showTimeRemaining ? t('leaderboard.time_remaining') : t('leaderboard.all_time')}
                </span>
              </div>
              <div className="text-3xl font-black italic tracking-tighter text-white shadow-[0_0_30px_rgba(252,192,37,0.1)]">
                {showTimeRemaining ? timeRemaining : '∞'}
              </div>
            </section>

            <section className="flex items-end justify-center gap-4 pt-10">
              {orderedTopThree[0] && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl border-2 border-slate-400">
                      <img src={orderedTopThree[0].avatar} alt={orderedTopThree[0].name} />
                    </div>
                    <div className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-lg bg-slate-400 text-xs font-black text-black">
                      {orderedTopThree[0].rank}
                    </div>
                  </div>
                  <div className="flex h-24 w-20 flex-col items-center justify-center rounded-t-xl border-t border-slate-400/30 bg-gradient-to-t from-[#1a1919] to-slate-400/20 p-2 text-center">
                    <p className="w-full truncate text-[9px] font-black uppercase text-white">{orderedTopThree[0].name}</p>
                    <p className="mt-1 text-[10px] font-black text-slate-400">
                      {formatNumber(orderedTopThree[0].amount, 'short')} ZXC
                    </p>
                  </div>
                </div>
              )}

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
                    <p className="mt-1 text-sm font-black text-[#fcc025]">
                      {formatNumber(orderedTopThree[1].amount, 'short')} ZXC
                    </p>
                  </div>
                </div>
              )}

              {orderedTopThree[2] && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="h-16 w-16 overflow-hidden rounded-2xl border-2 border-amber-700">
                      <img src={orderedTopThree[2].avatar} alt={orderedTopThree[2].name} />
                    </div>
                    <div className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-700 text-xs font-black text-white">
                      {orderedTopThree[2].rank}
                    </div>
                  </div>
                  <div className="flex h-20 w-20 flex-col items-center justify-center rounded-t-xl border-t border-amber-700/30 bg-gradient-to-t from-[#1a1919] to-amber-700/20 p-2 text-center">
                    <p className="w-full truncate text-[9px] font-black uppercase text-white">{orderedTopThree[2].name}</p>
                    <p className="mt-1 text-[10px] font-black text-amber-500">
                      {formatNumber(orderedTopThree[2].amount, 'short')} ZXC
                    </p>
                  </div>
                </div>
              )}
            </section>

            {category !== 'asset' && (
              <div className="flex overflow-x-auto rounded-xl border border-[#494847]/20 bg-[#1a1919] p-1.5">
                {FILTER_LABELS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setFilter(entry)}
                    className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      filter === entry ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'
                    }`}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            )}

            <section className="space-y-3">
              {otherPlayers.map((player) => (
                <div
                  key={`${player.rank}-${player.name}`}
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
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold uppercase ${
                        player.isSelf
                          ? 'border border-[#fcc025]/30 bg-[#262626] text-[#fcc025]'
                          : 'bg-[#262626] text-white'
                      }`}
                    >
                      {player.name.charAt(0)}
                    </div>
                    <div>
                      <p className={`text-[11px] font-black uppercase ${player.isSelf ? 'text-[#fcc025]' : 'text-white'}`}>
                        {player.name}
                      </p>
                      {player.isSelf && (
                        <p className="text-[9px] font-bold uppercase tracking-tighter text-[#adaaaa]">{t('leaderboard.you')}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black italic tracking-tighter ${player.isSelf ? 'text-[#fcc025]' : 'text-white'}`}>
                      {formatNumber(player.amount, 'short')} ZXC
                    </p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[#494847]">{metricLabel}</p>
                  </div>
                </div>
              ))}

              {selfEntry && !otherPlayers.some((player) => player.isSelf) && (
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
                      {formatNumber(selfEntry.amount, 'short')} ZXC
                    </p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[#494847]">{metricLabel}</p>
                  </div>
                </div>
              )}

              {(data?.entries?.length ?? 0) === 0 && (
                <div className="py-16 text-center">
                  <Trophy className="mx-auto mb-4 h-12 w-12 text-[#494847]" />
                  <p className="text-sm font-bold text-[#adaaaa]">{t('leaderboard.no_rankings')}</p>
                  <p className="mt-2 text-xs text-[#494847]">{t('leaderboard.no_data')}</p>
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
