import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { LayoutGrid, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RouletteView } from './RouletteView';
import { HorseRacingView } from './HorseRacingView';
import { SlotsView } from './SlotsView';
import { CoinflipView } from './CoinflipView';
import { SicboView } from './SicboView';
import { BingoView } from './BingoView';
import { DuelView } from './DuelView';
import { BlackjackView } from './BlackjackView';
import { DragonTigerView } from './DragonTigerView';
import { PokerView } from './PokerView';
import { BluffDiceView } from './BluffDiceView';
import { CrashView } from './CrashView';

export default function CasinoView() {
  const { game } = useParams();
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const gameLabels: Record<string, { zh: string; en: string }> = {
    roulette: { zh: '輪盤', en: 'Roulette' },
    horse: { zh: '賽馬', en: 'Horse Racing' },
    slots: { zh: '老虎機', en: 'Slots' },
    coinflip: { zh: '猜硬幣', en: 'Coinflip' },
    sicbo: { zh: '骰寶', en: 'Sicbo' },
    bingo: { zh: '賓果', en: 'Bingo' },
    duel: { zh: '對決', en: 'Duel' },
    blackjack: { zh: '21點', en: 'Blackjack' },
    dragon: { zh: '射龍門', en: 'Shoot Dragon Gate' },
    poker: { zh: '撲克', en: 'Poker' },
    bluffdice: { zh: '吹牛', en: 'Bluff Dice' },
    crash: { zh: '暴衝', en: 'Crash' },
  };
  const currentGameLabel = game ? (isZh ? gameLabels[game]?.zh : gameLabels[game]?.en) : '';

  const renderGame = () => {
    switch (game) {
      case 'roulette': return <RouletteView />;
      case 'horse': return <HorseRacingView />;
      case 'slots': return <SlotsView />;
      case 'coinflip': return <CoinflipView />;
      case 'sicbo': return <SicboView />;
      case 'bingo': return <BingoView />;
      case 'duel': return <DuelView />;
      case 'blackjack': return <BlackjackView />;
      case 'dragon': return <DragonTigerView />;
      case 'poker': return <PokerView />;
      case 'bluffdice': return <BluffDiceView />;
      case 'crash': return <CrashView />;
      default:
        return (
          <div className="p-20 text-center space-y-4 bg-[#1a1919] rounded-2xl border border-[#494847]/10">
            <h2 className="text-2xl font-black text-[#494847] uppercase italic tracking-tighter">Simulation {game} Unavailable</h2>
            <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">Protocol development in progress. Deploying soon.</p>
            <Link to="/app/casino/lobby" className="inline-block mt-8 px-8 py-3 bg-[#fcc025] text-black rounded-xl font-black uppercase italic tracking-tighter hover:bg-white transition-colors">
               Return to Floor
            </Link>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
             <Link to="/app/casino/lobby" className="text-[#adaaaa] hover:text-[#fcc025] transition-colors">
                <ChevronLeft size={24} />
             </Link>
             <div className="flex items-center gap-2">
                <LayoutGrid size={16} className="text-[#fcc025]" />
                <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">
                   {t('casino.title')} <span className="text-[#494847]">/ {currentGameLabel || game}</span>
                </h1>
             </div>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-7xl mx-auto">
        {renderGame()}
      </main>
    </div>
  );
}
