import { http } from './http';

export type Holiday = {
  id: number;
  name: string;
  holiday_date: string;
  is_paid: boolean;
};

export const holidaysApi = {
  list: async () => {
    const res = await http.get<{ success: boolean; data: Holiday[] }>('/holidays');
    return res.data;
  },
  create: async (payload: { name: string; holiday_date: string; is_paid: boolean }) => {
    const res = await http.post<{ success: boolean; data: Holiday; message?: string }>('/holidays', payload);
    return res.data;
  },
  remove: async (id: number) => {
    const res = await http.delete<{ success: boolean; message?: string }>(`/holidays/${id}`);
    return res.data;
  },
};
