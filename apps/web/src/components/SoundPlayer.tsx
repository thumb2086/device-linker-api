import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../store/api';
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

    api.get('/api/v1/profile/prefs', { params: { sessionId } })
      .then((res) => {
        const payload = res.data;
        if (payload?.success === false) {
          console.warn('[SoundPlayer] API returned error, using defaults:', payload?.error);
          replacePrefs({});
          return;
        }
        if (payload?.data?.prefs) {
          replacePrefs(payload.data.prefs);
        } else {
          replacePrefs({});
        }
      })
      .catch((err) => {
        console.warn('[SoundPlayer] Failed to load prefs, using defaults:', err);
        replacePrefs({});
      });
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
    // Don't play BGM if not authorized
    if (!isAuthorized) return;

    const path = location.pathname.toLowerCase();
    let track = 'lobby';

    if (path.includes('/casino/roulette') || path.includes('/casino/crash')) {
      track = 'tense';
    } else if (path.includes('/casino/')) {
      track = 'casino';
    } else if (path.startsWith('/app')) {
      track = 'lobby';
    } else if (path.includes('/login')) {
      // No music on login page
      return;
    }

    playBGM(track);
  }, [location.pathname, playBGM, isAuthorized]);

  return null;
}
