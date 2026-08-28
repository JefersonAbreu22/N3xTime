import fs from 'fs/promises';
import { Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { Department, EmployeeRequest, TimeRecord, User } from '../models/index.js';
import { assertPeriodOpen } from '../utils/monthlyClosing.js';
import { AttendanceService } from '../services/AttendanceService.js';
import { AuditService } from '../services/AuditService.js';
import { attemptTimeRecordEmail } from '../services/TimeRecordEmailService.js';
import { isManagerResponsibleForUser } from '../utils/leadership.js';
import { DepartmentLeaderAssignment } from '../models/DepartmentLeaderAssignment.js';
import { DepartmentHierarchyLevel } from '../models/DepartmentHierarchyLevel.js';
import { dateOnlySchema } from '../validation/dateOnly.js';

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');

const requestSchema = z.object({
  request_type: z.enum(['time_adjustment', 'medical_certificate', 'declaration', 'vacation', 'day_off']),
  target_date: dateOnlySchema,
  requested_entry_time: timeSchema.optional().nullable().or(z.literal('')),
  requested_lunch_start: timeSchema.optional().nullable().or(z.literal('')),
  requested_lunch_end: timeSchema.optional().nullable().or(z.literal('')),
  requested_exit_time: timeSchema.optional().nullable().or(z.literal('')),
  absence_start_time: timeSchema.optional().nullable().or(z.literal('')),
  absence_end_time: timeSchema.optional().nullable().or(z.literal('')),
  reason: z.string().trim().min(5),
  attachment_name: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  attachment_url: z.string().trim().max(2048).optional().nullable().or(z.literal('')),
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  admin_comment: z.string().max(1000).optional().nullable(),
  override_entry_time: timeSchema.optional().nullable().or(z.literal('')),
  override_lunch_start: timeSchema.optional().nullable().or(z.literal('')),
  override_lunch_end: timeSchema.optional().nullable().or(z.literal('')),
  override_exit_time: timeSchema.optional().nullable().or(z.literal('')),
  override_absence_start_time: timeSchema.optional().nullable().or(z.literal('')),
  override_absence_end_time: timeSchema.optional().nullable().or(z.literal('')),
});

const hasValidAbsencePeriod = (startTime?: string | null, endTime?: string | null) => {
  if (!startTime || !endTime) return false;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  return (endHour * 60) + endMinute > (startHour * 60) + startMinute;
};

const getDateBounds = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
};

const buildRecordDate = (dateValue: string, timeValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const cleanupUploadedFile = async (filePath?: string | null) => {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.warn('Unable to remove temporary attachment:', error);
  }
};

type ScopedEmployeeRequest = EmployeeRequest & { requester?: User | null; reviewer?: User | null };

const resolveRequestRouting = async (employeeId: number) => {
  const employee = await User.findByPk(employeeId, {
    attributes: ['id', 'manager_id', 'department_id'],
  });

  if (!employee) {
    return { targetManagerId: null, targetDepartmentId: null };
  }

  const targetDepartmentId = employee.department_id ?? null;
  let targetManagerId: number | null = null;

  if (targetDepartmentId) {
    const hierarchyReviewers = await DepartmentLeaderAssignment.findAll({
      where: { department_id: targetDepartmentId },
      include: [{ model: DepartmentHierarchyLevel, as: 'level', required: true }],
      order: [[{ model: DepartmentHierarchyLevel, as: 'level' }, 'position', 'DESC']],
    });
    const hierarchyReviewer = hierarchyReviewers.find((assignment) => {
      const raw = assignment.permissions;
      const parsed = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
      return parsed.includes('approve_requests');
    });
    targetManagerId = hierarchyReviewer?.user_id ?? null;
  }

  if (!targetManagerId && employee.manager_id) {
    const directManager = await User.findOne({
      where: { id: employee.manager_id, role: 'manager', status: 'active' },
      attributes: ['id'],
    });
    targetManagerId = directManager?.id ?? null;
  }

  if (!targetManagerId && targetDepartmentId) {
    const departmentManager = await User.findOne({
      where: { role: 'manager', status: 'active', department_id: targetDepartmentId },
      attributes: ['id'],
      order: [['id', 'ASC']],
    });
    targetManagerId = departmentManager?.id ?? null;
  }

  return { targetManagerId, targetDepartmentId };
};

const isManagerResponsibleForRequest = async (
  request: ScopedEmployeeRequest,
  reviewerId: number,
  reviewerDepartmentId: number | null
) => {
  return await isManagerResponsibleForUser(reviewerId, reviewerDepartmentId, {
    id: request.requester?.id,
    manager_id: request.requester?.manager_id,
    department_id: request.requester?.department_id,
  }, 'approve_requests');
};

const getScopedRequest = async (req: AuthRequest, requestId: number) => {
  const requester = req.user;
  if (!requester) return null;

  const request = await EmployeeRequest.findOne({
    where: { id: requestId },
    include: [
      { model: User, as: 'requester', attributes: ['id', 'name', 'manager_id', 'department_id', 'registration_number'] },
      { model: User, as: 'reviewer', attributes: ['id', 'name'], required: false },
    ],
  }) as ScopedEmployeeRequest | null;

  if (!request) return null;
  if (requester.role === 'admin') return request;

  if (requester.role === 'manager') {
    const reviewerUser = await User.findByPk(requester.id, {
      attributes: ['id', 'department_id'],
    });
    if (reviewerUser && await isManagerResponsibleForRequest(request, requester.id, reviewerUser.department_id ?? null)) {
      return request;
    }
  }

  if (requester.role === 'employee' && request.user_id === requester.id) return request;
  return null;
};

const applyApprovedTimeAdjustment = async (
  request: EmployeeRequest,
  reviewerId: number,
  reviewReason: string | null | undefined
) => {
  const changedRecords: TimeRecord[] = [];
  if (!request.requested_entry_time && !request.requested_exit_time && !request.requested_lunch_start && !request.requested_lunch_end) {
    return changedRecords;
  }

  const { start, end } = getDateBounds(request.target_date);
  const records = await TimeRecord.findAll({
    where: {
      user_id: request.user_id,
      record_time: { [Op.between]: [start, end] },
    },
    order: [['record_time', 'ASC']],
  });

  const upsertRecord = async (recordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit', timeValue: string | null) => {
    if (!timeValue) return;
    const existing = records.find((record) => record.record_type === recordType);
    const nextRecordTime = buildRecordDate(request.target_date, timeValue);
    if (existing) {
      existing.record_time = nextRecordTime;
      existing.method = 'manual';
      existing.status = 'adjusted';
      existing.reviewed_by = reviewerId;
      existing.review_reason = reviewReason ?? request.reason;
      existing.reviewed_at = new Date();
      await existing.save();
      changedRecords.push(existing);
      return;
    }

    const createdRecord = await TimeRecord.create({
      user_id: request.user_id,
      record_time: nextRecordTime,
      record_type: recordType,
      method: 'manual',
      status: 'adjusted',
      reviewed_by: reviewerId,
      review_reason: reviewReason ?? request.reason,
      reviewed_at: new Date(),
    });
    changedRecords.push(createdRecord);
  };

  await upsertRecord('entry', request.requested_entry_time);
  await upsertRecord('lunch_start', request.requested_lunch_start);
  await upsertRecord('lunch_end', request.requested_lunch_end);
  await upsertRecord('exit', request.requested_exit_time);
  return changedRecords;
};

const getFutureAdjustmentLabel = (
  targetDate: string,
  times: {
    entry?: string | null;
    lunchStart?: string | null;
    lunchEnd?: string | null;
    exit?: string | null;
  }
) => {
  const candidates = [
    ['entrada', times.entry],
    ['saída para almoço', times.lunchStart],
    ['retorno do almoço', times.lunchEnd],
    ['saída', times.exit],
  ] as const;
  const now = new Date();

  for (const [label, timeValue] of candidates) {
    if (timeValue && buildRecordDate(targetDate, timeValue).getTime() > now.getTime()) return label;
  }

  return null;
};

const assignAbsenceSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  request_type: z.enum(['vacation', 'day_off', 'medical_certificate', 'declaration', 'external_work']),
  target_date: dateOnlySchema.optional(),
  start_date: dateOnlySchema.optional(),
  end_date: dateOnlySchema.optional(),
  absence_start_time: timeSchema.optional().nullable().or(z.literal('')),
  absence_end_time: timeSchema.optional().nullable().or(z.literal('')),
  reason: z.string().trim().min(3),
});

const getDateKeysInRange = (startStr: string, endStr: string) => {
  const result: string[] = [];
  const start = new Date(`${startStr}T12:00:00Z`);
  const end = new Date(`${endStr}T12:00:00Z`);
  
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const cursor = new Date(start);
  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cursor.getUTCDate()).padStart(2, '0');
    result.push(`${year}-${month}-${day}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  
  return result;
};

export const assignAbsence = async (req: AuthRequest, res: Response) => {
  const uploadedFile = req.file;
  try {
    const requester = req.user;
    if (!requester || !['admin', 'manager'].includes(requester.role)) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(403).json({ success: false, error: 'Acesso restrito à gestão.' });
    }

    const payload = assignAbsenceSchema.parse(req.body);

    if (payload.request_type === 'declaration') {
      if (!payload.target_date || payload.start_date || payload.end_date) {
        await cleanupUploadedFile(uploadedFile?.path);
        return res.status(400).json({ success: false, error: 'A declaração por horas deve ser lançada para um único dia.' });
      }
      if (!hasValidAbsencePeriod(payload.absence_start_time, payload.absence_end_time)) {
        await cleanupUploadedFile(uploadedFile?.path);
        return res.status(400).json({ success: false, error: 'Informe um intervalo de horas válido para a declaração.' });
      }
      if (!uploadedFile) {
        return res.status(400).json({ success: false, error: 'Anexe a declaração que comprova o período informado.' });
      }
    }
    
    let datesToProcess: string[] = [];
    if (payload.target_date) {
      datesToProcess = [payload.target_date];
    } else if (payload.start_date && payload.end_date) {
      datesToProcess = getDateKeysInRange(payload.start_date, payload.end_date);
    }
    
    if (datesToProcess.length === 0) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(400).json({ success: false, error: 'Forneça uma data válida ou um período válido.' });
    }

    const targetUser = await User.findByPk(payload.user_id);
    if (!targetUser) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado.' });
    }
    if (!targetUser.requires_time_tracking) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(409).json({ success: false, error: 'Este usuário não está sujeito ao controle de ponto.' });
    }

    if (requester.role === 'manager') {
      const reviewerUser = await User.findByPk(requester.id, { attributes: ['id', 'department_id'] });
      const isResponsible = await isManagerResponsibleForUser(requester.id, reviewerUser?.department_id ?? null, {
        manager_id: targetUser.manager_id,
        department_id: targetUser.department_id,
      });
      if (!isResponsible) {
        await cleanupUploadedFile(uploadedFile?.path);
        return res.status(403).json({ success: false, error: 'Você não tem permissão para gerenciar este colaborador.' });
      }
    }

    const attachmentName = uploadedFile?.originalname || null;
    const attachmentUrl = uploadedFile ? `/uploads/requests/${uploadedFile.filename}` : null;

    const createdRequests = [];

    for (const dateKey of datesToProcess) {
      await assertPeriodOpen(dateKey, 'lançar ausências para datas já fechadas');

      const existingRequest = await EmployeeRequest.findOne({
        where: {
          user_id: payload.user_id,
          target_date: dateKey,
          status: { [Op.in]: ['approved', 'pending'] },
          request_type: { [Op.in]: ['vacation', 'day_off', 'medical_certificate', 'declaration', 'external_work'] },
        }
      });

      if (existingRequest) {
        continue; // Skip dates that already have an absence assigned
      }

      const request = await EmployeeRequest.create({
        user_id: payload.user_id,
        target_manager_id: requester.id,
        request_type: payload.request_type,
        target_date: dateKey,
        reason: payload.reason,
        status: 'approved',
        reviewed_by: requester.id,
        reviewed_at: new Date(),
        admin_comment: 'Lançado diretamente pela gestão.',
        attachment_name: attachmentName,
        attachment_url: attachmentUrl,
        absence_start_time: payload.request_type === 'declaration' ? payload.absence_start_time : null,
        absence_end_time: payload.request_type === 'declaration' ? payload.absence_end_time : null,
      });

      await AttendanceService.syncDailySummary(payload.user_id, dateKey);

      await AuditService.log({
        user_id: requester.id,
        action: 'ASSIGN_ABSENCE',
        entity_name: 'employee_requests',
        entity_id: request.id,
        old_value: null,
        new_value: {
          request_type: payload.request_type,
          target_date: dateKey,
          reason: payload.reason,
          absence_start_time: payload.absence_start_time ?? null,
          absence_end_time: payload.absence_end_time ?? null,
        },
      }, req);
      
      createdRequests.push(request);
    }
    
    if (createdRequests.length === 0) {
      return res.status(409).json({ success: false, error: 'Já existe uma ausência para o(s) dia(s) selecionado(s).' });
    }

    return res.status(201).json({ success: true, data: createdRequests, message: `Lançado com sucesso para ${createdRequests.length} dia(s).` });
  } catch (error) {
    console.error('Assign absence error:', error);
    await cleanupUploadedFile(uploadedFile?.path);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Dados inválidos.' });
    }
    if (error instanceof Error && error.message.includes('competência')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Erro ao lançar a ausência.' });
  }
};

export const createEmployeeRequest = async (req: AuthRequest, res: Response) => {
  const uploadedFile = req.file;
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'employee') {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(403).json({ success: false, error: 'Somente colaboradores podem abrir solicitações.' });
    }

    const payload = requestSchema.parse(req.body);
    if (payload.request_type === 'time_adjustment' && (!payload.requested_entry_time && !payload.requested_exit_time && !payload.requested_lunch_start && !payload.requested_lunch_end)) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(400).json({ success: false, error: 'Informe o horário desejado para o ajuste.' });
    }
    if (payload.request_type === 'declaration' && !hasValidAbsencePeriod(payload.absence_start_time, payload.absence_end_time)) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(400).json({ success: false, error: 'Informe o horário inicial e final que devem ser abonados.' });
    }
    const requesterUser = await User.findByPk(requester.id, { attributes: ['id', 'requires_time_tracking'] });
    if (!requesterUser?.requires_time_tracking) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(409).json({ success: false, error: 'Seu usuário não está sujeito ao controle de ponto.' });
    }

    if (payload.request_type === 'time_adjustment') {
      const futureAdjustment = getFutureAdjustmentLabel(payload.target_date, {
        entry: payload.requested_entry_time,
        lunchStart: payload.requested_lunch_start,
        lunchEnd: payload.requested_lunch_end,
        exit: payload.requested_exit_time,
      });
      if (futureAdjustment) {
        await cleanupUploadedFile(uploadedFile?.path);
        return res.status(400).json({
          success: false,
          error: `Não é permitido solicitar ajuste para ${futureAdjustment} em um horário futuro. Aguarde o horário ocorrer.`,
        });
      }
    }

    await assertPeriodOpen(payload.target_date, 'abrir solicitações para datas já fechadas');

    if (['medical_certificate', 'declaration'].includes(payload.request_type) && !uploadedFile && !payload.attachment_url) {
      return res.status(400).json({
        success: false,
        error: 'Envie um anexo para atestado ou declaração.',
      });
    }

    const attachmentName = uploadedFile?.originalname || payload.attachment_name || null;
    const attachmentUrl = uploadedFile ? `/uploads/requests/${uploadedFile.filename}` : (payload.attachment_url || null);
    const { targetManagerId, targetDepartmentId } = await resolveRequestRouting(requester.id);

    if (!targetManagerId) {
      await cleanupUploadedFile(uploadedFile?.path);
      return res.status(409).json({
        success: false,
        error: 'Nenhum líder responsável foi encontrado para o colaborador. Verifique o setor e o líder definidos no cadastro operacional.',
      });
    }

    const request = await EmployeeRequest.create({
      user_id: requester.id,
      target_manager_id: targetManagerId,
      target_department_id: targetDepartmentId,
      request_type: payload.request_type,
      target_date: payload.target_date,
      requested_entry_time: payload.requested_entry_time ?? null,
      requested_lunch_start: payload.requested_lunch_start ?? null,
      requested_lunch_end: payload.requested_lunch_end ?? null,
      requested_exit_time: payload.requested_exit_time ?? null,
      absence_start_time: payload.request_type === 'declaration' ? payload.absence_start_time : null,
      absence_end_time: payload.request_type === 'declaration' ? payload.absence_end_time : null,
      reason: payload.reason,
      attachment_name: attachmentName,
      attachment_url: attachmentUrl,
    });

    return res.status(201).json({ success: true, data: request, message: 'Solicitação enviada para análise.' });
  } catch (error) {
    console.error('Create employee request error:', error);

    await cleanupUploadedFile(uploadedFile?.path);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Dados inválidos para a solicitação.' });
    }

    if (error instanceof Error && error.message.includes('competência')) {
      return res.status(409).json({ success: false, error: error.message });
    }

    return res.status(500).json({ success: false, error: 'Erro ao criar a solicitação.' });
  }
};

export const listMyRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'employee') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao colaborador.' });
    }

    const requests = await EmployeeRequest.findAll({
      where: { user_id: requester.id },
      include: [{ model: User, as: 'reviewer', attributes: ['id', 'name'], required: false }],
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: requests });
  } catch (error) {
    console.error('List my requests error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar suas solicitações.' });
  }
};

export const listReviewRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || !['admin', 'manager'].includes(requester.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito à gestão.' });
    }

    const where: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && ['pending', 'approved', 'rejected'].includes(req.query.status)) {
      where.status = req.query.status;
    }
    if (typeof req.query.requestType === 'string' && req.query.requestType !== '') {
      where.request_type = req.query.requestType;
    }

    const requests = await EmployeeRequest.findAll({
      where,
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name', 'registration_number', 'manager_id', 'department_id'],
          include: [{ model: Department, as: 'department', attributes: ['id', 'name'], required: false }],
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
    }) as Array<ScopedEmployeeRequest & { requester?: (User & { department?: Department | null }) | null }>;

    let scopedRequests = requests;
    if (requester.role === 'manager') {
      const reviewerUser = await User.findByPk(requester.id, {
        attributes: ['id', 'department_id'],
      });

      if (reviewerUser) {
        const filtered = [];
        for (const item of requests) {
          if (await isManagerResponsibleForRequest(item, requester.id, reviewerUser.department_id ?? null)) {
            filtered.push(item);
          }
        }
        scopedRequests = filtered;
      } else {
        scopedRequests = [];
      }
    }

    return res.json({ success: true, data: scopedRequests });
  } catch (error) {
    console.error('List review requests error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar as solicitações.' });
  }
};

export const deleteEmployeeRequest = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || !['admin', 'manager'].includes(requester.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito à gestão.' });
    }

    const request = await getScopedRequest(req, Number(req.params.id));
    if (!request) {
      return res.status(404).json({ success: false, error: 'Solicitação não encontrada no escopo atual.' });
    }

    await assertPeriodOpen(request.target_date, 'excluir solicitações da competência fechada');

    const userId = request.user_id;
    const targetDate = request.target_date;

    await request.destroy();
    await AttendanceService.syncDailySummary(userId, targetDate);

    await AuditService.log({
      user_id: requester.id,
      action: 'DELETE_REQUEST',
      entity_name: 'employee_requests',
      entity_id: request.id,
      old_value: { request_type: request.request_type, target_date: request.target_date, status: request.status },
      new_value: null,
    }, req);

    return res.json({ success: true, message: 'Solicitação excluída com sucesso.' });
  } catch (error) {
    console.error('Delete employee request error:', error);
    if (error instanceof Error && error.message.includes('competência')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: 'Erro ao excluir a solicitação.' });
  }
};

export const reviewEmployeeRequest = async (req: AuthRequest, res: Response) => {
  try {
    const reviewer = req.user;
    if (!reviewer || !['admin', 'manager'].includes(reviewer.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito à gestão.' });
    }

    const request = await getScopedRequest(req, Number(req.params.id));
    if (!request) {
      return res.status(404).json({ success: false, error: 'Solicitação não encontrada no escopo atual.' });
    }

    const payload = reviewSchema.parse(req.body);
    await assertPeriodOpen(request.target_date, 'revisar solicitações da competência fechada');

    request.status = payload.status;
    request.reviewed_by = reviewer.id;
    request.admin_comment = payload.admin_comment ?? null;

    if (payload.override_entry_time !== undefined) request.requested_entry_time = payload.override_entry_time || null;
    if (payload.override_lunch_start !== undefined) request.requested_lunch_start = payload.override_lunch_start || null;
    if (payload.override_lunch_end !== undefined) request.requested_lunch_end = payload.override_lunch_end || null;
    if (payload.override_exit_time !== undefined) request.requested_exit_time = payload.override_exit_time || null;
    if (payload.override_absence_start_time !== undefined) request.absence_start_time = payload.override_absence_start_time || null;
    if (payload.override_absence_end_time !== undefined) request.absence_end_time = payload.override_absence_end_time || null;

    if (payload.status === 'approved' && request.request_type === 'declaration'
      && !hasValidAbsencePeriod(request.absence_start_time, request.absence_end_time)) {
      return res.status(400).json({ success: false, error: 'Informe um intervalo de horas válido antes de aprovar a declaração.' });
    }

    if (payload.status === 'approved' && request.request_type === 'time_adjustment') {
      const futureAdjustment = getFutureAdjustmentLabel(request.target_date, {
        entry: request.requested_entry_time,
        lunchStart: request.requested_lunch_start,
        lunchEnd: request.requested_lunch_end,
        exit: request.requested_exit_time,
      });
      if (futureAdjustment) {
        return res.status(400).json({
          success: false,
          error: `Não é permitido aprovar ajuste para ${futureAdjustment} em um horário futuro.`,
        });
      }
    }

    request.reviewed_at = new Date();

    let adjustedRecords: TimeRecord[] = [];
    if (payload.status === 'approved') {
      if (request.request_type === 'time_adjustment') {
        adjustedRecords = await applyApprovedTimeAdjustment(request, reviewer.id, payload.admin_comment);
      }
    }

    await request.save();
    await AttendanceService.syncDailySummary(request.user_id, request.target_date);

    if (payload.status === 'approved' && request.request_type === 'time_adjustment') {
      const employee = await User.findByPk(request.user_id);
      if (employee) {
        await Promise.all(adjustedRecords.map((record) => attemptTimeRecordEmail(employee, record)));
      }
    }

    await AuditService.log({
      user_id: reviewer.id,
      action: 'REVIEW_REQUEST',
      entity_name: 'employee_requests',
      entity_id: request.id,
      old_value: { status: 'pending' },
      new_value: {
        status: payload.status,
        admin_comment: payload.admin_comment,
        absence_start_time: request.absence_start_time,
        absence_end_time: request.absence_end_time,
      },
    }, req);

    return res.json({ success: true, data: request, message: 'Solicitação revisada com sucesso.' });
  } catch (error) {
    console.error('Review employee request error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Dados inválidos para revisão da solicitação.' });
    }

    if (error instanceof Error && error.message.includes('competência')) {
      return res.status(409).json({ success: false, error: error.message });
    }

    return res.status(500).json({ success: false, error: 'Erro ao revisar a solicitação.' });
  }
};
