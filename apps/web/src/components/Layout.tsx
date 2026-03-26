import { Outlet, Link } from 'react-router-dom';
import ChatRoom from './ChatRoom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-xl font-bold tracking-tighter text-blue-500">DEVICE LINKER</h1>
        <nav className="hidden md:flex space-x-6 text-sm font-medium uppercase tracking-widest text-slate-400">
          <Link to="/app" className="hover:text-white transition-colors">Lobby</Link>
          <Link to="/app/leaderboard" className="hover:text-white transition-colors">🏆 Top</Link>
          <Link to="/app/wallet" className="hover:text-white transition-colors">Wallet</Link>
          <Link to="/app/market" className="hover:text-white transition-colors">Market</Link>
          <Link to="/app/rewards" className="hover:text-white transition-colors">Rewards</Link>
          <Link to="/app/inventory" className="hover:text-white transition-colors">Backpack</Link>
          <Link to="/app/admin" className="hover:text-white transition-colors">Admin</Link>
        </nav>
        <div className="md:hidden flex space-x-2 overflow-x-auto">
             <Link to="/app" className="px-2 py-1 text-xs">Lobby</Link>
             <Link to="/app/leaderboard" className="px-2 py-1 text-xs">🏆</Link>
             <Link to="/app/inventory" className="px-2 py-1 text-xs">🎒</Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col md:flex-row gap-6 p-4 max-w-[1600px] mx-auto w-full relative">
        <div className="flex-1">
            <Outlet />
        </div>
        <aside className="w-full md:w-80 space-y-4 md:sticky md:top-24 h-fit">
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
