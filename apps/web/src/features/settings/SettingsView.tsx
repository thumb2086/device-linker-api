import { Link } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Edit2,
  Globe,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  Settings as SettingsIcon,
  TrendingUp,
  User,
  Volume2,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserStore } from '../../store/useUserStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';

const Toggle = ({ enabled, onClick }: { enabled: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative inline-flex h-6 w-12 items-center rounded-full transition-all ${
      enabled ? 'bg-[#fcc025] shadow-[0_0_15px_rgba(252,192,37,0.35)]' : 'bg-[#494847]/30'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 rounded-full transition-transform ${
        enabled ? 'translate-x-7 bg-black' : 'translate-x-1 bg-[#fcc025]'
      }`}
    />
  </button>
);

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold text-[#adaaaa]">
        <span>{label}</span>
        <span className="font-mono text-[#fcc025]">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="w-full accent-[#fcc025]"
      />
    </div>
  );
}

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const { sessionId, clearAuth } = useAuthStore();
  const { username, address, balance, setUsername } = useUserStore();
  const {
    amountDisplay,
    danmuEnabled,
    masterVolume,
    bgmEnabled,
    bgmVolume,
    sfxEnabled,
    sfxVolume,
    replacePrefs,
    setPrefs,
  } = usePreferencesStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(username || '');

  useEffect(() => {
    setDisplayNameDraft(username || '');
  }, [username]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    fetch(`/api/v1/profile/prefs?sessionId=${sessionId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (payload?.success !== false && payload?.data?.prefs) {
          replacePrefs(payload.data.prefs);
          if (payload.data.displayName) setUsername(payload.data.displayName);
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId, replacePrefs, setUsername]);

  const persistPrefs = async (updates: Partial<{
    amountDisplay: 'compact' | 'full';
    danmuEnabled: boolean;
    masterVolume: number;
    bgmEnabled: boolean;
    bgmVolume: number;
    sfxEnabled: boolean;
    sfxVolume: number;
  }>) => {
    if (!sessionId) return;
    setPrefs(updates);
    setSaving(true);
    setStatusText('設定已同步中...');
    try {
      const res = await fetch('/api/v1/profile/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, prefs: updates }),
      });
      const payload = await res.json();
      if (payload?.success === false) {
        setStatusText('設定儲存失敗');
      } else {
        setStatusText('設定已套用');
      }
    } catch {
      setStatusText('設定儲存失敗');
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatusText(null), 1500);
    }
  };

  const saveDisplayName = async () => {
    const nextName = displayNameDraft.trim();
    if (!sessionId || nextName.length < 2 || nextName.length > 20) {
      setStatusText('顯示名稱需為 2 到 20 字元');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/v1/profile/set-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, username: nextName }),
      });
      const payload = await res.json();
      if (payload?.success === false) {
        setStatusText('顯示名稱更新失敗');
        return;
      }
      setUsername(nextName);
      setIsEditingName(false);
      setStatusText('顯示名稱已更新');
    } catch {
      setStatusText('顯示名稱更新失敗');
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatusText(null), 1500);
    }
  };

  const previewBalance = useMemo(
    () => formatNumber(balance || 0, amountDisplay === 'full' ? 'full' : 'short'),
    [amountDisplay, balance]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0e0e0e]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#fcc025] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] pb-32 font-['Manrope'] text-white">
      <header className="fixed top-0 z-50 w-full border-b border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <SettingsIcon className="text-[#fcc025]" />
            <h1 className="text-xl font-extrabold uppercase italic tracking-tight text-[#fcc025]">
              {t('settings.title')}
            </h1>
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
            {saving ? 'Syncing' : 'Phase 2'}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-24">
        <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-[#262626] p-3">
                <User className="text-[#fcc025]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">Operator Profile</p>
                {isEditingName ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <input
                      value={displayNameDraft}
                      maxLength={20}
                      onChange={(event) => setDisplayNameDraft(event.target.value)}
                      className="rounded-xl border border-[#494847]/20 bg-[#0e0e0e] px-4 py-3 text-sm font-bold outline-none focus:border-[#fcc025]/40"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveDisplayName}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#fcc025] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black"
                      >
                        <Check size={14} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDisplayNameDraft(username || '');
                          setIsEditingName(false);
                        }}
                        className="rounded-xl border border-[#494847]/20 bg-[#262626] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="mt-1 truncate text-2xl font-black uppercase italic tracking-tight">
                      {username || 'OPERATOR'}
                    </h2>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#adaaaa]">
                      {address || 'NO ADDRESS'}
                    </p>
                  </>
                )}
              </div>
            </div>
            {!isEditingName && (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#262626] text-[#fcc025]"
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">Balance Preview</p>
            <p className="mt-2 text-3xl font-black italic tracking-tight text-[#fcc025]">{previewBalance}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <Volume2 className="text-[#fcc025]" size={18} />
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Display & Audio</h3>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">金額顯示格式</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => persistPrefs({ amountDisplay: 'compact' })}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                      amountDisplay === 'compact' ? 'bg-[#fcc025] text-black' : 'bg-[#262626] text-white'
                    }`}
                  >
                    100萬
                  </button>
                  <button
                    type="button"
                    onClick={() => persistPrefs({ amountDisplay: 'full' })}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                      amountDisplay === 'full' ? 'bg-[#fcc025] text-black' : 'bg-[#262626] text-white'
                    }`}
                  >
                    1,000,000
                  </button>
                </div>
              </div>
            </div>

            <SliderRow label="總音量" value={masterVolume} onChange={(value) => persistPrefs({ masterVolume: value })} />
            <SliderRow label="BGM 音量" value={bgmVolume} onChange={(value) => persistPrefs({ bgmVolume: value })} />
            <SliderRow label="音效音量" value={sfxVolume} onChange={(value) => persistPrefs({ sfxVolume: value })} />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">BGM</span>
                  <Toggle enabled={bgmEnabled} onClick={() => persistPrefs({ bgmEnabled: !bgmEnabled })} />
                </div>
              </div>
              <div className="rounded-2xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">SFX</span>
                  <Toggle enabled={sfxEnabled} onClick={() => persistPrefs({ sfxEnabled: !sfxEnabled })} />
                </div>
              </div>
              <div className="rounded-2xl border border-[#494847]/10 bg-[#0e0e0e] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider">彈幕</span>
                  <Toggle enabled={danmuEnabled} onClick={() => persistPrefs({ danmuEnabled: !danmuEnabled })} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="text-[#fcc025]" size={18} />
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Language</h3>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#adaaaa]">
                  {i18n.language === 'zh' ? 'Chinese' : 'English'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
              className="rounded-xl border border-[#fcc025]/20 bg-[#262626] px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#fcc025]"
            >
              Switch
            </button>
          </div>

          <div className="mt-6 divide-y divide-[#494847]/10 overflow-hidden rounded-2xl border border-[#494847]/10 bg-[#0e0e0e]">
            <Link to="/app/health" className="flex items-center justify-between p-4 transition-colors hover:bg-[#1a1919]">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">服務狀態</span>
              <ChevronRight size={16} className="text-[#adaaaa]" />
            </Link>
            <Link to="/app/support" className="flex items-center justify-between p-4 transition-colors hover:bg-[#1a1919]">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">安全與支援</span>
              <ChevronRight size={16} className="text-[#adaaaa]" />
            </Link>
          </div>
        </section>

        <section className="space-y-3 pb-4">
          {statusText && <p className="text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#fcc025]">{statusText}</p>}
          <button
            type="button"
            onClick={() => {
              clearAuth();
              window.location.href = '/login';
            }}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-600 to-red-800 py-4 text-sm font-black uppercase tracking-[0.2em]"
          >
            <LogOut size={18} />
            {t('settings.terminate_session')}
          </button>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 h-20 w-full border-t border-[#494847]/15 bg-[#0e0e0e]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-around px-4">
          <Link to="/app/casino/lobby" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <LayoutGrid size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.casino')}</span>
          </Link>
          <Link to="/app/market" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <TrendingUp size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.market')}</span>
          </Link>
          <Link to="/app/wallet" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <Wallet size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.vault')}</span>
          </Link>
          <Link to="/app/settings" className="flex flex-col items-center justify-center text-[#fcc025] drop-shadow-[0_0_8px_rgba(252,192,37,0.4)]">
            <SettingsIcon size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{t('nav.settings')}</span>
          </Link>
          <Link to="/app/transactions" className="flex flex-col items-center justify-center text-[#adaaaa] transition-all hover:text-white">
            <MessageSquareText size={24} className="mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Feed</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
