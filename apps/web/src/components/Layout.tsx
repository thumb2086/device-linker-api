import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import ChatRoom from './ChatRoom';
import { useAuthStore } from '../store/useAuthStore';
import { useUserStore } from '../store/useUserStore';
import { Settings, LogOut, Zap, Trophy, Wallet, Bell, Menu } from 'lucide-react';

export default function Layout() {
  const { isAuthorized, logout } = useAuthStore();
  const { address } = useUserStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-white font-sans">
      {/* Dynamic Header */}
      <header className="bg-black/80 backdrop-blur-xl border-b border-neutral-900 text-white p-6 flex justify-between items-center sticky top-0 z-50">
        <Link to="/app" className="flex items-center gap-4 group">
          <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center font-black text-2xl italic text-black shadow-lg shadow-amber-500/20 group-hover:rotate-6 transition-transform">
             <Zap size={28} className="fill-current" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-2xl font-black italic tracking-tighter text-amber-500 uppercase leading-none">子熙模擬器</h1>
            <p className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.4em] mt-1">ZiXi Simulator</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-10">
          {[
            { to: '/app', label: '大廳 LOBBY' },
            { to: '/app/leaderboard', label: '🏆 排行榜 TOP' },
            { to: '/app/wallet', label: '錢包 WALLET' },
            { to: '/app/market', label: '市場 MARKET' },
          ].map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-amber-500 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
           {isAuthorized && (
               <Link
                 to="/app/settings"
                 className="p-3 bg-neutral-900 hover:bg-neutral-800 text-amber-500 rounded-xl border border-neutral-800 transition-all group"
               >
                 <Settings size={20} className="group-hover:rotate-45 transition-transform" />
               </Link>
           )}
           <button
             onClick={handleLogout}
             className="p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl border border-rose-500/20 transition-all flex items-center gap-2"
           >
             <LogOut size={20} />
             <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">登出 EXIT</span>
           </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 lg:p-10 flex flex-col lg:flex-row gap-10">
        <div className="flex-1 min-w-0">
            <Outlet />
        </div>

        {/* Sidebar / Chat */}
        <aside className="w-full lg:w-96 space-y-8 h-fit lg:sticky lg:top-32">
            <ChatRoom />

            <section className="bg-black border border-neutral-900 p-8 rounded-[2.5rem] shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <Bell size={18} className="text-amber-500" />
                    <h4 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.4em]">意見回饋 FEEDBACK</h4>
                </div>
                <textarea
                  placeholder="遇到問題或有新想法？說點什麼..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-xs text-white mb-4 h-32 focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-neutral-700 font-bold"
                />
                <button className="w-full bg-neutral-900 hover:bg-neutral-800 text-amber-500 text-[10px] font-black py-4 rounded-2xl border border-neutral-800 transition-all uppercase tracking-[0.2em]">提交回饋 SUBMIT</button>
            </section>

            <footer className="text-center py-4">
                <p className="text-[10px] font-black text-neutral-800 uppercase tracking-[0.5em]">&copy; 2024 ZiXi Simulator • Phase 1</p>
            </footer>
        </aside>
      </main>
    </div>
  );
}
