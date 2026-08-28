import { http } from './http';

export type CompanyProfile = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  night_shift_start: string;
  night_shift_end: string;
  late_tolerance_minutes: number;
  lunch_tolerance_minutes: number;
  latitude: number | null;
  longitude: number | null;
  allowed_radius: number | null;
  block_outside_area: boolean;
};

export type UpdateCompanyPayload = Omit<CompanyProfile, 'id'>;

export const companyApi = {
  get: async () => {
    const res = await http.get<{ success: boolean; data: CompanyProfile }>('/company');
    return res.data;
  },
  update: async (payload: UpdateCompanyPayload) => {
    const res = await http.put<{ success: boolean; data: CompanyProfile; message?: string }>('/company', payload);
    return res.data;
  },
  rotateKioskKey: async (currentPassword: string, newKey: string) => {
    const res = await http.put<{ success: boolean; message: string }>('/company/kiosk-key', {
      current_password: currentPassword,
      new_key: newKey,
    });
    return res.data;
  },
};
