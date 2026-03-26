import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '../../store/useUserStore';

export default function MarketView() {
  const queryClient = useQueryClient();
  const { balance } = useUserStore();
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [quantity, setQuantity] = useState('1');

  const marketQuery = useQuery({
    queryKey: ['market-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/market/summary');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 10000,
  });

  const orderMutation = useMutation({
    mutationFn: async (payload: { symbol: string; qty: number; side: 'buy' | 'sell' }) => {
      const res = await fetch('/api/v1/market/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '交易失敗');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-summary'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const items = marketQuery.data?.items || [];
  const selectedItem = items.find((it: any) => it.symbol === selectedSymbol);

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-3xl font-bold text-white">金融市場</h2>
          <p className="text-slate-400">即時價格模擬與資產交易</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500 uppercase">可用資產</div>
          <div className="text-2xl font-mono font-bold text-yellow-500">{balance} ZXC</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item: any) => (
              <div
                key={item.symbol}
                className={`p-6 rounded-xl border transition-all cursor-pointer ${selectedSymbol === item.symbol ? 'bg-blue-600/10 border-blue-500 ring-1 ring-blue-500' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
                onClick={() => setSelectedSymbol(item.symbol)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-lg text-white">{item.symbol}</div>
                    <div className="text-xs text-slate-500">{item.name}</div>
                  </div>
                  <div className={`text-sm font-bold ${parseFloat(item.change) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(item.change) >= 0 ? '+' : ''}{item.change}%
                  </div>
                </div>
                <div className="text-2xl font-mono font-bold text-white">${item.price}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-800 h-fit space-y-6">
          <h3 className="text-xl font-bold text-white border-b border-slate-800 pb-4">交易終端</h3>

          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">選擇標的</span>
              <span className="text-white font-bold">{selectedSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">目前市價</span>
              <span className="text-white font-bold font-mono">${selectedItem?.price || '0.00'}</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-500 uppercase">交易數量</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white font-mono"
              />
            </div>

            <div className="pt-4 grid grid-cols-2 gap-3">
              <button
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                onClick={() => orderMutation.mutate({ symbol: selectedSymbol, qty: parseFloat(quantity), side: 'buy' })}
                disabled={orderMutation.isPending}
              >
                買入
              </button>
              <button
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                onClick={() => orderMutation.mutate({ symbol: selectedSymbol, qty: parseFloat(quantity), side: 'sell' })}
                disabled={orderMutation.isPending}
              >
                賣出
              </button>
            </div>

            {orderMutation.isError && (
              <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                {orderMutation.error.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
