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
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: 'active' | 'inactive' | 'suspended';
  users_count: number;
  admins_count: number;
  active_admins_count: number;
  is_primary: boolean;
  created_at: string;
};

export type CompanyDetailsPayload = {
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
};

export type ProvisionCompanyPayload = CompanyDetailsPayload & {
  kiosk_access_key: string;
};

export type CompanyAdmin = {
  id: number;
  name: string;
  email: string;
  cpf: string;
  registration_number: string;
  status: 'active' | 'inactive';
  must_change_password: boolean;
  created_at: string;
};

export type CompanyAdminPayload = {
  name: string;
  email: string;
  cpf: string;
  registration_number: string;
  password: string;
  status?: 'active' | 'inactive';
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
  updateCompany: async (id: number, payload: CompanyDetailsPayload) => (await platformHttp.patch(`/companies/${id}`, payload)).data,
  listCompanyAdmins: async (id: number) =>
    (await platformHttp.get<{ success: boolean; data: CompanyAdmin[] }>(`/companies/${id}/admins`)).data,
  createCompanyAdmin: async (id: number, payload: CompanyAdminPayload) =>
    (await platformHttp.post<{ success: boolean; message: string; data: CompanyAdmin }>(`/companies/${id}/admins`, payload)).data,
  updateCompanyAdmin: async (id: number, userId: number, payload: CompanyAdminPayload & { status: 'active' | 'inactive' }) =>
    (await platformHttp.put<{ success: boolean; message: string; data?: CompanyAdmin }>(`/companies/${id}/admins/${userId}`, payload)).data,
  accessCompany: async (id: number) => (await platformHttp.post<{ success: boolean; data: { token: string; user: AuthUser } }>(`/companies/${id}/access`)).data,
  updateCompanyStatus: async (id: number, status: PlatformCompany['status'], reason: string) =>
    (await platformHttp.patch(`/companies/${id}/status`, { status, reason })).data,
  backupCompany: async (id: number) => (await platformHttp.get<Blob>(`/companies/${id}/backup`, { responseType: 'blob' })).data,
  importCompany: async (id: number, file: File, replaceExisting = true) => {
    const form = new FormData();
    form.append('dump', file);
    form.append('replaceExisting', String(replaceExisting));
    return (await platformHttp.post(`/companies/${id}/import`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  listLogs: async (params: PlatformLogFilters = {}) => (await platformHttp.get<{
    success: boolean;
    data: { items: PlatformLog[]; pagination: { page: number; limit: number; total: number; pages: number } };
  }>('/logs', { params })).data,
};
