import { create } from 'zustand';

interface UserState {
  address: string | null;
  balance: string;
  token: 'ZXC' | 'YJC';
  setAddress: (address: string | null) => void;
  setBalance: (balance: string) => void;
  setToken: (token: 'ZXC' | 'YJC') => void;
}

export const useUserStore = create<UserState>((set) => ({
  address: null,
  balance: '0',
  token: 'ZXC',
  setAddress: (address) => set({ address }),
  setBalance: (balance) => set({ balance }),
  setToken: (token) => set({ token }),
}));
