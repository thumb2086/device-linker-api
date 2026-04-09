import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, ChevronLeft, ChevronRight, Gift, Percent, MessageCircle, TrendingUp } from 'lucide-react';
import { LEVEL_TIERS } from '@repo/shared';
import AppBottomNav from '../../components/AppBottomNav';

export default function VIPLevelsView() {
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  const formatNumber = (num: number) => {
    if (num >= 1_000_000_000_000) return `${(num / 1_000_000_000_000).toFixed(1)}兆`;
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}億`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}百萬`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
  };


  const gameFeeDiscountByThreshold = (threshold: number) => {
    if (threshold >= 100_000_000_000) return 100;
    if (threshold >= 50_000_000) return 50;
    if (threshold >= 1_000_000) return 20;
    if (threshold >= 100_000) return 10;
    return 0;
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/app" className="text-[#adaaaa] transition-colors hover:text-[#fcc025]">
              <ChevronLeft size={24} />
            </Link>
            <Crown className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              VIP 等級說明
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-24">
        {/* 等級總覽 */}
        <section className="mb-8 rounded-2xl border border-[#494847]/10 bg-gradient-to-br from-[#1a1919] to-[#141414] p-6 shadow-2xl">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
            等級系統總覽
          </h2>
          <p className="mt-3 text-sm font-bold text-[#adaaaa] leading-relaxed">
            共 {LEVEL_TIERS.length} 個等級，從普通會員到神諭十二階。等級依據您的總投注額計算，等級越高享有越多特權。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-3">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-[#adaaaa]">最高折扣</span>
              </div>
              <p className="mt-1 text-lg font-black text-emerald-400">100%</p>
            </div>
            <div className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-3">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-[#fcc025]" />
                <span className="text-[10px] font-bold text-[#adaaaa]">最高倍率</span>
              </div>
              <p className="mt-1 text-lg font-black text-[#fcc025]">8.0x</p>
            </div>
          </div>
        </section>

        {/* 特權說明 */}
        <section className="mb-6 rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
            VIP 特權說明
          </h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Percent className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">遊戲手續費折扣</h3>
                <p className="text-xs font-bold text-[#adaaaa]">
                  依統一規則：普通/青銅 0%、白銀 10%、黃金 20%、鑽石 50%、創世以上 100%
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fcc025]/10">
                <Gift className="h-4 w-4 text-[#fcc025]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">每日紅利倍率</h3>
                <p className="text-xs font-bold text-[#adaaaa]">
                  每日登入紅利依等級倍率發放，最高可達 8 倍
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                <MessageCircle className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">彈幕特權</h3>
                <p className="text-xs font-bold text-[#adaaaa]">
                  專屬彈幕顏色與優先顯示權，高等級會員發言更醒目
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                <TrendingUp className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">單注上限</h3>
                <p className="text-xs font-bold text-[#adaaaa]">
                  等級越高單注上限越高，神諭十二階單注上限高達 10 千兆
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 等級列表 */}
        <section className="space-y-3">
          <h2 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
            完整等級列表
          </h2>
          {LEVEL_TIERS.map((tier, index) => (
            <div
              key={tier.label}
              className={`rounded-xl border p-4 transition-all ${
                index <= 5 
                  ? 'border-[#fcc025]/30 bg-gradient-to-r from-[#fcc025]/5 to-transparent' 
                  : 'border-[#494847]/10 bg-[#1a1919]'
              }`}
            >
              <button
                onClick={() => setExpandedTier(expandedTier === tier.label ? null : tier.label)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-black"
                    style={{ 
                      backgroundColor: `${tier.danmakuColor}20`,
                      color: tier.danmakuColor 
                    }}
                  >
                    {index + 1}
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-white">{tier.label}</h3>
                    <p className="text-[10px] font-bold text-[#adaaaa]">
                      門檻: {formatNumber(tier.threshold)}
                    </p>
                  </div>
                </div>
                <ChevronRight 
                  className={`h-5 w-5 text-[#494847] transition-transform ${
                    expandedTier === tier.label ? 'rotate-90' : ''
                  }`} 
                />
              </button>
              
              {expandedTier === tier.label && (
                <div className="mt-4 space-y-2 border-t border-[#494847]/10 pt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">單注上限</p>
                      <p className="text-sm font-black text-white">{formatNumber(tier.maxBet)}</p>
                    </div>
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">手續費折扣</p>
                      <p className="text-sm font-black text-emerald-400">
                        {gameFeeDiscountByThreshold(tier.threshold)}%
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">紅利倍率</p>
                      <p className="text-sm font-black text-[#fcc025]">
                        {(tier.dailyBonusMultiplier || 1).toFixed(1)}x
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#0e0e0e] p-2">
                      <p className="text-[9px] font-bold text-[#adaaaa]">彈幕顏色</p>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded"
                          style={{ backgroundColor: tier.danmakuColor }}
                        />
                        <span className="text-xs font-bold text-white">{tier.danmakuColor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
