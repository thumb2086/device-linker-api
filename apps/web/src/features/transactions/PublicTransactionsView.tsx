import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Activity, LayoutGrid, MessageSquareText, Settings, TrendingUp, Wallet } from 'lucide-react';

export default function PublicTransactionsView() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-transactions'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/transactions/public', { params: { limit: 40 } });
      return res.data.data.items as Array<any>;
    },
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Activity className="text-[#fcc025]" />
          <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">Public Transactions</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pt-24">
        <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Latest Market & Wallet Activity</p>
          <div className="mt-4 space-y-3">
            {isLoading && <div className="text-sm text-[#adaaaa]">載入中...</div>}
            {!isLoading && !data?.length && (
              <div className="rounded-xl border border-dashed border-[#494847]/20 p-4 text-sm text-[#adaaaa]">尚無公開交易資料</div>
            )}
            {data?.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white">{item.summary}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#adaaaa]">
                      {item.scope} · {item.maskedAddress}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#fcc025]">{item.kind}</p>
                    <p className="mt-1 text-[10px] font-bold text-[#adaaaa]">{new Date(item.createdAt).toLocaleString('zh-TW')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 h-20 w-full border-t border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-around px-4">
          <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <LayoutGrid size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Casino</span>
          </Link>
          <Link to="/app/market" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <TrendingUp size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Market</span>
          </Link>
          <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <Wallet size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Wallet</span>
          </Link>
          <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <Settings size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Settings</span>
          </Link>
          <Link to="/app/transactions" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
            <MessageSquareText size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Feed</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
