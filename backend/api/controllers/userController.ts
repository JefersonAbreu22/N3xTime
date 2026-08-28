import { Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Op, col, fn, UniqueConstraintError } from 'sequelize';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { User } from '../models/User.js';
import { BiometricSample } from '../models/BiometricSample.js';
import { WorkSchedule } from '../models/WorkSchedule.js';
import { PASSWORD_POLICY_MESSAGE, passwordSchema } from '../validation/passwordPolicy.js';
import { dateOnlySchema } from '../validation/dateOnly.js';
import { runWithoutTenant } from '../tenancy/tenantContext.js';
import { TenantReferenceError } from '../tenancy/tenantReferenceGuard.js';
import { getLeadershipAssignments, getManagedUserIds, isManagerResponsibleForUser } from '../utils/leadership.js';

import { Department } from '../models/Department.js';

const timeFieldSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora inválida');
const workScheduleSchema = z.object({
  entry_time: timeFieldSchema,
  exit_time: timeFieldSchema,
  lunch_duration: z.number().int().min(0).max(240),
  flexible_lunch: z.boolean().default(true),
  work_days: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  custom_workload: z.record(z.string().or(z.number()), z.number().int().min(0)).nullable().optional(),
});

const pinCodeSchema = z.string().trim().regex(/^\d{4,10}$/, 'PIN deve conter de 4 a 10 digitos').nullable().optional();

const createUserSchema = z.object({
  name: z.string().min(3).max(255),
  cpf: z.string().min(11).max(14),
  registration_number: z.string().min(1).max(50),
  email: z.string().email().max(255),
  password: passwordSchema,
  work_type: z.enum(['presential', 'hybrid', 'remote']),
  role: z.enum(['employee', 'manager']).optional(),
  department_id: z.number().int().positive().nullable().optional(),
  manager_id: z.number().int().positive().nullable().optional(),
  schedule_id: z.number().int().positive().nullable().optional(),
  work_schedule: workScheduleSchema.nullable().optional(),
  pin_code: pinCodeSchema,
  status: z.enum(['active', 'inactive']).optional(),
  remote_clock_in_enabled: z.any().transform((val) => {
    if (val === 'true' || val === '1' || val === 1 || val === true) return true;
    if (val === 'false' || val === '0' || val === 0 || val === false) return false;
    return Boolean(val);
  }).optional(),
  remote_clock_in_justification: z.string().nullable().optional(),
  hire_date: dateOnlySchema.nullable().optional(),
  requires_time_tracking: z.boolean().optional(),
});

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
};

const normalizeTimeToStorage = (value: string) => `${value}:00`;

const normalizeWorkDays = (value: unknown) => {
  let days = value;
  if (typeof value === 'string') {
    try {
      days = JSON.parse(value);
    } catch {
      days = null;
    }
  }

  if (!Array.isArray(days)) return [1, 2, 3, 4, 5];

  const normalized = days
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return normalized.length ? normalized : [1, 2, 3, 4, 5];
};

const buildWorkScheduleSummary = (schedule?: WorkSchedule | null) => {
  if (!schedule || !schedule.entry_time || !schedule.exit_time) return null;
  const entry = String(schedule.entry_time).slice(0, 5);
  const exit = String(schedule.exit_time).slice(0, 5);
  const dailyWorkloadMinutes = Math.max(timeToMinutes(exit) - timeToMinutes(entry) - Number(schedule.lunch_duration ?? 0), 0);

  return {
    id: schedule.id,
    name: schedule.name,
    type: schedule.type,
    entry_time: entry,
    exit_time: exit,
    lunch_duration: Number(schedule.lunch_duration ?? 0),
    flexible_lunch: Boolean(schedule.flexible_lunch),
    work_days: normalizeWorkDays(schedule.work_days),
    custom_workload: schedule.custom_workload,
    daily_workload_minutes: dailyWorkloadMinutes,
  };
};

const getDuplicateUserFieldMessage = (error: unknown) => {
  if (!(error instanceof UniqueConstraintError)) return null;

  const duplicatedField = error.errors[0]?.path ?? '';
  if (duplicatedField === 'email') return 'Já existe um colaborador cadastrado com este e-mail.';
  if (duplicatedField === 'cpf') return 'Já existe um colaborador cadastrado com este CPF.';
  if (duplicatedField === 'registration_number') return 'Já existe um colaborador cadastrado com esta matrícula.';
  return 'Já existe um colaborador cadastrado com um dos dados informados.';
};

const findUserWithSamePin = async (pinCode: string, excludedUserId?: number) => {
  const where = excludedUserId
    ? { pin_code: { [Op.ne]: null }, id: { [Op.ne]: excludedUserId } }
    : { pin_code: { [Op.ne]: null } };

  const users = await User.findAll({
    where,
    attributes: ['id', 'name', 'pin_code'],
  });

  for (const candidate of users) {
    if (!candidate.pin_code) continue;
    const isSamePin = candidate.pin_code.startsWith('$2')
      ? await bcrypt.compare(pinCode, candidate.pin_code)
      : pinCode === candidate.pin_code;

    if (isSamePin) return candidate;
  }

  return null;
};

const ensurePinIsUnique = async (pinCode: string | null | undefined, excludedUserId?: number) => {
  if (!pinCode) return null;
  return findUserWithSamePin(pinCode, excludedUserId);
};

const upsertUserSchedule = async ({
  user,
  schedulePayload,
}: {
  user: User;
  schedulePayload: z.infer<typeof workScheduleSchema> | null | undefined;
}) => {
  if (schedulePayload === undefined) {
    return;
  }

  if (schedulePayload === null) {
    user.schedule_id = null;
    return;
  }

  const scheduleValues = {
    name: `Jornada - ${user.name}`,
    type: 'custom' as const,
    entry_time: normalizeTimeToStorage(schedulePayload.entry_time),
    exit_time: normalizeTimeToStorage(schedulePayload.exit_time),
    lunch_duration: schedulePayload.lunch_duration,
    flexible_lunch: schedulePayload.flexible_lunch,
    work_days: schedulePayload.work_days,
    custom_workload: schedulePayload.custom_workload as Record<number, number> | null,
  };

  if (user.schedule_id) {
    const existingSchedule = await WorkSchedule.findByPk(user.schedule_id);
    if (existingSchedule) {
      existingSchedule.name = scheduleValues.name;
      existingSchedule.type = scheduleValues.type;
      existingSchedule.entry_time = scheduleValues.entry_time;
      existingSchedule.exit_time = scheduleValues.exit_time;
      existingSchedule.lunch_duration = scheduleValues.lunch_duration;
      existingSchedule.flexible_lunch = scheduleValues.flexible_lunch;
      existingSchedule.work_days = scheduleValues.work_days;
      existingSchedule.custom_workload = scheduleValues.custom_workload as Record<number, number> | null;
      await existingSchedule.save();
      return;
    }
  }

  const createdSchedule = await WorkSchedule.create(scheduleValues);
  user.schedule_id = createdSchedule.id;
};

import { AuditService } from '../services/AuditService.js';

export const createEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const requesterId = req.user?.id;
    if (!role || !requesterId) return res.status(401).json({ success: false, error: 'Não autorizado.' });
    if (role !== 'admin' && role !== 'manager') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const parsed = createUserSchema.safeParse(req.body);
    if (parsed.success === false) {
      const passwordError = parsed.error.issues.some((issue) => issue.path[0] === 'password');
      return res.status(400).json({ success: false, error: passwordError ? PASSWORD_POLICY_MESSAGE : 'Dados inválidos.' });
    }

    const payload = parsed.data;
    
    // Regra de hierarquia: 
    // - Somente admin pode criar 'manager'
    // - Se admin não definir manager_id, fica null (direto ao admin/sem gestor superior)
    // - Se manager está criando, o user sempre será 'employee' e manager_id será o ID do próprio manager
    
    let targetRole: 'employee' | 'manager' = 'employee';
    let targetManagerId: number | null = null;
    
    if (role === 'admin') {
      targetRole = payload.role ?? 'employee';
      targetManagerId = payload.manager_id ?? null;
    } else { // é manager
      targetRole = 'employee';
      targetManagerId = requesterId;
      const assignments = await getLeadershipAssignments(requesterId, 'manage_team');
      if (!payload.department_id || !assignments.some((assignment) => assignment.department_id === payload.department_id)) {
        return res.status(403).json({ success: false, error: 'Sua hierarquia não permite cadastrar colaboradores neste setor.' });
      }
    }

    const existingEmailUser = await runWithoutTenant(() => User.findOne({
      where: { email: payload.email },
      attributes: ['id'],
    }));
    if (existingEmailUser) {
      return res.status(409).json({ success: false, error: 'Este e-mail já está vinculado a outra conta.' });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { cpf: payload.cpf },
          { registration_number: payload.registration_number },
        ],
      },
      attributes: ['id', 'email', 'cpf', 'registration_number'],
    });

    if (existingUser) {
      if (existingUser.cpf === payload.cpf) {
        return res.status(409).json({ success: false, error: 'Já existe um colaborador cadastrado com este CPF.' });
      }
      if (existingUser.registration_number === payload.registration_number) {
        return res.status(409).json({ success: false, error: 'Já existe um colaborador cadastrado com esta matrícula.' });
      }
    }

    const existingPinUser = await ensurePinIsUnique(payload.pin_code);
    if (existingPinUser) {
      return res.status(409).json({ success: false, error: 'Este PIN ja esta em uso por outro colaborador.' });
    }

    const password_hash = await bcrypt.hash(payload.password, 12);
    const pinCodeHash = payload.pin_code ? await bcrypt.hash(payload.pin_code, 10) : null;

    const user = await User.create({
      name: payload.name,
      cpf: payload.cpf,
      registration_number: payload.registration_number,
      email: payload.email,
      password_hash,
      role: targetRole,
      work_type: payload.work_type,
      department_id: payload.department_id ?? null,
      manager_id: targetManagerId,
      schedule_id: payload.schedule_id ?? null,
      pin_code: pinCodeHash,
      status: payload.status ?? 'active',
      hire_date: payload.hire_date ?? null,
      requires_time_tracking: role === 'admin' ? (payload.requires_time_tracking ?? true) : true,
    });

    await upsertUserSchedule({
      user,
      schedulePayload: payload.work_schedule,
    });
    await user.save();

    const persistedSchedule = user.schedule_id ? await WorkSchedule.findByPk(user.schedule_id) : null;

    await AuditService.log({
      user_id: requesterId,
      action: 'CREATE_USER',
      entity_name: 'users',
      entity_id: user.id,
      new_value: { name: user.name, role: user.role, department_id: user.department_id, manager_id: user.manager_id },
    }, req);

    return res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        registration_number: user.registration_number,
        role: user.role,
        work_type: user.work_type,
        department_id: user.department_id,
        manager_id: user.manager_id,
        schedule_id: user.schedule_id,
        schedule: buildWorkScheduleSummary(persistedSchedule),
        status: user.status,
        hire_date: user.hire_date,
        requires_time_tracking: user.requires_time_tracking,
      },
    });
  } catch (error) {
    if (error instanceof TenantReferenceError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    const duplicateMessage = getDuplicateUserFieldMessage(error);
    if (duplicateMessage) {
      return res.status(409).json({ success: false, error: duplicateMessage });
    }
    console.error('Create employee error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'manager') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });

    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'O administrador principal da empresa não pode ser alterado pela gestão de colaboradores.' });
    }

    // Um manager só pode atualizar funcionários dele
    if (role === 'manager' && !await isManagerResponsibleForUser(req.user!.id, null, user, 'manage_team')) {
      return res.status(403).json({ success: false, error: 'Você só pode editar sua própria equipe.' });
    }

    // Permitir atualização de dados básicos
    const parsed = createUserSchema.partial().safeParse(req.body);
    if (parsed.success === false) {
      const validationDetails = parsed.error.format();
      console.error('Validation Error Details:', validationDetails);
      const passwordError = parsed.error.issues.some((issue) => issue.path[0] === 'password');
      return res.status(400).json({ success: false, error: passwordError ? PASSWORD_POLICY_MESSAGE : 'Dados inválidos.', details: validationDetails });
    }

    const p = parsed.data;
    console.log('--- UPDATE USER PAYLOAD ---');
    console.log(JSON.stringify(req.body.work_schedule, null, 2));
    console.log('--- PARSED ---');
    console.log(JSON.stringify(p.work_schedule, null, 2));
    if (p.email && p.email !== user.email) {
      const existingEmailUser = await runWithoutTenant(() => User.findOne({
        where: { email: p.email, id: { [Op.ne]: user.id } },
        attributes: ['id'],
      }));
      if (existingEmailUser) {
        return res.status(409).json({ success: false, error: 'Este e-mail já está vinculado a outra conta.' });
      }
    }
    if (p.name) user.name = p.name;
    if (p.cpf) user.cpf = p.cpf;
    if (p.email) user.email = p.email;
    if (p.work_type) user.work_type = p.work_type;
    if (p.status) user.status = p.status;
    if (p.hire_date !== undefined) user.hire_date = p.hire_date || null;
    if (role === 'admin' && p.requires_time_tracking !== undefined) {
      user.requires_time_tracking = p.requires_time_tracking;
      if (!p.requires_time_tracking) {
        user.remote_clock_in_enabled = false;
        user.remote_clock_in_justification = null;
      }
    }
    if (p.pin_code) {
      const existingPinUser = await ensurePinIsUnique(p.pin_code, user.id);
      if (existingPinUser) {
        return res.status(409).json({ success: false, error: 'Este PIN ja esta em uso por outro colaborador.' });
      }
      user.pin_code = await bcrypt.hash(p.pin_code, 10);
    } else if (p.pin_code === null) {
      user.pin_code = null;
    }
    
    if (role === 'admin') {
      if (p.role) user.role = p.role;
      if (p.manager_id !== undefined) user.manager_id = p.manager_id;
      if (p.department_id !== undefined) user.department_id = p.department_id;
    } else {
      if (p.department_id !== undefined && p.department_id !== null) {
        user.department_id = p.department_id;
      }
    }

    if (p.remote_clock_in_enabled !== undefined) {
      user.remote_clock_in_enabled = p.remote_clock_in_enabled;
      if (p.remote_clock_in_enabled) {
         if (p.remote_clock_in_justification !== undefined) {
           user.remote_clock_in_justification = p.remote_clock_in_justification;
         }
      } else {
        user.remote_clock_in_justification = null;
      }
    }

    if (p.password) {
      user.password_hash = await bcrypt.hash(p.password, 12);
    }

    await upsertUserSchedule({
      user,
      schedulePayload: p.work_schedule,
    });

    await user.save();

    await AuditService.log({
      user_id: req.user?.id,
      action: 'UPDATE_USER',
      entity_name: 'users',
      entity_id: user.id,
      new_value: { name: user.name, role: user.role, department_id: user.department_id, manager_id: user.manager_id, status: user.status },
    }, req);

    return res.json({ success: true, message: 'Usuário atualizado.' });
  } catch (error) {
    console.error('Update user error:', error);
    const duplicateMessage = getDuplicateUserFieldMessage(error);
    if (duplicateMessage) {
      return res.status(409).json({ success: false, error: duplicateMessage });
    }
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });

    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'O administrador principal da empresa não pode ser inativado.' });
    }

    // Em vez de hard delete, faremos soft delete / inativação
    user.status = 'inactive';
    await user.save();

    await AuditService.log({
      user_id: req.user?.id,
      action: 'DELETE_USER',
      entity_name: 'users',
      entity_id: user.id,
      new_value: { status: 'inactive' },
    }, req);

    return res.json({ success: true, message: 'Usuário inativado.' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const listTeam = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const requesterId = req.user?.id;
    if (!role || !requesterId) return res.status(401).json({ success: false, error: 'Não autorizado.' });
    if (role !== 'admin' && role !== 'manager') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const managedIds = role === 'manager' ? await getManagedUserIds(requesterId, null, 'view_team') : [];
    const where = role === 'admin'
      ? { status: 'active', role: { [Op.ne]: 'admin' } }
      : { status: 'active', id: { [Op.in]: managedIds } };
    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'registration_number', 'work_type', 'status', 'created_at', 'role', 'manager_id', 'department_id', 'facial_descriptor', 'schedule_id', 'remote_clock_in_enabled', 'remote_clock_in_justification', 'hire_date', 'requires_time_tracking'],
      include: [
        {
          model: User,
          as: 'manager',
          attributes: ['id', 'name']
        },
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'name']
        },
        {
          model: WorkSchedule,
          as: 'schedule',
          attributes: ['id', 'name', 'type', 'entry_time', 'exit_time', 'lunch_duration', 'flexible_lunch', 'work_days', 'custom_workload'],
        }
      ],
      order: [['name', 'ASC']],
      limit: 500,
    });

    const userIds = users.map((user) => user.id);
    const biometricRows = userIds.length
      ? (await BiometricSample.findAll({
          where: { user_id: { [Op.in]: userIds } },
          attributes: [
            'user_id',
            [fn('COUNT', col('id')), 'sampleCount'],
            [fn('MAX', col('created_at')), 'lastSampleAt'],
          ],
          group: ['user_id'],
          raw: true,
        })) as unknown as Array<{ user_id: number; sampleCount: string | number; lastSampleAt: string | null }>
      : [];

    const biometricMap = new Map(
      biometricRows.map((row) => [
        Number(row.user_id),
        {
          sampleCount: Number(row.sampleCount ?? 0),
          lastSampleAt: row.lastSampleAt ?? null,
        },
      ])
    );

    const enrichedUsers = users.map((user) => {
      const plainUser = user.toJSON() as Record<string, unknown>;
      const { facial_descriptor: _facial_descriptor, ...safeUser } = plainUser;
      const biometricInfo = biometricMap.get(user.id);
      return {
        ...safeUser,
        has_biometric: Boolean(user.facial_descriptor),
        biometric_sample_count: biometricInfo?.sampleCount ?? (user.facial_descriptor ? 1 : 0),
        biometric_updated_at: biometricInfo?.lastSampleAt ?? null,
        schedule: buildWorkScheduleSummary(plainUser.schedule as WorkSchedule | null),
      };
    });

    return res.json({ success: true, data: enrichedUsers });
  } catch (error) {
    console.error('List team error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const listManagers = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso negado.' });

    const managers = await User.findAll({
      where: { status: 'active', role: 'manager' },
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']],
    });

    return res.json({ success: true, data: managers });
  } catch (error) {
    console.error('List managers error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};
