import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

export default function LoginView() {
  const { setAuth } = useAuthStore();
  const [tab, setTab] = useState<'qr' | 'custody'>('qr');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const initSession = async () => {
    setError(null);
    try {
      // Use legacy endpoint for better compatibility with app flows
      const res = await fetch('/api/user.js?action=create_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'web' })
      });
      const data = await res.json();
      if (data.success && data.sessionId) {
        setSessionId(data.sessionId);
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=dlinker://login?sessionId=${data.sessionId}`);
      } else {
        setError("無法建立連線階段");
      }
    } catch (err: any) {
      setError(`連線錯誤: ${err.message}`);
    }
  };

  useEffect(() => {
    if (tab === 'qr') initSession();
  }, [tab, retryCount]);

  useEffect(() => {
    if (tab !== 'qr' || !sessionId) return;

    const interval = setInterval(() => {
      fetch(`/api/user.js?action=get_status&sessionId=${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.status === 'authorized') {
            setAuth(data.address, sessionId, data.publicKey || '0x');
          }
        });
    }, 2000);

    return () => clearInterval(interval);
  }, [tab, sessionId, setAuth]);

  const handleCustodyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user.js?action=custody_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || '登入失敗');
      } else {
        setAuth(data.address, data.sessionId, '0x');
      }
    } catch (err) {
      setError('網路連線錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#1e293b] rounded-3xl shadow-2xl border border-slate-700/50 p-8 space-y-8">
        <header className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
                <ShieldCheck size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">DEVICE LINKER</h1>
            <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Secure Identity Protocol</p>
        </header>

        <div className="flex bg-[#0f172a]/50 p-1.5 rounded-2xl border border-slate-700/30">
          <button
            onClick={() => setTab('qr')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${tab === 'qr' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            掃描 QR 登入
          </button>
          <button
            onClick={() => setTab('custody')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${tab === 'custody' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            受託帳號登入
          </button>
        </div>

        {tab === 'qr' ? (
          <div className="flex flex-col items-center space-y-6">
            <div className="relative p-4 bg-white rounded-3xl shadow-inner">
               {qrCodeUrl ? (
                 <img src={qrCodeUrl} alt="QR Code" className="w-56 h-56" />
               ) : (
                 <div className="w-56 h-56 bg-slate-100 flex items-center justify-center rounded-2xl">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
            </div>
            <p className="text-slate-400 text-xs text-center px-8 leading-relaxed font-medium">
               請使用手機端 <span className="text-blue-400 font-bold">Device Linker App</span> 掃描二維碼進行身份授權
            </p>
          </div>
        ) : (
          <form onSubmit={handleCustodyLogin} className="space-y-4">
            <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-tighter">Username</label>
                <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="輸入帳號"
                    className="w-full bg-[#0f172a] border border-slate-700/50 rounded-2xl px-5 py-4 text-white text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-600"
                    required
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-tighter">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="輸入密碼"
                    className="w-full bg-[#0f172a] border border-slate-700/50 rounded-2xl px-5 py-4 text-white text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-600"
                    required
                />
            </div>
            {error && <div className="text-rose-400 text-xs font-bold text-center bg-rose-500/10 py-3 rounded-xl border border-rose-500/20">{error}</div>}
            <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
            >
                {loading ? '身分驗證中...' : '立即登入系統'}
            </button>
          </form>
        )}

        <div className="pt-6 border-t border-slate-700/30 flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase">System Ready</span>
            </div>
            <button onClick={() => setRetryCount(c => c + 1)} className="text-slate-500 hover:text-white transition-colors">
                <RefreshCw size={14} />
            </button>
        </div>
      </div>

      <p className="mt-8 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Powered by Modular Monolith Infrastructure</p>
    </div>
  );
}
