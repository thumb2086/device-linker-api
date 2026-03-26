import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export default function AdminView() {
  const queryClient = useQueryClient();
  const [maintMode, setMaintMode] = useState(false);
  const [blacklistAddr, setBlacklistAddr] = useState('');

  const healthQuery = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ops/health');
      const data = await res.json();
      return data.data;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ops/events');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 5000,
  });

  const maintMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
        await fetch('/api/v1/admin/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['admin-health'] });
    }
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4">
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">管理中心</h2>
          <p className="text-slate-500">系統維護、資產管理與監控看板</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase font-black">System Status</div>
                <div className={`font-bold ${healthQuery.data?.status === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                    {healthQuery.data?.status?.toUpperCase() || 'OFFLINE'}
                </div>
            </div>
            <button
                className={`px-4 py-2 rounded-lg font-bold text-sm ${healthQuery.data?.maintenance ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                onClick={() => maintMutation.mutate(!healthQuery.data?.maintenance)}
            >
                {healthQuery.data?.maintenance ? '解除維護' : '開啟維護'}
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Operations Summary */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                  <span className="font-bold text-slate-300">即時營運事件 (Structured Events)</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-black">LIVE</span>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-600 sticky top-0">
                        <tr>
                            <th className="p-3">時間</th>
                            <th className="p-3">來源</th>
                            <th className="p-3">類型</th>
                            <th className="p-3">內容</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {eventsQuery.data?.events?.map((ev: any) => (
                            <tr key={ev.id} className="hover:bg-slate-800/50 transition-colors">
                                <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(ev.createdAt).toLocaleTimeString()}</td>
                                <td className="p-3 font-mono text-blue-400">{ev.source}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ev.severity === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-slate-800 text-slate-400'}`}>
                                        {ev.kind}
                                    </span>
                                </td>
                                <td className="p-3 text-slate-300">{ev.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
          </div>

          {/* Quick Actions / Management */}
          <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                  <h3 className="font-bold text-white">黑名單管理</h3>
                  <input
                    type="text"
                    placeholder="錢包地址 0x..."
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white font-mono text-sm"
                    value={blacklistAddr}
                    onChange={(e) => setBlacklistAddr(e.target.value)}
                  />
                  <button className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition-all">
                      加入黑名單
                  </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
                  <h3 className="font-bold text-white">手動獎勵發放</h3>
                  <div className="space-y-2">
                      <input type="text" placeholder="目標地址" className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-sm text-white font-mono" />
                      <select className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-sm text-slate-400">
                          <option>選擇獎勵類型</option>
                          <option>稱號: 傳奇賭神</option>
                          <option>道具: 稀有寶箱</option>
                          <option>1,000,000 ZXC</option>
                      </select>
                  </div>
                  <button className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg transition-all">
                      確認發放
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}
