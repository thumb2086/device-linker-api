import { useState } from 'react';
import { CheckCircle2, Dice5, HelpCircle, Shield } from 'lucide-react';

interface GameOdds {
  key: string;
  name: string;
  rtp: number;
  houseEdge: number;
  description: string;
  fairness: string;
}

const GAME_ODDS: GameOdds[] = [
  { key: 'roulette', name: '輪盤', rtp: 97.3, houseEdge: 2.7, description: '支援紅黑、單雙、大小與單號投注，倍率依下注格位變化。', fairness: '結果由伺服器隨機流程產生，開獎後可追溯當期結果。' },
  { key: 'sicbo', name: '骰寶', rtp: 96.0, houseEdge: 4.0, description: '三顆骰子多種押法，含大小、點數、豹子與組合投注。', fairness: '骰點結果固定落盤，每局結算依賠率表執行。' },
  { key: 'bluffdice', name: '吹牛骰', rtp: 98.0, houseEdge: 2.0, description: '低抽水對決型遊戲，節奏快，適合短局對賭。', fairness: '房間制回合有完整下注與結算紀錄。' },
  { key: 'horse', name: '賽馬', rtp: 95.0, houseEdge: 5.0, description: '多匹賽馬依權重與狀態模擬衝線結果。', fairness: '每場開賽前就已鎖定參數與封盤時間，避免中途改盤。' },
  { key: 'dragon', name: '龍虎', rtp: 96.3, houseEdge: 3.7, description: '比大小直觀玩法，適合快速連續下注。', fairness: '對戰雙方結果同源計算，結算規則一致。' },
  { key: 'slots', name: '老虎機', rtp: 94.0, houseEdge: 6.0, description: '高波動遊戲，可能短期連輸，但也有較高倍數獎勵。', fairness: '每次轉動獨立計算，不會受前一局結果影響。' },
  { key: 'coinflip', name: '擲硬幣', rtp: 98.0, houseEdge: 2.0, description: '簡單 50/50 遊戲，倍率透明。', fairness: '正反面機率對稱，唯一差異來自平台抽水。' },
  { key: 'bingo', name: '賓果', rtp: 93.0, houseEdge: 7.0, description: '依號碼與投注組合派彩，玩法較多元。', fairness: '開球與結算順序固定，對所有玩家一致。' },
  { key: 'blackjack', name: '21 點', rtp: 99.0, houseEdge: 1.0, description: '高 RTP 經典玩法，策略選擇會影響實際長期報酬。', fairness: '牌局結構明確，莊閒流程固定。' },
];

export default function OddsTab() {
  const [selectedGame, setSelectedGame] = useState<string | null>('roulette');

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-emerald-400" />
          <h2 className="text-lg font-black text-emerald-400">公平遊戲保證</h2>
        </div>
        <p className="mt-3 text-sm font-bold leading-relaxed text-[#adaaaa]">
          所有遊戲都使用固定規則與可追蹤的回合資料。RTP 代表長期平均回報，不等於單局保證結果，但能作為判斷遊戲期望值的參考。
        </p>
        <div className="mt-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-400">所有 RTP 與派彩邏輯都採固定規則</span>
        </div>
      </section>

      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">什麼是 RTP？</h2>
        <p className="mt-3 text-sm font-bold leading-relaxed text-[#adaaaa]">
          RTP 是玩家回報率。若 RTP 為 97%，代表長期大量局數下，平均每投注 100 元會返還 97 元。剩餘 3% 即為平台優勢。
        </p>
        <div className="mt-4 rounded-lg bg-[#0e0e0e] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#adaaaa]">平台優勢 = 100% - RTP</span>
            <span className="font-black text-[#fcc025]">數值越低越接近玩家友善</span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">各遊戲機率與說明</h2>
        {GAME_ODDS.map((game) => (
          <div key={game.key} className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-4">
            <button
              onClick={() => setSelectedGame(selectedGame === game.key ? null : game.key)}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fcc025]/10">
                  <Dice5 className="h-5 w-5 text-[#fcc025]" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-white">{game.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-400">RTP {game.rtp}%</span>
                    <span className="text-[10px] font-bold text-[#adaaaa]">平台優勢 {game.houseEdge}%</span>
                  </div>
                </div>
              </div>
              <HelpCircle className="h-5 w-5 text-[#494847]" />
            </button>

            {selectedGame === game.key && (
              <div className="mt-4 space-y-3 border-t border-[#494847]/10 pt-4">
                <p className="text-sm font-bold text-[#adaaaa]">{game.description}</p>
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <p className="text-xs font-bold text-emerald-400">
                    <span className="mr-2">公平性</span>
                    {game.fairness}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#0e0e0e] p-2 text-center">
                    <p className="text-[9px] font-bold text-[#adaaaa]">長期回報率</p>
                    <p className="text-lg font-black text-emerald-400">{game.rtp}%</p>
                  </div>
                  <div className="rounded-lg bg-[#0e0e0e] p-2 text-center">
                    <p className="text-[9px] font-bold text-[#adaaaa]">平台優勢</p>
                    <p className="text-lg font-black text-[#ff7351]">{game.houseEdge}%</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
