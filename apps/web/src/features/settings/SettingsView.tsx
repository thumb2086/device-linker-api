import { Link } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2,
  Music,
  Bell,
  Shield,
  User,
  LogOut,
  ChevronRight,
  Settings as SettingsIcon,
  Info,
  Edit2,
  Globe
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserStore } from '../../store/useUserStore';

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const { sessionId, logout } = useAuthStore();
  const { username, address } = useUserStore();
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [volume, setVolume] = useState(50);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/profile/sound-prefs?sessionId=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setBgmEnabled(data.data.bgmEnabled);
          setSfxEnabled(data.data.sfxEnabled);
          setVolume(Math.round(data.data.volume * 100));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const savePrefs = (updates: any) => {
    const next = {
      bgmEnabled,
      sfxEnabled,
      volume: volume / 100,
      ...updates
    };
    fetch('/api/v1/profile/sound-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, prefs: next })
    });
  };

  const handleBgmToggle = () => {
    const next = !bgmEnabled;
    setBgmEnabled(next);
    savePrefs({ bgmEnabled: next });
  };

  const handleSfxToggle = () => {
    const next = !sfxEnabled;
    setSfxEnabled(next);
    savePrefs({ sfxEnabled: next });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value);
    setVolume(next);
    savePrefs({ volume: next / 100 });
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(nextLang);
  };

  const Toggle = ({ enabled, onClick }: { enabled: boolean, onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`relative inline-flex h-6 w-12 items-center rounded-full transition-all focus:outline-none ${
        enabled ? 'bg-[#fcc025] shadow-[0_0_15px_rgba(252,192,37,0.4)]' : 'bg-[#fcc025]/20'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform transition-transform ${
        enabled ? 'translate-x-7 bg-black' : 'translate-x-1 bg-[#fcc025]'
      } rounded-full`} />
    </button>
  );

  if (loading) return (
    <div className="flex justify-center items-center h-screen bg-[#0e0e0e]">
      <div className="w-10 h-10 border-4 border-[#fcc025] border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-['Manrope'] pb-32">
      <header className="fixed top-0 w-full z-50 bg-[#0e0e0e] border-b border-[#494847]/15">
        <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
             <SettingsIcon className="text-[#fcc025]" />
             <h1 className="font-extrabold tracking-tight text-xl text-[#fcc025] uppercase italic">ZiXi Simulator</h1>
          </div>
        </div>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto space-y-8">
        <section className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#fcc025]/60 font-bold">Terminal Interface</p>
          <h2 className="text-3xl font-extrabold tracking-tight uppercase italic text-white">{t('settings.title')}</h2>
        </section>

        {/* Profile Section */}
        <section className="bg-[#1a1919] rounded-xl p-5 border-l-2 border-[#fcc025] shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-[#262626] p-3 rounded-lg">
                <User className="text-[#fcc025] w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#adaaaa] font-bold">Identity Profile</p>
                <p className="text-lg font-bold text-white uppercase tracking-tight italic">{username || (address ? address.slice(0, 8) : 'OPERATOR_01')}</p>
              </div>
            </div>
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-[#262626] text-[#fcc025] hover:bg-[#2c2c2c] active:scale-90 transition-all">
              <Edit2 size={16} />
            </button>
          </div>
        </section>

        {/* Language Selection */}
        <section className="bg-[#1a1919] rounded-xl p-6 shadow-2xl">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <Globe className="text-[#fcc025] w-5 h-5" />
               <div>
                 <h3 className="text-[10px] uppercase tracking-[0.15em] font-extrabold text-white">Language / 語言</h3>
                 <p className="text-[10px] text-[#adaaaa] mt-0.5 font-bold uppercase tracking-tight">{i18n.language === 'zh' ? '繁體中文' : 'English'}</p>
               </div>
             </div>
             <button
                onClick={toggleLanguage}
                className="px-4 py-2 bg-[#262626] hover:bg-[#2c2c2c] border border-[#fcc025]/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#fcc025]"
             >
                Switch
             </button>
           </div>
        </section>

        {/* Audio Matrix */}
        <section className="bg-[#1a1919] rounded-xl overflow-hidden shadow-2xl">
          <div className="p-6 space-y-8">
            <div className="flex items-center gap-3">
              <Volume2 className="text-[#fcc025] w-5 h-5" />
              <h3 className="text-[10px] uppercase tracking-[0.15em] font-extrabold text-white">{t('settings.audio_matrix')}</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[11px] uppercase tracking-wider text-[#adaaaa] font-bold">
                  <label>{t('settings.master_volume')}</label>
                  <span className="text-[#fcc025] font-mono">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-full h-1 bg-[#494847]/30 rounded-lg appearance-none cursor-pointer accent-[#fcc025]"
                />
              </div>
            </div>

            <div className="h-[1px] bg-[#494847]/10"></div>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white uppercase tracking-wider font-bold">{t('settings.bgm')}</span>
                <Toggle enabled={bgmEnabled} onClick={handleBgmToggle} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white uppercase tracking-wider font-bold">{t('settings.sfx')}</span>
                <Toggle enabled={sfxEnabled} onClick={handleSfxToggle} />
              </div>
            </div>
          </div>
        </section>

        {/* Support & Protocols */}
        <section className="bg-[#1a1919] rounded-xl overflow-hidden shadow-2xl divide-y divide-[#494847]/10">
          <div className="p-4 flex items-center gap-3">
            <Info className="text-[#edb210] w-5 h-5" />
            <h3 className="text-[10px] uppercase tracking-[0.15em] font-extrabold text-white">{t('settings.system_protocol')}</h3>
          </div>
          <Link to="/app/support" className="flex items-center justify-between p-5 hover:bg-[#1a1919] group transition-colors">
            <span className="text-[11px] text-white uppercase tracking-widest font-bold group-hover:text-[#fcc025]">{t('settings.service_status')}</span>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80]"></span>
              <ChevronRight size={16} className="text-[#adaaaa] group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
          <a href="#" className="flex items-center justify-between p-5 hover:bg-[#1a1919] group transition-colors">
            <span className="text-[11px] text-white uppercase tracking-widest font-bold group-hover:text-[#fcc025]">{t('settings.security_protocol')}</span>
            <ChevronRight size={16} className="text-[#adaaaa] group-hover:translate-x-1 transition-transform" />
          </a>
        </section>

        <section className="pt-4">
           <button
             onClick={() => { logout(); window.location.href = '/login'; }}
             className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-sm uppercase tracking-[0.2em] text-white bg-gradient-to-r from-red-600 to-red-800 shadow-[0_4px_20px_rgba(220,38,38,0.2)] active:scale-95 transition-all border border-red-500/20"
           >
             <LogOut size={20} />
             {t('settings.terminate_session')}
           </button>
           <p className="text-center text-[10px] text-[#adaaaa]/40 mt-6 tracking-widest uppercase font-bold">Version 4.1.2-Gold-Edition</p>
        </section>
      </main>
    </div>
  );
}
