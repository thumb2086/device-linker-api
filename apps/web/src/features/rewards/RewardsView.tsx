import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function RewardsView() {
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

  const catalog = rewardsQuery.data?.catalog;

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4">
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-8 rounded-2xl border border-white/10 shadow-xl text-white">
        <h2 className="text-4xl font-bold mb-2">獎勵中心</h2>
        <p className="opacity-70">領取每日活動與購買限時稱號</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h3 className="text-xl font-bold text-slate-300 border-l-4 border-yellow-500 pl-3 uppercase tracking-wider">限時活動</h3>
          <div className="space-y-3">
            {catalog?.campaigns?.map((c: any) => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 p-6 rounded-xl flex justify-between items-center">
                <div>
                  <div className="font-bold text-lg text-white">{c.title}</div>
                  <div className="text-sm text-yellow-500/80">獎勵：{c.rewards.tokens} ZXC</div>
                </div>
                <button
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg transition-all"
                  onClick={() => claimMutation.mutate(c.id)}
                  disabled={claimMutation.isPending}
                >
                  {claimMutation.isPending ? '領取中...' : '立即領取'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-bold text-slate-300 border-l-4 border-blue-500 pl-3 uppercase tracking-wider">稱號商店</h3>
          <div className="grid grid-cols-1 gap-3">
            {catalog?.titles?.map((t: any) => (
              <div key={t.id} className="bg-slate-900/40 border border-slate-800 p-6 rounded-xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="font-bold text-lg text-white">{t.name}</div>
                  <span className={`text-[10px] px-2 py-1 rounded uppercase font-black ${t.rarity === 'legendary' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {t.rarity}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-slate-400 font-mono">{parseFloat(t.price).toLocaleString()} ZXC</div>
                  <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold border border-slate-700">
                    購買
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
