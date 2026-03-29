import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Flame, LayoutGrid, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import AppBottomNav from '../../components/AppBottomNav';

type GameCard = {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
};

type RoomState = {
  id: string;
  game: string;
  players: Array<{ userId: string }>;
};

export default function RoomLobbyView() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  const games: GameCard[] = [
    { id: 'coinflip', name: 'Coinflip', nameZh: '\u78b0\u78bc', icon: '\ud83e\ude99' },
    { id: 'slots', name: 'Slots', nameZh: '\u8001\u864e\u6a5f', icon: '\ud83c\udfb0' },
    { id: 'roulette', name: 'Roulette', nameZh: '\u8f2a\u76e4', icon: '\ud83c\udfa1' },
    { id: 'blackjack', name: 'Blackjack', nameZh: '21 \u9ede', icon: '\ud83c\udccf' },
    { id: 'horse', name: 'Horse Racing', nameZh: '\u8cfd\u99ac', icon: '\ud83c\udfa0' },
    { id: 'dragon', name: 'Dragon Tiger', nameZh: '\u9f8d\u864e', icon: '\ud83d\udc09' },
    { id: 'sicbo', name: 'Sicbo', nameZh: '\u9ab0\u5bf6', icon: '\ud83c\udfb2' },
    { id: 'bingo', name: 'Bingo', nameZh: '\u8cd3\u679c', icon: '\ud83c\udfb1' },
    { id: 'crash', name: 'Crash', nameZh: '\u66b4\u885d', icon: '\ud83d\udcc8' },
    { id: 'duel', name: 'Duel', nameZh: '\u5c0d\u6c7a', icon: '\u2694\ufe0f' },
    { id: 'poker', name: 'Poker', nameZh: '\u64b2\u514b', icon: '\ud83c\udccf' },
    { id: 'bluffdice', name: 'Bluff Dice', nameZh: '\u5439\u725b', icon: '\ud83c\udfb2' },
  ];

  const zh = {
    highStakes: '\u9ad8\u984d\u5834',
    featuredTitle: '\u738b\u724c\u8cfd\u99ac',
  };

  const roomsQuery = useQuery({
    queryKey: ['game-rooms'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/games/rooms');
      return (res.data?.data?.rooms || []) as RoomState[];
    },
    refetchInterval: 15000,
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

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <LayoutGrid className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">{t('casino.title')}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-6 pt-24">
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
          {renderedGames.map((game) => (
            <Link
              key={game.id}
              to={`/app/casino/${game.id}`}
              className="group relative overflow-hidden rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 transition-all hover:bg-[#262626]"
            >
              {game.hot && (
                <div className="absolute right-0 top-0 p-3">
                  <div className="h-2 w-2 animate-ping rounded-full bg-[#fcc025]" />
                </div>
              )}
              <div className="flex flex-col items-center space-y-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#494847]/20 bg-[#0e0e0e] text-4xl transition-transform duration-300 group-hover:scale-110">
                  <span className="drop-shadow-[0_0_12px_rgba(252,192,37,0.2)]">{game.icon}</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-tight text-white transition-colors group-hover:text-[#fcc025]">
                    {isZh ? game.nameZh : game.name}
                  </h3>
                  <div className="mt-2 flex items-center justify-center gap-1.5">
                    <Users size={10} className="text-[#adaaaa]" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#adaaaa]">
                      {game.players} {t('casino.active_players')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-[#fcc025] transition-transform group-hover:scale-x-100" />
            </Link>
          ))}
        </section>
      </main>

      <AppBottomNav current="casino" />
    </div>
  );
}
