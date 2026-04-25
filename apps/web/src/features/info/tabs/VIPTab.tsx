import { useState } from 'react';
import { ChevronRight, Gift, Percent } from 'lucide-react';

interface VipTier {
  name: string;
  threshold: number;
  maxBet: number;
  dailyBonus: number;
  feeDiscount: number;
  danmakuColor: string;
}

const feeDiscountByThreshold = (threshold: number) => {
  if (threshold >= 100_000_000_000) return 100; // 創世等級以上
  if (threshold >= 50_000_000) return 50; // 鑽石等級
  if (threshold >= 1_000_000) return 20; // 黃金會員
  if (threshold >= 100_000) return 10; // 白銀會員
  return 0; // 普通/青銅
};

const VIP_TIERS: VipTier[] = [
  { name: '普通會員', threshold: 0, maxBet: 1_000, dailyBonus: 1.0, feeDiscount: feeDiscountByThreshold(0), danmakuColor: '#a0a0a0' },
  { name: '青銅會員', threshold: 10_000, maxBet: 5_000, dailyBonus: 1.1, feeDiscount: feeDiscountByThreshold(10_000), danmakuColor: '#cd7f32' },
  { name: '白銀會員', threshold: 100_000, maxBet: 20_000, dailyBonus: 1.2, feeDiscount: feeDiscountByThreshold(100_000), danmakuColor: '#c0c0c0' },
  { name: '黃金會員', threshold: 1_000_000, maxBet: 100_000, dailyBonus: 1.3, feeDiscount: feeDiscountByThreshold(1_000_000), danmakuColor: '#ffd700' },
  { name: '白金會員', threshold: 10_000_000, maxBet: 500_000, dailyBonus: 1.4, feeDiscount: feeDiscountByThreshold(10_000_000), danmakuColor: '#e5e4e2' },
  { name: '鑽石等級', threshold: 50_000_000, maxBet: 2_000_000, dailyBonus: 1.5, feeDiscount: feeDiscountByThreshold(50_000_000), danmakuColor: '#b9f2ff' },
  { name: '黑鑽等級', threshold: 100_000_000, maxBet: 10_000_000, dailyBonus: 1.6, feeDiscount: feeDiscountByThreshold(100_000_000), danmakuColor: '#000000' },
  { name: '菁英等級', threshold: 200_000_000, maxBet: 20_000_000, dailyBonus: 1.7, feeDiscount: feeDiscountByThreshold(200_000_000), danmakuColor: '#ff6b6b' },
  { name: '宗師等級', threshold: 500_000_000, maxBet: 50_000_000, dailyBonus: 1.8, feeDiscount: feeDiscountByThreshold(500_000_000), danmakuColor: '#4ecdc4' },
  { name: '王者等級', threshold: 1_000_000_000, maxBet: 100_000_000, dailyBonus: 1.9, feeDiscount: feeDiscountByThreshold(1_000_000_000), danmakuColor: '#ffe66d' },
  { name: '至尊等級', threshold: 2_000_000_000, maxBet: 200_000_000, dailyBonus: 2.0, feeDiscount: feeDiscountByThreshold(2_000_000_000), danmakuColor: '#a8e6cf' },
  { name: '蒼穹等級', threshold: 5_000_000_000, maxBet: 300_000_000, dailyBonus: 2.1, feeDiscount: feeDiscountByThreshold(5_000_000_000), danmakuColor: '#7b68ee' },
  { name: '寰宇等級', threshold: 10_000_000_000, maxBet: 500_000_000, dailyBonus: 2.2, feeDiscount: feeDiscountByThreshold(10_000_000_000), danmakuColor: '#00ced1' },
  { name: '星穹等級', threshold: 20_000_000_000, maxBet: 700_000_000, dailyBonus: 2.3, feeDiscount: feeDiscountByThreshold(20_000_000_000), danmakuColor: '#ff1493' },
  { name: '萬界等級', threshold: 50_000_000_000, maxBet: 850_000_000, dailyBonus: 2.4, feeDiscount: feeDiscountByThreshold(50_000_000_000), danmakuColor: '#ff4500' },
  { name: '創世等級', threshold: 100_000_000_000, maxBet: 900_000_000, dailyBonus: 2.5, feeDiscount: feeDiscountByThreshold(100_000_000_000), danmakuColor: '#ffd700' },
  { name: '神諭等級', threshold: 1_000_000_000_000, maxBet: 1_000_000_000, dailyBonus: 2.6, feeDiscount: feeDiscountByThreshold(1_000_000_000_000), danmakuColor: '#ff00ff' },
  { name: '神諭一階', threshold: 2_000_000_000_000, maxBet: 2_000_000_000, dailyBonus: 2.7, feeDiscount: feeDiscountByThreshold(2_000_000_000_000), danmakuColor: '#ff69b4' },
  { name: '神諭二階', threshold: 5_000_000_000_000, maxBet: 5_000_000_000, dailyBonus: 2.8, feeDiscount: feeDiscountByThreshold(5_000_000_000_000), danmakuColor: '#da70d6' },
  { name: '神諭三階', threshold: 10_000_000_000_000, maxBet: 10_000_000_000, dailyBonus: 2.9, feeDiscount: feeDiscountByThreshold(10_000_000_000_000), danmakuColor: '#ba55d3' },
  { name: '神諭四階', threshold: 20_000_000_000_000, maxBet: 20_000_000_000, dailyBonus: 3.0, feeDiscount: feeDiscountByThreshold(20_000_000_000_000), danmakuColor: '#9370db' },
  { name: '神諭五階', threshold: 50_000_000_000_000, maxBet: 50_000_000_000, dailyBonus: 3.1, feeDiscount: feeDiscountByThreshold(50_000_000_000_000), danmakuColor: '#8a2be2' },
  { name: '神諭六階', threshold: 100_000_000_000_000, maxBet: 100_000_000_000, dailyBonus: 3.2, feeDiscount: feeDiscountByThreshold(100_000_000_000_000), danmakuColor: '#9400d3' },
  { name: '神諭七階', threshold: 200_000_000_000_000, maxBet: 200_000_000_000, dailyBonus: 3.3, feeDiscount: feeDiscountByThreshold(200_000_000_000_000), danmakuColor: '#9932cc' },
  { name: '神諭八階', threshold: 500_000_000_000_000, maxBet: 500_000_000_000, dailyBonus: 3.4, feeDiscount: feeDiscountByThreshold(500_000_000_000_000), danmakuColor: '#8b008b' },
  { name: '神諭九階', threshold: 1_000_000_000_000_000, maxBet: 1_000_000_000_000, dailyBonus: 3.5, feeDiscount: feeDiscountByThreshold(1_000_000_000_000_000), danmakuColor: '#4b0082' },
  { name: '神諭十階', threshold: 2_000_000_000_000_000, maxBet: 2_000_000_000_000, dailyBonus: 3.6, feeDiscount: feeDiscountByThreshold(2_000_000_000_000_000), danmakuColor: '#483d8b' },
  { name: '神諭十一階', threshold: 5_000_000_000_000_000, maxBet: 5_000_000_000_000, dailyBonus: 3.7, feeDiscount: feeDiscountByThreshold(5_000_000_000_000_000), danmakuColor: '#2f4f4f' },
  { name: '神諭十二階', threshold: 10_000_000_000_000_000, maxBet: 10_000_000_000_000, dailyBonus: 3.8, feeDiscount: feeDiscountByThreshold(10_000_000_000_000_000), danmakuColor: '#191970' },
];

const formatThreshold = (value: number) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
};

export default function VIPTab() {
  const [expandedTier, setExpandedTier] = useState<string | null>('VIP 1');
  const [activeTab, setActiveTab] = useState<'member' | 'vip'>('member');

  return (
    <div className="space-y-6">
      {/* 分頁切換 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('member')}
          className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'member'
              ? 'bg-[#fcc025] text-black'
              : 'border border-[#494847]/20 bg-[#1a1919] text-[#adaaaa]'
          }`}
        >
          會員等級 (32級)
        </button>
        <button
          onClick={() => setActiveTab('vip')}
          className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'vip'
              ? 'bg-[#fcc025] text-black'
              : 'border border-[#494847]/20 bg-[#1a1919] text-[#adaaaa]'
          }`}
        >
          VIP 等級 (YJC持有)
        </button>
      </div>

      {activeTab === 'member' && (
        <>
          <section className="rounded-2xl border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#141414] p-6 shadow-2xl">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">會員等級總覽</h2>
            <p className="mt-3 text-sm font-bold leading-relaxed text-[#adaaaa]">
              會員等級依照累積押注量提升。等級越高，可用單筆下注額度越高，並獲得更好的每日獎勵與市場手續費折扣。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-3">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-emerald-400" />
                  <span className="text-[10px] font-bold text-[#adaaaa]">最高手續費減免</span>
                </div>
                <p className="mt-1 text-lg font-black text-emerald-400">100%</p>
              </div>
              <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-3">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-[#fcc025]" />
                  <span className="text-[10px] font-bold text-[#adaaaa]">最高每日獎勵倍率</span>
                </div>
                <p className="mt-1 text-lg font-black text-[#fcc025]">8.0x</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">32 個會員等級</h2>
            {VIP_TIERS.map((tier, index) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-4 transition-all ${
                  index >= 3
                    ? 'border-[#fcc025]/30 bg-gradient-to-r from-[#fcc025]/5 to-transparent'
                    : 'border-[#494847]/10 bg-[#1a1919]'
                }`}
              >
                <button
                  onClick={() => setExpandedTier(expandedTier === tier.name ? null : tier.name)}
                  className="flex w-full items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-black"
                      style={{ backgroundColor: `${tier.danmakuColor}20`, color: tier.danmakuColor }}
                    >
                      {index + 1}
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-white">{tier.name}</h3>
                      <p className="text-[10px] font-bold text-[#adaaaa]">累計押注 {formatThreshold(tier.threshold)}</p>
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-5 w-5 text-[#494847] transition-transform ${expandedTier === tier.name ? 'rotate-90' : ''}`}
                  />
                </button>

                {expandedTier === tier.name && (
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#494847]/10 pt-4">
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">單筆下注上限</p>
                      <p className="text-sm font-black text-white">{formatThreshold(tier.maxBet)}</p>
                    </div>
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">市場費率折扣</p>
                      <p className="text-sm font-black text-emerald-400">{tier.feeDiscount}%</p>
                    </div>
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">每日獎勵倍率</p>
                      <p className="text-sm font-black text-[#fcc025]">{tier.dailyBonus.toFixed(1)}x</p>
                    </div>
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">身份顏色</p>
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded" style={{ backgroundColor: tier.danmakuColor }} />
                        <span className="text-xs font-bold text-white">{tier.danmakuColor}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}

      {activeTab === 'vip' && (
        <>
          <section className="rounded-2xl border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#141414] p-6 shadow-2xl">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">VIP 等級總覽</h2>
            <p className="mt-3 text-sm font-bold leading-relaxed text-[#adaaaa]">
              VIP 等級依照 <span className="text-[#fcc025]">佑件幣 (YJC) 持有量</span> 決定。持有越多，可進入更高級的專屬房間，並享有特殊特權。
            </p>
            <div className="mt-4 rounded-xl border border-[#fcc025]/20 bg-[#0e0e0e] p-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#adaaaa]">VIP 計算公式：</span>
                <span className="text-sm font-bold text-[#fcc025]">YJC 持有量決定 VIP 等級</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">3 個 VIP 等級</h2>
            
            {/* VIP 0 / 未達 VIP */}
            <div className="rounded-xl border border-[#494847]/10 bg-[#1a1919] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#494847]/20 text-sm font-black text-[#adaaaa]">
                  0
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-[#adaaaa]">未達 VIP</h3>
                  <p className="text-[10px] font-bold text-[#494847]">YJC 持有量 0</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[10px] font-bold text-[#adaaaa]">無專屬房間</p>
                </div>
              </div>
            </div>

            {/* VIP 1 */}
            <div className="rounded-xl border border-[#fcc025]/30 bg-gradient-to-r from-[#fcc025]/5 to-transparent p-4">
              <button
                onClick={() => setExpandedTier(expandedTier === 'VIP 1' ? null : 'VIP 1')}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fcc025]/20 text-sm font-black text-[#fcc025]">
                    1
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-[#fcc025]">VIP 1</h3>
                    <p className="text-[10px] font-bold text-[#adaaaa]">持有 1 - 999 YJC</p>
                  </div>
                </div>
                <ChevronRight
                  className={`h-5 w-5 text-[#fcc025] transition-transform ${expandedTier === 'VIP 1' ? 'rotate-90' : ''}`}
                />
              </button>
              {expandedTier === 'VIP 1' && (
                <div className="mt-4 space-y-2 border-t border-[#494847]/10 pt-4">
                  <div className="rounded-lg bg-[#0e0e0e] p-3">
                    <p className="text-[9px] font-bold text-[#adaaaa]">可進入房間</p>
                    <p className="text-sm font-bold text-[#fcc025]">table_1 (VIP 專屬桌)</p>
                  </div>
                  <div className="rounded-lg bg-[#0e0e0e] p-3">
                    <p className="text-[9px] font-bold text-[#adaaaa]">特殊說明</p>
                    <p className="text-xs font-bold text-[#adaaaa]">基礎 VIP 資格，可進入第一級 VIP 專屬遊戲房間</p>
                  </div>
                </div>
              )}
            </div>

            {/* VIP 2 */}
            <div className="rounded-xl border border-[#fcc025]/50 bg-gradient-to-r from-[#fcc025]/10 to-transparent p-4">
              <button
                onClick={() => setExpandedTier(expandedTier === 'VIP 2' ? null : 'VIP 2')}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fcc025] text-sm font-black text-black">
                    2
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-[#fcc025]">VIP 2</h3>
                    <p className="text-[10px] font-bold text-[#adaaaa]">持有 1,000+ YJC</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-emerald-400/30 px-2 py-1 text-[9px] font-bold uppercase text-emerald-400">
                    零手續費
                  </span>
                  <ChevronRight
                    className={`h-5 w-5 text-[#fcc025] transition-transform ${expandedTier === 'VIP 2' ? 'rotate-90' : ''}`}
                  />
                </div>
              </button>
              {expandedTier === 'VIP 2' && (
                <div className="mt-4 space-y-2 border-t border-[#494847]/10 pt-4">
                  <div className="rounded-lg bg-[#0e0e0e] p-3">
                    <p className="text-[9px] font-bold text-[#adaaaa]">可進入房間</p>
                    <p className="text-sm font-bold text-[#fcc025]">table_1, table_2 (全部 VIP 房間)</p>
                  </div>
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                    <p className="text-[9px] font-bold text-emerald-400">⭐ 專屬特權</p>
                    <p className="text-sm font-black text-emerald-400">zero_fee (零手續費)</p>
                    <p className="text-xs font-bold text-[#adaaaa]">市場交易享有零手續費優惠</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
