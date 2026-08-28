import { create } from 'zustand';

export type PlatformUser = { id: number; name: string; email: string; role: 'platform_admin' };

type PlatformAuthState = {
  token: string | null;
  user: PlatformUser | null;
  setSession: (token: string, user: PlatformUser) => void;
  clearSession: () => void;
};

const STORAGE_KEY = 'n3xtime:platform-session';
const initial = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return value?.token && value?.user ? value : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
})();

export const usePlatformAuthStore = create<PlatformAuthState>((set) => ({
  ...initial,
  setSession: (token, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    set({ token, user });
  },
  clearSession: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null });
  },
}));
