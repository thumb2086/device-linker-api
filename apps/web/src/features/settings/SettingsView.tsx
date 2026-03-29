import { Link } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Edit2,
  Globe,
  LogOut,
  Settings as SettingsIcon,
  User,
  Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@repo/shared';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserStore } from '../../store/useUserStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import AppBottomNav from '../../components/AppBottomNav';
import { useWallet } from '../wallet/useWallet';
import { resolvePreferredBalance } from '../../utils/balance';

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
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#adaaaa]">
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
  const { summary: walletSummaryQuery } = useWallet();
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

  const isZh = i18n.language.startsWith('zh');
  const zh = {
    syncing: '\u540c\u6b65\u4e2d',
    profile: '\u64cd\u4f5c\u54e1\u6a94\u6848',
    save: '\u5132\u5b58',
    cancel: '\u53d6\u6d88',
    noAddress: '\u672a\u9023\u63a5\u5730\u5740',
    balancePreview: '\u9918\u984d\u9810\u89bd',
    displayAudio: '\u986f\u793a\u8207\u97f3\u6548',
    amountDisplay: '\u91d1\u984d\u986f\u793a\u683c\u5f0f',
    masterVolume: '\u7e3d\u97f3\u91cf',
    bgmVolume: 'BGM \u97f3\u91cf',
    sfxVolume: '\u97f3\u6548\u97f3\u91cf',
    danmaku: '\u5f48\u5e55',
    language: '\u8a9e\u8a00',
    chinese: '\u4e2d\u6587',
    switchLabel: '\u5207\u63db',
    supportCenter: '\u652f\u63f4\u4e2d\u5fc3',
    githubRepo: 'GitHub \u5009\u5eab',
    syncingSettings: '\u8a2d\u5b9a\u540c\u6b65\u4e2d...',
    syncFailed: '\u8a2d\u5b9a\u540c\u6b65\u5931\u6557',
    settingsSaved: '\u8a2d\u5b9a\u5df2\u5132\u5b58',
    nameLength: '\u986f\u793a\u540d\u7a31\u9577\u5ea6\u9700\u4ecb\u65bc 2 \u5230 20 \u5b57',
    nameUpdateFailed: '\u986f\u793a\u540d\u7a31\u66f4\u65b0\u5931\u6557',
    nameUpdated: '\u986f\u793a\u540d\u7a31\u5df2\u66f4\u65b0',
  };

  const walletPreviewBalance = resolvePreferredBalance({
    onchainBalance: walletSummaryQuery.data?.onchain?.zxc?.balance,
    onchainAvailable: walletSummaryQuery.data?.onchain?.zxc?.available,
    walletBalance: walletSummaryQuery.data?.summary?.balances?.ZXC,
    fallbackBalance: balance,
  });

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
    setStatusText(isZh ? zh.syncingSettings : 'Syncing settings...');
    try {
      const res = await fetch('/api/v1/profile/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, prefs: updates }),
      });
      const payload = await res.json();
      if (payload?.success === false) {
        setStatusText(isZh ? zh.syncFailed : 'Failed to sync settings');
      } else {
        setStatusText(isZh ? zh.settingsSaved : 'Settings saved');
      }
    } catch {
      setStatusText(isZh ? zh.syncFailed : 'Failed to sync settings');
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatusText(null), 1500);
    }
  };

  const saveDisplayName = async () => {
    const nextName = displayNameDraft.trim();
    if (!sessionId || nextName.length < 2 || nextName.length > 20) {
      setStatusText(isZh ? zh.nameLength : 'Display name must be 2-20 characters');
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
        setStatusText(isZh ? zh.nameUpdateFailed : 'Failed to update display name');
        return;
      }
      setUsername(nextName);
      setIsEditingName(false);
      setStatusText(isZh ? zh.nameUpdated : 'Display name updated');
    } catch {
      setStatusText(isZh ? zh.nameUpdateFailed : 'Failed to update display name');
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatusText(null), 1500);
    }
  };

  const previewBalance = useMemo(
    () => formatNumber(walletPreviewBalance || 0, amountDisplay === 'full' ? 'full' : 'short'),
    [amountDisplay, walletPreviewBalance]
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
            {saving ? (isZh ? zh.syncing : 'Syncing') : 'Phase 2'}
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
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adaaaa]">
                  {isZh ? zh.profile : 'Operator Profile'}
                </p>
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
                        {isZh ? zh.save : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDisplayNameDraft(username || '');
                          setIsEditingName(false);
                        }}
                        className="rounded-xl border border-[#494847]/20 bg-[#262626] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                      >
                        {isZh ? zh.cancel : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="mt-1 truncate text-2xl font-black uppercase italic tracking-tight">
                      {username || 'OPERATOR'}
                    </h2>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#adaaaa]">
                      {address || (isZh ? zh.noAddress : 'NO ADDRESS')}
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
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#adaaaa]">
              {isZh ? zh.balancePreview : 'Balance Preview'}
            </p>
            <p className="mt-2 text-3xl font-black italic tracking-tight text-[#fcc025]">{previewBalance}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#494847]/10 bg-[#1a1919] p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <Volume2 className="text-[#fcc025]" size={18} />
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
              {isZh ? zh.displayAudio : 'Display & Audio'}
            </h3>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                  {isZh ? zh.amountDisplay : 'Amount Display'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => persistPrefs({ amountDisplay: 'compact' })}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                      amountDisplay === 'compact' ? 'bg-[#fcc025] text-black' : 'bg-[#262626] text-white'
                    }`}
                  >
                    {isZh ? '100\u842c' : '100M'}
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

            <SliderRow label={isZh ? zh.masterVolume : 'Master Volume'} value={masterVolume} onChange={(value) => persistPrefs({ masterVolume: value })} />
            <SliderRow label={isZh ? zh.bgmVolume : 'BGM Volume'} value={bgmVolume} onChange={(value) => persistPrefs({ bgmVolume: value })} />
            <SliderRow label={isZh ? zh.sfxVolume : 'SFX Volume'} value={sfxVolume} onChange={(value) => persistPrefs({ sfxVolume: value })} />

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
                  <span className="text-[11px] font-bold uppercase tracking-wider">{isZh ? zh.danmaku : 'Danmaku'}</span>
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
                <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                  {isZh ? zh.language : 'Language'}
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#adaaaa]">
                  {isZh ? zh.chinese : 'English'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => i18n.changeLanguage(isZh ? 'en' : 'zh')}
              className="rounded-xl border border-[#fcc025]/20 bg-[#262626] px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#fcc025]"
            >
              {isZh ? zh.switchLabel : 'Switch'}
            </button>
          </div>

          <div className="mt-6 divide-y divide-[#494847]/10 overflow-hidden rounded-2xl border border-[#494847]/10 bg-[#0e0e0e]">
            <Link to="/app/support" className="flex items-center justify-between p-4 transition-colors hover:bg-[#1a1919]">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                {isZh ? zh.supportCenter : 'Support Center'}
              </span>
              <ChevronRight size={16} className="text-[#adaaaa]" />
            </Link>
            <a
              href="https://github.com/thumb2086/device-linker-api"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-4 transition-colors hover:bg-[#1a1919]"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                {isZh ? zh.githubRepo : 'GitHub Repository'}
              </span>
              <ChevronRight size={16} className="text-[#adaaaa]" />
            </a>
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

      <AppBottomNav current="settings" />
    </div>
  );
}
