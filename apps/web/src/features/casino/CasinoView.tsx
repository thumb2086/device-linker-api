import { useParams } from 'react-router-dom';
import { RouletteView } from './RouletteView';
import { HorseRacingView } from './HorseRacingView';
import { SlotsView } from './SlotsView';
import { CoinflipView } from './CoinflipView';
import { SicboView } from './SicboView';
import { BingoView } from './BingoView';
import { DuelView } from './DuelView';

export default function CasinoView() {
  const { game } = useParams();

  const renderGame = () => {
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
      default:
        return (
          <div className="p-12 text-center">
            <h2 className="text-2xl font-bold text-slate-400">遊戲 {game} 正在開發中...</h2>
            <p className="mt-4 text-slate-500">請稍後再試，或嘗試其他熱門遊戲。</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <h2 className="text-xl font-bold uppercase tracking-widest text-slate-300">
          CASINO <span className="text-yellow-500">/ {game}</span>
        </h2>
      </div>
      {renderGame()}
    </div>
  );
}
