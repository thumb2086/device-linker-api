import { create } from 'zustand';

export type AmountDisplayFormat = 'compact' | 'full';

export interface UserPreferences {
  amountDisplay: AmountDisplayFormat;
  danmuEnabled: boolean;
  masterVolume: number;
  bgmEnabled: boolean;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  amountDisplay: 'compact',
  danmuEnabled: true,
  masterVolume: 0.7,
  bgmEnabled: true,
  bgmVolume: 0.45,
  sfxEnabled: true,
  sfxVolume: 0.75,
};

interface PreferenceState extends UserPreferences {
  hydrated: boolean;
  setPrefs: (prefs: Partial<UserPreferences>) => void;
  replacePrefs: (prefs: Partial<UserPreferences>) => void;
  resetPrefs: () => void;
}

export const usePreferencesStore = create<PreferenceState>((set) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,
  setPrefs: (prefs) => set((state) => ({ ...state, ...prefs })),
  replacePrefs: (prefs) => set(() => ({ ...DEFAULT_PREFERENCES, ...prefs, hydrated: true })),
  resetPrefs: () => set(() => ({ ...DEFAULT_PREFERENCES, hydrated: false })),
}));
