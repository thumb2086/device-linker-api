import { useState } from 'react';
import { Dice5, HelpCircle, Shield, CheckCircle2 } from 'lucide-react';

interface GameOdds {
  name: string;
  rtp: number;
  houseEdge: number;
  description: string;
  fairness: string;
}

const GAME_ODDS: GameOdds[] = [
  {
    name: '輪盤 (Roulette)',
    rtp: 97.3,
    houseEdge: 2.7,
    description: '歐式輪盤單零設計，紅黑單注賠率 1:1，單號賠率 35:1',
    fairness: '每次旋轉結果由隨機數生成器決定，公開可驗證',
  },
  {
    name: '骰寶 (Sic Bo)',
    rtp: 96.0,
    houseEdge: 4.0,
    description: '三顆骰子點數預測，大小單雙多種玩法',
    fairness: '骰子點數經過加密隨機算法生成，確保公平',
  },
  {
    name: '吹牛骰 (Bluff Dice)',
    rtp: 98.0,
    houseEdge: 2.0,
    description: '心理博弈遊戲，吹牛與抓謊的較量',
    fairness: '雙方骰子獨立生成，系統無法預知結果',
  },
  {
    name: '賽馬 (Horse Racing)',
    rtp: 95.0,
    houseEdge: 5.0,
    description: '模擬賽馬競速，8匹馬不同賠率',
    fairness: '馬匹表現基於歷史數據與隨機因素綜合計算',
  },
  {
    name: '龍虎 (Dragon Tiger)',
    rtp: 96.3,
    houseEdge: 3.7,
    description: '比大小極簡玩法，龍虎和三方下注',
    fairness: '每局獨立發牌，採用多重洗牌算法',
  },
  {
    name: '拉霸 (Slots)',
    rtp: 94.0,
    houseEdge: 6.0,
    description: '多線拉霸，連線獲獎，大獎彩池累積',
    fairness: '轉輪結果由加密隨機數決定，獲獎機率公開',
  },
  {
    name: '幣翻 (Coinflip)',
    rtp: 98.0,
    houseEdge: 2.0,
    description: '簡單正反猜測，50/50 公平對決',
    fairness: '正反面機率嚴格 50%，區塊鏈可驗證隨機數',
  },
  {
    name: '賓果 (Bingo)',
    rtp: 93.0,
    houseEdge: 7.0,
    description: '數字連線遊戲，多人同樂',
    fairness: '數字球隨機抽取，過程公開透明',
  },
  {
    name: '百家樂 (Baccarat)',
    rtp: 98.9,
    houseEdge: 1.1,
    description: '經典撲克比點，莊閒對決',
    fairness: '採用標準 8 副牌，洗牌算法經過審計',
  },
  {
    name: '21點 (Blackjack)',
    rtp: 99.0,
    houseEdge: 1.0,
    description: '最接近 21 點獲勝，可選擇要牌停牌',
    fairness: '標準撲克規則，牌組隨機且不可預測',
  },
];

export default function OddsTab() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* 公平性聲明 */}
      <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-emerald-400" />
          <h2 className="text-lg font-black text-emerald-400">公平遊戲保證</h2>
        </div>
        <p className="mt-3 text-sm font-bold text-[#adaaaa] leading-relaxed">
          所有遊戲採用經過驗證的隨機數生成算法，確保每次遊戲結果公平、公正、不可預測。
          部分遊戲採用區塊鏈可驗證隨機數(VRF)，保證結果無法被操控。
        </p>
        <div className="mt-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-400">所有 RTP 數據均經過第三方審計</span>
        </div>
      </section>

      {/* RTP 說明 */}
      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
          什麼是 RTP？
        </h2>
        <p className="mt-3 text-sm font-bold text-[#adaaaa] leading-relaxed">
          RTP (Return to Player) 表示玩家回報率。例如 97% 的 RTP 表示長期來看，
          每投注 100 元平均會回報 97 元。RTP 越高，對玩家越有利。
        </p>
        <div className="mt-4 rounded-lg bg-[#0e0e0e] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#adaaaa]">賭場優勢 = 100% - RTP</span>
            <span className="font-black text-[#fcc025]">越低越好</span>
          </div>
        </div>
      </section>

      {/* 遊戲機率列表 */}
      <section className="space-y-3">
        <h2 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
          各遊戲機率詳情
        </h2>
        {GAME_ODDS.map((game) => (
          <div
            key={game.name}
            className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-4"
          >
            <button
              onClick={() => setSelectedGame(selectedGame === game.name ? null : game.name)}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fcc025]/10">
                  <Dice5 className="h-5 w-5 text-[#fcc025]" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-white">{game.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-400">
                      RTP {game.rtp}%
                    </span>
                    <span className="text-[10px] font-bold text-[#adaaaa]">
                      優勢 {game.houseEdge}%
                    </span>
                  </div>
                </div>
              </div>
              <HelpCircle className="h-5 w-5 text-[#494847]" />
            </button>

            {selectedGame === game.name && (
              <div className="mt-4 space-y-3 border-t border-[#494847]/10 pt-4">
                <p className="text-sm font-bold text-[#adaaaa]">{game.description}</p>
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <p className="text-xs font-bold text-emerald-400">
                    <span className="mr-2">🛡️</span>
                    {game.fairness}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#0e0e0e] p-2 text-center">
                    <p className="text-[9px] font-bold text-[#adaaaa]">玩家回報率</p>
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

      {/* 負責任博彩 */}
      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
          負責任博彩提醒
        </h2>
        <p className="mt-3 text-sm font-bold text-[#adaaaa] leading-relaxed">
          請注意：博彩有風險，投注需謹慎。所有遊戲結果均由隨機數決定，
          不存在必勝策略。請設定預算上限，理性娛樂。
        </p>
      </section>
    </div>
  );
}
