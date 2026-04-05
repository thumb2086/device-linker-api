import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { RefreshCw, ShieldCheck, Globe, LogIn, Fingerprint, QrCode, Monitor, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginView() {
  const { setAuth } = useAuthStore();
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const [tab, setTab] = useState<'qr' | 'custody'>('qr');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Load saved username and rememberMe preference
  useEffect(() => {
    const savedUsername = localStorage.getItem('custody_username');
    const savedRememberMe = localStorage.getItem('custody_remember_me');
    if (savedUsername) setUsername(savedUsername);
    if (savedRememberMe === 'true') setRememberMe(true);
  }, []);

  const toggleLanguage = () => {
    i18n.changeLanguage(isZh ? 'en' : 'zh');
  };

  const initSession = async () => {
    setError(null);
    setSessionId(null);
    setQrCodeUrl(null);
    setDeepLinkUrl(null);
    try {
      const res = await fetch('/api/v1/auth/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'web', clientType: 'web' })
      });
      const data = await res.json();
      const payload = data?.data;
      const loginLink = payload?.deepLink || payload?.legacyDeepLink;

      if (data.success && payload?.sessionId && loginLink) {
        setSessionId(payload.sessionId);
        setDeepLinkUrl(loginLink);
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(loginLink)}`);
      } else {
        setError(data.error || "SESSION_CREATION_FAILED");
      }
    } catch (err: any) {
      setError(`CONNECTION_ERROR: ${err.message}`);
    }
  };

  useEffect(() => {
    if (tab === 'qr') initSession();
  }, [tab, retryCount]);

  useEffect(() => {
    if (tab !== 'qr' || !sessionId) return;

    const interval = setInterval(() => {
      fetch(`/api/v1/auth/status?sessionId=${encodeURIComponent(sessionId)}`)
        .then(res => res.json())
        .then(data => {
          const payload = data?.data;
          if (data.success && payload?.status === 'authorized' && payload?.address) {
            setAuth(payload.address, sessionId, payload.publicKey || '0x');
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
      const res = await fetch('/api/v1/auth/custody/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, platform: 'web', clientType: 'web' })
      });
      const data = await res.json();
      const payload = data?.data;
      if (!data.success || !payload?.success || !payload?.sessionId || !payload?.address) {
        setError(data.error || 'LOGIN_FAILED');
      } else {
        // Save remember me preference
        if (rememberMe) {
          localStorage.setItem('custody_username', username);
          localStorage.setItem('custody_remember_me', 'true');
        } else {
          localStorage.removeItem('custody_username');
          localStorage.setItem('custody_remember_me', 'false');
        }
        setAuth(payload.address, payload.sessionId, payload.publicKey || '0x');
      }
    } catch (err) {
      setError('NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex flex-col items-center justify-center p-6 font-['Manrope'] text-white selection:bg-[#fcc025]/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#fcc025]/5 blur-[120px] rounded-full" />
      </div>

      {/* Language Toggle */}
      <div className="absolute top-8 right-8 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleLanguage}
          className="flex items-center gap-3 px-5 py-2.5 bg-[#1a1919] hover:bg-[#262626] text-[#fcc025] rounded-xl transition-all border border-[#fcc025]/20 shadow-lg"
        >
          <Globe size={16} />
          <span className="text-[10px] font-bold uppercase tracking-widest">{isZh ? 'English' : '\u4e2d\u6587'}</span>
        </motion.button>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#1a1919] rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-[#494847]/15 p-10 space-y-10 relative z-10 overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#fcc025] to-transparent opacity-40" />

        <header className="text-center space-y-3">
            <motion.div
              initial={{ rotate: -15, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 12 }}
              className="mx-auto w-20 h-20 bg-[#262626] rounded-2xl flex items-center justify-center border border-[#fcc025]/20 shadow-[0_0_30px_rgba(252,192,37,0.1)] mb-6"
            >
                <Fingerprint size={42} className="text-[#fcc025]" />
            </motion.div>
            <h1 className="text-4xl font-extrabold text-[#fcc025] tracking-tighter uppercase italic">ZiXi Identity</h1>
            <p className="text-[#adaaaa] text-[10px] font-bold uppercase tracking-[0.4em] leading-relaxed">Secured Simulation Access Protocol</p>
        </header>

        <div className="flex bg-[#0e0e0e] p-1.5 rounded-xl border border-[#494847]/20">
          <button
            onClick={() => setTab('qr')}
            className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${tab === 'qr' ? 'bg-[#fcc025] text-black shadow-lg shadow-[#fcc025]/20' : 'text-[#adaaaa] hover:text-white'}`}
          >
            {t('auth.qr_login')}
          </button>
          <button
            onClick={() => setTab('custody')}
            className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${tab === 'custody' ? 'bg-[#fcc025] text-black shadow-lg shadow-[#fcc025]/20' : 'text-[#adaaaa] hover:text-white'}`}
          >
            {t('auth.custody_login')}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'qr' ? (
            <motion.div
              key="qr"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex flex-col items-center space-y-8"
            >
              <div className="relative p-6 bg-gradient-to-br from-[#fcc025] to-[#e6ad03] rounded-3xl shadow-[0_20px_50px_rgba(252,192,37,0.15)] group">
                 {qrCodeUrl ? (
                   <div className="p-3 bg-white rounded-xl group-hover:scale-105 transition-transform duration-500">
                      <img src={qrCodeUrl} alt="QR Code" className="w-44 h-44" />
                   </div>
                 ) : (
                   <div className="w-44 h-44 flex items-center justify-center">
                      <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                   </div>
                 )}
              </div>
              <div className="text-center space-y-2 px-4">
                 <p className="text-[#adaaaa] text-[11px] leading-relaxed font-bold uppercase tracking-tight">
                     {t('auth.qr_instruction')}
                 </p>
                 {deepLinkUrl && (
                   <a
                     href={deepLinkUrl}
                     className="inline-flex items-center justify-center mt-2 px-4 py-2 rounded-lg bg-[#262626] border border-[#fcc025]/20 text-[#fcc025] text-[10px] font-black uppercase tracking-widest hover:bg-[#2c2c2c] transition-all"
                   >
                     Open App
                   </a>
                 )}
                 <div className="flex items-center justify-center gap-2 pt-2">
                     <QrCode size={12} className="text-[#fcc025]" />
                     <span className="text-[9px] text-[#fcc025]/60 font-bold uppercase tracking-[0.2em]">Encrypted Session Active</span>
                 </div>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="custody"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleCustodyLogin}
              className="space-y-6"
            >
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#fcc025] uppercase ml-1 tracking-widest">{t('auth.username')}</label>
                  <div className="relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[#fcc025]/40">
                      <Monitor size={16} />
                    </div>
                    <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Operator ID"
                        className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-xl pl-14 pr-5 py-4 text-white text-sm focus:border-[#fcc025]/50 focus:ring-4 focus:ring-[#fcc025]/5 outline-none transition-all placeholder:text-[#494847] font-bold"
                        required
                    />
                  </div>
              </div>
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#fcc025] uppercase ml-1 tracking-widest">{t('auth.password')}</label>
                  <div className="relative">
                     <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[#fcc025]/40">
                        <Monitor size={16} />
                      </div>
                      <input
                          type="password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Pass-Code"
                          className="w-full bg-[#0e0e0e] border border-[#494847]/30 rounded-xl pl-14 pr-5 py-4 text-white text-sm focus:border-[#fcc025]/50 focus:ring-4 focus:ring-[#fcc025]/5 outline-none transition-all placeholder:text-[#494847] font-bold"
                          required
                      />
                  </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center gap-3 px-1">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                    rememberMe
                      ? 'border-[#fcc025] bg-[#fcc025]'
                      : 'border-[#494847]/50 bg-transparent'
                  }`}
                >
                  {rememberMe && <Check size={14} className="text-black" />}
                </button>
                <span className="text-[11px] font-bold text-[#adaaaa]">
                  {isZh ? '記住我（下次自動登入）' : 'Remember Me (Auto-login next time)'}
                </span>
              </div>
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[#ff7351] text-[10px] font-bold text-center bg-[#ff7351]/10 py-4 rounded-xl border border-[#ff7351]/20 uppercase tracking-widest"
                >
                  {error}
                </motion.div>
              )}
              <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-br from-[#fcc025] to-[#e6ad03] text-black font-black py-4 rounded-xl shadow-[0_4px_20px_rgba(252,192,37,0.2)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 relative overflow-hidden group"
              >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <LogIn size={20} className="relative z-10" />
                  <span className="relative z-10 text-xs uppercase italic tracking-tighter">
                    {loading ? t('auth.logging_in') : t('auth.login_btn')}
                  </span>
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="pt-8 border-t border-[#494847]/10 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-[#fcc025] rounded-full animate-pulse shadow-[0_0_8px_#fcc025]"></div>
                <span className="text-[9px] font-bold text-[#adaaaa] uppercase tracking-[0.2em]">{t('auth.system_ready')}</span>
            </div>
            <motion.button
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.5 }}
              onClick={() => setRetryCount(c => c + 1)}
              className="p-2.5 text-[#adaaaa] hover:text-[#fcc025] transition-colors bg-[#0e0e0e] rounded-lg border border-[#494847]/20"
            >
                <RefreshCw size={14} />
            </motion.button>
        </div>
      </motion.div>

      <p className="mt-12 text-[9px] font-bold text-[#494847] uppercase tracking-[0.5em] flex items-center gap-3">
          <ShieldCheck size={12} className="text-[#fcc025]/30" />
          Powered by Modular Monolith Infrastructure v4.1
      </p>
    </div>
  );
}
