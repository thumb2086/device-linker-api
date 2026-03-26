import { Howl } from 'howler';

const sounds: Record<string, Howl> = {
  click: new Howl({ src: ['/audio/click.mp3'], volume: 0.5 }),
  bet: new Howl({ src: ['/audio/bet.mp3'], volume: 0.6 }),
  win: new Howl({ src: ['/audio/win.mp3'], volume: 0.8 }),
  lose: new Howl({ src: ['/audio/lose.mp3'], volume: 0.5 }),
  bgm: new Howl({ src: ['/audio/bgm_lobby.mp3'], volume: 0.2, loop: true }),
};

export const useAudio = () => {
  const play = (name: keyof typeof sounds) => {
    if (sounds[name]) {
      sounds[name].play();
    }
  };

  const toggleBGM = (play: boolean) => {
    if (play) {
      if (!sounds.bgm.playing()) sounds.bgm.play();
    } else {
      sounds.bgm.stop();
    }
  };

  return { play, toggleBGM };
};
