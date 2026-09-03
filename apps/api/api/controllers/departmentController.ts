import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { Department } from '../models/Department.js';
import { User } from '../models/User.js';
import { WorkSchedule } from '../models/WorkSchedule.js';
import { DepartmentHierarchyLevel } from '../models/DepartmentHierarchyLevel.js';
import { DepartmentLeaderAssignment, LeadershipPermission } from '../models/DepartmentLeaderAssignment.js';
import { getManagedUserIds } from '../utils/leadership.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';
import { AuditService } from '../services/AuditService.js';

const departmentSchema = z.object({
  name: z.string().min(2).max(100),
});

const permissions = ['view_team', 'manage_team', 'view_time_records', 'manage_time_records', 'approve_requests', 'view_reports', 'manage_biometrics'] as const;
const hierarchySchema = z.object({
  levels: z.array(z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(2).max(80),
    leaders: z.array(z.object({
      id: z.number().int().positive().optional(),
      user_id: z.number().int().positive(),
      permissions: z.array(z.enum(permissions)).min(1),
    })).default([]),
  })).max(20),
});

export const listDepartments = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const requesterId = req.user?.id;
    if (!requesterId || (role !== 'admin' && role !== 'manager')) {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }

    const managedIds = role === 'manager' ? await getManagedUserIds(requesterId, null, 'view_team') : [];
    const usersWhere = role === 'admin'
      ? { status: { [Op.ne]: 'inactive' }, role: { [Op.ne]: 'admin' } }
      : { status: { [Op.ne]: 'inactive' }, id: { [Op.in]: managedIds } };

    const departments = await Department.findAll({
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'name', 'email', 'role', 'status', 'suspended_at', 'suspended_by', 'suspension_reason', 'suspension_type', 'suspension_start_date', 'suspension_end_at', 'manager_id', 'department_id', 'work_type', 'facial_descriptor', 'remote_clock_in_enabled', 'remote_clock_in_justification'],
          where: usersWhere,
          required: false,
          include: [
            {
              model: WorkSchedule,
              as: 'schedule',
              attributes: ['id', 'name', 'type', 'entry_time', 'exit_time', 'lunch_duration', 'flexible_lunch', 'work_days', 'custom_workload'],
            }
          ]
        },
        {
          model: DepartmentHierarchyLevel,
          as: 'hierarchy_levels',
          required: false,
          include: [{
            model: DepartmentLeaderAssignment,
            as: 'leaders',
            required: false,
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'department_id', 'status'], required: true }],
          }],
        },
      ],
      order: [['name', 'ASC'], [{ model: DepartmentHierarchyLevel, as: 'hierarchy_levels' }, 'position', 'ASC']],
    });

    const userIds = departments.flatMap(d => (d as unknown as { users?: { id: number }[] }).users?.map((u) => u.id) || []);
    let biometricMap = new Map();
    
    if (userIds.length > 0) {
      const { BiometricSample } = await import('../models/BiometricSample.js');
      const { fn, col, Op } = await import('sequelize');
      const biometricRows = await BiometricSample.findAll({
        where: { user_id: { [Op.in]: userIds } },
        attributes: [
          'user_id',
          [fn('COUNT', col('id')), 'sampleCount'],
          [fn('MAX', col('created_at')), 'lastSampleAt'],
        ],
        group: ['user_id'],
        raw: true,
      }) as unknown as Array<{ user_id: number; sampleCount: string | number; lastSampleAt: Date | string | null }>;
      
      biometricMap = new Map(
        biometricRows.map((row) => [
          Number(row.user_id),
          {
            sampleCount: Number(row.sampleCount ?? 0),
            lastSampleAt: row.lastSampleAt ?? null,
          },
        ])
      );
    }

    const enrichedDepartments = departments.map(dept => {
      const plainDept = dept.toJSON() as { users?: Array<{ id: number; facial_descriptor?: unknown; [key: string]: unknown }> };
      plainDept.users = plainDept.users?.map((user) => {
        const { facial_descriptor, ...safeUser } = user;
        const biometricInfo = biometricMap.get(user.id);
        return {
          ...safeUser,
          has_biometric: Boolean(facial_descriptor),
          biometric_sample_count: biometricInfo?.sampleCount ?? (facial_descriptor ? 1 : 0),
          biometric_updated_at: biometricInfo?.lastSampleAt ?? null,
        };
      }) || [];
      return plainDept;
    });

    return res.json({ success: true, data: enrichedDepartments });
  } catch (error) {
    console.error('List departments error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const updateDepartmentHierarchy = async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso negado.' });
  const departmentId = Number(req.params.id);
  const parsed = hierarchySchema.safeParse(req.body);
  if (!Number.isInteger(departmentId) || !parsed.success) {
    return res.status(400).json({ success: false, error: 'Hierarquia inválida.' });
  }

  const department = await Department.findByPk(departmentId);
  if (!department) return res.status(404).json({ success: false, error: 'Setor não encontrado.' });

  const repeatedUsers = parsed.data.levels.flatMap((level) => level.leaders.map((leader) => leader.user_id));
  if (new Set(repeatedUsers).size !== repeatedUsers.length) {
    return res.status(409).json({ success: false, error: 'Um usuário não pode ocupar dois níveis da mesma hierarquia.' });
  }

  const eligibleUsers = repeatedUsers.length ? await User.findAll({
    where: { id: { [Op.in]: repeatedUsers }, status: 'active', role: { [Op.ne]: 'admin' } },
    attributes: ['id', 'role'],
  }) : [];
  if (eligibleUsers.length !== repeatedUsers.length) {
    return res.status(409).json({ success: false, error: 'Todos os líderes precisam ser usuários ativos da empresa.' });
  }

  try {
    const previousHierarchy = await DepartmentHierarchyLevel.findAll({
      where: { department_id: departmentId },
      include: [{ model: DepartmentLeaderAssignment, as: 'leaders', required: false }],
      order: [['position', 'ASC']],
    });
    await sequelize.transaction(async (transaction) => {
      const currentLevels = await DepartmentHierarchyLevel.findAll({ where: { department_id: departmentId }, transaction });
      const previousAssignments = await DepartmentLeaderAssignment.findAll({ where: { department_id: departmentId }, attributes: ['user_id'], transaction });
      const currentIds = new Set(currentLevels.map((level) => level.id));
      const submittedIds = new Set(parsed.data.levels.flatMap((level) => level.id ? [level.id] : []));
      if ([...submittedIds].some((id) => !currentIds.has(id))) throw new Error('Nível não pertence ao setor.');

      // Move positions out of the unique range before applying the new order.
      for (const level of currentLevels) await level.update({ position: level.position + 1000, name: `__reordering_${level.id}` }, { transaction });

      const keptLevelIds: number[] = [];
      for (let index = 0; index < parsed.data.levels.length; index += 1) {
        const input = parsed.data.levels[index];
        const level = input.id
          ? currentLevels.find((item) => item.id === input.id)!
          : await DepartmentHierarchyLevel.create({ department_id: departmentId, name: input.name, position: 2000 + index }, { transaction });
        await level.update({ name: input.name, position: index + 1 }, { transaction });
        keptLevelIds.push(level.id);

        await DepartmentLeaderAssignment.destroy({ where: { level_id: level.id }, transaction });
        if (input.leaders.length) {
          await DepartmentLeaderAssignment.bulkCreate(input.leaders.map((leader) => ({
            department_id: departmentId,
            level_id: level.id,
            user_id: leader.user_id,
            permissions: leader.permissions as LeadershipPermission[],
          })), { transaction });
        }
      }

      const removedIds = currentLevels.map((level) => level.id).filter((id) => !keptLevelIds.includes(id));
      if (removedIds.length) {
        await DepartmentLeaderAssignment.destroy({ where: { level_id: { [Op.in]: removedIds } }, transaction });
        await DepartmentHierarchyLevel.destroy({ where: { id: { [Op.in]: removedIds } }, transaction });
      }

      if (repeatedUsers.length) {
        await User.update({ role: 'manager' }, { where: { id: { [Op.in]: repeatedUsers } }, transaction });
      }

      const removedLeaderIds = [...new Set(previousAssignments.map((assignment) => assignment.user_id).filter((userId) => !repeatedUsers.includes(userId)))];
      for (const removedLeaderId of removedLeaderIds) {
        const otherAssignments = await DepartmentLeaderAssignment.count({ where: { user_id: removedLeaderId }, transaction });
        if (!otherAssignments) {
          await User.update({ role: 'employee' }, { where: { id: removedLeaderId }, transaction });
          await User.update({ manager_id: null }, { where: { manager_id: removedLeaderId }, transaction });
        }
      }
    });
    await AuditService.log({
      user_id: req.user.id,
      action: 'UPDATE_DEPARTMENT_HIERARCHY',
      entity_name: 'departments',
      entity_id: departmentId,
      old_value: previousHierarchy.map((level) => level.toJSON()),
      new_value: parsed.data.levels,
    }, req);
    return res.json({ success: true, message: 'Hierarquia e permissões atualizadas.' });
  } catch (error) {
    console.error('Update department hierarchy error:', error);
    return res.status(409).json({ success: false, error: error instanceof Error ? error.message : 'Não foi possível salvar a hierarquia.' });
  }
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Dados inválidos.' });

    const department = await Department.create({ name: parsed.data.name });
    return res.json({ success: true, data: department });
  } catch (error) {
    console.error('Create department error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const updateDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const { id } = req.params;
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Dados inválidos.' });

    const department = await Department.findByPk(id);
    if (!department) return res.status(404).json({ success: false, error: 'Setor não encontrado.' });

    department.name = parsed.data.name;
    await department.save();

    return res.json({ success: true, data: department });
  } catch (error) {
    console.error('Update department error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const { id } = req.params;
    const department = await Department.findByPk(id);
    if (!department) return res.status(404).json({ success: false, error: 'Setor não encontrado.' });

    // Check if there are users
    const usersCount = await User.count({ where: { department_id: id, status: 'active' } });
    if (usersCount > 0) {
      return res.status(400).json({ success: false, error: 'Não é possível excluir setor com colaboradores ativos.' });
    }

    const levelIds = (await DepartmentHierarchyLevel.findAll({ where: { department_id: id }, attributes: ['id'] })).map((level) => level.id);
    const leaderIds = levelIds.length
      ? [...new Set((await DepartmentLeaderAssignment.findAll({ where: { level_id: { [Op.in]: levelIds } }, attributes: ['user_id'] })).map((assignment) => assignment.user_id))]
      : [];
    if (levelIds.length) await DepartmentLeaderAssignment.destroy({ where: { level_id: { [Op.in]: levelIds } } });
    await DepartmentHierarchyLevel.destroy({ where: { department_id: id } });
    for (const leaderId of leaderIds) {
      if (!await DepartmentLeaderAssignment.count({ where: { user_id: leaderId } })) {
        await User.update({ role: 'employee' }, { where: { id: leaderId } });
        await User.update({ manager_id: null }, { where: { manager_id: leaderId } });
      }
    }
    await department.destroy();

    return res.json({ success: true, message: 'Setor excluído com sucesso.' });
  } catch (error) {
    console.error('Delete department error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};
