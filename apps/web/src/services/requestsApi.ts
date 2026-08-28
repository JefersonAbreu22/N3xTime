import { http } from './http';

export type EmployeeRequest = {
  id: number;
  user_id: number;
  reviewed_by: number | null;
  request_type: 'time_adjustment' | 'medical_certificate' | 'declaration' | 'vacation' | 'day_off' | 'external_work';
  status: 'pending' | 'approved' | 'rejected';
  target_date: string;
  requested_entry_time: string | null;
  requested_lunch_start: string | null;
  requested_lunch_end: string | null;
  requested_exit_time: string | null;
  absence_start_time: string | null;
  absence_end_time: string | null;
  reason: string;
  attachment_name: string | null;
  attachment_url: string | null;
  admin_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  requester?: {
    id: number;
    name: string;
    registration_number?: string;
    department?: { id: number; name: string } | null;
  } | null;
  reviewer?: { id: number; name: string } | null;
};

export const requestsApi = {
  my: async () => {
    const res = await http.get<{ success: boolean; data: EmployeeRequest[] }>('/requests/my');
    return res.data;
  },
  create: async (payload: {
    request_type: EmployeeRequest['request_type'];
    target_date: string;
    requested_entry_time?: string | null;
    requested_lunch_start?: string | null;
    requested_lunch_end?: string | null;
    requested_exit_time?: string | null;
    absence_start_time?: string | null;
    absence_end_time?: string | null;
    reason: string;
    attachment_name?: string | null;
    attachment_url?: string | null;
    attachment_file?: File | null;
  }) => {
    const formData = new FormData();
    formData.append('request_type', payload.request_type);
    formData.append('target_date', payload.target_date);
    formData.append('reason', payload.reason);

    if (payload.requested_entry_time) formData.append('requested_entry_time', payload.requested_entry_time);
    if (payload.requested_lunch_start) formData.append('requested_lunch_start', payload.requested_lunch_start);
    if (payload.requested_lunch_end) formData.append('requested_lunch_end', payload.requested_lunch_end);
    if (payload.requested_exit_time) formData.append('requested_exit_time', payload.requested_exit_time);
    if (payload.absence_start_time) formData.append('absence_start_time', payload.absence_start_time);
    if (payload.absence_end_time) formData.append('absence_end_time', payload.absence_end_time);
    if (payload.attachment_name) formData.append('attachment_name', payload.attachment_name);
    if (payload.attachment_url) formData.append('attachment_url', payload.attachment_url);
    if (payload.attachment_file) formData.append('attachment', payload.attachment_file);

    const res = await http.post<{ success: boolean; data: EmployeeRequest; message?: string }>('/requests', formData);
    return res.data;
  },
  reviewQueue: async (params?: { status?: EmployeeRequest['status']; requestType?: EmployeeRequest['request_type'] | '' }) => {
    const res = await http.get<{ success: boolean; data: EmployeeRequest[] }>('/requests/review', { params });
    return res.data;
  },
  review: async (id: number, payload: { status: 'approved' | 'rejected'; admin_comment?: string | null; override_entry_time?: string | null; override_lunch_start?: string | null; override_lunch_end?: string | null; override_exit_time?: string | null; override_absence_start_time?: string | null; override_absence_end_time?: string | null; }) => {
    const res = await http.patch<{ success: boolean; data: EmployeeRequest; message?: string }>(`/requests/${id}/review`, payload);
    return res.data;
  },
  assignAbsence: async (payload: { user_id: number; request_type: 'vacation' | 'day_off' | 'medical_certificate' | 'declaration' | 'external_work'; target_date?: string; start_date?: string; end_date?: string; absence_start_time?: string; absence_end_time?: string; reason: string; attachment_file?: File | null; }) => {
    const formData = new FormData();
    formData.append('user_id', payload.user_id.toString());
    formData.append('request_type', payload.request_type);
    formData.append('reason', payload.reason);
    if (payload.target_date) formData.append('target_date', payload.target_date);
    if (payload.start_date) formData.append('start_date', payload.start_date);
    if (payload.end_date) formData.append('end_date', payload.end_date);
    if (payload.absence_start_time) formData.append('absence_start_time', payload.absence_start_time);
    if (payload.absence_end_time) formData.append('absence_end_time', payload.absence_end_time);
    if (payload.attachment_file) formData.append('attachment', payload.attachment_file);

    const res = await http.post<{ success: boolean; data: EmployeeRequest[]; message?: string }>('/requests/assign-absence', formData);
    return res.data;
  },
  delete: async (id: number) => {
    const res = await http.delete<{ success: boolean; message?: string }>(`/requests/${id}`);
    return res.data;
  },
};
