import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import ChatRoom from './ChatRoom';
import { useAuthStore } from '../store/useAuthStore';
import { useUserStore } from '../store/useUserStore';
import { Settings, LogOut, LayoutGrid, Trophy, Wallet, Bell, Menu, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Layout() {
  const { isAuthorized, clearAuth: logout } = useAuthStore();
  const { address } = useUserStore();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0e0e0e] text-white font-['Manrope']">
      <main className="flex-1 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-10 lg:p-10">
        <div className="flex-1 min-w-0">
            <Outlet />
        </div>

        {/* Sidebar / Chat - Only visible on desktop or large screens */}
        <aside className="hidden lg:flex w-96 flex-col gap-8 h-fit sticky top-32">
            <ChatRoom />

            <section className="bg-[#1a1919] border border-[#494847]/10 p-8 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <Bell size={18} className="text-[#fcc025]" />
                    <h4 className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-[0.4em]">SYSTEM TERMINAL</h4>
                </div>
                <div className="bg-[#0e0e0e] rounded-xl p-5 border border-[#494847]/20">
                   <p className="text-[10px] font-bold text-[#fcc025] uppercase tracking-widest mb-2">Simulation Status</p>
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#fcc025] animate-pulse" />
                      <span className="text-[9px] font-black uppercase text-white tracking-widest">Operator Connected</span>
                   </div>
                </div>
            </section>

            <footer className="text-center py-4">
                <p className="text-[9px] font-black text-[#494847] uppercase tracking-[0.5em]">&copy; 2026 ZiXi Simulator • Aureum Edition</p>
            </footer>
        </aside>
      </main>
    </div>
  );
}
