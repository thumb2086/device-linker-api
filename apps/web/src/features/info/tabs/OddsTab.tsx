import { useState } from 'react';
import { CheckCircle2, Dice5, HelpCircle, Shield } from 'lucide-react';

interface GameOdds {
  key: string;
  name: string;
  rtp: number;
  houseEdge: number;
  description: string;
  payout: string;
  probability: string;
  fairness: string;
}

const GAME_ODDS: GameOdds[] = [
  { key: 'coinflip', name: '擲硬幣', rtp: 98.0, houseEdge: 2.0, description: '最簡單 2 選 1。選正面或反面，回合開獎固定一面。', payout: '猜中 2.0x；猜錯 0x。', probability: '正/反各 50%。', fairness: '以 roundId 雜湊值偶奇決定 heads / tails，可重算驗證。' },
  { key: 'roulette', name: '輪盤', rtp: 97.3, houseEdge: 2.7, description: '歐式 37 格（0-36），可同時下多個注種，系統會加總派彩倍率。', payout: '單號中 35x；紅黑/單雙/大小中 2x。', probability: '單號 1/37（2.70%）；紅黑 18/37（48.65%）。', fairness: '中獎號碼由 roundId 雜湊後取模 37 產生。' },
  { key: 'sicbo', name: '骰寶', rtp: 96.0, houseEdge: 4.0, description: '3 顆骰子，支援「大 / 小」與「指定總和」下注。', payout: '大/小中 2x；總和精準命中 6x。', probability: '大 107/216（49.54%）；小 107/216（49.54%）；總和依點數分布。', fairness: '同一回合由雜湊拆分出 3 顆骰點，結果可追溯。' },
  { key: 'slots', name: '老虎機', rtp: 94.0, houseEdge: 6.0, description: '7 種符號 3 軸，三軸獨立。中獎看三連或任意對子。', payout: '777 三連 50x；其他三連 10x；任意對子 2x。', probability: '任意三連 7/343（2.04%）；任意對子 126/343（36.73%）。', fairness: '3 軸結果由同一 seed 的不同位段計算，規則固定。' },
  { key: 'horse', name: '賽馬', rtp: 95.0, houseEdge: 5.0, description: '6 匹馬固定倍率，系統依權重抽中一匹勝馬。', payout: '赤焰 1.8x、雷霆 2.2x、幻影 2.9x、夜刃 4.0x、霜牙 5.8x、流星 8.5x。', probability: '依倍率作為權重抽樣（高倍率馬中獎率相對較高）。', fairness: '開獎使用固定權重 + 回合 seed，無人工干預。' },
  { key: 'shoot_dragon_gate', name: '射龍門', rtp: 96.3, houseEdge: 3.7, description: '先開左右門牌，再開中間牌。中間牌落在兩門之間即贏。', payout: '中間牌落在區間內 2x；柱倒/區間外 0x；同門牌退回本金 1x。', probability: '依三張牌點數關係決定（每局固定三次抽牌）。', fairness: '左右門與中牌皆由同局隨機流程獨立抽出。' },
  { key: 'blackjack', name: '21 點', rtp: 99.0, houseEdge: 1.0, description: '支援 start / hit / stand；莊家規則固定（小於 17 補牌）。', payout: 'Blackjack 1.5x；一般獲勝 1x；和局退回本金 1x。', probability: '與當前手牌決策相關，非固定單一勝率。', fairness: '每張牌透過 seed + index 生成，重播可還原。' },
  { key: 'crash', name: '暴漲', rtp: 96.0, houseEdge: 4.0, description: '倍率隨時間成長，玩家在爆點前 cashout 即依當前倍數派彩。', payout: '派彩 = 下注 × 當前倍數（若已爆點則 0x）。', probability: '爆點使用 0.99/(1-r)^0.05 公式，長尾分布。', fairness: '爆點由回合 hash 推導，不可於開局後修改。' },
  { key: 'duel', name: '對決', rtp: 97.5, houseEdge: 2.5, description: '雙方各選正反，一次開幣決勝。系統以玩家為 p1。', payout: 'p1 勝利 1.96x；失敗 0x；同選或平局退回本金 1x。', probability: '在雙方選擇對立時，單局勝率 50%。', fairness: '勝負由單次雜湊硬幣決定，規則固定。' },
  { key: 'bingo', name: '賓果', rtp: 93.0, houseEdge: 7.0, description: '玩家自選 1~10 號，系統每局開出 30 個中獎號。', payout: '中 5→1x、中 6→2x、中 7→5x、中 8→10x、中 9→20x、中 10→100x。', probability: '命中數服從超幾何分布（選號越多，命中高階機率越高）。', fairness: '每局由 round hash 連續擴展出 30 個不重複號碼。' },
  { key: 'poker', name: '撲克', rtp: 97.0, houseEdge: 3.0, description: '固定 5 張牌評分牌型，依牌型給倍率。', payout: '同花順 50x、四條 20x、葫蘆 10x、同花 6x、順子 4x、三條 3x、兩對 2x、一對 1x、皇家同花順 100x。', probability: '牌型機率依 5 張牌組合而定（高倍牌型機率極低）。', fairness: '5 張牌皆由同 seed 分 index 抽出，結果可驗證。' },
  { key: 'bluffdice', name: '吹牛骰', rtp: 98.0, houseEdge: 2.0, description: '目前預設以目標總點 18 計算 5 顆骰總和差距。', payout: '差 0 點 5x；差 1~2 點 2x；差 3~4 點 1x；其餘 0x。', probability: '5 顆骰總和分布近似鐘形，18 附近機率最高。', fairness: '5 顆骰由 seed + action 一次生成，派彩公式固定。' },
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

      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">手續費與等級優惠</h2>
        <p className="mt-3 text-sm font-bold leading-relaxed text-[#adaaaa]">
          遊戲手續費採統一公式：<span className="text-emerald-400">手續費 = 下注金額 × 2% × (1 - 等級折扣率)</span>。
          等級折扣率依會員等級計算，最高可到 <span className="text-[#fcc025]">100%</span>（等於遊戲手續費 0）。
        </p>
        <ul className="mt-3 space-y-2 text-xs font-bold text-[#adaaaa]">
          <li>• 普通會員：折扣 0%（實收 2.00%）</li>
          <li>• 白銀會員：折扣 10%（實收 1.80%）</li>
          <li>• 黃金會員：折扣 20%（實收 1.60%）</li>
          <li>• 鑽石等級：折扣 50%（實收 1.00%）</li>
          <li>• 創世等級以上：折扣 100%（實收 0%）</li>
        </ul>
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
                <div className="rounded-lg bg-[#0e0e0e] p-3">
                  <p className="text-xs font-bold text-[#fcc025]">🎯 派彩規則：{game.payout}</p>
                  <p className="mt-1 text-xs font-bold text-[#adaaaa]">📊 機率重點：{game.probability}</p>
                </div>
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
