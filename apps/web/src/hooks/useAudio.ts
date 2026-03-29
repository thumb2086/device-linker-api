type AudioPrefs = {
  masterVolume: number;
  bgmEnabled: boolean;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
};

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmOscillator: OscillatorNode | null = null;
let unlockBound = false;

const state: AudioPrefs = {
  masterVolume: 0.7,
  bgmEnabled: true,
  bgmVolume: 0.45,
  sfxEnabled: true,
  sfxVolume: 0.75,
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function syncGain() {
  if (!masterGain || !bgmGain || !sfxGain) return;
  masterGain.gain.value = clamp(state.masterVolume);
  bgmGain.gain.value = state.bgmEnabled ? clamp(state.bgmVolume) : 0;
  sfxGain.gain.value = state.sfxEnabled ? clamp(state.sfxVolume) : 0;
}

function stopBgm() {
  if (bgmOscillator) {
    bgmOscillator.stop();
    bgmOscillator.disconnect();
    bgmOscillator = null;
  }
}

function startBgm() {
  const ctx = ensureAudio();
  if (!ctx || !bgmGain || bgmOscillator || ctx.state !== 'running' || !state.bgmEnabled) return;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  filter.Q.value = 0.8;

  bgmOscillator = ctx.createOscillator();
  bgmOscillator.type = 'triangle';
  bgmOscillator.frequency.value = 110;
  bgmOscillator.connect(filter);
  filter.connect(bgmGain);
  bgmOscillator.start();
}

function unlockAudio() {
  const ctx = ensureAudio();
  if (!ctx) return;
  void ctx.resume().then(() => {
    syncGain();
    if (state.bgmEnabled) startBgm();
  }).catch(() => {});
}

function bindUnlock() {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointerdown', unlockAudio, opts);
  window.addEventListener('keydown', unlockAudio, opts);
}

function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  if (!audioContext) {
    audioContext = new Context();
    masterGain = audioContext.createGain();
    bgmGain = audioContext.createGain();
    sfxGain = audioContext.createGain();
    bgmGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
    syncGain();
    bindUnlock();
  }
  return audioContext;
}

function play(name: string) {
  const ctx = ensureAudio();
  if (!ctx || !sfxGain || ctx.state !== 'running' || !state.sfxEnabled) return;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  const frequencyMap: Record<string, number> = {
    click: 660,
    win: 880,
    lose: 220,
    switch: 520,
  };

  oscillator.type = 'sine';
  oscillator.frequency.value = frequencyMap[name] || 440;
  envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
  oscillator.connect(envelope);
  envelope.connect(sfxGain);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.18);
}

function toggleBGM(shouldPlay: boolean) {
  state.bgmEnabled = shouldPlay;
  syncGain();
  if (shouldPlay) startBgm();
  else stopBgm();
}

function setGlobalVolume(volume: number) {
  state.masterVolume = clamp(volume);
  syncGain();
}

function setBGMVolume(volume: number) {
  state.bgmVolume = clamp(volume);
  syncGain();
}

function setSFXVolume(volume: number) {
  state.sfxVolume = clamp(volume);
  syncGain();
}

function setSFXEnabled(enabled: boolean) {
  state.sfxEnabled = enabled;
  syncGain();
}

function setPreferences(prefs: Partial<AudioPrefs>) {
  if (typeof prefs.masterVolume === 'number') state.masterVolume = clamp(prefs.masterVolume);
  if (typeof prefs.bgmEnabled === 'boolean') state.bgmEnabled = prefs.bgmEnabled;
  if (typeof prefs.bgmVolume === 'number') state.bgmVolume = clamp(prefs.bgmVolume);
  if (typeof prefs.sfxEnabled === 'boolean') state.sfxEnabled = prefs.sfxEnabled;
  if (typeof prefs.sfxVolume === 'number') state.sfxVolume = clamp(prefs.sfxVolume);
  syncGain();
  if (state.bgmEnabled) startBgm();
  else stopBgm();
}

export const useAudio = () => ({
  play,
  toggleBGM,
  setGlobalVolume,
  setBGMVolume,
  setSFXVolume,
  setSFXEnabled,
  setPreferences,
});
