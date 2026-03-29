// apps/web/src/features/auth/useAuth.ts

import { useAuthStore } from '../../store/useAuthStore';

export const useAuth = () => {
  const { address, sessionId, publicKey, isAuthorized, setAuth, clearAuth } = useAuthStore();

  return {
    isAuthorized,
    address,
    session: sessionId ? { id: sessionId, address, publicKey } : null,
    setAuth,
    logout: clearAuth,
  };
};
