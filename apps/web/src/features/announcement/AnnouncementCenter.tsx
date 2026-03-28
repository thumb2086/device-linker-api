import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, X, Info, AlertTriangle, Zap } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  createdAt: string;
}

export default function AnnouncementCenter() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/v1/announcements')
      .then(res => res.json())
      .then(data => {
        if (data.success) setAnnouncements(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <Zap size={18} className="text-rose-400" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-400" />;
      default: return <Info size={18} className="text-blue-400" />;
    }
  };

  if (announcements.length === 0 && !loading) return null;

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30 z-40 border border-blue-400/30"
      >
        <Megaphone size={24} />
        {announcements.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-[#0f172a]">
            {announcements.length}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[#1e293b] rounded-[2rem] shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col max-h-[80vh]"
            >
              <header className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-[#0f172a]/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600/20 rounded-xl">
                    <Megaphone size={20} className="text-blue-400" />
                  </div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">公告中心</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-slate-700/50 rounded-xl text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  announcements.map((ann, idx) => (
                    <motion.div
                      key={ann.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-5 bg-[#0f172a]/50 rounded-2xl border border-slate-700/30 hover:border-blue-500/30 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(ann.type)}
                          <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{ann.title}</h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{new Date(ann.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">{ann.content}</p>
                    </motion.div>
                  ))
                )}
              </div>

              <footer className="p-4 bg-[#0f172a]/30 border-t border-slate-700/50 text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Device Linker Information Center</p>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
