import { Response } from 'express';
import { z } from 'zod';
import { dateOnlySchema } from '../validation/dateOnly.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { Holiday, User } from '../models/index.js';
import { AttendanceService } from '../services/AttendanceService.js';

const holidaySchema = z.object({
  name: z.string().trim().min(2),
  holiday_date: dateOnlySchema,
  is_paid: z.boolean().default(true),
});

const syncHolidayDate = async (dateKey: string) => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (dateKey > todayKey) return;

  const users = await User.findAll({ where: { status: 'active', requires_time_tracking: true }, attributes: ['id'] });
  const results = await Promise.allSettled(users.map((user) => AttendanceService.syncDailySummary(user.id, dateKey)));
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    console.error(`Holiday summary sync failed for ${failures.length} user(s) on ${dateKey}.`);
  }
};

export const listHolidays = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito à gestão.' });
    }

    const holidays = await Holiday.findAll({ order: [['holiday_date', 'ASC']] });
    return res.json({ success: true, data: holidays });
  } catch (error) {
    console.error('List holidays error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar os feriados.' });
  }
};

export const createHoliday = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Somente administradores podem cadastrar feriados.' });
    }

    const payload = holidaySchema.parse(req.body);
    const holiday = await Holiday.create(payload);
    await syncHolidayDate(payload.holiday_date);
    return res.status(201).json({ success: true, data: holiday, message: 'Feriado cadastrado.' });
  } catch (error) {
    console.error('Create holiday error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao cadastrar o feriado.' });
  }
};

export const deleteHoliday = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Somente administradores podem remover feriados.' });
    }

    const holiday = await Holiday.findByPk(Number(req.params.id));
    if (!holiday) {
      return res.status(404).json({ success: false, error: 'Feriado não encontrado.' });
    }

    const holidayDate = String(holiday.holiday_date).slice(0, 10);
    await holiday.destroy();
    await syncHolidayDate(holidayDate);
    return res.json({ success: true, message: 'Feriado removido.' });
  } catch (error) {
    console.error('Delete holiday error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao remover o feriado.' });
  }
};
