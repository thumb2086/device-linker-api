import React from 'react';
import { Backpack } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import AppBottomNav from '../../components/AppBottomNav';
import { api } from '../../store/api';

export default function BackpackView() {
  const inventory = useQuery({
    queryKey: ['backpack-items'],
    queryFn: async () => {
      const res = await api.get('/api/v1/me/inventory');
      return Array.isArray(res.data.data?.items) ? res.data.data.items : [];
    },
  });

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
          <Backpack className="text-[#fcc025]" />
          <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">Backpack</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-6 pt-24">
        {inventory.isLoading && <p className="text-sm text-[#adaaaa]">Loading items...</p>}
        {!inventory.isLoading && inventory.data?.length === 0 && (
          <div className="rounded-xl border border-[#494847]/20 bg-[#1a1919] p-6 text-sm text-[#adaaaa]">
            目前背包沒有道具。
          </div>
        )}

        {inventory.data?.map((item: any, idx: number) => (
          <div key={item.id || `${item.label || 'item'}-${idx}`} className="rounded-xl border border-[#494847]/20 bg-[#1a1919] p-4">
            <p className="text-sm font-bold text-white">{item.label || item.name || `道具 #${idx + 1}`}</p>
            <p className="mt-1 text-xs text-[#adaaaa]">類型：{item.type || 'general'} · 效果：{item.effect || 'N/A'}</p>
          </div>
        ))}
      </main>

      <AppBottomNav current="none" />
    </div>
  );
}
