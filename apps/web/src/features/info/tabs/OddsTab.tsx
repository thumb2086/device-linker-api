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
  { key: 'roulette', name: '輪盤', rtp: 97.3, houseEdge: 2.7, description: '歐式輪盤 37 格（0-36）。單號投注賠率 35:1，紅黑/單雙/大小投注賠率 1:1。綠色 0 為莊家優勢來源。', fairness: 'FNV-1a 雜湊演算法產生中獎號碼，結果可透過種子驗證。' },
  { key: 'sicbo', name: '骰寶', rtp: 96.0, houseEdge: 4.0, description: '三顆六面骰。大小投注（4-10 小，11-17 大）賠率 1:1，總和投注賠率 1:6。三顆骰點數總和決定勝負。', fairness: 'FNV-1a 雜湊產生三顆骰子結果，公開透明。' },
  { key: 'bluffdice', name: '吹牛骰', rtp: 98.0, houseEdge: 2.0, description: '五顆骰子對決遊戲。押中總和區間獲勝，依準確度派彩。低抽水對決型遊戲，節奏快速。', fairness: '五顆骰子結果由雜湊決定，公開可驗證。' },
  { key: 'horse', name: '賽馬', rtp: 95.0, houseEdge: 5.0, description: '六匹賽馬競速。選擇馬匹下注，獲勝馬匹依權重倍率派彩。赤焰 1.8x、雷霆 2.2x、幻影 2.9x、夜刃 4.0x、霜牙 5.8x、流星 8.5x。', fairness: '勝利馬匹由雜湊演算法決定，結果鎖定後不可更改。' },
  { key: 'dragon', name: '龍虎（射龍門）', rtp: 96.3, houseEdge: 3.7, description: '兩張牌開「門」，玩家射出一張牌。若射中兩門之間獲勝，倍率為 12/牌差。柱倒（射中門牌）為 0 倍。', fairness: '三張牌（左門、右門、射牌）皆由雜湊演算法產生，公平可驗證。' },
  { key: 'slots', name: '老虎機', rtp: 94.0, houseEdge: 6.0, description: '三軸老虎機。三同符號獲 10 倍（777 獲 50 倍），兩同符號獲 2 倍。符號：🍒 🍋 🍊 🍇 🔔 💎 7️⃣', fairness: '每個軸獨立由雜湊產生，三軸組合決定結果。' },
  { key: 'coinflip', name: '擲硬幣', rtp: 98.0, houseEdge: 2.0, description: '簡單 50/50 遊戲。選擇正面或反面，猜中獲 1.96 倍（2% 平台抽水），猜錯歸零。', fairness: 'FNV-1a 雜湊末位決定正反面，機率對稱可驗證。' },
  { key: 'bingo', name: '賓果', rtp: 93.0, houseEdge: 7.0, description: '玩家選 5 個號碼（1-75），開出 5 個中獎號碼。中 3 個獲 5 倍，中 4 個獲 20 倍，中 5 個獲 100 倍。', fairness: '中獎號碼由雜湊演算法產生，無法預測。' },
  { key: 'blackjack', name: '21 點', rtp: 99.0, houseEdge: 1.0, description: '經典 Blackjack。莊家 17 點停牌，玩家可選擇 Hit 或 Stand。BlackJack (A+10) 獲 1.5 倍，普通贏家獲 1 倍，和局退注。', fairness: '每張牌由 FNV-1a 雜湊產生，牌局結構透明。' },
  { key: 'crash', name: '暴漲', rtp: 96.0, houseEdge: 4.0, description: '倍率從 1.00x 開始上漲，隨機暴漲結束。玩家在暴漲前停利即可獲得當前倍率。暴漲點由指數分佈決定。', fairness: '暴漲點由雜湊演算法決定，公式：0.99 / (1 - random) ^ 0.05' },
  { key: 'duel', name: '對決', rtp: 97.5, houseEdge: 2.5, description: '兩人對決擲硬幣。一方選正面另一方反面，開出結果決定勝負。贏家拿走雙方下注（扣除 2.5% 手續費）。', fairness: '硬幣結果由雜湊演算法產生，公平對決。' },
  { key: 'poker', name: '德州撲克', rtp: 97.0, houseEdge: 3.0, description: '簡化版德州撲克。發兩張底牌，五張公牌，組成最佳五張牌型。皇家同花順獲 100 倍，同花順 50 倍，四條 20 倍，葫蘆 10 倍。', fairness: '所有牌由 FNV-1a 雜湊產生，牌局結果可驗證。' },
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
