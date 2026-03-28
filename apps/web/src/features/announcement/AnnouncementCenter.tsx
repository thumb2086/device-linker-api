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
      case 'urgent': return <Zap size={18} className="text-rose-500 fill-current" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
      default: return <Info size={18} className="text-amber-500" />;
    }
  };

  if (announcements.length === 0 && !loading) return null;

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05, rotate: 5 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 w-16 h-16 bg-amber-500 rounded-[1.5rem] flex items-center justify-center text-black shadow-lg shadow-amber-500/30 z-40 border border-amber-600/50"
      >
        <Megaphone size={28} className="fill-current" />
        {announcements.length > 0 && (
          <span className="absolute -top-1 -right-1 w-6 h-6 bg-rose-600 rounded-full text-[10px] font-black flex items-center justify-center border-4 border-[#0a0a0a] text-white">
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
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-xl bg-[#141414] rounded-[2.5rem] shadow-[0_0_100px_rgba(251,191,36,0.15)] border border-amber-500/20 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <header className="p-8 border-b border-neutral-800 flex justify-between items-center bg-black/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/20">
                    <Megaphone size={24} className="text-black fill-current" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-amber-500 uppercase tracking-tighter italic">公告中心</h2>
                    <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Platform News & Updates</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-3 hover:bg-neutral-800 rounded-2xl text-neutral-500 transition-all border border-transparent hover:border-neutral-700"
                >
                  <X size={24} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  announcements.map((ann, idx) => (
                    <motion.div
                      key={ann.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-6 bg-black rounded-3xl border border-neutral-800 hover:border-amber-500/30 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/10 transition-colors" />

                      <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="flex items-center gap-3">
                          {getTypeIcon(ann.type)}
                          <h3 className="text-lg font-black text-white group-hover:text-amber-400 transition-colors italic tracking-tight">{ann.title}</h3>
                        </div>
                        <div className="bg-neutral-900 px-3 py-1 rounded-lg border border-neutral-800">
                          <span className="text-[10px] font-black text-neutral-500 uppercase">{new Date(ann.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <p className="text-neutral-400 leading-relaxed font-medium relative z-10">{ann.content}</p>
                    </motion.div>
                  ))
                )}
              </div>

              <footer className="p-6 bg-black/50 border-t border-neutral-800 text-center">
                <p className="text-[10px] font-black text-neutral-700 uppercase tracking-[0.5em]">ZiXi Information Hub</p>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
