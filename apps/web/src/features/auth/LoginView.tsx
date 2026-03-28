import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { RefreshCw, ShieldCheck, Globe, Zap, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export default function LoginView() {
  const { setAuth } = useAuthStore();
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<'qr' | 'custody'>('qr');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  const initSession = async () => {
    setError(null);
    setSessionId(null);
    setQrCodeUrl(null);
    try {
      const res = await fetch('/api/user.js?action=create_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'web' })
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON:", text);
        setError("API Error: Invalid Response");
        return;
      }

      if (data.success && data.sessionId) {
        setSessionId(data.sessionId);
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=dlinker://login?sessionId=${data.sessionId}`);
      } else {
        setError(data.error || "Failed to create session");
      }
    } catch (err: any) {
      setError(`Connection error: ${err.message}`);
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
        })
        .catch(err => console.error("Poll error:", err));
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
        setError(data.error || 'Login failed');
      } else {
        setAuth(data.address, data.sessionId, '0x');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 font-sans text-white">
      {/* Language Toggle */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-amber-400 rounded-xl transition-all border border-amber-500/20"
        >
          <Globe size={18} />
          <span className="text-xs font-bold uppercase">{i18n.language === 'zh' ? 'English' : '中文'}</span>
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#141414] rounded-[2rem] shadow-[0_0_50px_rgba(251,191,36,0.1)] border border-amber-500/10 p-8 space-y-8"
      >
        <header className="text-center space-y-2">
            <div className="mx-auto w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 mb-4">
                <Zap size={40} className="text-black fill-current" />
            </div>
            <h1 className="text-4xl font-black text-amber-500 tracking-tighter uppercase italic">子熙模擬器</h1>
            <p className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em]">ZiXi Identity Protocol</p>
        </header>

        <div className="flex bg-black p-1.5 rounded-2xl border border-neutral-800">
          <button
            onClick={() => setTab('qr')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${tab === 'qr' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            {t('auth.qr_login')}
          </button>
          <button
            onClick={() => setTab('custody')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${tab === 'custody' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            {t('auth.custody_login')}
          </button>
        </div>

        {tab === 'qr' ? (
          <div className="flex flex-col items-center space-y-6">
            <div className="relative p-6 bg-amber-500 rounded-[2rem] shadow-2xl">
               {qrCodeUrl ? (
                 <div className="p-2 bg-white rounded-xl">
                    <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                 </div>
               ) : (
                 <div className="w-48 h-48 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                 </div>
               )}
            </div>
            <p className="text-neutral-400 text-xs text-center px-4 leading-relaxed font-bold">
               {t('auth.qr_instruction')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleCustodyLogin} className="space-y-5">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-amber-500/70 uppercase ml-2 tracking-widest">{t('auth.username')}</label>
                <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter Username"
                    className="w-full bg-black border border-neutral-800 rounded-2xl px-5 py-4 text-white text-sm focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all placeholder:text-neutral-700 font-bold"
                    required
                />
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-black text-amber-500/70 uppercase ml-2 tracking-widest">{t('auth.password')}</label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter Password"
                    className="w-full bg-black border border-neutral-800 rounded-2xl px-5 py-4 text-white text-sm focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all placeholder:text-neutral-700 font-bold"
                    required
                />
            </div>
            {error && <div className="text-rose-500 text-xs font-black text-center bg-rose-500/10 py-4 rounded-2xl border border-rose-500/20">{error}</div>}
            <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-4 rounded-2xl shadow-xl shadow-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
                <LogIn size={20} />
                {loading ? t('auth.logging_in') : t('auth.login_btn')}
            </button>
          </form>
        )}

        <div className="pt-6 border-t border-neutral-800 flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_10px_#fbbf24]"></div>
                <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest">{t('auth.system_ready')}</span>
            </div>
            <button onClick={() => setRetryCount(c => c + 1)} className="p-2 text-neutral-600 hover:text-amber-500 transition-colors bg-neutral-900/50 rounded-xl border border-neutral-800">
                <RefreshCw size={14} />
            </button>
        </div>
      </motion.div>

      <p className="mt-8 text-[10px] font-black text-neutral-700 uppercase tracking-[0.5em]">Powered by Modular Monolith Infrastructure</p>
    </div>
  );
}
