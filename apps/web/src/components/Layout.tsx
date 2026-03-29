import React from 'react';
import { Outlet } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ChatRoom from './ChatRoom';

export default function Layout() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  return (
    <div className="min-h-screen flex flex-col bg-[#0e0e0e] font-['Manrope'] text-white">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 lg:flex-row lg:p-10">
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>

        <aside className="sticky top-32 hidden h-fit w-96 flex-col gap-8 lg:flex">
          <ChatRoom />

          <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-8 shadow-2xl">
            <div className="mb-6 flex items-center gap-3">
              <Bell size={18} className="text-[#fcc025]" />
              <h4 className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#adaaaa]">
                {isZh ? '\u7cfb\u7d71\u7d42\u7aef' : 'System Terminal'}
              </h4>
            </div>
            <div className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] p-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#fcc025]">
                {isZh ? '\u6a21\u64ec\u72c0\u614b' : 'Simulation Status'}
              </p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#fcc025]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white">
                  {isZh ? '\u64cd\u4f5c\u54e1\u5df2\u9023\u7dda' : 'Operator Connected'}
                </span>
              </div>
            </div>
          </section>

          <footer className="py-4 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.5em] text-[#494847]">
              &copy; 2026 ZiXi Simulator - Aureum Edition
            </p>
          </footer>
        </aside>
      </main>
    </div>
  );
}
