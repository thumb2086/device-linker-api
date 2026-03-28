import { create } from 'zustand';

interface UserState {
  address: string | null;
  balance: string;
  username: string | null;
  token: 'ZXC' | 'YJC';
  setAddress: (address: string | null) => void;
  setBalance: (balance: string) => void;
  setUsername: (username: string | null) => void;
  setToken: (token: 'ZXC' | 'YJC') => void;
}

export const useUserStore = create<UserState>((set) => ({
  address: null,
  balance: '0',
  username: null,
  token: 'ZXC',
  setAddress: (address) => set({ address }),
  setBalance: (balance) => set({ balance }),
  setUsername: (username) => set({ username }),
  setToken: (token) => set({ token }),
}));
