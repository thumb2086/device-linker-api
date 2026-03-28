import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';

export default function LoginView() {
  const { setAuth } = useAuthStore();
  const [tab, setTab] = useState<'qr' | 'custody'>('qr');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'qr') {
      fetch('/api/v1/auth/create-session', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.sessionId) {
            setSessionId(data.data.sessionId);
            setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=dlinker://login?sessionId=${data.data.sessionId}`);
          } else {
            console.error("Failed to create session", data);
          }
        })
        .catch(err => console.error("Network error creating session", err));
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== 'qr' || !sessionId) return;

    const interval = setInterval(() => {
      fetch(`/api/v1/auth/status?sessionId=${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.status === 'authorized') {
            setAuth(data.data.address, sessionId, data.data.publicKey || '0x');
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
      const res = await fetch('/api/v1/auth/custody/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Login failed');
      } else if (data.data?.sessionId) {
        setAuth(data.data.user.address, data.data.sessionId, '0x');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
      setAuth("0x1234567890123456789012345678901234567890", "demo_session", "0x");
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-xl max-w-md mx-auto mt-20 border border-slate-100">
      <div className="flex w-full mb-8 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setTab('qr')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'qr' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Device Linker (QR)
        </button>
        <button
          onClick={() => setTab('custody')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'custody' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          託管帳戶登入
        </button>
      </div>

      {tab === 'qr' ? (
        <div className="flex flex-col items-center space-y-6 text-center">
          <h2 className="text-2xl font-bold text-slate-800">掃碼授權</h2>
          <p className="text-slate-500 text-sm px-4">請使用 Device Linker App 掃描下方二維碼以登入此網頁端。</p>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="relative w-52 h-52 border-8 border-white rounded-2xl shadow-sm" />
            ) : (
              <div className="relative w-52 h-52 bg-slate-50 animate-pulse rounded-2xl border-8 border-white shadow-sm" />
            )}
          </div>

          <div className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">
            Session: {sessionId || 'Initializing...'}
          </div>
        </div>
      ) : (
        <form onSubmit={handleCustodyLogin} className="w-full space-y-5">
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-2">受託帳號登入</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">帳號名稱</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm"
                required
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-xs text-center font-medium bg-red-50 p-2 rounded-lg border border-red-100">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-slate-200 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? '登入中...' : '立即登入'}
          </button>
        </form>
      )}

      <button
        onClick={handleDemoLogin}
        className="mt-4 text-[10px] text-slate-300 hover:text-slate-500 transition-colors uppercase font-bold tracking-tighter"
      >
        (DEBUG) Demo 快速跳過登入
      </button>

      <div className="mt-8 pt-6 border-t border-slate-100 w-full">
        <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">Powered by Modular Monolith</span>
            <div className="flex gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">System Online</span>
            </div>
        </div>
      </div>
    </div>
  );
}
