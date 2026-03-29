import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useAudio } from '../hooks/useAudio';

export default function SoundPlayer() {
  const { sessionId, isAuthorized } = useAuthStore();
  const { toggleBGM, setGlobalVolume } = useAudio();
  const [prefs, setPrefs] = useState<any>(null);

  useEffect(() => {
    if (!isAuthorized) return;

    const fetchPrefs = () => {
        fetch(`/api/v1/profile/sound-prefs?sessionId=${sessionId}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) setPrefs(data.data);
          })
          .catch(() => {});
    };

    fetchPrefs();
    const interval = setInterval(fetchPrefs, 10000);
    return () => clearInterval(interval);
  }, [sessionId, isAuthorized]);

  useEffect(() => {
    if (prefs) {
        setGlobalVolume(prefs.volume);
        toggleBGM(prefs.bgmEnabled);
    }
  }, [prefs, toggleBGM, setGlobalVolume]);

  return null;
}
