import {
  Calendar,
  CheckCircle2,
  Gift,
  Star,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppBottomNav from '../../components/AppBottomNav';

const DAILY_REWARDS = [
  { day: 1, amount: '0.1 ZXC', status: 'CLAIMED' },
  { day: 2, amount: '0.2 ZXC', status: 'AVAILABLE' },
  { day: 3, amount: '0.5 ZXC', status: 'LOCKED' },
  { day: 4, amount: '1.0 ZXC', status: 'LOCKED' },
  { day: 5, amount: '2.0 ZXC', status: 'LOCKED' },
  { day: 6, amount: '5.0 ZXC', status: 'LOCKED' },
  { day: 7, amount: '10 ZXC', status: 'LOCKED' },
];

export default function RewardsView() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const queryClient = useQueryClient();

  const rewardsQuery = useQuery({
    queryKey: ['rewards-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/rewards/summary');
      const data = await res.json();
      return data.data;
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch('/api/v1/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards-summary'] });
    },
  });

  const campaigns = rewardsQuery.data?.catalog?.campaigns || [];

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Gift className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              {t('vault.vip_bonus')}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-10 px-6 pt-24">
        <section className="flex flex-col items-center justify-center pt-4">
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-[#fcc025] bg-[#1a1919] shadow-[0_0_50px_rgba(252,192,37,0.2)]">
            <Star size={64} fill="#fcc025" className="text-[#fcc025]" />
          </div>
          <div className="mt-4 rounded-full bg-[#fcc025] px-4 py-1 text-[10px] font-black uppercase tracking-widest text-black shadow-xl">
            Platinum IV
          </div>
          <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.3em] text-[#adaaaa]">
            {isZh ? 'VIP \u7b49\u7d1a\u9032\u5ea6' : 'VIP Tier Progress'}
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full border border-[#494847]/20 bg-[#1a1919]">
            <div className="h-full w-[65%] bg-[#fcc025] shadow-[0_0_10px_#fcc025]" />
          </div>
          <div className="mt-2 flex w-full justify-between text-[9px] font-black uppercase text-[#494847]">
            <span>Gold</span>
            <span>Platinum</span>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Calendar size={16} className="text-[#adaaaa]" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">
              {isZh ? '\u6bcf\u65e5\u734e\u52f5' : 'Daily Rewards'}
            </h3>
          </div>
          <div className="grid grid-cols-4 gap-3 md:grid-cols-7">
            {DAILY_REWARDS.map((reward) => (
              <div
                key={reward.day}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all ${
                  reward.status === 'CLAIMED'
                    ? 'border-emerald-500/20 bg-emerald-500/5 opacity-40'
                    : reward.status === 'AVAILABLE'
                      ? 'border-[#fcc025] bg-[#fcc025]/10 shadow-[0_0_20px_rgba(252,192,37,0.1)]'
                      : 'border-[#494847]/10 bg-[#1a1919]'
                }`}
              >
                <span className="text-[8px] font-black uppercase text-[#adaaaa]">Day {reward.day}</span>
                <div className="text-xs font-black italic">{reward.amount}</div>
                {reward.status === 'CLAIMED' && <CheckCircle2 size={12} className="text-emerald-500" />}
                {reward.status === 'AVAILABLE' && (
                  <button type="button" className="rounded-sm bg-[#fcc025] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-tighter text-black">
                    {isZh ? '\u9818\u53d6' : 'Claim'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Zap size={16} className="text-[#adaaaa]" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">
              {isZh ? '\u76ee\u524d\u4efb\u52d9' : 'Active Quests'}
            </h3>
          </div>
          <div className="space-y-4">
            {campaigns.map((campaign: any) => (
              <div
                key={campaign.id}
                className="group flex items-center justify-between rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 transition-all hover:bg-[#201f1f]"
              >
                <div className="flex-1 space-y-2">
                  <h4 className="text-sm font-bold uppercase tracking-tight text-white transition-colors group-hover:text-[#fcc025]">
                    {campaign.title}
                  </h4>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#fcc025]">
                    Reward: {campaign.rewards.tokens} ZXC
                  </p>
                  <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-[#0e0e0e]">
                    <div className="h-full w-1/2 bg-[#fcc025]/50" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => claimMutation.mutate(campaign.id)}
                  className="rounded-lg bg-[#fcc025] px-6 py-2 text-[10px] font-black uppercase tracking-widest text-black transition-colors hover:bg-white"
                >
                  {isZh ? '\u9818\u53d6\u734e\u52f5' : 'Claim Reward'}
                </button>
              </div>
            ))}

            {!campaigns.length && (
              <div className="rounded-2xl border border-dashed border-[#494847]/20 p-6 text-center text-[11px] font-bold uppercase tracking-widest text-[#adaaaa]">
                {isZh ? '\u76ee\u524d\u6c92\u6709\u555f\u7528\u4e2d\u7684\u4efb\u52d9' : 'No active reward quests'}
              </div>
            )}
          </div>
        </section>
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
