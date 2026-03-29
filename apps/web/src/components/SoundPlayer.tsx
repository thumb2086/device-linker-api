import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useAudio } from '../hooks/useAudio';

export default function SoundPlayer() {
  const { sessionId, isAuthorized } = useAuthStore();
  const location = useLocation();
  const { init, playBGM, setPreferences } = useAudio();
  const replacePrefs = usePreferencesStore((state) => state.replacePrefs);
  const masterVolume = usePreferencesStore((state) => state.masterVolume);
  const bgmEnabled = usePreferencesStore((state) => state.bgmEnabled);
  const bgmVolume = usePreferencesStore((state) => state.bgmVolume);
  const sfxEnabled = usePreferencesStore((state) => state.sfxEnabled);
  const sfxVolume = usePreferencesStore((state) => state.sfxVolume);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!isAuthorized || !sessionId) return;

    fetch(`/api/v1/profile/prefs?sessionId=${sessionId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (payload?.success !== false && payload?.data?.prefs) {
          replacePrefs(payload.data.prefs);
        }
      })
      .catch(() => {});
  }, [sessionId, isAuthorized, replacePrefs]);

  useEffect(() => {
    setPreferences({
      masterVolume,
      bgmEnabled,
      bgmVolume,
      sfxEnabled,
      sfxVolume,
    });
  }, [masterVolume, bgmEnabled, bgmVolume, sfxEnabled, sfxVolume, setPreferences]);

  useEffect(() => {
    const path = location.pathname.toLowerCase();
    let track = 'lobby';

    if (path.includes('/casino/roulette') || path.includes('/casino/crash')) {
      track = 'tense';
    } else if (path.includes('/casino/')) {
      track = 'casino';
    } else if (path.startsWith('/app')) {
      track = 'lobby';
    } else if (path.includes('/login')) {
      track = 'lobby';
    }

    playBGM(track);
  }, [location.pathname, playBGM]);

  return null;
}
