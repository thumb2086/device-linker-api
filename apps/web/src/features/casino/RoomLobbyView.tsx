import { useMemo } from 'react';
import { ChevronRight, Flame, LayoutGrid, Lock, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import AppBottomNav from '../../components/AppBottomNav';
import { useAuth } from '../auth/useAuth';

type GameCard = {
  id: string;
  name: string;
  nameZh: string;
  icon: string | string[];
  vipOnly?: boolean;
};

type RoomState = {
  id: string;
  game: string;
  players: Array<{ userId: string }>;
};

export default function RoomLobbyView() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const navigate = useNavigate();
  const { session } = useAuth();

  const games: GameCard[] = [
    { id: 'coinflip', name: 'Coinflip', nameZh: '猜硬幣', icon: '🪙' },
    { id: 'slots', name: 'Slots', nameZh: '老虎機', icon: '🎰' },
    { id: 'roulette', name: 'Roulette', nameZh: '輪盤', icon: '🎡' },
    { id: 'blackjack', name: 'Blackjack', nameZh: '21 點', icon: '🃏' },
    { id: 'horse', name: 'Horse Racing', nameZh: '賽馬', icon: '🏇' },
    { id: 'dragon', name: 'Shoot Dragon Gate', nameZh: '射龍門', icon: ['龍', '門'] },
    { id: 'sicbo', name: 'Sicbo', nameZh: '骰寶', icon: '🎲' },
    { id: 'bingo', name: 'Bingo', nameZh: '賓果', icon: '🎱' },
    { id: 'crash', name: 'Crash', nameZh: '暴衝', icon: '📈' },
    { id: 'duel', name: 'Duel', nameZh: '對決', icon: '⚔️' },
    { id: 'poker', name: 'Poker', nameZh: '撲克', icon: '🃏', vipOnly: true },
    { id: 'bluffdice', name: 'Bluff Dice', nameZh: '吹牛', icon: '🎲', vipOnly: true },
  ];

  const zh = {
    highStakes: '高額場',
    featuredTitle: '王牌賽馬',
    vipOnly: 'VIP 專屬',
    pending: 'VIP 專屬',
    vipLocked: '需 VIP1 (1 YJC)',
    entering: '進入中…',
  };

  const roomsQuery = useQuery({
    queryKey: ['game-rooms'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/games/rooms');
      return (res.data?.data?.rooms || []) as RoomState[];
    },
    refetchInterval: 15000,
  });

  const vipMeQuery = useQuery({
    queryKey: ['vip-me', session?.id],
    enabled: Boolean(session?.id),
    queryFn: async () => {
      const res = await axios.get('/api/v1/vip/me', { params: { sessionId: session?.id } });
      return res.data?.data;
    },
  });

  const hasVip1 = (vipMeQuery.data?.yjcVipTier?.key || 'none') !== 'none';

  const joinRoomMutation = useMutation({
    mutationFn: async ({ roomId }: { roomId: string }) => {
      if (!session?.id) throw new Error('NO_SESSION');
      const res = await axios.post('/api/v1/games/rooms/join', { sessionId: session.id, roomId });
      return res.data;
    },
  });

  const playerCountByGame = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const room of roomsQuery.data || []) {
      const key = String(room.game || '').toLowerCase();
      counts[key] = (counts[key] || 0) + (room.players?.length || 0);
    }
    return counts;
  }, [roomsQuery.data]);

  const renderedGames = useMemo(() => (
    games.map((game) => {
      const players = playerCountByGame[game.id] || 0;
      return {
        ...game,
        players,
        hot: players > 0,
      };
    })
  ), [games, playerCountByGame]);

  const resolveRoomId = (gameId: string) => {
    if (gameId === 'poker') return 'poker_vip';
    if (gameId === 'bluffdice') return 'bluffdice_vip';
    return `${gameId}_01`;
  };

  const handleVipEnter = async (gameId: string) => {
    if (!hasVip1 || joinRoomMutation.isPending) return;
    try {
      await joinRoomMutation.mutateAsync({ roomId: resolveRoomId(gameId) });
      navigate(`/app/casino/${gameId}`);
    } catch {
      // ignore; join error shown by backend message in subsequent page attempts
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="app-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <LayoutGrid className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('casino.title')}</h1>
          </div>
        </div>
      </header>

      <main className="app-shell space-y-10 pt-24">
        <section className="group relative h-[300px] overflow-hidden rounded-3xl">
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <img
            src="https://images.unsplash.com/photo-1543357480-c60d40007a3f?auto=format&fit=crop&q=80&w=2070"
            className="absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-1000 group-hover:scale-105"
            alt="Horse racing"
          />
          <div className="absolute bottom-0 left-0 z-20 space-y-4 p-10">
            <div className="flex items-center gap-2">
              <span className="rounded-sm bg-[#fcc025] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-black">
                {t('casino.featured')}
              </span>
              <div className="flex items-center gap-1.5 text-[#fcc025]">
                <Flame size={14} className="fill-current" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {isZh ? zh.highStakes : 'High Stakes'}
                </span>
              </div>
            </div>
            <h2 className="text-5xl font-black uppercase italic tracking-tighter">
              {isZh ? zh.featuredTitle : 'Elite Horse Racing'}
            </h2>
            <Link
              to="/app/casino/horse"
              className="group flex w-fit items-center gap-3 rounded-xl bg-[#fcc025] px-8 py-3.5 font-black uppercase italic tracking-tighter text-black transition-colors hover:bg-white"
            >
              {t('casino.play_now')}
              <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {renderedGames.map((game) => {
            const locked = Boolean(game.vipOnly && !hasVip1);
            return (
              <div
                key={game.id}
                className={`group relative overflow-hidden rounded-2xl border p-6 transition-all ${
                  game.vipOnly
                    ? 'border-[#fcc025]/15 bg-[#151515] hover:bg-[#1c1b1b]'
                    : 'border-[#494847]/10 bg-[#1a1919] hover:bg-[#262626]'
                }`}
              >
                {game.vipOnly && (
                  <div className="absolute left-3 top-3 rounded-full border border-[#fcc025]/25 bg-[#fcc025]/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#fcc025]">
                    VIP
                  </div>
                )}
                {game.hot && (
                  <div className="absolute right-0 top-0 p-3">
                    <div className="h-2 w-2 animate-ping rounded-full bg-[#fcc025]" />
                  </div>
                )}
                <div className="flex flex-col items-center space-y-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#494847]/20 bg-[#0e0e0e] text-4xl transition-transform duration-300 group-hover:scale-110">
                    {Array.isArray(game.icon) ? (
                      <div className="flex items-center gap-2 text-base font-black text-[#fcc025]">
                        {game.icon.map((label) => (
                          <span
                            key={label}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#fcc025]/25 bg-[#161616] shadow-[0_0_12px_rgba(252,192,37,0.08)]"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="drop-shadow-[0_0_12px_rgba(252,192,37,0.2)]">{game.icon}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-tight text-white transition-colors group-hover:text-[#fcc025]">
                      {isZh ? game.nameZh : game.name}
                    </h3>
                    <div className="mt-2 flex items-center justify-center gap-1.5">
                      <Users size={10} className="text-[#adaaaa]" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#adaaaa]">
                        {game.vipOnly
                          ? (locked ? (isZh ? zh.vipLocked : 'VIP1 required') : (isZh ? zh.pending : 'VIP room'))
                          : `${game.players} ${t('casino.active_players')}`}
                      </span>
                    </div>
                  </div>

                  {game.vipOnly ? (
                    <button
                      type="button"
                      disabled={locked || joinRoomMutation.isPending}
                      onClick={() => handleVipEnter(game.id)}
                      className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[#fcc025]/30 bg-[#121212] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#fcc025] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {locked ? <Lock size={12} /> : <ChevronRight size={12} />}
                      {joinRoomMutation.isPending ? (isZh ? zh.entering : 'Entering...') : (isZh ? '進入房間' : 'Enter Room')}
                    </button>
                  ) : (
                    <Link
                      to={`/app/casino/${game.id}`}
                      className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[#494847]/30 bg-[#121212] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#d7d7d7]"
                    >
                      <ChevronRight size={12} />
                      {isZh ? '開始遊戲' : 'Play'}
                    </Link>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-[#fcc025] transition-transform group-hover:scale-x-100" />
              </div>
            );
          })}
        </section>
      </main>

      <AppBottomNav current="casino" />
    </div>
  );
}
