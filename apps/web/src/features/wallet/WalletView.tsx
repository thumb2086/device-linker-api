import React, { useState } from 'react';
import { useWallet } from './useWallet';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserStore } from '../../store/useUserStore';
import { Wallet, Send, Gift, History, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import './Wallet.css';

export function WalletView() {
  const { address } = useAuthStore();
  const { user, balance, totalBet } = useUserStore();
  const { airdrop, transfer } = useWallet();

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [activeToken, setActiveToken] = useState('zhixi');

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !amount) return;
    try {
      await transfer.mutateAsync({ to, amount, token: activeToken });
      alert('轉帳成功！');
      setTo('');
      setAmount('');
    } catch (err: any) {
      alert(`轉帳失敗: ${err.message}`);
    }
  };

  const handleAirdrop = async () => {
    try {
      const res = await airdrop.mutateAsync();
      alert(`領取成功！獲得 ${res.reward} ZXC`);
    } catch (err: any) {
      alert(`領取失敗: ${err.message}`);
    }
  };

  return (
    <div className="wallet-container max-w-4xl mx-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <Wallet size={24} />
            </div>
            數位錢包
          </h1>
          <p className="text-slate-500 text-sm font-mono mt-1 opacity-80">{address}</p>
        </div>
        <button
          onClick={handleAirdrop}
          disabled={airdrop.isPending}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
        >
          {airdrop.isPending ? <Loader2 className="animate-spin" size={18} /> : <Gift size={18} />}
          領取每日空投
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:scale-110 transition-transform">
             <Wallet size={64} className="text-indigo-600" />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">子熙幣餘額 (ZXC)</p>
          <p className="text-3xl font-black text-slate-900 tabular-nums">
             {parseFloat(balance || '0').toLocaleString()}
          </p>
          <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-fit uppercase">
             Live Mainnet
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">累計投注額</p>
          <p className="text-3xl font-black text-slate-900 tabular-nums">
             {parseFloat(totalBet || '0').toLocaleString()}
          </p>
          <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-slate-400">
             <ChevronRight size={10} /> 下一個等級: 10,000,000
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
           <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">帳戶類型</p>
              <p className="text-xl font-bold text-slate-800">
                 {user?.mode === 'custody' ? '受託保管帳戶' : '去中心化錢包'}
              </p>
           </div>
           <p className="text-[10px] text-slate-400 mt-2 font-medium">
              受託帳戶由平台管理私鑰，交易快速且無須手續費。
           </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <section className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Send size={18} className="text-slate-400" />
              快速轉帳
            </h2>
          </div>
          <form onSubmit={handleTransfer} className="p-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">選擇代幣</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveToken('zhixi')}
                    className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${activeToken === 'zhixi' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    子熙幣 (ZXC)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveToken('yjc')}
                    className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${activeToken === 'yjc' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    優件幣 (YJC)
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">接收者地址</label>
                <input
                  type="text"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">轉帳金額</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm font-bold"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    MAX
                  </div>
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={transfer.isPending}
              className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-xl font-bold transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {transfer.isPending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              確認轉帳
            </button>
            <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
               <AlertCircle size={10} /> 區塊鏈轉帳不可逆，請仔細檢查地址與金額。
            </p>
          </form>
        </section>

        <section className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-50 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <History size={18} className="text-slate-400" />
                最近交易
              </h2>
            </div>
            <div className="p-6 space-y-4">
               {[1, 2, 3].map(i => (
                 <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                          <History size={16} />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-slate-800">遊戲投注</p>
                          <p className="text-[10px] text-slate-400">2026/03/28 15:30</p>
                       </div>
                    </div>
                    <p className="text-sm font-black text-red-500">-10,000</p>
                 </div>
               ))}
               <button className="w-full text-center text-xs font-bold text-indigo-600 hover:text-indigo-700 pt-2 transition-colors">
                  查看完整歷史紀錄
               </button>
            </div>
          </div>

          <div className="bg-indigo-900 rounded-2xl p-6 text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <Gift size={80} />
             </div>
             <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1">VIP 進度</p>
             <p className="text-xl font-black mb-4">黃金會員</p>
             <div className="w-full h-2 bg-indigo-950/50 rounded-full overflow-hidden">
                <div className="w-2/3 h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full"></div>
             </div>
             <div className="mt-2 flex justify-between text-[10px] font-bold text-indigo-300">
                <span>0</span>
                <span>10,000,000</span>
             </div>
          </div>
        </section>
      </div>
    </div>
  );
}
