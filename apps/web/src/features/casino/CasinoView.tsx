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

const VIP_LOCKED_GAMES = new Set(['poker', 'bluffdice']);

const GAME_LABELS: Record<string, { zh: string; en: string }> = {
  roulette: { zh: '\u8f2a\u76e4', en: 'Roulette' },
  horse: { zh: '\u8cfd\u99ac', en: 'Horse Racing' },
  slots: { zh: '\u8001\u864e\u6a5f', en: 'Slots' },
  coinflip: { zh: '\u731c\u786c\u5e63', en: 'Coinflip' },
  sicbo: { zh: '\u9ab0\u5bf6', en: 'Sicbo' },
  bingo: { zh: '\u8cd3\u679c', en: 'Bingo' },
  duel: { zh: '\u5c0d\u6c7a', en: 'Duel' },
  blackjack: { zh: '21 \u9ede', en: 'Blackjack' },
  dragon: { zh: '\u5c04\u9f8d\u9580', en: 'Shoot Dragon Gate' },
  poker: { zh: '\u64b2\u514b', en: 'Poker' },
  bluffdice: { zh: '\u5439\u725b', en: 'Bluff Dice' },
  crash: { zh: '\u66b4\u885d', en: 'Crash' },
};

export default function CasinoView() {
  const { game } = useParams();
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const currentGameLabel = game ? (isZh ? GAME_LABELS[game]?.zh : GAME_LABELS[game]?.en) : '';

  const renderGame = () => {
    if (game && VIP_LOCKED_GAMES.has(game)) {
      return (
        <div className="space-y-4 rounded-2xl border border-[#fcc025]/15 bg-[#1a1919] p-20 text-center">
          <div className="inline-flex rounded-full border border-[#fcc025]/25 bg-[#fcc025]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#fcc025]">
            VIP
          </div>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#fcc025]">
            {isZh ? 'VIP \u904a\u6232\u5c1a\u672a\u958b\u653e' : 'VIP Game Not Available Yet'}
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
            {isZh
              ? '\u64b2\u514b\u8207\u5439\u725b\u6703\u5728 VIP \u7cfb\u7d71\u5b8c\u6210\u5f8c\u958b\u653e\u3002'
              : 'Poker and Bluff Dice will unlock after the VIP system is ready.'}
          </p>
          <Link
            to="/app/casino/lobby"
            className="mt-8 inline-block rounded-xl bg-[#fcc025] px-8 py-3 font-black uppercase italic tracking-tighter text-black transition-colors hover:bg-white"
          >
            {isZh ? '\u8fd4\u56de\u5927\u5ef3' : 'Return to Floor'}
          </Link>
        </div>
      );
    }

    switch (game) {
      case 'roulette':
        return <RouletteView />;
      case 'horse':
        return <HorseRacingView />;
      case 'slots':
        return <SlotsView />;
      case 'coinflip':
        return <CoinflipView />;
      case 'sicbo':
        return <SicboView />;
      case 'bingo':
        return <BingoView />;
      case 'duel':
        return <DuelView />;
      case 'blackjack':
        return <BlackjackView />;
      case 'dragon':
        return <DragonTigerView />;
      case 'poker':
        return <PokerView />;
      case 'bluffdice':
        return <BluffDiceView />;
      case 'crash':
        return <CrashView />;
      default:
        return (
          <div className="space-y-4 rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-20 text-center">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#494847]">
              {isZh ? '\u6b64\u6a21\u64ec\u5c1a\u672a\u958b\u653e' : `Simulation ${game} Unavailable`}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">
              {isZh ? '\u5340\u584a\u5354\u5b9a\u958b\u767c\u4e2d\uff0c\u5f88\u5feb\u90e8\u7f72\u3002' : 'Protocol development in progress. Deploying soon.'}
            </p>
            <Link
              to="/app/casino/lobby"
              className="mt-8 inline-block rounded-xl bg-[#fcc025] px-8 py-3 font-black uppercase italic tracking-tighter text-black transition-colors hover:bg-white"
            >
              {isZh ? '\u8fd4\u56de\u5927\u5ef3' : 'Return to Floor'}
            </Link>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="app-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <Link to="/app/casino/lobby" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </Link>
            <div className="flex items-center gap-2">
              <LayoutGrid size={16} className="text-[#fcc025]" />
              <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
                {t('casino.title')} <span className="text-[#494847]">/ {currentGameLabel || game}</span>
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="app-shell pt-24">{renderGame()}</main>
    </div>
  );
}
