import { http } from './http';

const KIOSK_TOKEN_KEY = 'kiosk_token';
const LEGACY_KIOSK_TOKEN_KEY = 'kiosk_token';

export type AccountCompany = {
  membershipId: number;
  companyId: number;
  userId: number;
  name: string;
  slug: string;
  role: 'admin' | 'manager' | 'employee';
};

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  company: { id: number; slug: string; name: string };
  must_change_password?: boolean;
  is_platform_admin?: boolean;
  is_impersonating?: boolean;
  remote_clock_in_enabled?: boolean;
  requires_time_tracking?: boolean;
  department_id?: number | null;
  leadership_permissions?: Array<'view_team' | 'manage_team' | 'view_time_records' | 'manage_time_records' | 'approve_requests' | 'view_reports' | 'manage_biometrics'>;
  available_companies?: AccountCompany[];
};

export type LoginResponse = {
  success: boolean;
  data:
    | { token: string; user: SessionUser }
    | { requires_company_selection: true; selection_token: string; companies: AccountCompany[] };
};

type KioskLoginResponse = {
  success: boolean;
  data: {
    token: string;
    mode: 'kiosk';
    company: KioskCompany;
  };
};

export type KioskCompany = { id: number; slug: string; name: string };

type KioskStatusResponse = {
  success: boolean;
  data: {
    terminalEnabled: boolean;
    sessionVersion: number;
    lastRevokedAt: string | null;
    releasedAt?: string | null;
    company: KioskCompany;
  };
};

type BiometricSummaryResponse = {
  success: boolean;
  data: {
    totalUsers: number;
    usersWithBiometrics: number;
    usersWithoutBiometrics: number;
    usersWithLowCoverage: number;
    totalSamples: number;
    recommendedSampleCount: number;
    recentEnrollments: number;
    recentVerifications: number;
    recentVerificationFailures: number;
    recentResets: number;
    pinFallbacks: number;
    invalidPinAttempts: number;
    rateLimitedPinAttempts: number;
    lowConfidenceRejections: number;
    sampleCoverageRate: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
    deviceBreakdown: Array<{
      deviceLabel: string;
      successCount: number;
      failureCount: number;
      pinFallbackCount: number;
    }>;
  };
};

export type BiometricHistoryMetadata = {
  sampleCount?: number;
  replaceExisting?: boolean;
  previousSampleCount?: number;
  failedAttempts?: number;
  retryInSeconds?: number | null;
  validation?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
};

export type BiometricHistoryEvent = {
  id: number;
  user_id: number | null;
  event_type: 'enrollment' | 'verification_success' | 'verification_failure' | 'pin_fallback' | 'reset';
  method: 'facial' | 'pin' | 'manual' | 'web';
  success: boolean;
  match_score: string | null;
  threshold: string | null;
  reason: string | null;
  triggered_by: number | null;
  device_info: string | null;
  metadata: string | null;
  parsedMetadata?: BiometricHistoryMetadata | null;
  created_at: string;
  User?: { id: number; name: string; registration_number: string } | null;
  triggeredByUser?: { id: number; name: string } | null;
};

type BiometricHistoryResponse = {
  success: boolean;
  data: BiometricHistoryEvent[];
};

export const getKioskToken = () => {
  const persistedToken = window.localStorage.getItem(KIOSK_TOKEN_KEY);
  if (persistedToken) return persistedToken;

  const legacyToken = window.sessionStorage.getItem(LEGACY_KIOSK_TOKEN_KEY);
  if (legacyToken) {
    window.localStorage.setItem(KIOSK_TOKEN_KEY, legacyToken);
    window.sessionStorage.removeItem(LEGACY_KIOSK_TOKEN_KEY);
    return legacyToken;
  }

  return null;
};

export const clearKioskToken = () => {
  window.localStorage.removeItem(KIOSK_TOKEN_KEY);
  window.sessionStorage.removeItem(LEGACY_KIOSK_TOKEN_KEY);
};

export const getKioskHeaders = () => {
  const token = getKioskToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await http.post<LoginResponse>('/auth/login', { email, password });
    return res.data;
  },
  selectCompany: async (token: string, companyId: number) => {
    const res = await http.post<LoginResponse>('/auth/company/select', { companyId }, { headers: { Authorization: `Bearer ${token}` } });
    return res.data;
  },
  me: async () => {
    const res = await http.get<{ success: boolean; data: { user: SessionUser } }>('/auth/me');
    return res.data;
  },
  requestPasswordReset: async (email: string) => {
    const res = await http.post<{ success: boolean; message: string }>('/auth/password/forgot', { email });
    return res.data;
  },
  resetPassword: async (token: string, password: string) => {
    const res = await http.post<{ success: boolean; message: string }>('/auth/password/reset', { token, password });
    return res.data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await http.post<{ success: boolean; message: string }>('/auth/password/change', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return res.data;
  },
  getKioskCompany: async (companySlug: string) => {
    const res = await http.get<{ success: boolean; data: KioskCompany }>(`/auth/kiosk/company/${encodeURIComponent(companySlug)}`);
    return res.data;
  },
  kioskLogin: async (accessKey: string, companySlug?: string) => {
    const res = await http.post<KioskLoginResponse>('/auth/kiosk/login', { accessKey, ...(companySlug ? { companySlug } : {}) });
    if (res.data.success && res.data.data?.token) {
      window.localStorage.setItem(KIOSK_TOKEN_KEY, res.data.data.token);
      window.sessionStorage.removeItem(LEGACY_KIOSK_TOKEN_KEY);
    }
    return res.data;
  },
  getKioskStatus: async (useKioskToken = false) => {
    const res = await http.get<KioskStatusResponse>('/auth/kiosk/status', useKioskToken ? { headers: getKioskHeaders() } : undefined);
    return res.data;
  },
  releaseKioskSession: async () => {
    const res = await http.post<{
      success: boolean;
      message: string;
      data: { terminalEnabled: boolean; sessionVersion: number; releasedAt: string | null };
    }>('/auth/kiosk/release');
    return res.data;
  },
  revokeKioskSession: async () => {
    const res = await http.post<{ success: boolean; message: string; data: { terminalEnabled: boolean; sessionVersion: number; lastRevokedAt: string | null } }>(
      '/auth/kiosk/revoke'
    );
    clearKioskToken();
    return res.data;
  },
  getFaces: async (useKioskToken = false) => {
    const res = await http.get<{ success: boolean; data: Array<{ id: number; name: string; registration_number: string; descriptor: number[]; sampleDescriptors?: number[][]; sampleCount?: number; biometricUpdatedAt?: string | null; suggestedRecordType?: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | null }> }>(
      '/auth/faces',
      useKioskToken ? { headers: getKioskHeaders() } : undefined
    );
    return res.data;
  },
  registerFace: async (userId: number, descriptors: number[][], qualityScores?: number[], replaceExisting = true) => {
    const res = await http.post<{ success: boolean; message: string; data?: { sampleCount: number } }>('/auth/face/register', {
      userId,
      descriptors,
      qualityScores,
      replaceExisting,
    });
    return res.data;
  },
  resetFace: async (userId: number, reason?: string) => {
    const res = await http.post<{ success: boolean; message: string }>('/auth/face/reset', {
      userId,
      reason,
    });
    return res.data;
  },
  getBiometricSummary: async () => {
    const res = await http.get<BiometricSummaryResponse>('/auth/biometrics/summary');
    return res.data;
  },
  getBiometricHistory: async () => {
    const res = await http.get<BiometricHistoryResponse>('/auth/biometrics/history');
    return res.data;
  },
};
