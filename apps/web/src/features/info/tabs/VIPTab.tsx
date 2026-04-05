import { useMemo, useState } from 'react';
import { ChevronRight, Gift, MessageCircle, Percent, TrendingUp } from 'lucide-react';

interface VipTier {
  name: string;
  threshold: number;
  maxBet: number;
  dailyBonus: number;
  feeDiscount: number;
  danmakuColor: string;
}

const VIP_TIERS: VipTier[] = [
  { name: '新手', threshold: 0, maxBet: 1_000, dailyBonus: 1.0, feeDiscount: 0, danmakuColor: '#a0a0a0' },
  { name: '青銅', threshold: 10_000, maxBet: 5_000, dailyBonus: 1.1, feeDiscount: 5, danmakuColor: '#cd7f32' },
  { name: '白銀', threshold: 100_000, maxBet: 20_000, dailyBonus: 1.25, feeDiscount: 10, danmakuColor: '#c0c0c0' },
  { name: '黃金', threshold: 1_000_000, maxBet: 100_000, dailyBonus: 1.5, feeDiscount: 20, danmakuColor: '#ffd700' },
  { name: '鑽石', threshold: 10_000_000, maxBet: 500_000, dailyBonus: 2.0, feeDiscount: 35, danmakuColor: '#00cfff' },
  { name: '傳奇', threshold: 50_000_000, maxBet: 2_000_000, dailyBonus: 3.0, feeDiscount: 50, danmakuColor: '#ff4fff' },
];

const formatThreshold = (value: number) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
};

export default function VIPTab() {
  const [expandedTier, setExpandedTier] = useState<string | null>('黃金');

  const maxDiscount = useMemo(
    () => Math.max(...VIP_TIERS.map((tier) => tier.feeDiscount)),
    [],
  );
  const maxBonus = useMemo(
    () => Math.max(...VIP_TIERS.map((tier) => tier.dailyBonus)),
    [],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#141414] p-6 shadow-2xl">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">VIP 等級總覽</h2>
        <p className="mt-3 text-sm font-bold leading-relaxed text-[#adaaaa]">
          VIP 依照累積資產與活躍度提升。等級越高，可用單筆下注額度越高，並獲得更好的每日獎勵與市場手續費折扣。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-3">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-[#adaaaa]">最高手續費減免</span>
            </div>
            <p className="mt-1 text-lg font-black text-emerald-400">{maxDiscount}%</p>
          </div>
          <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-3">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-[#fcc025]" />
              <span className="text-[10px] font-bold text-[#adaaaa]">最高每日獎勵倍率</span>
            </div>
            <p className="mt-1 text-lg font-black text-[#fcc025]">{maxBonus.toFixed(1)}x</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">VIP 特權說明</h2>
        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Percent className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">市場手續費折扣</h3>
              <p className="text-xs font-bold text-[#adaaaa]">等級越高，市場交易費率越低，最高可享 50% 折扣。</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fcc025]/10">
              <Gift className="h-4 w-4 text-[#fcc025]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">每日獎勵加成</h3>
              <p className="text-xs font-bold text-[#adaaaa]">每日領取與活動獎勵可依 VIP 倍率提升，最高 3 倍。</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <MessageCircle className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">彈幕與身份識別</h3>
              <p className="text-xs font-bold text-[#adaaaa]">高等級 VIP 會獲得更醒目的聊天室顏色與更高顯示優先度。</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">更高下注上限</h3>
              <p className="text-xs font-bold text-[#adaaaa]">VIP 等級會同步提高遊戲單筆下注上限，方便大額玩家使用。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">等級門檻與配置</h2>
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
                  <p className="text-[10px] font-bold text-[#adaaaa]">門檻資產 {formatThreshold(tier.threshold)}</p>
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
    </div>
  );
}
