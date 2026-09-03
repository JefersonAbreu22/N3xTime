import { http } from './http';

export type AccessRestrictionType =
  | 'temporary_suspension'
  | 'inss_leave'
  | 'occupational_leave'
  | 'parental_leave'
  | 'unpaid_leave'
  | 'permanent_disability_retirement'
  | 'military_service'
  | 'union_or_elective_mandate'
  | 'family_care_leave'
  | 'protective_measure'
  | 'judicial_detention'
  | 'other_leave'
  | 'termination';

export const accessRestrictionLabels: Record<AccessRestrictionType, string> = {
  temporary_suspension: 'Suspensão temporária',
  inss_leave: 'Afastamento pelo INSS',
  occupational_leave: 'Acidente/doença do trabalho',
  parental_leave: 'Licença maternidade/parental',
  unpaid_leave: 'Licença não remunerada',
  permanent_disability_retirement: 'Aposentadoria por incapacidade',
  military_service: 'Serviço militar',
  union_or_elective_mandate: 'Mandato sindical ou eleitoral',
  family_care_leave: 'Acompanhamento familiar',
  protective_measure: 'Afastamento por medida protetiva',
  judicial_detention: 'Determinação judicial',
  other_leave: 'Outro afastamento',
  termination: 'Desligado',
};

export type TeamUser = {
  id: number;
  name: string;
  email: string;
  registration_number: string;
  work_type: 'presential' | 'hybrid' | 'remote';
  role: 'admin' | 'manager' | 'employee';
  manager_id: number | null;
  department_id: number | null;
  manager?: { id: number; name: string } | null;
  department?: { id: number; name: string } | null;
  has_biometric?: boolean;
  biometric_sample_count?: number;
  biometric_updated_at?: string | null;
  schedule?: {
    id: number;
    name: string;
    type: 'fixed' | '12x36' | 'rotative' | 'custom';
    entry_time: string;
    exit_time: string;
    lunch_duration: number;
    flexible_lunch: boolean;
    work_days: number[];
    daily_workload_minutes: number;
  } | null;
  status: 'active' | 'suspended' | 'inactive';
  suspended_at?: string | null;
  suspended_by?: number | null;
  suspension_reason?: string | null;
  suspension_type?: AccessRestrictionType | null;
  suspension_start_date?: string | null;
  suspension_end_at?: string | null;
  remote_clock_in_enabled?: boolean;
  remote_clock_in_justification?: string | null;
  hire_date?: string | null;
  requires_time_tracking?: boolean;
  created_at: string;
};

export type ManagerUser = {
  id: number;
  name: string;
  email: string;
};

export type CreateEmployeePayload = {
  name: string;
  cpf: string;
  registration_number: string;
  email: string;
  password: string;
  work_type: 'presential' | 'hybrid' | 'remote';
  role?: 'employee' | 'manager';
  manager_id?: number | null;
  department_id?: number | null;
  schedule_id?: number | null;
  work_schedule?: {
    entry_time: string;
    exit_time: string;
    lunch_duration: number;
    flexible_lunch: boolean;
    work_days: number[];
  } | null;
  pin_code?: string | null;
  status?: 'active' | 'inactive';
  remote_clock_in_enabled?: boolean;
  remote_clock_in_justification?: string | null;
  hire_date?: string | null;
  requires_time_tracking?: boolean;
};

const normalizeJsonValue = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeWorkDays = (value: unknown): number[] => {
  const parsed = normalizeJsonValue<unknown>(value, []);
  if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];

  const days = parsed
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return days.length ? days : [1, 2, 3, 4, 5];
};

export const normalizeTeamUser = (user: TeamUser): TeamUser => ({
  ...user,
  schedule: user.schedule
    ? {
        ...user.schedule,
        work_days: normalizeWorkDays(user.schedule.work_days),
      }
    : user.schedule,
});

export const usersApi = {
  team: async () => {
    const res = await http.get<{ success: boolean; data: TeamUser[] }>('/users/team');
    return { ...res.data, data: res.data.data.map(normalizeTeamUser) };
  },
  managers: async () => {
    const res = await http.get<{ success: boolean; data: ManagerUser[] }>('/users/managers');
    return res.data;
  },
  createEmployee: async (payload: CreateEmployeePayload) => {
    const res = await http.post<{ success: boolean; data: TeamUser }>('/users', payload);
    return { ...res.data, data: normalizeTeamUser(res.data.data) };
  },
  updateEmployee: async (id: number, payload: Partial<CreateEmployeePayload>) => {
    const res = await http.put<{ success: boolean; message: string }>(`/users/${id}`, payload);
    return res.data;
  },
  changeStatus: async (id: number, payload: {
    status: 'active' | 'suspended';
    reason?: string | null;
    restriction_type?: AccessRestrictionType | null;
    start_date?: string | null;
    end_date?: string | null;
  }) => {
    const res = await http.patch<{ success: boolean; message: string }>(`/users/${id}/status`, payload);
    return res.data;
  },
  deleteEmployee: async (id: number) => {
    const res = await http.delete<{ success: boolean; message: string }>(`/users/${id}`);
    return res.data;
  },
};
