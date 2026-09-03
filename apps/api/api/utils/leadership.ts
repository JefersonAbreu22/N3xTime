import { Op } from 'sequelize';
import { DepartmentHierarchyLevel } from '../models/DepartmentHierarchyLevel.js';
import { DepartmentLeaderAssignment, LeadershipPermission } from '../models/DepartmentLeaderAssignment.js';
import { User } from '../models/User.js';

const normalizePermissions = (value: DepartmentLeaderAssignment['permissions']): LeadershipPermission[] => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const allLeadershipPermissions: LeadershipPermission[] = ['view_team', 'manage_team', 'view_time_records', 'manage_time_records', 'approve_requests', 'view_reports', 'manage_biometrics'];

export const getEffectiveLeadershipPermissions = async (userId: number): Promise<LeadershipPermission[]> => {
  const assignments = await DepartmentLeaderAssignment.findAll({ where: { user_id: userId }, attributes: ['permissions'] });
  if (!assignments.length) return allLeadershipPermissions;
  return [...new Set(assignments.flatMap((assignment) => normalizePermissions(assignment.permissions)))];
};

export const getLeadershipAssignments = async (managerId: number, permission: LeadershipPermission = 'view_team') => {
  const assignments = await DepartmentLeaderAssignment.findAll({
    where: { user_id: managerId },
    include: [{ model: DepartmentHierarchyLevel, as: 'level', attributes: ['id', 'position'], required: true }],
  }) as Array<DepartmentLeaderAssignment & { level?: DepartmentHierarchyLevel }>;

  return assignments.filter((assignment) => normalizePermissions(assignment.permissions).includes(permission));
};

export const isManagerResponsibleForUser = async (
  managerId: number,
  _managerDepartmentId: number | null | undefined,
  employee: { id?: number; manager_id?: number | null; department_id?: number | null },
  permission: LeadershipPermission = 'view_team'
) => {
  if (employee.id === managerId) return false;

  const assignments = await getLeadershipAssignments(managerId, permission);
  const assignment = assignments.find((item) => item.department_id === employee.department_id);
  if (assignment) {
    // Leaders at the same level do not manage each other. Higher levels can see
    // lower levels, and every configured level reaches the employees below it.
    if (employee.id) {
      const employeeAssignments = await DepartmentLeaderAssignment.findAll({
        where: { user_id: employee.id, department_id: employee.department_id },
        include: [{ model: DepartmentHierarchyLevel, as: 'level', attributes: ['position'], required: true }],
      }) as Array<DepartmentLeaderAssignment & { level?: DepartmentHierarchyLevel }>;
      if (employeeAssignments.length) {
        return employeeAssignments.every((item) => Number(assignment.level?.position) < Number(item.level?.position));
      }
    }
    return true;
  }

  // Backward compatibility only for leaders that have not entered the new model yet.
  const hasConfiguredHierarchy = await DepartmentLeaderAssignment.count({ where: { user_id: managerId } });
  return hasConfiguredHierarchy === 0 && employee.manager_id === managerId;
};

export const getManagedUserIds = async (
  managerId: number,
  _managerDepartmentId: number | null | undefined,
  permission: LeadershipPermission = 'view_team'
) => {
  const assignments = await getLeadershipAssignments(managerId, permission);
  const departmentIds = [...new Set(assignments.map((item) => item.department_id))];
  const legacyWhere = { manager_id: managerId };

  if (!departmentIds.length) {
    if (await DepartmentLeaderAssignment.count({ where: { user_id: managerId } })) return [];
    const users = await User.findAll({ where: { status: { [Op.ne]: 'inactive' }, ...legacyWhere }, attributes: ['id'] });
    return users.map((user) => user.id);
  }

  const candidates = await User.findAll({
    where: {
      status: { [Op.ne]: 'inactive' },
      id: { [Op.ne]: managerId },
      [Op.or]: [{ department_id: { [Op.in]: departmentIds } }, legacyWhere],
    },
    attributes: ['id', 'department_id', 'manager_id'],
  });

  const allowed: number[] = [];
  for (const candidate of candidates) {
    if (await isManagerResponsibleForUser(managerId, null, candidate, permission)) allowed.push(candidate.id);
  }
  return allowed;
};

export const hasLeadershipPermission = async (managerId: number, permission: LeadershipPermission) =>
  (await getLeadershipAssignments(managerId, permission)).length > 0;
