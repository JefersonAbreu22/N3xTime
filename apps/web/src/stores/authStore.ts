import { create } from 'zustand';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  company: { id: number; slug: string; name: string };
  remote_clock_in_enabled?: boolean;
  must_change_password?: boolean;
  is_platform_admin?: boolean;
  is_impersonating?: boolean;
  requires_time_tracking?: boolean;
  department_id?: number | null;
  leadership_permissions?: Array<'view_team' | 'manage_team' | 'view_time_records' | 'manage_time_records' | 'approve_requests' | 'view_reports' | 'manage_biometrics'>;
  available_companies?: Array<{ membershipId: number; companyId: number; userId: number; name: string; slug: string; role: 'admin' | 'manager' | 'employee' }>;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  beginImpersonation: (token: string, user: AuthUser) => void;
  endImpersonation: () => void;
  clearSession: () => void;
  markPasswordChanged: () => void;
};

const STORAGE_KEY = 'ponto-smart:session';
const ORIGIN_STORAGE_KEY = 'ponto-smart:origin-session';

const loadInitial = (): Pick<AuthState, 'token' | 'user'> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as { token: string; user: AuthUser };
    if (!parsed?.token || !parsed?.user) return { token: null, user: null };
    return { token: parsed.token, user: parsed.user };
  } catch {
    return { token: null, user: null };
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitial(),
  setSession: (token, user) =>
    set(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      return { token, user };
    }),
  beginImpersonation: (token, user) =>
    set((state) => {
      if (state.token && state.user && !state.user.is_impersonating) {
        localStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      return { token, user };
    }),
  endImpersonation: () =>
    set(() => {
      try {
        const origin = JSON.parse(localStorage.getItem(ORIGIN_STORAGE_KEY) || 'null') as { token: string; user: AuthUser } | null;
        localStorage.removeItem(ORIGIN_STORAGE_KEY);
        if (origin?.token && origin?.user) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(origin));
          return origin;
        }
      } catch {
        localStorage.removeItem(ORIGIN_STORAGE_KEY);
      }
      localStorage.removeItem(STORAGE_KEY);
      return { token: null, user: null };
    }),
  clearSession: () =>
    set(() => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ORIGIN_STORAGE_KEY);
      return { token: null, user: null };
    }),
  markPasswordChanged: () => set((state) => {
    if (!state.user || !state.token) return state;
    const user = { ...state.user, must_change_password: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user }));
    return { user };
  }),
}));

