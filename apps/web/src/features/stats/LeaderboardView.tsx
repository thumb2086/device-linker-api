import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Timer, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useUserStore } from '../../store/useUserStore';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';

type LeaderboardFilter = 'DAILY' | 'WEEKLY' | 'SEASON' | 'HISTORY';

type LeaderboardEntry = {
  rank: number;
  name: string;
  winnings: number;
  winRate: number;
  avatar: string;
  streak: number;
};

type HistoricalKing = {
  season: string;
  name: string;
  title: string;
  streak: number;
  reward: number;
};

const FILTER_TO_TYPE = {
  DAILY: 'balance',
  WEEKLY: 'total_bet',
  SEASON: 'total_bet',
  HISTORY: 'total_bet',
} as const;


function buildAvatar(seed: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

function toLeaderboardEntry(row: any, index: number): LeaderboardEntry {
  const displayName = row?.displayName || row?.display_name || row?.name || row?.address || `PLAYER_${index + 1}`;
  const totalBet = Number(row?.totalBet ?? row?.total_bet ?? 0);
  const balance = Number(row?.balance ?? 0);
  const referenceValue = Math.max(totalBet, balance);
  const winRate = Math.min(99.9, Math.max(10, Number(row?.winRate ?? (45 + (index * 4.2) % 28))));
  return {
    rank: index + 1,
    name: String(displayName),
    winnings: referenceValue,
    winRate: Number(winRate.toFixed(1)),
    avatar: buildAvatar(String(displayName)),
    streak: Math.max(0, Number(row?.streak ?? (index < 3 ? 3 - index : 0))),
  };
}

export default function LeaderboardView() {
  const { t } = useTranslation();
  const { address } = useUserStore();
  const [filter, setFilter] = useState<LeaderboardFilter>('WEEKLY');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoricalKing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserLabel = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'OPERATOR_X';

  useEffect(() => {
    let alive = true;
    const fetchBoard = async () => {
      try {
        setLoading(true);
        setError(null);
        if (filter === 'HISTORY') {
          const response = await api.get('/api/v1/stats/leaderboard/history', { params: { limit: 30 } });
          const rows = response?.data?.data?.history;
          const normalizedHistory = Array.isArray(rows)
            ? rows.map((row: any, idx: number) => {
                const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {};
                return {
                  season: String(raw.season || raw.seasonId || `S${idx + 1}`),
                  name: String(raw.name || raw.winnerName || raw.displayName || 'UNKNOWN'),
                  title: String(raw.title || '歷史榜王'),
                  streak: Number(raw.streak || raw.consecutiveWins || 1),
                  reward: Number(raw.reward || raw.rewardAmount || 0),
                } as HistoricalKing;
              })
            : [];
          if (alive) setHistoryEntries(normalizedHistory);
          if (alive) setEntries([]);
        } else {
          const response = await api.get('/api/v1/stats/leaderboard', {
            params: { type: FILTER_TO_TYPE[filter] },
          });
          const rows = response?.data?.data?.leaderboard;
          const normalized = Array.isArray(rows) ? rows.map((row: any, idx: number) => toLeaderboardEntry(row, idx)) : [];
          if (alive) setEntries(normalized);
        }
      } catch (err: any) {
        if (alive) {
          setError(err?.message || 'Failed to load leaderboard');
          setEntries([]);
          setHistoryEntries([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchBoard();
    return () => {
      alive = false;
    };
  }, [filter]);

  const rankingEntries = useMemo(() => {
    if (entries.length > 0) return entries;
    return [
      { rank: 1, name: 'KRONOS_X', winnings: 1_248_500, avatar: buildAvatar('Kronos'), winRate: 78.4, streak: 3 },
      { rank: 2, name: 'CYBER_PUNK', winnings: 942_100, avatar: buildAvatar('Cyber'), winRate: 72.4, streak: 2 },
      { rank: 3, name: 'NEON_SOUL', winnings: 856_400, avatar: buildAvatar('Neon'), winRate: 69.7, streak: 2 },
      { rank: 4, name: 'BIT_LORD', winnings: 642_100, avatar: buildAvatar('Bit'), winRate: 66.2, streak: 1 },
      { rank: 5, name: 'DATA_MINER', winnings: 589_000, avatar: buildAvatar('Data'), winRate: 63.8, streak: 1 },
      { rank: 6, name: 'SIM_CHAMP', winnings: 412_500, avatar: buildAvatar('Sim'), winRate: 61.2, streak: 0 },
      { rank: 7, name: 'ZERO_COOL', winnings: 398_200, avatar: buildAvatar('Zero'), winRate: 59.3, streak: 0 },
    ];
  }, [entries]);

  const topThree = rankingEntries.slice(0, 3);
  const others = rankingEntries.slice(3);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Trophy className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('leaderboard.title')}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-10 px-6 pt-24">
        <section className="flex flex-col items-center justify-center space-y-2">
          <div className="flex items-center gap-2 text-[#fcc025] opacity-60">
            <Timer size={14} />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{t('leaderboard.season_ends')}</span>
          </div>
          <div className="text-3xl font-black italic tracking-tighter text-white shadow-[0_0_30px_rgba(252,192,37,0.1)]">2D 14H 30M 12S</div>
        </section>

        {filter !== 'HISTORY' && (
          <>
            <section className="flex items-end justify-center gap-4 pt-10">
              {topThree.slice(1).map((player) => (
                <div key={player.rank} className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className={`overflow-hidden rounded-2xl border-2 ${player.rank === 2 ? 'border-slate-400' : 'border-amber-800'} h-16 w-16`}>
                      <img src={player.avatar} alt={player.name} />
                    </div>
                    <div className={`absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${player.rank === 2 ? 'bg-slate-400 text-black' : 'bg-amber-800 text-white'}`}>
                      {player.rank}
                    </div>
                  </div>
                  <div className={`flex h-24 w-20 flex-col items-center justify-center rounded-t-xl border-t p-2 text-center ${player.rank === 2 ? 'border-slate-400/30 bg-gradient-to-t from-[#1a1919] to-slate-400/20' : 'border-amber-800/30 bg-gradient-to-t from-[#1a1919] to-amber-800/20'}`}>
                    <p className="w-full truncate text-[9px] font-black uppercase text-white">{player.name}</p>
                    <p className={`mt-1 text-[10px] font-black ${player.rank === 2 ? 'text-slate-400' : 'text-amber-800'}`}>{formatNumber(player.winnings, 'short')} ZXC</p>
                  </div>
                </div>
              ))}

              {topThree[0] && (
                <div className="-translate-y-4 flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="absolute left-1/2 top-[-2.5rem] -translate-x-1/2 text-[#fcc025]">
                      <Crown size={32} fill="currentColor" />
                    </div>
                    <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-[#fcc025] shadow-[0_0_40px_rgba(252,192,37,0.3)]">
                      <img src={topThree[0].avatar} alt={topThree[0].name} />
                    </div>
                    <div className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-xl bg-[#fcc025] text-sm font-black text-black">1</div>
                  </div>
                  <div className="flex h-32 w-28 flex-col items-center justify-center rounded-t-2xl border-t border-[#fcc025]/30 bg-gradient-to-t from-[#1a1919] to-[#fcc025]/20 p-4 text-center">
                    <p className="w-full truncate text-[11px] font-black uppercase text-white">{topThree[0].name}</p>
                    <p className="mt-1 text-sm font-black text-[#fcc025]">{formatNumber(topThree[0].winnings, 'short')} ZXC</p>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <div className="flex rounded-xl border border-[#494847]/20 bg-[#1a1919] p-1.5">
          {(['DAILY', 'WEEKLY', 'SEASON', 'HISTORY'] as LeaderboardFilter[]).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setFilter(entry)}
              className={`flex-1 rounded-lg py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all ${filter === entry ? 'bg-[#fcc025] text-black shadow-lg' : 'text-[#adaaaa] hover:text-white'}`}
            >
              {entry}
            </button>
          ))}
        </div>

        {loading && <p className="text-center text-xs font-bold uppercase tracking-wider text-[#adaaaa]">Loading leaderboard...</p>}
        {error && <p className="text-center text-xs font-bold uppercase tracking-wider text-red-300">{error}</p>}

        {filter === 'HISTORY' ? (
          <section className="space-y-3">
            {historyEntries.map((king) => (
              <div key={`${king.season}-${king.name}`} className="rounded-xl border border-[#fcc025]/20 bg-[#1a1919] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#fcc025]">{king.season} 歷史榜王</p>
                  <p className="rounded bg-[#fcc025]/10 px-2 py-1 text-[10px] font-bold text-[#fcc025]">連冠 {king.streak}</p>
                </div>
                <p className="text-base font-black uppercase tracking-tight text-white">{king.name}</p>
                <p className="text-xs font-bold text-[#adaaaa]">{king.title} · 季獎勵 {formatNumber(king.reward)} 子熙幣</p>
              </div>
            ))}
            {historyEntries.length === 0 && !loading && !error && (
              <div className="rounded-xl border border-[#494847]/20 bg-[#1a1919] p-4 text-center text-xs font-bold tracking-wider text-[#adaaaa]">
                尚未有歷史榜王資料（SQL 無資料）
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-3">
            {others.map((player) => (
              <div key={player.rank} className="group flex items-center justify-between rounded-xl border border-[#494847]/10 bg-[#1a1919] p-4 transition-all hover:bg-[#201f1f]">
                <div className="flex items-center gap-4">
                  <span className="w-6 text-[10px] font-black text-[#494847]">{player.rank}</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#262626] text-xs font-bold uppercase text-white">{player.name.charAt(0)}</div>
                  <div>
                    <p className="text-[11px] font-black uppercase text-white">{player.name}</p>
                    <p className="text-[9px] font-bold uppercase tracking-tighter text-[#adaaaa]">{t('leaderboard.win_rate')}: {player.winRate}% · 連冠 {player.streak}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black italic tracking-tighter text-white">{formatNumber(player.winnings, 'short')} ZXC</p>
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#fcc025]/30 bg-[#262626] text-xs font-bold uppercase text-[#fcc025]">ME</div>
                <div>
                  <p className="text-[11px] font-black uppercase text-white">{currentUserLabel}</p>
                  <p className="text-[9px] font-bold uppercase tracking-tighter text-[#adaaaa]">{t('leaderboard.win_rate')}: 58.2% · 連冠 0</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black italic tracking-tighter text-[#fcc025]">12.5 ZXC</p>
              </div>
            </div>
          </section>
        )}
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
