import React, { useState } from 'react';
import { useMarket } from './useMarket';
import { TrendingUp, TrendingDown, LayoutGrid, LayoutList, History, Banknote, Landmark, Activity, ShoppingCart, Loader2 } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';

export default function MarketView() {
  const { balance } = useUserStore();
  const { snapshot, account, execute } = useMarket();
  const [activeTab, setActiveTab] = useState<'stocks' | 'futures' | 'portfolio'>('stocks');

  const handleAction = async (type: string, payload: any) => {
    try {
      await execute.mutateAsync({ type, ...payload });
      alert('交易成功！');
    } catch (err: any) {
      alert(`交易失敗: ${err.message}`);
    }
  };

  if (snapshot.isLoading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" size={40} /></div>;

  const stocks = snapshot.data?.symbols || {};

  return (
    <div className="market-container max-w-6xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl text-white">
              <Activity size={28} />
            </div>
            全球市場模擬中心
          </h1>
          <p className="text-slate-500 font-medium mt-1">即時行情、資產配置與風險對沖</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">總資產淨值</p>
             <p className="text-xl font-black text-slate-900 tabular-nums">
                {account.data?.netWorth?.toLocaleString() || '0'} <span className="text-[10px] text-slate-400">ZXC</span>
             </p>
          </div>
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">銀行餘額</p>
             <p className="text-xl font-black text-indigo-600 tabular-nums">
                {account.data?.bankBalance?.toLocaleString() || '0'}
             </p>
          </div>
        </div>
      </header>

      <div className="flex w-full mb-8 bg-slate-100 p-1 rounded-2xl">
        {['stocks', 'futures', 'portfolio'].map((t: any) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === t ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'stocks' ? '股票現貨' : t === 'futures' ? '期貨合約' : '我的持倉'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <section className="lg:col-span-3 space-y-6">
          {activeTab === 'stocks' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {Object.entries(stocks).map(([symbol, data]: any) => (
                 <div key={symbol} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                       <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-slate-400 text-lg">
                             {symbol.charAt(0)}
                          </div>
                          <div>
                             <h3 className="font-black text-slate-900 text-lg">{symbol}</h3>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{data.sector || '科技股'}</p>
                          </div>
                       </div>
                       <div className={`text-right ${data.changePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          <p className="text-lg font-black tabular-nums">{data.price.toFixed(2)}</p>
                          <p className="text-[10px] font-bold flex items-center justify-end gap-1 uppercase">
                             {data.changePct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                             {data.changePct.toFixed(2)}%
                          </p>
                       </div>
                    </div>
                    <div className="flex gap-2">
                       <button
                        onClick={() => handleAction('stock_buy', { symbol, quantity: "1" })}
                        className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-colors"
                       >
                         買入
                       </button>
                       <button
                        onClick={() => handleAction('stock_sell', { symbol, quantity: "1" })}
                        className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                       >
                         賣出
                       </button>
                    </div>
                 </div>
               ))}
            </div>
          )}

          {activeTab === 'portfolio' && (
             <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                   <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">標的</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">數量</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">市值</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">未實現盈虧</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {(account.data?.stockPositions || []).map((p: any) => (
                        <tr key={p.symbol} className="hover:bg-slate-50/30 transition-colors">
                           <td className="px-6 py-4 font-black text-slate-900">{p.symbol}</td>
                           <td className="px-6 py-4 text-right font-bold tabular-nums">{p.quantity}</td>
                           <td className="px-6 py-4 text-right font-bold tabular-nums text-slate-600">{p.marketValue.toLocaleString()}</td>
                           <td className={`px-6 py-4 text-right font-black tabular-nums ${p.unrealizedPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {p.unrealizedPnl > 0 ? '+' : ''}{p.unrealizedPnl.toLocaleString()}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          )}
        </section>

        <section className="lg:col-span-1 space-y-6">
           <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100">
              <h3 className="font-black text-lg mb-4 flex items-center gap-2">
                 <Landmark size={20} /> 銀行服務
              </h3>
              <div className="space-y-4">
                 <div className="bg-indigo-700/50 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">可用現金 (ZXC)</p>
                    <p className="text-xl font-black tabular-nums">{account.data?.cash?.toLocaleString() || '0'}</p>
                 </div>
                 <div className="flex gap-2">
                    <button
                      onClick={() => handleAction('bank_deposit', { amount: "10000" })}
                      className="flex-1 py-3 bg-white text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-50 transition-all active:scale-95"
                    >
                      存款 1w
                    </button>
                    <button
                      onClick={() => handleAction('bank_withdraw', { amount: "10000" })}
                      className="flex-1 py-3 bg-indigo-500 text-white rounded-xl text-xs font-black hover:bg-indigo-400 transition-all active:scale-95"
                    >
                      提款 1w
                    </button>
                 </div>
              </div>
           </div>
        </section>
      </div>
    </div>
  );
}
