import React, { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { LEVEL_TIERS, formatNumber } from '@repo/shared';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';

export default function VipView() {
  const profile = useQuery({
    queryKey: ['vip-profile'],
    queryFn: async () => {
      const res = await api.get('/api/v1/me/profile');
      return res.data.data?.profile;
    },
  });

  const currentTierIndex = useMemo(() => {
    const level = profile.data?.vipLevel;
    if (!level) return 0;
    const index = LEVEL_TIERS.findIndex((tier) => tier.label === level);
    return index >= 0 ? index : 0;
  }, [profile.data?.vipLevel]);

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <ShieldCheck className="text-[#fcc025]" />
          <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">VIP Center</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 pt-24">
        <section className="rounded-2xl border border-[#fcc025]/20 bg-[#1a1919] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#fcc025]">Current Tier</p>
          <h2 className="mt-2 text-2xl font-black uppercase italic">
            {profile.data?.vipLevel || LEVEL_TIERS[0].label}
          </h2>
          <p className="mt-2 text-sm text-[#adaaaa]">
            累計押注：{formatNumber(Number(profile.data?.totalBet || 0))} 子熙幣 · 單注上限：{formatNumber(Number(profile.data?.maxBet || LEVEL_TIERS[0].maxBet))} 子熙幣
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#494847]/20 bg-[#1a1919]">
          <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-[#494847]/20 bg-[#141414] p-4 text-[11px] font-bold uppercase tracking-widest text-[#adaaaa]">
            <span>等級</span>
            <span>累計押注門檻</span>
            <span>單注上限</span>
          </div>
          {LEVEL_TIERS.map((tier, index) => {
            const isCurrent = index === currentTierIndex;
            return (
              <div
                key={tier.label}
                className={`grid grid-cols-[1.5fr_1fr_1fr] p-4 text-sm ${isCurrent ? 'bg-[#fcc025]/10 text-[#fcc025]' : 'text-white'} border-b border-[#494847]/10 last:border-none`}
              >
                <span className="font-bold">{tier.label}</span>
                <span>{formatNumber(tier.threshold)}</span>
                <span>{formatNumber(tier.maxBet)}</span>
              </div>
            );
          })}
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
