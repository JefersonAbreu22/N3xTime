import { http } from './http';
import { TeamUser, normalizeTeamUser } from './usersApi';

export type Department = {
  id: number;
  name: string;
  users?: TeamUser[];
  hierarchy_levels?: HierarchyLevel[];
};

export type LeadershipPermission = 'view_team' | 'manage_team' | 'view_time_records' | 'manage_time_records' | 'approve_requests' | 'view_reports' | 'manage_biometrics';
export type HierarchyLeader = {
  id?: number;
  user_id: number;
  permissions: LeadershipPermission[] | string;
  user?: Pick<TeamUser, 'id' | 'name' | 'email' | 'role' | 'department_id' | 'status'>;
};
export type HierarchyLevel = { id?: number; name: string; position?: number; leaders: HierarchyLeader[] };

const normalizePermissions = (value: LeadershipPermission[] | string): LeadershipPermission[] => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value) as LeadershipPermission[]; } catch { return []; }
};

export const departmentsApi = {
  list: async () => {
    const res = await http.get<{ success: boolean; data: Department[] }>('/departments');
    return {
      ...res.data,
      data: res.data.data.map((department) => ({
        ...department,
        users: department.users?.map(normalizeTeamUser),
        hierarchy_levels: department.hierarchy_levels?.map((level) => ({
          ...level,
          leaders: level.leaders.map((leader) => ({ ...leader, permissions: normalizePermissions(leader.permissions) })),
        })),
      })),
    };
  },
  create: async (name: string) => {
    const res = await http.post<{ success: boolean; data: Department }>('/departments', { name });
    return res.data;
  },
  update: async (id: number, name: string) => {
    const res = await http.put<{ success: boolean; data: Department }>(`/departments/${id}`, { name });
    return res.data;
  },
  delete: async (id: number) => {
    const res = await http.delete<{ success: boolean; message: string }>(`/departments/${id}`);
    return res.data;
  },
  updateHierarchy: async (id: number, levels: HierarchyLevel[]) => {
    const res = await http.put<{ success: boolean; message: string }>(`/departments/${id}/hierarchy`, { levels });
    return res.data;
  },
};
