import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Music, Bell, Shield, User, LogOut, ChevronRight, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';

export default function SettingsView() {
  const { t } = useTranslation();
  const { sessionId, logout } = useAuthStore();
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

  const SettingRow = ({ icon: Icon, title, children }: any) => (
    <div className="flex items-center justify-between p-6 bg-black rounded-3xl border border-neutral-800 hover:border-amber-500/20 transition-all group">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-neutral-900 rounded-2xl group-hover:bg-amber-500/10 transition-colors">
          <Icon size={20} className="text-amber-500" />
        </div>
        <span className="font-black text-white uppercase italic tracking-tighter">{title}</span>
      </div>
      {children}
    </div>
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      <header className="flex items-center gap-4">
        <div className="p-4 bg-amber-500 rounded-[1.5rem] shadow-lg shadow-amber-500/20">
          <Settings size={32} className="text-black fill-current" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-amber-500 uppercase italic tracking-tighter">個人設定</h1>
          <p className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.4em]">Personal Preferences</p>
        </div>
      </header>

      <section className="space-y-6">
        <h2 className="text-xs font-black text-neutral-500 uppercase tracking-[0.3em] ml-2">音效與音樂 Sound & Audio</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingRow icon={Music} title="背景音樂 BGM">
             <button
                onClick={handleBgmToggle}
                className={`w-14 h-8 rounded-full transition-all relative ${bgmEnabled ? 'bg-amber-500' : 'bg-neutral-800'}`}
             >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${bgmEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </SettingRow>
          <SettingRow icon={Volume2} title="遊戲音效 SFX">
             <button
                onClick={handleSfxToggle}
                className={`w-14 h-8 rounded-full transition-all relative ${sfxEnabled ? 'bg-amber-500' : 'bg-neutral-800'}`}
             >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${sfxEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </SettingRow>
        </div>

        <div className="p-8 bg-black rounded-[2.5rem] border border-neutral-800 space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Volume2 size={20} className="text-amber-500" />
                    <span className="font-black text-white uppercase italic tracking-tighter">主音量 Volume</span>
                </div>
                <span className="text-amber-500 font-black text-xl italic">{volume}%</span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full h-2 bg-neutral-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xs font-black text-neutral-500 uppercase tracking-[0.3em] ml-2">帳戶安全 Security</h2>
        <div className="space-y-4">
          <SettingRow icon={User} title="修改個人名稱 Edit Name">
            <ChevronRight size={20} className="text-neutral-700" />
          </SettingRow>
          <SettingRow icon={Shield} title="雙重驗證 2FA">
            <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full border border-amber-500/20">未啟用 DISABLED</span>
          </SettingRow>
        </div>
      </section>

      <div className="pt-10">
        <button
          onClick={() => { logout(); window.location.href = '/login'; }}
          className="w-full py-6 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-[2rem] font-black uppercase italic tracking-tighter flex items-center justify-center gap-3 transition-all"
        >
          <LogOut size={24} />
          退出登入 LOGOUT
        </button>
      </div>
    </div>
  );
}
