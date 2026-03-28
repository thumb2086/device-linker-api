import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export default function SoundPlayer() {
  const { sessionId, isAuthorized } = useAuthStore();
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
    const interval = setInterval(fetchPrefs, 5000); // Sync every 5s for simple state management
    return () => clearInterval(interval);
  }, [sessionId, isAuthorized]);

  // This is a placeholder for actual audio logic
  // In a real app, we would use these prefs to control Tone.js or native Audio objects
  useEffect(() => {
    if (prefs) {
        console.log("Sound Preferences Updated:", prefs);
        // window.bgmVolume = prefs.volume;
        // window.bgmEnabled = prefs.bgmEnabled;
    }
  }, [prefs]);

  return null;
}
