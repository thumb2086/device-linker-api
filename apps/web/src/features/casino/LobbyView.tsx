// apps/web/src/features/casino/LobbyView.tsx

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../store/api";

const GAMES = [
  { id: 'coinflip', name: '掷硬币', icon: '🪙', color: 'from-blue-500 to-cyan-500' },
  { id: 'roulette', name: '轮盘', icon: '🎡', color: 'from-red-500 to-rose-500' },
  { id: 'horse', name: '赛马', icon: '🏇', color: 'from-green-500 to-emerald-500' },
  { id: 'slots', name: '老虎机', icon: '🎰', color: 'from-yellow-500 to-amber-500' },
  { id: 'blackjack', name: '21点', icon: '🃏', color: 'from-indigo-500 to-blue-500' },
  { id: 'dragon', name: '龙虎', icon: '🐉', color: 'from-orange-500 to-red-500' },
  { id: 'sicbo', name: '骰宝', icon: '🎲', color: 'from-teal-500 to-cyan-500' },
  { id: 'bingo', name: '宾果', icon: '🎱', color: 'from-purple-500 to-pink-500' },
  { id: 'crash', name: '暴涨', icon: '📈', color: 'from-blue-600 to-indigo-600' },
  { id: 'duel', name: '对决', icon: '⚔️', color: 'from-slate-700 to-slate-900' },
  { id: 'poker', name: '德州扑克', icon: '🏙️', color: 'from-amber-600 to-red-600' },
  { id: 'bluffdice', name: '吹牛骰子', icon: '🎲', color: 'from-slate-500 to-slate-700' }
];

export const LobbyView: React.FC = () => {
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        api.get('/api/v1/stats/health').then(res => setStats(res.data.stats)).catch(() => {});
    }, []);

    return (
        <div className="space-y-8 pb-12">
            <div className="relative overflow-hidden bg-slate-900/50 rounded-3xl border border-slate-800 p-8 md:p-12 mb-8 shadow-2xl">
                 <div className="relative z-10 max-w-2xl">
                    <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase mb-4 leading-tight">
                        Platform <span className="text-blue-500">Migration</span> <br/>
                        <span className="text-blue-400">Modular Monolith</span>
                    </h2>
                    <p className="text-slate-400 text-lg font-medium max-w-lg mb-8 leading-relaxed">
                        Welcome to the new refactored device-linker platform. All 12 games are fully operational and secured by our domain-driven architecture.
                    </p>
                    <div className="flex items-center space-x-6 text-xs font-black uppercase tracking-widest text-slate-500">
                        <div className="flex items-center space-x-2">
                             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                             <span>Mainnet Live</span>
                        </div>
                        <div className="flex items-center space-x-2">
                             <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                             <span>1.0.0 Refactor</span>
                        </div>
                    </div>
                 </div>
                 <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-blue-600/10 to-transparent"></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {GAMES.map(game => (
                    <Link 
                      key={game.id} 
                      to={`/app/casino/${game.id}`}
                      className="group relative overflow-hidden bg-slate-900 hover:bg-slate-800/80 border border-slate-800 p-6 rounded-2xl shadow-lg transition-all hover:-translate-y-1 active:scale-95"
                    >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-2xl shadow-lg mb-4 group-hover:scale-110 transition-transform`}>
                             {game.icon}
                        </div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">{game.name}</h3>
                        <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest mb-4">Play Now &raquo;</p>
                        <div className="absolute bottom-0 right-0 w-8 h-8 opacity-5 group-hover:opacity-10 transition-opacity">
                             <span className="text-6xl absolute bottom-0 right-0">🎰</span>
                        </div>
                    </Link>
                ))}
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center space-x-6">
                    <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Online</div>
                        <div className="text-xl font-black text-white italic">1,248 Players</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">System Uptime</div>
                        <div className="text-xl font-black text-green-500 italic">99.98%</div>
                    </div>
                </div>
                <div className="flex space-x-2">
                    <Link to="/app/wallet" className="bg-slate-800 hover:bg-slate-700 text-white font-black px-6 py-2.5 rounded-xl uppercase tracking-widest text-[10px] transition-all">Deposit</Link>
                    <Link to="/app/market" className="bg-blue-600 hover:bg-blue-500 text-white font-black px-6 py-2.5 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-blue-900/40 transition-all">Market</Link>
                </div>
            </div>
        </div>
    );
};
