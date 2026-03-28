import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export default function ProfileSetup({ onComplete }: { onComplete: () => void }) {
  const { sessionId } = useAuthStore();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.length < 2) {
      setError('用戶名太短了');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/profile/set-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, username })
      });
      const data = await res.json();
      if (data.success) {
        onComplete();
      } else {
        setError(data.error || '儲存失敗');
      }
    } catch (err) {
      setError('網路連線錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 font-sans text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#141414] rounded-[2.5rem] p-10 shadow-[0_0_50px_rgba(251,191,36,0.1)] border border-amber-500/10"
      >
        <div className="flex flex-col items-center text-center space-y-6">
          <motion.div
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20"
          >
            <Zap size={40} className="text-black fill-current" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-4xl font-black text-amber-500 tracking-tighter uppercase italic">歡迎加入</h1>
            <p className="text-neutral-500 font-bold uppercase text-xs tracking-widest">在開始之前，請為您的帳戶設定一個顯示名稱</p>
          </div>

          <form onSubmit={handleSave} className="w-full space-y-6 pt-4">
            <div className="relative">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-amber-500/50">
                <User size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="輸入您的暱稱 (2-20 字元)"
                className="w-full bg-black border border-neutral-800 rounded-2xl pl-14 pr-6 py-5 text-white text-lg focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all placeholder:text-neutral-700 font-bold"
                maxLength={20}
                required
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-rose-500 text-sm font-black bg-rose-500/10 py-4 px-4 rounded-2xl border border-rose-500/20"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-5 rounded-2xl shadow-xl shadow-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 group"
            >
              <span className="text-lg uppercase italic tracking-tighter">儲存並進入系統</span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
