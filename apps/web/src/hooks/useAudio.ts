type AudioPrefs = {
  masterVolume: number;
  bgmEnabled: boolean;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
};

type SoundKey =
  | 'click'
  | 'win_small'
  | 'win_big'
  | 'bet'
  | 'slot_reel'
  | 'slot_stop'
  | 'crash_engine'
  | 'crash_explosion'
  | 'bgm_lobby'
  | 'bgm_casino'
  | 'bgm_tense';

declare global {
  interface Window {
    Howl?: new (options: Record<string, unknown>) => any;
    Howler?: {
      autoUnlock?: boolean;
      html5PoolSize?: number;
    };
    __deviceLinkerAudioManager?: AudioManager;
  }
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

class AudioManager {
  private sounds: Partial<Record<SoundKey, any>> = {};
  private currentBgmKey = '';
  private currentBgmId: number | null = null;
  private pendingBgmKey = '';
  private initialized = false;
  private initializing = false;
  private loadingHowler = false;
  private pendingBgmReplay = false;
  private gestureBound = false;
  private clickBound = false;

  private state: AudioPrefs = {
    masterVolume: 0.7,
    bgmEnabled: true,
    bgmVolume: 0.45,
    sfxEnabled: true,
    sfxVolume: 0.75,
  };

  private soundConfig: Record<SoundKey, string> = {
    click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    win_small: 'https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3',
    win_big: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
    bet: 'https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3',
    slot_reel: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
    slot_stop: 'https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3',
    crash_engine: 'https://assets.mixkit.co/active_storage/sfx/2022/2022-preview.mp3',
    crash_explosion: 'https://assets.mixkit.co/active_storage/sfx/2023/2023-preview.mp3',
    bgm_lobby: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    bgm_casino: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    bgm_tense: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  };

  private isBgmKey(key: string): key is Extract<SoundKey, `bgm_${string}`> {
    return key.startsWith('bgm_');
  }

  private getEffectiveVolume(key: SoundKey, overrideVolume?: number): number {
    const base = this.isBgmKey(key) ? this.state.bgmVolume : this.state.sfxVolume;
    const withMaster = clamp(base) * clamp(this.state.masterVolume);
    if (typeof overrideVolume === 'number') return clamp(overrideVolume) * withMaster;
    return withMaster;
  }

  private isMuted(key: SoundKey): boolean {
    if (this.state.masterVolume <= 0) return true;
    if (this.isBgmKey(key)) return !this.state.bgmEnabled || this.state.bgmVolume <= 0;
    return !this.state.sfxEnabled || this.state.sfxVolume <= 0;
  }

  private ensureHowlerScript() {
    if (typeof window === 'undefined' || window.Howl || this.loadingHowler) return;
    const existing = document.querySelector('script[data-audio-manager="howler"]');
    if (existing) {
      this.loadingHowler = true;
      return;
    }

    this.loadingHowler = true;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js';
    script.async = true;
    script.dataset.audioManager = 'howler';
    script.onload = () => {
      this.loadingHowler = false;
      this.finishInit();
    };
    script.onerror = () => {
      this.loadingHowler = false;
      this.initializing = false;
    };
    document.head.appendChild(script);
  }

  private finishInit() {
    if (this.initialized || typeof window === 'undefined' || !window.Howl) return;
    if (window.Howler) {
      window.Howler.autoUnlock = true;
      if (typeof window.Howler.html5PoolSize === 'number' && window.Howler.html5PoolSize < 24) {
        window.Howler.html5PoolSize = 24;
      }
    }
    this.initialized = true;
    this.initializing = false;
    this.preloadSfx();
    this.applyAllSoundStates();
    this.flushPendingBgmReplay();
  }

  init() {
    if (typeof window === 'undefined') return;
    this.bindGestureUnlock();
    this.bindGlobalClickSound();
    if (this.initialized || this.initializing) return;
    this.initializing = true;
    if (window.Howl) {
      this.finishInit();
      return;
    }
    this.ensureHowlerScript();
  }

  private preloadSfx() {
    (Object.keys(this.soundConfig) as SoundKey[]).forEach((key) => {
      if (!this.isBgmKey(key)) this.ensureSound(key);
    });
  }

  private bindGestureUnlock() {
    if (this.gestureBound || typeof window === 'undefined') return;
    this.gestureBound = true;

    const unlock = () => {
      this.init();
      if (this.pendingBgmKey && this.state.bgmEnabled) {
        this.playBGM(this.pendingBgmKey);
      }
    };

    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  private bindGlobalClickSound() {
    if (this.clickBound || typeof document === 'undefined') return;
    this.clickBound = true;

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest('button, a, [role="button"], input[type="range"], select');
      if (!interactive) return;
      this.play('click', { volume: 0.6 });
    });
  }

  private ensureSound(key: SoundKey) {
    if (typeof window === 'undefined' || !window.Howl) return null;
    if (this.sounds[key]) return this.sounds[key] || null;

    const sound = new window.Howl({
      src: [this.soundConfig[key]],
      html5: this.isBgmKey(key),
      preload: !this.isBgmKey(key),
      mute: this.isMuted(key),
      volume: this.getEffectiveVolume(key),
    });
    this.sounds[key] = sound;
    return sound;
  }

  private releaseSound(key: SoundKey) {
    const sound = this.sounds[key];
    if (!sound) return;
    try {
      sound.stop();
      if (typeof sound.unload === 'function') sound.unload();
    } catch {}
    delete this.sounds[key];
  }

  private applySoundState(key: SoundKey) {
    const sound = this.sounds[key];
    if (!sound) return;
    sound.mute(this.isMuted(key));
    sound.volume(this.getEffectiveVolume(key));
  }

  private applyAllSoundStates() {
    (Object.keys(this.sounds) as SoundKey[]).forEach((key) => this.applySoundState(key));
  }

  private normalizeBgmKey(trackName?: string): Extract<SoundKey, `bgm_${string}`> {
    const raw = String(trackName || '').trim().toLowerCase();
    if (!raw) return 'bgm_lobby';
    if (raw in this.soundConfig && this.isBgmKey(raw)) return raw as Extract<SoundKey, `bgm_${string}`>;
    const prefixed = raw.startsWith('bgm_') ? raw : `bgm_${raw}`;
    if (prefixed in this.soundConfig && this.isBgmKey(prefixed)) return prefixed as Extract<SoundKey, `bgm_${string}`>;
    return 'bgm_lobby';
  }

  private flushPendingBgmReplay() {
    if (!this.pendingBgmReplay) return;
    this.pendingBgmReplay = false;
    if (this.pendingBgmKey && this.state.bgmEnabled) {
      this.playBGM(this.pendingBgmKey);
    }
  }

  play(key: Exclude<SoundKey, `bgm_${string}`> | Extract<SoundKey, `bgm_${string}`>, options?: { loop?: boolean; volume?: number }) {
    this.init();
    if (!this.initialized || !window.Howl) return null;
    const sound = this.ensureSound(key);
    if (!sound || this.isMuted(key)) return null;

    sound.loop(Boolean(options?.loop));
    sound.mute(this.isMuted(key));
    sound.volume(this.getEffectiveVolume(key, options?.volume));
    const id = sound.play();
    if (this.isBgmKey(key)) {
      this.currentBgmKey = key;
      this.currentBgmId = id;
      this.pendingBgmKey = key;
    }
    return id;
  }

  stop(key: SoundKey, id?: number | null) {
    const sound = this.sounds[key];
    if (!sound) return;
    if (id) sound.stop(id);
    else sound.stop();

    if (this.currentBgmKey === key && (!id || this.currentBgmId === id)) {
      this.currentBgmId = null;
    }
  }

  playBGM(trackName?: string) {
    const key = this.normalizeBgmKey(trackName);
    this.pendingBgmKey = key;
    this.init();

    if (this.initializing && !this.initialized) {
      this.pendingBgmReplay = true;
      return null;
    }
    if (!this.initialized || this.isMuted(key)) return null;

    if (this.currentBgmKey && this.currentBgmKey !== key) {
      this.stop(this.currentBgmKey as SoundKey, this.currentBgmId);
      this.currentBgmKey = '';
      this.currentBgmId = null;
    }

    if (this.currentBgmKey === key && this.currentBgmId) {
      this.applySoundState(key);
      return this.currentBgmId;
    }

    return this.play(key, { loop: true, volume: 1 });
  }

  stopBGM() {
    if (!this.currentBgmKey) return;
    const currentKey = this.currentBgmKey as SoundKey;
    this.stop(currentKey, this.currentBgmId);
    this.currentBgmKey = '';
    this.currentBgmId = null;
  }

  setPreferences(prefs: Partial<AudioPrefs>) {
    if (typeof prefs.masterVolume === 'number') this.state.masterVolume = clamp(prefs.masterVolume);
    if (typeof prefs.bgmEnabled === 'boolean') this.state.bgmEnabled = prefs.bgmEnabled;
    if (typeof prefs.bgmVolume === 'number') this.state.bgmVolume = clamp(prefs.bgmVolume);
    if (typeof prefs.sfxEnabled === 'boolean') this.state.sfxEnabled = prefs.sfxEnabled;
    if (typeof prefs.sfxVolume === 'number') this.state.sfxVolume = clamp(prefs.sfxVolume);

    this.applyAllSoundStates();
    if (!this.state.bgmEnabled || this.state.masterVolume <= 0 || this.state.bgmVolume <= 0) {
      this.stopBGM();
    } else if (this.pendingBgmKey) {
      this.playBGM(this.pendingBgmKey);
    }
  }
}

function getAudioManager(): AudioManager {
  if (typeof window === 'undefined') return new AudioManager();
  if (!window.__deviceLinkerAudioManager) {
    window.__deviceLinkerAudioManager = new AudioManager();
  }
  return window.__deviceLinkerAudioManager;
}

const audioApi = {
  init: () => getAudioManager().init(),
  play: (name: SoundKey, options?: { loop?: boolean; volume?: number }) => getAudioManager().play(name, options),
  playBGM: (trackName?: string) => getAudioManager().playBGM(trackName),
  stopBGM: () => getAudioManager().stopBGM(),
  setPreferences: (prefs: Partial<AudioPrefs>) => getAudioManager().setPreferences(prefs),
};

export const useAudio = () => audioApi;
