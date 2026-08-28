import axios from 'axios';
import { usePlatformAuthStore, type PlatformUser } from '../stores/platformAuthStore';
import { useAuthStore, type AuthUser } from '../stores/authStore';

const platformHttp = axios.create({
  baseURL: import.meta.env.PROD ? '/api/platform' : (import.meta.env.VITE_API_BASE_URL || '/api') + '/platform',
});

platformHttp.interceptors.request.use((config) => {
  const token = usePlatformAuthStore.getState().token || useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type PlatformCompany = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  slug: string;
  cnpj: string | null;
  status: 'active' | 'inactive' | 'suspended';
  users_count: number;
  is_primary: boolean;
  created_at: string;
};

export type ProvisionCompanyPayload = {
  legal_name: string;
  trade_name?: string;
  slug: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  address_line?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  kiosk_access_key: string;
  admin: { name: string; email: string; password: string; cpf: string; registration_number: string };
};

export type PlatformLogCategory = 'platform' | 'audit' | 'biometric' | 'clock' | 'request' | 'email';

export type PlatformLog = {
  id: string;
  source_id: number;
  category: PlatformLogCategory;
  event: string;
  company_id: number | null;
  company_name: string | null;
  actor_name: string | null;
  actor_email: string | null;
  subject_name: string | null;
  ip_address: string | null;
  device_info: string | null;
  success: boolean | number | null;
  details: Record<string, unknown> | string | null;
  occurred_at: string;
};

export type PlatformLogFilters = {
  page?: number;
  limit?: number;
  companyId?: number;
  category?: PlatformLogCategory;
  search?: string;
  from?: string;
  to?: string;
};

export const platformApi = {
  bootstrapSession: async () => {
    const response = await platformHttp.post<{ success: boolean; data: { token: string; user: PlatformUser } }>('/auth/session');
    return response.data;
  },
  listCompanies: async () => (await platformHttp.get<{ success: boolean; data: PlatformCompany[] }>('/companies')).data,
  provisionCompany: async (payload: ProvisionCompanyPayload) => (await platformHttp.post('/companies', payload)).data,
  accessCompany: async (id: number) => (await platformHttp.post<{ success: boolean; data: { token: string; user: AuthUser } }>(`/companies/${id}/access`)).data,
  updateCompanyStatus: async (id: number, status: PlatformCompany['status'], reason: string) =>
    (await platformHttp.patch(`/companies/${id}/status`, { status, reason })).data,
  listLogs: async (params: PlatformLogFilters = {}) => (await platformHttp.get<{
    success: boolean;
    data: { items: PlatformLog[]; pagination: { page: number; limit: number; total: number; pages: number } };
  }>('/logs', { params })).data,
};
