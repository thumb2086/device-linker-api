import { useQuery } from '@tanstack/react-query';

export default function HealthView() {
  const { data: healthData, isLoading } = useQuery({
    queryKey: ['health-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/stats/health');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const { data: txData } = useQuery({
      queryKey: ['recent-txs'],
      queryFn: async () => {
        const res = await fetch('/api/v1/stats/recent-txs');
        const data = await res.json();
        return data.data;
      },
      refetchInterval: 10000,
  });

  const stats = healthData?.stats;
  const events = txData?.events || [];

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">全站健康狀態</h2>
            <p className="text-slate-400">即時系統運行與鏈上交易監控</p>
          </div>
          <div className="flex gap-4">
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-black">運行時間</div>
                  <div className="text-xl font-bold text-green-400 font-mono">{stats?.uptime || '---'}</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-black">故障率 (24h)</div>
                  <div className="text-xl font-bold text-blue-400 font-mono">{stats?.failureRate || '---'}</div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
            <h3 className="text-lg font-bold text-white mb-6 border-b border-slate-800 pb-3 uppercase tracking-wider">交易流量 (成功 vs 失敗)</h3>
            <div className="flex items-end gap-1 h-32 mb-4">
                {stats?.last24h?.success.map((val: number, i: number) => (
                    <div key={i} className="flex-1 group relative">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-[8px] text-white px-1 rounded opacity-0 group-hover:opacity-100">{val}</div>
                        <div className="bg-green-500/20 w-full rounded-t" style={{ height: `${(val/50)*100}%` }}></div>
                        <div className="bg-red-500/60 w-full rounded-t -mt-1" style={{ height: `${(stats.last24h.failure[i]/50)*100}%` }}></div>
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                <span>24H AGO</span>
                <span>NOW</span>
            </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
            <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-800 pb-3 uppercase tracking-wider">系統事件實況</h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {events.map((ev: any, i: number) => (
                    <div key={i} className="flex gap-3 text-xs bg-slate-950/40 p-3 rounded-lg border border-slate-800/40">
                        <div className="text-slate-500 font-mono whitespace-nowrap">{new Date(ev.createdAt).toLocaleTimeString([], { hour12: false })}</div>
                        <div className={`font-black ${ev.severity === 'error' ? 'text-red-500' : 'text-blue-400'}`}>[{ev.kind}]</div>
                        <div className="text-slate-300 truncate">{ev.message}</div>
                    </div>
                ))}
                {events.length === 0 && <div className="text-center py-10 text-slate-600 italic">尚無即時數據...</div>}
            </div>
        </div>
      </div>
    </div>
  );
}
