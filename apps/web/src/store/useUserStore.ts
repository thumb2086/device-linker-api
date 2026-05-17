import { create } from 'zustand';

interface UserState {
  address: string | null;
  balance: string;
  username: string | null;
  token: 'ZXC' | 'YJC';
  activeAvatar: string;
  activeTitle: string;
  setAddress: (address: string | null) => void;
  setBalance: (balance: string) => void;
  setUsername: (username: string | null) => void;
  setToken: (token: 'ZXC' | 'YJC') => void;
  setActiveAvatar: (id: string) => void;
  setActiveTitle: (id: string) => void;
}

export const useUserStore = create<UserState>((set) => ({
  address: null,
  balance: '0',
  username: null,
  token: 'ZXC',
  activeAvatar: 'classic_chip',
  activeTitle: '',
  setAddress: (address) => set({ address }),
  setBalance: (balance) => set({ balance }),
  setUsername: (username) => set({ username }),
  setToken: (token) => set({ token }),
  setActiveAvatar: (id) => set({ activeAvatar: id }),
  setActiveTitle: (id) => set({ activeTitle: id }),
}));
