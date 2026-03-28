import React, { useEffect, useState } from 'react';
import { useUserStore } from '../store/useUserStore';

export default function SoundPlayer() {
  const [bgm, setBgm] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initial BGM setup if needed
    // const audio = new Audio('/assets/sounds/bgm_main.mp3');
    // audio.loop = true;
    // setBgm(audio);
  }, []);

  return null; // Invisible component
}
