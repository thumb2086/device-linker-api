import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export default function LeaderboardView() {
  const [type, setType] = useState<'total_bet' | 'balance'>('total_bet');

  const { data: lbData, isLoading } = useQuery({
    queryKey: ['leaderboard', type],
    queryFn: async () => {
      const res = await fetch(`/api/v1/stats/leaderboard?type=${type}`);
      const data = await res.json();
      return data.data;
    },
  });

  const entries = lbData?.leaderboard || [];

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center">
        <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">巔峰排行榜</h2>
        <div className="flex justify-center gap-2">
          <button
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${type === 'total_bet' ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400'}`}
            onClick={() => setType('total_bet')}
          >
            下注總額
          </button>
          <button
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${type === 'balance' ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400'}`}
            onClick={() => setType('balance')}
          >
            資產排名
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-950 text-slate-500 text-xs uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4 font-medium">排名</th>
              <th className="px-6 py-4 font-medium">玩家</th>
              <th className="px-6 py-4 font-medium">{type === 'total_bet' ? '累計下注' : '目前資產'}</th>
              <th className="px-6 py-4 font-medium">等級</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 animate-pulse">載入中...</td></tr>
            ) : entries.map((entry: any, i: number) => (
              <tr key={entry.address} className={i === 0 ? 'bg-yellow-500/10 border-l-4 border-yellow-500' : i < 3 ? 'bg-yellow-500/5' : ''}>
                <td className="px-6 py-4 relative">
                  {i === 0 && <div className="absolute top-0 left-0 bg-yellow-500 text-[8px] font-black px-1.5 py-0.5 text-black">榜王</div>}
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${i === 0 ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-orange-400 text-black' : 'text-slate-500'}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{entry.avatar || '👤'}</span>
                    <div>
                      <div className="text-white font-bold">{entry.displayName || entry.address.slice(0, 10) + '...'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{entry.address}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 font-mono text-yellow-500 font-bold">
                  {parseFloat(entry.value).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-slate-400 text-sm">
                  {entry.vipLevel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
