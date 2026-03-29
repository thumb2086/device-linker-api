import { Howl, Howler } from 'howler';

/**
 * Robust Sound Player
 * Uses Howler.js for audio management.
 * Gracefully handles missing audio files by suppressing 404 console errors
 * and providing a safe fallback.
 */

const createHowl = (src: string, options: any = {}) => {
  return new Howl({
    src: [src],
    html5: true, // Use HTML5 Audio for larger files and to help with cross-origin/loading
    onloaderror: (id, error) => {
        // Silently handle load errors for missing assets
        console.warn(`Audio load error for ${src}:`, error);
    },
    onplayerror: (id, error) => {
        console.error(`Audio play error for ${src}:`, error);
    },
    ...options
  });
};

const sounds: Record<string, Howl> = {
  click: createHowl('/audio/click.mp3', { volume: 0.5 }),
  bet: createHowl('/audio/bet.mp3', { volume: 0.6 }),
  win: createHowl('/audio/win.mp3', { volume: 0.8 }),
  lose: createHowl('/audio/lose.mp3', { volume: 0.5 }),
  bgm: createHowl('/audio/bgm_lobby.mp3', { volume: 0.2, loop: true }),
};

export const useAudio = () => {
  const play = (name: string) => {
    const sound = sounds[name];
    if (sound && sound.state() === 'loaded') {
      sound.play();
    } else if (sound && sound.state() === 'unloaded') {
      // Try to load once on first attempt if unloaded
      sound.load();
    }
  };

  const toggleBGM = (shouldPlay: boolean) => {
    if (shouldPlay) {
      if (sounds.bgm && !sounds.bgm.playing()) {
          if (sounds.bgm.state() === 'loaded') {
            sounds.bgm.play();
          } else {
            sounds.bgm.load();
          }
      }
    } else {
      if (sounds.bgm) sounds.bgm.stop();
    }
  };

  const setGlobalVolume = (volume: number) => {
    Howler.volume(volume);
  };

  return { play, toggleBGM, setGlobalVolume };
};
