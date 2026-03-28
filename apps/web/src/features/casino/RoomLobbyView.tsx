import React from 'react';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  Users,
  Zap,
  Trophy,
  Settings,
  TrendingUp,
  Wallet,
  Play,
  Flame,
  ChevronRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function RoomLobbyView() {
  const { t } = useTranslation();

  const games = [
    { id: 'coinflip', name: 'Coinflip', nameZh: '擲硬幣', icon: '🪙', players: 124, hot: true },
    { id: 'slots', name: 'Slots', nameZh: '老虎機', icon: '🎰', players: 842, hot: true },
    { id: 'roulette', name: 'Roulette', nameZh: '輪盤', icon: '🎡', players: 215, hot: false },
    { id: 'blackjack', name: 'Blackjack', nameZh: '21點', icon: '🃏', players: 56, hot: false },
    { id: 'horse', name: 'Horse Racing', nameZh: '賽馬', icon: '🏇', players: 312, hot: true },
    { id: 'dragon', name: 'Dragon Tiger', nameZh: '龍虎', icon: '🐉', players: 89, hot: false },
    { id: 'sicbo', name: 'Sicbo', nameZh: '骰寶', icon: '🎲', players: 167, hot: false },
    { id: 'bingo', name: 'Bingo', nameZh: '賓果', icon: '🎱', players: 45, hot: false },
    { id: 'crash', name: 'Crash', nameZh: '暴漲', icon: '📈', players: 631, hot: true },
    { id: 'duel', name: 'Duel', nameZh: '對決', icon: '⚔️', players: 24, hot: false },
    { id: 'poker', name: 'Poker', nameZh: '德州', icon: '🏙️', players: 112, hot: false },
    { id: 'bluffdice', name: 'Bluff Dice', nameZh: '吹牛', icon: '🎲', players: 38, hot: false },
  ];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
             <LayoutGrid className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">{t('casino.title')}</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-7xl mx-auto space-y-10">
        {/* Featured Banner */}
        <section className="relative h-[300px] rounded-3xl overflow-hidden group">
           <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
           <img
             src="https://images.unsplash.com/photo-1511193311914-0346f16efe90?auto=format&fit=crop&q=80&w=2073"
             className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 opacity-60"
             alt="Featured"
           />
           <div className="absolute bottom-0 left-0 p-10 z-20 space-y-4">
              <div className="flex items-center gap-2">
                 <span className="bg-[#fcc025] text-black text-[9px] font-black px-2 py-1 rounded-sm uppercase tracking-widest">{t('casino.featured')}</span>
                 <div className="flex items-center gap-1.5 text-[#fcc025]">
                    <Flame size={14} className="fill-current" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">High Stakes</span>
                 </div>
              </div>
              <h2 className="text-5xl font-black italic tracking-tighter uppercase">Elite Horse Racing</h2>
              <Link to="/app/casino/horse" className="bg-[#fcc025] text-black px-8 py-3.5 rounded-xl font-black uppercase italic tracking-tighter flex items-center gap-3 w-fit hover:bg-white transition-colors group">
                 {t('casino.play_now')}
                 <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
           </div>
        </section>

        {/* Game Grid */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
           {games.map(game => (
             <Link
               key={game.id}
               to={`/app/casino/${game.id}`}
               className="bg-[#1a1919] rounded-2xl p-6 border border-[#494847]/10 hover:bg-[#262626] transition-all group relative overflow-hidden"
             >
                {game.hot && (
                  <div className="absolute top-0 right-0 p-3">
                     <div className="w-2 h-2 rounded-full bg-[#fcc025] animate-ping" />
                  </div>
                )}
                <div className="flex flex-col items-center text-center space-y-4">
                   <div className="text-5xl group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(252,192,37,0.2)]">
                      {game.icon}
                   </div>
                   <div>
                      <h3 className="text-sm font-bold uppercase tracking-tight text-white group-hover:text-[#fcc025] transition-colors">
                        {localStorage.getItem('i18nextLng') === 'zh' ? game.nameZh : game.name}
                      </h3>
                      <div className="flex items-center justify-center gap-1.5 mt-2">
                         <Users size={10} className="text-[#adaaaa]" />
                         <span className="text-[9px] font-bold text-[#adaaaa] uppercase tracking-widest">{game.players} {t('casino.active_players')}</span>
                      </div>
                   </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-[#fcc025] scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
             </Link>
           ))}
        </section>
      </main>

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-2xl border-t border-[#494847]/15 h-20 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex justify-around items-center h-full max-w-2xl mx-auto px-4">
              <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
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
