import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  address: string | null;
  sessionId: string | null;
  publicKey: string | null;
  isAuthorized: boolean;
  setAuth: (address: string, sessionId: string, publicKey: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      address: null,
      sessionId: null,
      publicKey: null,
      isAuthorized: false,
      setAuth: (address, sessionId, publicKey) => set({ address, sessionId, publicKey, isAuthorized: true }),
      clearAuth: () => set({ address: null, sessionId: null, publicKey: null, isAuthorized: false }),
    }),
    { name: 'auth-storage' }
  )
);
