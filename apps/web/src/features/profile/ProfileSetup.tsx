import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, ArrowRight, ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#1e293b] rounded-[2.5rem] p-10 shadow-2xl border border-slate-700/50"
      >
        <div className="flex flex-col items-center text-center space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-500/20"
          >
            <ShieldCheck size={40} className="text-white" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-4xl font-black text-white tracking-tight">歡迎加入</h1>
            <p className="text-slate-400 font-medium">在開始之前，請為您的帳戶設定一個顯示名稱</p>
          </div>

          <form onSubmit={handleSave} className="w-full space-y-6 pt-4">
            <div className="relative">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500">
                <User size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="輸入您的暱稱 (2-20 字元)"
                className="w-full bg-[#0f172a] border border-slate-700/50 rounded-2xl pl-14 pr-6 py-5 text-white text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-600"
                maxLength={20}
                required
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-rose-400 text-sm font-bold bg-rose-500/10 py-3 px-4 rounded-xl border border-rose-500/20"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 group"
            >
              {loading ? '儲存中...' : '儲存並進入系統'}
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
