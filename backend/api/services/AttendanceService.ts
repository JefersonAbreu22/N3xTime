import { TimeRecord } from '../models/TimeRecord.js';
import { WorkSchedule } from '../models/WorkSchedule.js';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { AttendanceSummary } from '../models/AttendanceSummary.js';
import { User } from '../models/User.js';
import { Holiday } from '../models/Holiday.js';
import { EmployeeRequest } from '../models/EmployeeRequest.js';
import {
  getDateKey,
  getWorkedMinutesForDay,
  shouldRequireWorkday,
  getScheduleSummary,
  getNightMinutesBetween,
  getLateMinutes,
  getTimeRangeMinutes,
  applyPartialAbsenceCredit,
} from './AttendanceCalculator.js';
import { Op } from 'sequelize';

export const AttendanceService = {
  /**
   * Atualiza ou cria o resumo de presença de um usuário em uma data específica.
   * Deve ser chamado sempre que houver alteração em registros de ponto (inclusão, alteração, exclusão)
   * ou aprovação de atestados/férias que afetem a data.
   */
  async syncDailySummary(userId: number, dateKey: string) {
    // 1. Busca os registros do dia
    const startOfDay = new Date(`${dateKey}T00:00:00`);
    const endOfDay = new Date(`${dateKey}T23:59:59.999`);

    const records = await TimeRecord.findAll({
      where: {
        user_id: userId,
        record_time: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      order: [['record_time', 'ASC']],
    });

    // 2. Busca o usuário e sua escala atual
    const user = await User.findByPk(userId, {
      include: [{ model: WorkSchedule, as: 'schedule' }],
    });

    if (!user || !user.requires_time_tracking) return null;

    const schedule = (user as unknown as { schedule?: WorkSchedule }).schedule;
    const scheduleSummary = getScheduleSummary(schedule);
    const isBeforeHire = Boolean(user.hire_date && dateKey < user.hire_date);
    const calculationRecords = isBeforeHire ? [] : records;

    // 3. Busca regras da empresa
    const company = await CompanyProfile.findOne();
    const lateTolerance = company?.late_tolerance_minutes ?? 5;
    const lunchTolerance = company?.lunch_tolerance_minutes ?? 10;
    const nightStart = company?.night_shift_start ?? '22:00';
    const nightEnd = company?.night_shift_end ?? '05:00';

    // 4. Busca feriados e ausências justificadas
    const holiday = await Holiday.findOne({ where: { holiday_date: dateKey } });
    
    const justifiedRequests = await EmployeeRequest.findAll({
      where: {
        user_id: userId,
        target_date: dateKey,
        status: 'approved',
        request_type: {
          [Op.in]: ['medical_certificate', 'declaration', 'vacation', 'day_off'],
        },
      },
    });

    const isHoliday = Boolean(holiday);
    const isPaidHoliday = Boolean(holiday?.is_paid);
    const fullDayJustified = justifiedRequests.some((request) => (
      request.request_type !== 'declaration' || !request.absence_start_time || !request.absence_end_time
    ));
    const partialAbsenceMinutes = justifiedRequests
      .filter((request) => request.request_type === 'declaration' && request.absence_start_time && request.absence_end_time)
      .reduce((total, request) => total + getTimeRangeMinutes(request.absence_start_time, request.absence_end_time), 0);
    const isJustified = fullDayJustified || partialAbsenceMinutes > 0;

    // 5. Cálculos
    const { workedMinutes, hasCompleteJourney, entryTime, exitTime } = getWorkedMinutesForDay(calculationRecords, schedule, {
      lunchToleranceMinutes: lunchTolerance,
    });

    const requiredMinutesPerDay = scheduleSummary?.daily_workload_minutes ?? 0;
    const workDays = scheduleSummary?.work_days ?? [1, 2, 3, 4, 5];

    const requiresWorkday = shouldRequireWorkday({
      dateKey,
      requiredMinutesPerDay,
      holidayDates: isPaidHoliday ? new Set([dateKey]) : new Set(),
      justifiedAbsenceDates: fullDayJustified ? new Set([dateKey]) : new Set(),
      workDays,
      hireDate: user.hire_date,
    });

    let requiredMinutes = requiresWorkday ? requiredMinutesPerDay : 0;

    // Regra: se o dia ainda não acabou e a jornada está incompleta, a carga exigida não deve gerar déficit falso
    const todayStr = getDateKey(new Date());
    if (dateKey > todayStr) {
      requiredMinutes = 0;
    } else if (dateKey === todayStr && !hasCompleteJourney) {
      requiredMinutes = Math.min(workedMinutes, requiredMinutes);
    }

    if (!fullDayJustified && partialAbsenceMinutes > 0) {
      requiredMinutes = applyPartialAbsenceCredit({
        requiredMinutes,
        workedMinutes,
        absenceMinutes: partialAbsenceMinutes,
      }).requiredMinutes;
    }

    const balanceMinutes = workedMinutes - requiredMinutes;
    let overtimeMinutes = 0;
    let deficitMinutes = 0;

    if (balanceMinutes > 0) {
      overtimeMinutes = balanceMinutes;
    } else if (balanceMinutes < 0) {
      deficitMinutes = Math.abs(balanceMinutes);
    }

    const nightMinutes = getNightMinutesBetween(entryTime, exitTime, nightStart, nightEnd);
    
    let lateMinutes = 0;
    if (entryTime && schedule?.entry_time) {
      lateMinutes = getLateMinutes({
        scheduleEntryTime: String(schedule.entry_time).slice(0, 5),
        actualEntryTime: entryTime,
        lateToleranceMinutes: lateTolerance,
      });
    }

    let status: AttendanceSummary['status'] = 'absent';
    if (isBeforeHire) {
      status = 'day_off';
    } else if (isJustified) {
      status = 'justified';
    } else if (isHoliday && workedMinutes === 0) {
      status = 'holiday';
    } else if (!requiresWorkday && workedMinutes === 0) {
      status = 'day_off';
    } else if (calculationRecords.length > 0) {
      status = hasCompleteJourney ? 'complete' : 'in_progress';
    }

    // 6. Persiste no banco de dados
    const summaryData = {
      user_id: userId,
      date: dateKey,
      worked_minutes: workedMinutes,
      required_minutes: requiredMinutes,
      late_minutes: lateMinutes,
      overtime_minutes: overtimeMinutes,
      deficit_minutes: deficitMinutes,
      bank_balance_minutes: balanceMinutes,
      night_minutes: nightMinutes,
      holiday_worked_minutes: isHoliday && workedMinutes > 0 ? workedMinutes : 0,
      status,
      has_complete_journey: hasCompleteJourney,
      is_holiday: isHoliday,
      is_justified_absence: !isBeforeHire && isJustified,
      record_count: calculationRecords.length,
      first_record_time: entryTime,
      last_record_time: exitTime,
    };

    const [summary] = await AttendanceSummary.upsert(summaryData);
    return summary;
  },

  /**
   * Recalcula um intervalo inteiro para um usuário (ex: quando muda a escala ou feriados).
   */
  async syncPeriod(userId: number, startDateKey: string, endDateKey: string) {
    const start = new Date(`${startDateKey}T00:00:00`);
    const end = new Date(`${endDateKey}T00:00:00`);
    const cursor = new Date(start);

    while (cursor <= end) {
      await this.syncDailySummary(userId, getDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
};
