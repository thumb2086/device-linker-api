// apps/web/src/components/Layout.tsx

import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import ChatRoom from './ChatRoom';
import { useAuth } from '../features/auth/useAuth';
import { api } from '../store/api';

export default function Layout() {
  const { isAuthorized, logout, session } = useAuth();

  const handleAirdrop = async () => {
    if (!isAuthorized) {
        alert("請先登入");
        return;
    }
    try {
        const res = await api.post('/api/v1/wallet/airdrop', { sessionId: session?.id });
        if (res.data.error) {
            alert(res.data.error.message);
        } else {
            alert(`領取成功！獲得 ${res.data.reward} ZXC`);
            window.location.reload(); // Refresh to update balance in views
        }
    } catch (e) {
        alert("領取失敗，請稍後再試");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-50">
        <Link to="/app" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-xl italic text-white shadow-lg shadow-blue-900/40">DL</div>
          <h1 className="text-xl font-bold tracking-tighter text-blue-500 hidden sm:block">DEVICE LINKER</h1>
        </Link>
        <nav className="hidden lg:flex space-x-6 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Link to="/app" className="hover:text-blue-400 transition-colors">Lobby</Link>
          <Link to="/app/leaderboard" className="hover:text-blue-400 transition-colors">🏆 Top</Link>
          <Link to="/app/wallet" className="hover:text-blue-400 transition-colors">Wallet</Link>
          <Link to="/app/market" className="hover:text-blue-400 transition-colors">Market</Link>
          <Link to="/app/rewards" className="hover:text-blue-400 transition-colors">Rewards</Link>
          <Link to="/app/inventory" className="hover:text-blue-400 transition-colors">Backpack</Link>
          <Link to="/app/admin" className="hover:text-blue-400 transition-colors text-red-900/40">Admin</Link>
        </nav>
        <div className="flex items-center space-x-4">
           {isAuthorized && (
               <button 
                 onClick={handleAirdrop}
                 className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-lg shadow-blue-900/20 transition-all active:scale-95 uppercase tracking-widest"
               >
                 Claim Airdrop
               </button>
           )}
           <div 
             onClick={() => isAuthorized ? logout() : (window.location.href = '/login')}
             className="w-10 h-10 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center text-xl cursor-pointer hover:bg-slate-700 transition-colors"
           >
             {isAuthorized ? '🚪' : '👤'}
           </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col md:flex-row gap-6 p-4 max-w-[1600px] mx-auto w-full relative">
        <div className="flex-1">
            <Outlet />
        </div>
        <aside className="w-full md:w-80 space-y-4 md:sticky md:top-24 h-fit">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-4 rounded-2xl shadow-xl">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">🎰 熱門遊戲</h4>
                 <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'coinflip', name: '擲硬幣', icon: '🪙' },
                      { id: 'roulette', name: '輪盤', icon: '🎡' },
                      { id: 'horse', name: '賽馬', icon: '🏇' },
                      { id: 'slots', name: '老虎機', icon: '🎰' },
                      { id: 'blackjack', name: '21點', icon: '🃏' },
                      { id: 'dragon', name: '龍虎', icon: '🐉' },
                      { id: 'sicbo', name: '骰寶', icon: '🎲' },
                      { id: 'bingo', name: '賓果', icon: '🎱' },
                      { id: 'crash', name: '暴漲', icon: '📈' },
                      { id: 'duel', name: '對決', icon: '⚔️' },
                      { id: 'poker', name: '德州', icon: '🏙️' },
                      { id: 'bluffdice', name: '吹牛', icon: '🎲' }
                    ].map(g => (
                      <Link key={g.id} to={`/app/casino/${g.id}`} className="flex items-center space-x-2 bg-slate-950/50 hover:bg-slate-800 p-2 rounded-lg border border-slate-800/50 transition-all text-[10px] font-bold text-slate-300">
                        <span className="text-sm">{g.icon}</span>
                        <span>{g.name}</span>
                      </Link>
                    ))}
                 </div>
            </div>
            <ChatRoom />
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">意見回饋</h4>
                <textarea
                  placeholder="遇到問題或有新想法？"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white mb-2 h-20 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button className="w-full bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold py-1.5 rounded transition-colors">提交回饋</button>
            </div>
        </aside>
      </main>
      <footer className="bg-slate-900 border-t border-slate-800 p-8 text-center text-sm text-slate-500">
        &copy; 2024 Device Linker Monolith • Refactored Architecture
      </footer>
    </div>
  );
}
