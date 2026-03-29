import React, { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useAudio } from '../hooks/useAudio';

export default function SoundPlayer() {
  const { sessionId, isAuthorized } = useAuthStore();
  const { setPreferences } = useAudio();
  const replacePrefs = usePreferencesStore((state) => state.replacePrefs);
  const resetPrefs = usePreferencesStore((state) => state.resetPrefs);
  const masterVolume = usePreferencesStore((state) => state.masterVolume);
  const bgmEnabled = usePreferencesStore((state) => state.bgmEnabled);
  const bgmVolume = usePreferencesStore((state) => state.bgmVolume);
  const sfxEnabled = usePreferencesStore((state) => state.sfxEnabled);
  const sfxVolume = usePreferencesStore((state) => state.sfxVolume);

  useEffect(() => {
    if (!isAuthorized || !sessionId) {
      resetPrefs();
      return;
    }

    fetch(`/api/v1/profile/prefs?sessionId=${sessionId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (payload?.success !== false && payload?.data?.prefs) {
          replacePrefs(payload.data.prefs);
        }
      })
      .catch(() => {});
  }, [sessionId, isAuthorized, replacePrefs, resetPrefs]);

  useEffect(() => {
    setPreferences({
      masterVolume,
      bgmEnabled,
      bgmVolume,
      sfxEnabled,
      sfxVolume,
    });
  }, [masterVolume, bgmEnabled, bgmVolume, sfxEnabled, sfxVolume, setPreferences]);

  return null;
}
