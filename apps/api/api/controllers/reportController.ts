import { Op } from 'sequelize';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { BiometricEvent } from '../models/BiometricEvent.js';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { Department } from '../models/Department.js';
import { getManagedUserIds, isManagerResponsibleForUser } from '../utils/leadership.js';
import { EmployeeRequest } from '../models/EmployeeRequest.js';
import { Holiday } from '../models/Holiday.js';
import { MonthlyClosing } from '../models/MonthlyClosing.js';
import { TimeRecord } from '../models/TimeRecord.js';
import { User } from '../models/User.js';
import { WorkSchedule } from '../models/WorkSchedule.js';
import { applyPartialAbsenceCredit, getTimeRangeMinutes } from '../services/AttendanceCalculator.js';

const parseDateInput = (value?: string, endOfDay = false) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return endOfDay
      ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
      : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return endOfDay
    ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999)
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
};

const getPeriodBounds = (startDate?: string, endDate?: string) => {
  const end = parseDateInput(endDate, true) ?? new Date();
  const start = parseDateInput(startDate, false)
    ?? new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29, 0, 0, 0, 0);

  const normalizedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const normalizedEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return { start: normalizedStart, end: normalizedEnd };
};

const getMonthBounds = (periodMonth: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(periodMonth);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return {
    year,
    month,
    periodMonth,
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
};

const getTodayBounds = () => {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
};

const getDayBoundsForDate = (value?: string) => {
  const baseDate = parseDateInput(value, false) ?? new Date();
  return {
    date: getDateKey(baseDate),
    start: new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0),
    end: new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59, 999),
  };
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
  return (hours * 60) + minutes;
};

const formatTimeLabel = (value?: Date | string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const getLateMinutes = ({
  scheduleEntryTime,
  actualEntryTime,
  lateToleranceMinutes,
}: {
  scheduleEntryTime?: string | null;
  actualEntryTime?: Date | string | null;
  lateToleranceMinutes: number;
}) => {
  if (!scheduleEntryTime || !actualEntryTime) return 0;
  const entryDate = new Date(actualEntryTime);
  const actualMinutes = entryDate.getHours() * 60 + entryDate.getMinutes();
  return Math.max(actualMinutes - timeToMinutes(scheduleEntryTime) - Math.max(lateToleranceMinutes, 0), 0);
};

const getScheduleSummary = (schedule?: WorkSchedule | null) => {
  if (!schedule) return null;
  const entry = schedule.entry_time ? String(schedule.entry_time).slice(0, 5) : '08:00';
  const exit = schedule.exit_time ? String(schedule.exit_time).slice(0, 5) : '18:00';
  const lunchDuration = Number(schedule.lunch_duration ?? 0);
  const workDays = Array.isArray(schedule.work_days) && schedule.work_days.length
    ? schedule.work_days.map(Number).filter((day) => day >= 0 && day <= 6)
    : [1, 2, 3, 4, 5];
    
  const entryMins = timeToMinutes(entry);
  let exitMins = timeToMinutes(exit);
  if (exitMins < entryMins) {
    exitMins += 24 * 60; // Adds 24 hours for night shifts crossing midnight
  }

  let dailyWorkload = Math.max(exitMins - entryMins - lunchDuration, 0);
  if (!schedule.entry_time || !schedule.exit_time) {
    dailyWorkload = 0; // Defaults to 0 so custom_workload takes over
  }

  return {
    entry_time: schedule.entry_time ? entry : null,
    exit_time: schedule.exit_time ? exit : null,
    lunch_duration: lunchDuration,
    flexible_lunch: Boolean(schedule.flexible_lunch),
    work_days: workDays,
    daily_workload_minutes: dailyWorkload,
    custom_workload: schedule.custom_workload as Record<string, number> | null,
  };
};

const createEmptyAttendanceMetrics = () => ({
  workedMinutesTotal: 0,
  requiredMinutesTotal: 0,
  expectedMinutesTotal: 0,
  balanceMinutesTotal: 0,
  overtimeMinutes: 0,
  deficitMinutes: 0,
  nightMinutesTotal: 0,
  holidayWorkedMinutes: 0,
  completeDays: 0,
  incompleteDays: 0,
  absenceDays: 0,
  justifiedDays: 0,
  lateMinutesTotal: 0,
  dailyBalances: [] as Array<{
    date: string;
    entryTime: Date | string | null;
    exitTime: Date | string | null;
    workedMinutes: number;
    requiredMinutes: number;
    expectedMinutes: number;
    balanceMinutes: number;
    hasCompleteJourney: boolean;
    nightMinutes: number;
    isHoliday: boolean;
    holidayType: 'paid' | 'unpaid' | null;
    isJustifiedAbsence: boolean;
    isAbsence: boolean;
  }>,
  latestDailyBalance: null as {
    date: string;
    entryTime: Date | string | null;
    exitTime: Date | string | null;
    workedMinutes: number;
    requiredMinutes: number;
    balanceMinutes: number;
    hasCompleteJourney: boolean;
  } | null,
  monthlyBreakdown: [] as Array<{
    month: string;
    workedMinutes: number;
    requiredMinutes: number;
    expectedMinutes: number;
    balanceMinutes: number;
    overtimeMinutes: number;
    deficitMinutes: number;
    nightMinutes: number;
    holidayWorkedMinutes: number;
    absenceDays: number;
    justifiedDays: number;
  }>,
});

const getDateKey = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getWorkedMinutesForDay = (
  records: TimeRecord[],
  schedule?: WorkSchedule | null,
  options?: { lunchToleranceMinutes?: number; justifiedExitTime?: string | null }
) => {
  const validRecords = records.filter((record) => record.status !== 'rejected').sort(
    (a, b) => new Date(a.record_time).getTime() - new Date(b.record_time).getTime()
  );
  const entryRecord = validRecords.find((record) => record.record_type === 'entry');
  const exitRecord = [...validRecords].reverse().find((record) => record.record_type === 'exit');
  const lunchStartRecord = validRecords.find((record) => record.record_type === 'lunch_start');
  const lunchEndRecord = validRecords.find((record) => record.record_type === 'lunch_end');

  if (!entryRecord) {
    return {
      workedMinutes: 0,
      hasCompleteJourney: false,
      entryTime: null,
      exitTime: null,
      deductedLunchMinutes: 0,
    };
  }

  // Considera a jornada em andamento se a entrada foi há menos de 16 horas
  const hoursSinceEntry = (new Date().getTime() - new Date(entryRecord.record_time).getTime()) / 3600000;
  const inProgress = hoursSinceEntry < 16;
  let justifiedExitTime: Date | null = null;
  if (!exitRecord && options?.justifiedExitTime) {
    const [hours, minutes] = String(options.justifiedExitTime).slice(0, 5).split(':').map(Number);
    const candidate = new Date(entryRecord.record_time);
    candidate.setHours(hours, minutes, 0, 0);
    const lastRecordTime = validRecords.reduce(
      (latest, record) => Math.max(latest, new Date(record.record_time).getTime()),
      new Date(entryRecord.record_time).getTime()
    );
    if (Number.isFinite(hours) && Number.isFinite(minutes) && candidate.getTime() >= lastRecordTime) {
      justifiedExitTime = candidate;
    }
  }
  const effectiveExitTime = (exitRecord && entryRecord.id !== exitRecord.id) 
    ? exitRecord.record_time 
    : (justifiedExitTime ?? (inProgress ? new Date().toISOString() : entryRecord.record_time));
    
  const rawWorkedMinutes = Math.round((new Date(effectiveExitTime).getTime() - new Date(entryRecord.record_time).getTime()) / 60000);
  const plannedLunchMinutes = Number(schedule?.lunch_duration ?? 0);
  
  let actualLunchMinutes = null;
  if (lunchStartRecord && lunchEndRecord) {
    actualLunchMinutes = Math.max(
      Math.round((new Date(lunchEndRecord.record_time).getTime() - new Date(lunchStartRecord.record_time).getTime()) / 60000),
      0
    );
  } else if (lunchStartRecord && !lunchEndRecord) {
     if (inProgress) {
       actualLunchMinutes = Math.max(
        Math.round((new Date().getTime() - new Date(lunchStartRecord.record_time).getTime()) / 60000),
        0
      );
     } else {
       actualLunchMinutes = plannedLunchMinutes;
     }
  }

  const lunchToleranceMinutes = Math.max(Number(options?.lunchToleranceMinutes ?? 0), 0);
  let deductedLunchMinutes = 0;

  if (actualLunchMinutes !== null) {
    deductedLunchMinutes = actualLunchMinutes;
  } else {
    // Se não houve batida de almoço, mantém o intervalo previsto apenas em jornadas longas.
    if (rawWorkedMinutes > 360 && plannedLunchMinutes > 0) {
      deductedLunchMinutes = plannedLunchMinutes;
    }
  }

  const hasCompleteJourney = Boolean(entryRecord && exitRecord && entryRecord.id !== exitRecord.id);
  const workedMinutes = Math.max(rawWorkedMinutes - deductedLunchMinutes, 0);

  return {
    workedMinutes,
    hasCompleteJourney,
    entryTime: entryRecord.record_time,
    exitTime: exitRecord && entryRecord.id !== exitRecord.id ? exitRecord.record_time : null,
    deductedLunchMinutes,
  };
};

const getMonthKey = (dateKey: string) => dateKey.slice(0, 7);

const formatMonthLabel = (periodMonth: string) => {
  const bounds = getMonthBounds(periodMonth);
  if (!bounds) return periodMonth;

  return new Date(bounds.year, bounds.month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
};

const getDateKeysInRange = (start: Date, end: Date) => {
  const result: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const final = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);

  while (cursor.getTime() <= final.getTime()) {
    result.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
};

const getWeekday = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.getDay();
};

const isDateBeforeHire = (dateKey: string, hireDate?: string | null) => Boolean(hireDate && dateKey < hireDate);
const isDateOutsideEmployment = (dateKey: string, nonWorkingFromDate?: string | null) => (
  Boolean(nonWorkingFromDate && dateKey >= nonWorkingFromDate)
);

const getNonWorkingFromDate = (user: User) => (
  user.status === 'suspended' ? user.suspension_start_date : null
);

const shouldRequireWorkday = ({
  dateKey,
  requiredMinutesPerDay,
  holidayDates,
  justifiedAbsenceDates,
  workDays,
  customWorkload,
  hireDate,
}: {
  dateKey: string;
  requiredMinutesPerDay: number;
  holidayDates: Set<string>;
  justifiedAbsenceDates: Set<string>;
  workDays: number[];
  customWorkload?: Record<string, number> | null;
  hireDate?: string | null;
}) => {
  if (hireDate && dateKey < hireDate) {
    return false;
  }

  const weekday = getWeekday(dateKey);
  
  if (customWorkload && typeof customWorkload[weekday] === 'number') {
    if (customWorkload[weekday] <= 0) return false;
  } else {
    if (!requiredMinutesPerDay) return false;
    if (!workDays.includes(weekday)) return false;
  }
  
  if (holidayDates.has(dateKey)) return false;
  if (justifiedAbsenceDates.has(dateKey)) return false;
  return true;
};

const getGeoMapLink = (record?: TimeRecord | null) => {
  if (!record || record.latitude === null || record.longitude === null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`;
};

const getNightMinutesBetween = (startValue: Date | string | null, endValue: Date | string | null, nightStart = '22:00', nightEnd = '05:00') => {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return 0;

  const [nightStartHour, nightStartMinute] = nightStart.split(':').map(Number);
  const [nightEndHour, nightEndMinute] = nightEnd.split(':').map(Number);

  let totalMinutes = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const final = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);

  while (cursor.getTime() <= final.getTime()) {
    const windowStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), nightStartHour, nightStartMinute, 0, 0);
    const windowEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, nightEndHour, nightEndMinute, 0, 0);
    const overlapStart = Math.max(start.getTime(), windowStart.getTime());
    const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());
    if (overlapEnd > overlapStart) {
      totalMinutes += Math.round((overlapEnd - overlapStart) / 60000);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMinutes;
};

const buildAttendanceMetrics = (
  records: TimeRecord[],
  schedule: WorkSchedule | null | undefined,
  options: {
    start: Date;
    end: Date;
    holidayDates: Set<string>;
    unpaidHolidayDates?: Set<string>;
    allHolidayDates?: Set<string>;
    justifiedAbsenceDates: Set<string>;
    partialAbsenceMinutesByDate?: Map<string, number>;
    partialAbsenceStartTimeByDate?: Map<string, string>;
    externalWorkDates?: Set<string>;
    nightShiftStart: string;
    nightShiftEnd: string;
    lateToleranceMinutes: number;
    lunchToleranceMinutes: number;
    hireDate?: string | null;
    nonWorkingFromDate?: string | null;
  }
) => {
  const recordsByDate = new Map<string, TimeRecord[]>();

  for (const record of records) {
    const key = getDateKey(record.record_time);
    const bucket = recordsByDate.get(key) ?? [];
    bucket.push(record);
    recordsByDate.set(key, bucket);
  }

  const scheduleSummary = getScheduleSummary(schedule);
  const requiredMinutesPerDay = scheduleSummary?.daily_workload_minutes ?? 0;
  const workDays = scheduleSummary?.work_days ?? [1, 2, 3, 4, 5];
  let workedMinutesTotal = 0;
  let overtimeMinutes = 0;
  let deficitMinutes = 0;
  let completeDays = 0;
  let incompleteDays = 0;
  let nightMinutesTotal = 0;
  let holidayWorkedMinutes = 0;
  let absenceDays = 0;
  let justifiedDays = 0;
  let lateMinutesTotal = 0;
  const monthlyMap = new Map<string, {
    month: string;
    workedMinutes: number;
    requiredMinutes: number;
    expectedMinutes: number;
    balanceMinutes: number;
    overtimeMinutes: number;
    deficitMinutes: number;
    nightMinutes: number;
    holidayWorkedMinutes: number;
    absenceDays: number;
    justifiedDays: number;
  }>();

  const dailyBalances = getDateKeysInRange(options.start, options.end).map((date) => {
      if (isDateBeforeHire(date, options.hireDate) || isDateOutsideEmployment(date, options.nonWorkingFromDate)) {
        return {
          date,
          entryTime: null,
          exitTime: null,
          workedMinutes: 0,
          requiredMinutes: 0,
          expectedMinutes: 0,
          balanceMinutes: 0,
          hasCompleteJourney: false,
          nightMinutes: 0,
          isHoliday: false,
          holidayType: null,
          isJustifiedAbsence: false,
          isAbsence: false,
        };
      }

      const dayRecords = recordsByDate.get(date) ?? [];
      const { workedMinutes, hasCompleteJourney, entryTime, exitTime } = getWorkedMinutesForDay(dayRecords, schedule, {
        lunchToleranceMinutes: options.lunchToleranceMinutes,
        justifiedExitTime: options.partialAbsenceStartTimeByDate?.get(date),
      });
      const requiresWorkday = shouldRequireWorkday({
        dateKey: date,
        requiredMinutesPerDay,
        holidayDates: options.holidayDates,
        justifiedAbsenceDates: options.justifiedAbsenceDates,
        workDays,
        customWorkload: scheduleSummary?.custom_workload,
        hireDate: options.hireDate,
      });

      const weekday = getWeekday(date);
      let expectedMinutesForDay = requiredMinutesPerDay;
      if (scheduleSummary?.custom_workload && typeof scheduleSummary.custom_workload[weekday] === 'number') {
        expectedMinutesForDay = scheduleSummary.custom_workload[weekday];
      }

      const isExternalWork = options.externalWorkDates?.has(date) ?? false;
      const expectedMinutes = requiresWorkday ? expectedMinutesForDay : 0;
      let lateMinutes = 0;
      if (entryTime && schedule?.entry_time && !isExternalWork) {
        lateMinutes = getLateMinutes({
          scheduleEntryTime: String(schedule.entry_time).slice(0, 5),
          actualEntryTime: entryTime,
          lateToleranceMinutes: options.lateToleranceMinutes,
        });
      }
      lateMinutesTotal += lateMinutes;

      let requiredMinutes = expectedMinutes;
      
      const todayStr = getDateKey(new Date());
      if (date > todayStr) {
        requiredMinutes = 0;
      } else if (date === todayStr && !isExternalWork) {
        // Durante o dia atual, não debita horas não trabalhadas antecipadamente no saldo banco.
        // Apenas o que a pessoa já trabalhou "abate" a exigência temporariamente, ou o saldo banco ficaria muito negativo durante a jornada.
        if (hasCompleteJourney) {
          requiredMinutes = expectedMinutes;
        } else {
          requiredMinutes = Math.min(workedMinutes + lateMinutes, expectedMinutes);
        }
      }

      let finalWorkedMinutes = workedMinutes;
      if (isExternalWork && date <= todayStr) {
        finalWorkedMinutes = Math.max(workedMinutes, expectedMinutes);
      }

      const partialAbsenceMinutes = options.partialAbsenceMinutesByDate?.get(date) ?? 0;
      if (partialAbsenceMinutes > 0) {
        requiredMinutes = applyPartialAbsenceCredit({
          requiredMinutes,
          workedMinutes: finalWorkedMinutes,
          absenceMinutes: partialAbsenceMinutes,
        }).requiredMinutes;
      }

      const balanceMinutes = finalWorkedMinutes - requiredMinutes;
      const nightMinutes = getNightMinutesBetween(entryTime, exitTime, options.nightShiftStart, options.nightShiftEnd);
      
      const monthKey = getMonthKey(date);
      const monthBucket = monthlyMap.get(monthKey) ?? {
        month: monthKey,
        workedMinutes: 0,
        requiredMinutes: 0,
        expectedMinutes: 0,
        balanceMinutes: 0,
        overtimeMinutes: 0,
        deficitMinutes: 0,
        nightMinutes: 0,
        holidayWorkedMinutes: 0,
        absenceDays: 0,
        justifiedDays: 0,
      };

      workedMinutesTotal += finalWorkedMinutes;
      nightMinutesTotal += nightMinutes;
      monthBucket.workedMinutes += finalWorkedMinutes;
      monthBucket.requiredMinutes += requiredMinutes;
      monthBucket.expectedMinutes += expectedMinutes;
      monthBucket.nightMinutes += nightMinutes;

      const isUnpaidHoliday = options.unpaidHolidayDates?.has(date) ?? false;
      const isHolidayAny = options.allHolidayDates?.has(date) ?? options.holidayDates.has(date);

      if (dayRecords.length === 0 && requiredMinutes > 0 && !isExternalWork && !isUnpaidHoliday) {
        absenceDays += 1;
        monthBucket.absenceDays += 1;
      }

      if (options.justifiedAbsenceDates.has(date) || partialAbsenceMinutes > 0) {
        justifiedDays += 1;
        monthBucket.justifiedDays += 1;
      }

      if (isHolidayAny && finalWorkedMinutes > 0) {
        holidayWorkedMinutes += finalWorkedMinutes;
        monthBucket.holidayWorkedMinutes += finalWorkedMinutes;
      }

      if ((dayRecords.length > 0 && hasCompleteJourney) || (isExternalWork && date <= todayStr)) {
        completeDays += 1;
      } else if (dayRecords.length > 0) {
        incompleteDays += 1;
      }
      if (balanceMinutes > 0) {
        overtimeMinutes += balanceMinutes;
        monthBucket.overtimeMinutes += balanceMinutes;
      } else if (balanceMinutes < 0) {
        deficitMinutes += Math.abs(balanceMinutes);
        monthBucket.deficitMinutes += Math.abs(balanceMinutes);
      }
      monthBucket.balanceMinutes += balanceMinutes;
      monthlyMap.set(monthKey, monthBucket);

      return {
        date,
        entryTime: formatTimeLabel(entryTime),
        exitTime: formatTimeLabel(exitTime),
        workedMinutes: finalWorkedMinutes,
        requiredMinutes,
        expectedMinutes,
        balanceMinutes,
        hasCompleteJourney: hasCompleteJourney || (isExternalWork && date <= todayStr),
        nightMinutes,
        isHoliday: isHolidayAny,
        holidayType: isHolidayAny ? (isUnpaidHoliday ? 'unpaid' as const : 'paid' as const) : null,
        isJustifiedAbsence: options.justifiedAbsenceDates.has(date) || partialAbsenceMinutes > 0,
        isAbsence: dayRecords.length === 0 && requiredMinutes > 0 && !isExternalWork && !isUnpaidHoliday,
      };
    });

  return {
    workedMinutesTotal,
    requiredMinutesTotal: dailyBalances.reduce((sum, item) => sum + item.requiredMinutes, 0),
    expectedMinutesTotal: dailyBalances.reduce((sum, item) => sum + item.expectedMinutes, 0),
    balanceMinutesTotal: dailyBalances.reduce((sum, item) => sum + item.balanceMinutes, 0),
    overtimeMinutes,
    deficitMinutes,
    nightMinutesTotal,
    holidayWorkedMinutes,
    completeDays,
    incompleteDays,
    absenceDays,
    justifiedDays,
    lateMinutesTotal,
    dailyBalances,
    latestDailyBalance: [...dailyBalances].reverse().find((item) => item.date === getDateKey(new Date())) ?? null,
    monthlyBreakdown: Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
};

const buildDailyTimeline = (
  dateKey: string,
  records: TimeRecord[],
  schedule?: WorkSchedule | null,
  options?: { lunchToleranceMinutes?: number; lateToleranceMinutes?: number; isJustified?: boolean; partialAbsenceMinutes?: number; partialAbsenceStartTime?: string | null; isHoliday?: boolean; isExternalWork?: boolean; hireDate?: string | null; nonWorkingFromDate?: string | null; }
) => {
  if (isDateBeforeHire(dateKey, options?.hireDate) || isDateOutsideEmployment(dateKey, options?.nonWorkingFromDate)) {
    return {
      status: 'absent' as const,
      entryTime: null,
      lunchStartTime: null,
      lunchEndTime: null,
      exitTime: null,
      workedMinutes: 0,
      expectedMinutes: 0,
      requiredMinutes: 0,
      balanceMinutes: 0,
      recordCount: 0,
    };
  }

  const validRecords = records
    .filter((record) => record.status !== 'rejected')
    .sort((a, b) => new Date(a.record_time).getTime() - new Date(b.record_time).getTime());

  const scheduleSummary = getScheduleSummary(schedule);
  const requiredMinutesPerDay = scheduleSummary?.daily_workload_minutes ?? 0;
  const workDays = scheduleSummary?.work_days ?? [1, 2, 3, 4, 5];
  
  const isExternalWork = options?.isExternalWork ?? false;
  
  const requiresWorkday = shouldRequireWorkday({
    dateKey,
    requiredMinutesPerDay,
    holidayDates: new Set(options?.isHoliday ? [dateKey] : []),
    justifiedAbsenceDates: new Set(options?.isJustified ? [dateKey] : []),
    workDays,
    customWorkload: scheduleSummary?.custom_workload,
    hireDate: options?.hireDate,
  });

  const weekday = getWeekday(dateKey);
  let expectedMinutesForDay = requiredMinutesPerDay;
  if (scheduleSummary?.custom_workload && typeof scheduleSummary.custom_workload[weekday] === 'number') {
    expectedMinutesForDay = scheduleSummary.custom_workload[weekday];
  }
  const expectedMinutes = requiresWorkday ? expectedMinutesForDay : 0;

  if (!validRecords.length) {
    let requiredMinutes = expectedMinutes;
    const todayStr = getDateKey(new Date());
    if (dateKey > todayStr) requiredMinutes = 0;
    else if (dateKey === todayStr && !isExternalWork) requiredMinutes = 0; // Se não tem batida hoje ainda, não dá deficit antecipado
    
    let finalWorkedMinutes = 0;
    if (isExternalWork && dateKey <= todayStr) {
      finalWorkedMinutes = expectedMinutes;
      requiredMinutes = expectedMinutes;
    }
    if (options?.partialAbsenceMinutes) {
      requiredMinutes = applyPartialAbsenceCredit({
        requiredMinutes,
        workedMinutes: finalWorkedMinutes,
        absenceMinutes: options.partialAbsenceMinutes,
      }).requiredMinutes;
    }
    
    return {
      status: isExternalWork && dateKey <= todayStr ? 'complete' as const : 'absent' as const,
      entryTime: null,
      lunchStartTime: null,
      lunchEndTime: null,
      exitTime: null,
      workedMinutes: finalWorkedMinutes,
      expectedMinutes,
      requiredMinutes,
      balanceMinutes: finalWorkedMinutes - requiredMinutes,
      recordCount: 0,
    };
  }

  const entryRecord = validRecords.find((record) => record.record_type === 'entry');
  const lunchStartRecord = validRecords.find((record) => record.record_type === 'lunch_start');
  const lunchEndRecord = validRecords.find((record) => record.record_type === 'lunch_end');
  const exitRecord = [...validRecords].reverse().find((record) => record.record_type === 'exit');
  const workedSummary = getWorkedMinutesForDay(validRecords, schedule, {
    lunchToleranceMinutes: options?.lunchToleranceMinutes,
    justifiedExitTime: options?.partialAbsenceStartTime,
  });
  
  let lateMinutes = 0;
  if (workedSummary.entryTime && schedule?.entry_time && !isExternalWork) {
    lateMinutes = getLateMinutes({
      scheduleEntryTime: String(schedule.entry_time).slice(0, 5),
      actualEntryTime: workedSummary.entryTime,
      lateToleranceMinutes: options?.lateToleranceMinutes ?? 0,
    });
  }
  
  const todayStr = getDateKey(new Date());
  let requiredMinutes = expectedMinutes;
  if (dateKey > todayStr) {
    requiredMinutes = 0;
  } else if (dateKey === todayStr && !isExternalWork) {
    if (workedSummary.hasCompleteJourney) {
      requiredMinutes = expectedMinutes;
    } else {
      requiredMinutes = Math.min(workedSummary.workedMinutes + lateMinutes, expectedMinutes);
    }
  }
  
  let finalWorkedMinutes = workedSummary.workedMinutes;
  if (isExternalWork && dateKey <= todayStr) {
    finalWorkedMinutes = Math.max(workedSummary.workedMinutes, expectedMinutes);
    requiredMinutes = expectedMinutes;
  }
  if (options?.partialAbsenceMinutes) {
    requiredMinutes = applyPartialAbsenceCredit({
      requiredMinutes,
      workedMinutes: finalWorkedMinutes,
      absenceMinutes: options.partialAbsenceMinutes,
    }).requiredMinutes;
  }
  
  const hasExit = Boolean(exitRecord);

  return {
    status: (hasExit || (isExternalWork && dateKey <= todayStr)) ? 'complete' as const : 'in_progress' as const,
    entryTime: formatTimeLabel(entryRecord?.record_time),
    lunchStartTime: formatTimeLabel(lunchStartRecord?.record_time),
    lunchEndTime: formatTimeLabel(lunchEndRecord?.record_time),
    exitTime: formatTimeLabel(exitRecord?.record_time),
    workedMinutes: finalWorkedMinutes,
    expectedMinutes,
    requiredMinutes,
    balanceMinutes: finalWorkedMinutes - requiredMinutes,
    recordCount: validRecords.length,
  };
};

const getScopedUsers = async (req: AuthRequest, departmentId?: number | null, userId?: number | null) => {
  const requester = req.user;
  if (!requester) {
    throw new Error('Não autorizado.');
  }

  const where: Record<string, unknown> = { status: { [Op.ne]: 'inactive' }, requires_time_tracking: true };
  
  if (requester.role === 'employee') {
    where.id = requester.id;
  }
  
  if (departmentId && requester.role !== 'employee') {
    where.department_id = departmentId;
  }
  if (userId && requester.role !== 'employee') {
    where.id = userId;
  }

  const users = await User.findAll({
    where,
    attributes: ['id', 'name', 'registration_number', 'department_id', 'manager_id', 'work_type', 'status', 'remote_clock_in_enabled', 'hire_date', 'suspension_start_date'],
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name'], required: false },
      { model: User, as: 'manager', attributes: ['id', 'name'], required: false },
      { model: WorkSchedule, as: 'schedule', attributes: ['id', 'entry_time', 'exit_time', 'lunch_duration', 'flexible_lunch', 'work_days', 'custom_workload'], required: false },
    ],
    order: [['name', 'ASC']],
  }) as Array<User & { department?: Department | null; manager?: User | null; schedule?: WorkSchedule | null }>;

  if (requester.role === 'manager') {
    const managedIds = new Set(await getManagedUserIds(requester.id, null, 'view_reports'));
    return users.filter(user => managedIds.has(user.id));
  }

  return users;
};

const getScopedUser = async (req: AuthRequest, userId: number) => {
  const requester = req.user;
  if (!requester) {
    throw new Error('Não autorizado.');
  }

  const where: Record<string, unknown> = {
    status: { [Op.ne]: 'inactive' },
    requires_time_tracking: true,
  };

  if (requester.role === 'employee') {
    where.id = requester.id;
  } else {
    where.id = userId;
  }

  const user = await User.findOne({
    where,
    attributes: ['id', 'name', 'registration_number', 'department_id', 'manager_id', 'status', 'hire_date', 'suspension_start_date'],
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name'], required: false },
      { model: User, as: 'manager', attributes: ['id', 'name'], required: false },
      { model: WorkSchedule, as: 'schedule', attributes: ['id', 'entry_time', 'exit_time', 'lunch_duration', 'flexible_lunch', 'work_days', 'custom_workload'], required: false },
    ],
  }) as (User & { department?: Department | null; manager?: User | null; schedule?: WorkSchedule | null }) | null;

  if (!user) return null;

  if (requester.role === 'manager') {
    if (!await isManagerResponsibleForUser(requester.id, null, user, 'view_reports')) return null;
  }

  return user;
};

const getReportingContext = async (userIds: number[], start: Date, end: Date) => {
  const [companyProfile, holidays, approvedRequests] = await Promise.all([
    CompanyProfile.findByPk(1),
    Holiday.findAll({
      where: {
        holiday_date: {
          [Op.between]: [getDateKey(start), getDateKey(end)],
        },
      },
      order: [['holiday_date', 'ASC']],
    }),
    EmployeeRequest.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        status: 'approved',
        target_date: {
          [Op.between]: [getDateKey(start), getDateKey(end)],
        },
        request_type: { [Op.in]: ['medical_certificate', 'declaration', 'vacation', 'day_off', 'external_work'] },
      },
      order: [['target_date', 'ASC']],
    }),
  ]);

  const holidayDates = new Set(holidays.filter(h => h.is_paid).map((holiday) => getDateKey(String(holiday.holiday_date))));
  const unpaidHolidayDates = new Set(holidays.filter(h => !h.is_paid).map((holiday) => getDateKey(String(holiday.holiday_date))));
  const allHolidayDates = new Set(holidays.map((holiday) => getDateKey(String(holiday.holiday_date))));
  
  const justifiedAbsencesByUser = new Map<number, Set<string>>();
  const partialAbsenceMinutesByUser = new Map<number, Map<string, number>>();
  const partialAbsenceStartTimeByUser = new Map<number, Map<string, string>>();
  const externalWorkByUser = new Map<number, Set<string>>();
  
  for (const request of approvedRequests) {
    if (request.request_type === 'external_work') {
      const bucket = externalWorkByUser.get(request.user_id) ?? new Set<string>();
      bucket.add(String(request.target_date));
      externalWorkByUser.set(request.user_id, bucket);
    } else if (request.request_type === 'declaration' && request.absence_start_time && request.absence_end_time) {
      const bucket = partialAbsenceMinutesByUser.get(request.user_id) ?? new Map<string, number>();
      const dateKey = String(request.target_date);
      bucket.set(dateKey, (bucket.get(dateKey) ?? 0) + getTimeRangeMinutes(request.absence_start_time, request.absence_end_time));
      partialAbsenceMinutesByUser.set(request.user_id, bucket);

      const startTimeBucket = partialAbsenceStartTimeByUser.get(request.user_id) ?? new Map<string, string>();
      const currentStartTime = startTimeBucket.get(dateKey);
      if (!currentStartTime || request.absence_start_time < currentStartTime) {
        startTimeBucket.set(dateKey, request.absence_start_time);
      }
      partialAbsenceStartTimeByUser.set(request.user_id, startTimeBucket);
    } else {
      const bucket = justifiedAbsencesByUser.get(request.user_id) ?? new Set<string>();
      bucket.add(String(request.target_date));
      justifiedAbsencesByUser.set(request.user_id, bucket);
    }
  }

  return {
    companyProfile,
    holidays,
    holidayDates,
    unpaidHolidayDates,
    allHolidayDates,
    justifiedAbsencesByUser,
    partialAbsenceMinutesByUser,
    partialAbsenceStartTimeByUser,
    externalWorkByUser,
  };
};

const getUsersForMonthlyClosing = async () => {
  return (await User.findAll({
    where: { status: 'active', requires_time_tracking: true },
    attributes: ['id', 'name', 'registration_number', 'department_id', 'manager_id', 'hire_date'],
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name'], required: false },
      { model: User, as: 'manager', attributes: ['id', 'name'], required: false },
      { model: WorkSchedule, as: 'schedule', attributes: ['id', 'entry_time', 'exit_time', 'lunch_duration', 'flexible_lunch', 'work_days', 'custom_workload'], required: false },
    ],
    order: [['name', 'ASC']],
  })) as Array<User & { department?: Department | null; manager?: User | null; schedule?: WorkSchedule | null }>;
};

const buildMonthlyClosingSnapshot = async (periodMonth: string) => {
  const bounds = getMonthBounds(periodMonth);
  if (!bounds) {
    throw new Error('Competência inválida. Use o formato AAAA-MM.');
  }

  const users = await getUsersForMonthlyClosing();
  const userIds = users.map((user) => user.id);

  if (!userIds.length) {
    return {
      periodMonth,
      periodLabel: formatMonthLabel(periodMonth),
      periodStart: getDateKey(bounds.start),
      periodEnd: getDateKey(bounds.end),
      totalEmployees: 0,
      bankHours: createEmptyAttendanceMetrics(),
    };
  }

  const [records, reportingContext] = await Promise.all([
    TimeRecord.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        record_time: { [Op.between]: [bounds.start, bounds.end] },
      },
      order: [['record_time', 'ASC']],
    }),
    getReportingContext(userIds, bounds.start, bounds.end),
  ]);

  const recordsByUser = new Map<number, TimeRecord[]>();
  for (const record of records) {
    const bucket = recordsByUser.get(record.user_id) ?? [];
    bucket.push(record);
    recordsByUser.set(record.user_id, bucket);
  }

  const nightShiftStart = reportingContext.companyProfile?.night_shift_start ?? '22:00';
  const nightShiftEnd = reportingContext.companyProfile?.night_shift_end ?? '05:00';
  const lateToleranceMinutes = Number(reportingContext.companyProfile?.late_tolerance_minutes ?? 5);
  const lunchToleranceMinutes = Number(reportingContext.companyProfile?.lunch_tolerance_minutes ?? 10);

  const bankHours = users.reduce((acc, user) => {
    const metrics = buildAttendanceMetrics(recordsByUser.get(user.id) ?? [], user.schedule, {
        start: bounds.start,
        end: bounds.end,
        holidayDates: reportingContext.holidayDates,
        unpaidHolidayDates: reportingContext.unpaidHolidayDates,
        allHolidayDates: reportingContext.allHolidayDates,
        justifiedAbsenceDates: reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set<string>(),
        partialAbsenceMinutesByDate: reportingContext.partialAbsenceMinutesByUser.get(user.id) ?? new Map<string, number>(),
        partialAbsenceStartTimeByDate: reportingContext.partialAbsenceStartTimeByUser.get(user.id) ?? new Map<string, string>(),
        externalWorkDates: reportingContext.externalWorkByUser.get(user.id) ?? new Set<string>(),
        nightShiftStart,
        nightShiftEnd,
        lateToleranceMinutes,
        lunchToleranceMinutes,
        hireDate: user.hire_date,
        nonWorkingFromDate: getNonWorkingFromDate(user),
      });

    acc.workedMinutesTotal += metrics.workedMinutesTotal;
    acc.requiredMinutesTotal += metrics.requiredMinutesTotal;
    acc.expectedMinutesTotal += metrics.expectedMinutesTotal;
    acc.balanceMinutesTotal += metrics.balanceMinutesTotal;
    acc.overtimeMinutes += metrics.overtimeMinutes;
    acc.deficitMinutes += metrics.deficitMinutes;
    acc.nightMinutesTotal += metrics.nightMinutesTotal;
    acc.holidayWorkedMinutes += metrics.holidayWorkedMinutes;
    acc.completeDays += metrics.completeDays;
    acc.incompleteDays += metrics.incompleteDays;
    acc.absenceDays += metrics.absenceDays;
    acc.justifiedDays += metrics.justifiedDays;
    acc.lateMinutesTotal += metrics.lateMinutesTotal;
    
    if (users.length === 1) {
      acc.latestDailyBalance = metrics.latestDailyBalance;
    }
    
    return acc;
  }, createEmptyAttendanceMetrics());

  return {
    periodMonth,
    periodLabel: formatMonthLabel(periodMonth),
    periodStart: getDateKey(bounds.start),
    periodEnd: getDateKey(bounds.end),
    totalEmployees: users.length,
    bankHours,
  };
};

const serializeMonthlyClosing = (
  record: (MonthlyClosing & { closedByUser?: User | null; reopenedByUser?: User | null }) | null,
  fallbackPeriodMonth?: string
) => {
  const periodMonth = record?.period_month ?? fallbackPeriodMonth ?? '';

  return {
    id: record?.id ?? null,
    periodMonth,
    periodLabel: formatMonthLabel(periodMonth),
    periodStart: record?.period_start ?? `${periodMonth}-01`,
    periodEnd: record?.period_end ?? `${periodMonth}-01`,
    status: record?.status ?? 'open',
    notes: record?.notes ?? null,
    reopenReason: record?.reopen_reason ?? null,
    closedAt: record?.closed_at ?? null,
    closedByName: record?.closedByUser?.name ?? null,
    reopenedAt: record?.reopened_at ?? null,
    reopenedByName: record?.reopenedByUser?.name ?? null,
    snapshot: (record?.snapshot as Record<string, unknown> | null) ?? null,
  };
};

export const getHrSummary = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const isManagement = ['admin', 'manager'].includes(requester.role);
    const departmentId = isManagement && req.query.departmentId ? Number(req.query.departmentId) : null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    
    const { start, end } = getPeriodBounds(
      typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      typeof req.query.endDate === 'string' ? req.query.endDate : undefined
    );
    const { start: todayStart, end: todayEnd } = getTodayBounds();

    const scopedUsers = await getScopedUsers(req, departmentId, userId);
    const users = req.query.operationalOnly === 'true'
      ? scopedUsers.filter((user) => user.status === 'active')
      : scopedUsers;
    const userIds = users.map((user) => user.id);

    const emptyResponse = {
      metrics: {
        totalEmployees: 0,
        presentToday: 0,
        missingToday: 0,
        lateToday: 0,
        pendingApprovals: 0,
        adjustedRecords: 0,
        rejectedRecords: 0,
        pinFallbacks: 0,
        biometricFailures: 0,
      },
      lateArrivals: [],
      todayTimeRecords: [],
      bankHours: createEmptyAttendanceMetrics(),
      absenceDocumentStats: {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        medicalCertificates: 0,
        declarations: 0,
        vacations: 0,
        dayOffs: 0,
        withAttachment: 0,
      },
      absenceDocuments: [],
      departmentBreakdown: [],
      exceptionQueue: [],
      period: { start, end },
    };

    if (!userIds.length) {
      return res.json({ success: true, data: emptyResponse });
    }

    const reportingContext = await getReportingContext(userIds, start, end);
    const nightShiftStart = reportingContext.companyProfile?.night_shift_start ?? '22:00';
    const nightShiftEnd = reportingContext.companyProfile?.night_shift_end ?? '05:00';
    const lateToleranceMinutes = Number(reportingContext.companyProfile?.late_tolerance_minutes ?? 5);
    const lunchToleranceMinutes = Number(reportingContext.companyProfile?.lunch_tolerance_minutes ?? 10);
    const absenceDocuments = (await EmployeeRequest.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        target_date: {
          [Op.between]: [getDateKey(start), getDateKey(end)],
        },
        request_type: { [Op.in]: ['medical_certificate', 'declaration', 'vacation', 'day_off', 'external_work', 'time_adjustment'] },
      },
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name', 'registration_number', 'department_id', 'manager_id'],
          include: [{ model: Department, as: 'department', attributes: ['id', 'name'], required: false }],
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['target_date', 'DESC'], ['created_at', 'DESC']],
    })) as Array<EmployeeRequest & { requester?: (User & { department?: Department | null }) | null; reviewer?: User | null }>;

    const periodRecords = (await TimeRecord.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        record_time: { [Op.between]: [start, end] },
      },
      include: [
        {
          model: User,
          attributes: ['id', 'name', 'registration_number', 'department_id', 'manager_id'],
          include: [{ model: Department, as: 'department', attributes: ['id', 'name'], required: false }],
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['record_time', 'DESC']],
    })) as Array<TimeRecord & { User?: (User & { department?: Department | null }) | null; reviewer?: User | null }>;

    const todayRecords = await TimeRecord.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        status: { [Op.ne]: 'rejected' },
        record_time: { [Op.between]: [todayStart, todayEnd] },
      },
      order: [['record_time', 'ASC']],
    });

    const biometricEvents = await BiometricEvent.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        created_at: { [Op.between]: [start, end] },
        event_type: { [Op.in]: ['pin_fallback', 'verification_failure'] },
      },
      order: [['created_at', 'DESC']],
    });

    const todayRecordMap = new Map<number, TimeRecord[]>();
    for (const record of todayRecords) {
      const bucket = todayRecordMap.get(record.user_id) ?? [];
      bucket.push(record);
      todayRecordMap.set(record.user_id, bucket);
    }

    const todayTimeRecordsMap = new Map<string, {
      departmentId: number | null;
      departmentName: string;
      collaborators: Array<{
        userId: number;
        userName: string;
        registrationNumber: string;
        records: Array<{
          id: number;
          recordTime: Date;
          recordType: TimeRecord['record_type'];
          method: TimeRecord['method'];
          status: TimeRecord['status'];
        }>;
      }>;
    }>();

    for (const user of users) {
      const records = todayRecordMap.get(user.id) ?? [];
      if (!records.length) continue;

      const key = String(user.department_id ?? 'none');
      const department = todayTimeRecordsMap.get(key) ?? {
        departmentId: user.department_id ?? null,
        departmentName: user.department?.name ?? 'Sem setor',
        collaborators: [],
      };
      department.collaborators.push({
        userId: user.id,
        userName: user.name,
        registrationNumber: user.registration_number,
        records: records.map((record) => ({
          id: record.id,
          recordTime: record.record_time,
          recordType: record.record_type,
          method: record.method,
          status: record.status,
        })),
      });
      todayTimeRecordsMap.set(key, department);
    }

    const todayTimeRecords = Array.from(todayTimeRecordsMap.values())
      .map((department) => ({
        ...department,
        collaborators: department.collaborators.sort((a, b) => a.userName.localeCompare(b.userName, 'pt-BR')),
      }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'pt-BR'));

    const periodRecordsByUser = new Map<number, TimeRecord[]>();
    for (const record of periodRecords) {
      const bucket = periodRecordsByUser.get(record.user_id) ?? [];
      bucket.push(record);
      periodRecordsByUser.set(record.user_id, bucket);
    }

    const presentToday = users.filter((user) => (todayRecordMap.get(user.id)?.length ?? 0) > 0).length;
    const lateArrivals = users.flatMap((user) => {
      const records = (todayRecordMap.get(user.id) ?? []).sort(
        (a, b) => new Date(a.record_time).getTime() - new Date(b.record_time).getTime()
      );
      const entryRecord = records.find((record) => record.record_type === 'entry');
      if (!entryRecord) return [];
      const scheduleEntryTime = user.schedule?.entry_time ? String(user.schedule.entry_time).slice(0, 5) : '09:00';
      const delayMinutes = getLateMinutes({
        scheduleEntryTime,
        actualEntryTime: entryRecord.record_time,
        lateToleranceMinutes,
      });
      if (delayMinutes <= 0) return [];
      return [{
        userId: user.id,
        userName: user.name,
        departmentName: user.department?.name ?? 'Sem setor',
        scheduleEntryTime,
        actualEntryTime: entryRecord.record_time,
        delayMinutes,
        isRemote: entryRecord.method === 'web',
      }];
    });
    const lateToday = lateArrivals.length;

    const pinFallbacks = biometricEvents.filter((event) => event.event_type === 'pin_fallback').length;
    const biometricFailures = biometricEvents.filter((event) => event.event_type === 'verification_failure').length;
    const bankHours = users.reduce((acc, user) => {
      const metrics = buildAttendanceMetrics(periodRecordsByUser.get(user.id) ?? [], user.schedule, {
        start,
        end,
        holidayDates: reportingContext.holidayDates,
        unpaidHolidayDates: reportingContext.unpaidHolidayDates,
        allHolidayDates: reportingContext.allHolidayDates,
        justifiedAbsenceDates: reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set<string>(),
        partialAbsenceMinutesByDate: reportingContext.partialAbsenceMinutesByUser.get(user.id) ?? new Map<string, number>(),
        partialAbsenceStartTimeByDate: reportingContext.partialAbsenceStartTimeByUser.get(user.id) ?? new Map<string, string>(),
        externalWorkDates: reportingContext.externalWorkByUser.get(user.id) ?? new Set<string>(),
        nightShiftStart,
        nightShiftEnd,
        lateToleranceMinutes,
        lunchToleranceMinutes,
        hireDate: user.hire_date,
        nonWorkingFromDate: getNonWorkingFromDate(user),
      });
      acc.workedMinutesTotal += metrics.workedMinutesTotal;
      acc.requiredMinutesTotal += metrics.requiredMinutesTotal;
      acc.expectedMinutesTotal += metrics.expectedMinutesTotal;
      acc.balanceMinutesTotal += metrics.balanceMinutesTotal;
      acc.overtimeMinutes += metrics.overtimeMinutes;
      acc.deficitMinutes += metrics.deficitMinutes;
      acc.nightMinutesTotal += metrics.nightMinutesTotal;
      acc.holidayWorkedMinutes += metrics.holidayWorkedMinutes;
      acc.completeDays += metrics.completeDays;
      acc.incompleteDays += metrics.incompleteDays;
      acc.absenceDays += metrics.absenceDays;
      acc.justifiedDays += metrics.justifiedDays;
      acc.lateMinutesTotal += metrics.lateMinutesTotal;

      if (users.length === 1) {
        acc.dailyBalances = metrics.dailyBalances;
        acc.latestDailyBalance = metrics.latestDailyBalance;
      }

      return acc;
    }, createEmptyAttendanceMetrics());

    const departmentBreakdownMap = new Map<
      string,
      { departmentId: number | null; departmentName: string; totalEmployees: number; presentToday: number; lateToday: number; pendingApprovals: number }
    >();

    for (const user of users) {
      const departmentName = user.department?.name ?? 'Sem setor';
      const key = String(user.department_id ?? 'none');
      const bucket = departmentBreakdownMap.get(key) ?? {
        departmentId: user.department_id ?? null,
        departmentName,
        totalEmployees: 0,
        presentToday: 0,
        lateToday: 0,
        pendingApprovals: 0,
      };
      bucket.totalEmployees += 1;
      if ((todayRecordMap.get(user.id)?.length ?? 0) > 0) bucket.presentToday += 1;
      const entryRecord = (todayRecordMap.get(user.id) ?? []).find((record) => record.record_type === 'entry');
      if (entryRecord) {
        const scheduleEntryTime = user.schedule?.entry_time ? String(user.schedule.entry_time).slice(0, 5) : '09:00';
        if (
          getLateMinutes({
            scheduleEntryTime,
            actualEntryTime: entryRecord.record_time,
            lateToleranceMinutes,
          }) > 0
        ) {
          bucket.lateToday += 1;
        }
      }
      departmentBreakdownMap.set(key, bucket);
    }

    for (const record of periodRecords) {
      const key = String(record.User?.department_id ?? 'none');
      const bucket = departmentBreakdownMap.get(key);
      if (bucket && (record.status === 'pending_approval')) {
        bucket.pendingApprovals += 1;
      }
    }

    const exceptionQueue = periodRecords
      .filter((record) => record.status === 'pending_approval')
      .slice(0, 12)
      .map((record) => ({
        id: record.id,
        recordTime: record.record_time,
        recordType: record.record_type,
        method: record.method,
        status: record.status,
        userName: record.User?.name ?? 'Sem vínculo',
        registrationNumber: record.User?.registration_number ?? null,
        departmentName: record.User?.department?.name ?? 'Sem setor',
        reviewReason: record.review_reason ?? null,
        reviewedAt: record.reviewed_at ?? null,
        reviewedByName: record.reviewer?.name ?? null,
        mapUrl: getGeoMapLink(record),
        photoUrl: record.photo_url ?? null,
      }));

    const missingClockIns = users.flatMap((user) => {
      const scheduleSummary = getScheduleSummary(user.schedule);
      const requiredMinutesPerDay = scheduleSummary?.daily_workload_minutes ?? 0;
      if (!requiredMinutesPerDay) return [];
      
      const workDays = scheduleSummary?.work_days ?? [1, 2, 3, 4, 5];
      const todayStr = getDateKey(new Date());
      const records = todayRecordMap.get(user.id) ?? [];
      const hasEntry = records.some((r) => r.record_type === 'entry');
      const isOnExternalWork = (reportingContext.externalWorkByUser.get(user.id) ?? new Set<string>()).has(todayStr);

      // Trabalho externo aprovado compõe a jornada do dia e não deve gerar
      // alerta de esquecimento de ponto, mesmo quando não houver batida.
      if (isOnExternalWork) return [];
      
      if (!hasEntry && shouldRequireWorkday({
        dateKey: todayStr,
        requiredMinutesPerDay,
        holidayDates: reportingContext.holidayDates,
        justifiedAbsenceDates: reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set<string>(),
        workDays,
        customWorkload: scheduleSummary?.custom_workload,
      })) {
        const scheduleEntryTime = user.schedule?.entry_time ? String(user.schedule.entry_time).slice(0, 5) : '09:00';
        const now = new Date();
        const expectedEntry = new Date(`${todayStr}T${scheduleEntryTime}:00`);
        const lateToleranceMinutes = Number(reportingContext.companyProfile?.late_tolerance_minutes ?? 5);
        expectedEntry.setMinutes(expectedEntry.getMinutes() + lateToleranceMinutes);
        
        if (now > expectedEntry) {
          const originalEntryTime = new Date(`${todayStr}T${scheduleEntryTime}:00`);
          const delayMinutes = Math.floor((now.getTime() - originalEntryTime.getTime()) / 60000);
          return [{
            userId: user.id,
            userName: user.name,
            departmentName: user.department?.name ?? 'Sem setor',
            scheduleEntryTime,
            delayMinutes,
          }];
        }
      }
      return [];
    });

    const absenceDocumentStats = absenceDocuments.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === 'pending') acc.pending += 1;
        if (item.status === 'approved') acc.approved += 1;
        if (item.status === 'rejected') acc.rejected += 1;
        if (item.request_type === 'medical_certificate') acc.medicalCertificates += 1;
        if (item.request_type === 'declaration') acc.declarations += 1;
        if (item.request_type === 'vacation') acc.vacations += 1;
        if (item.request_type === 'day_off') acc.dayOffs += 1;
        if (item.request_type === 'time_adjustment') acc.timeAdjustments += 1;
        if (item.attachment_url) acc.withAttachment += 1;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        medicalCertificates: 0,
        declarations: 0,
        vacations: 0,
        dayOffs: 0,
        timeAdjustments: 0,
        withAttachment: 0,
      }
    );

    const todayKey = getDateKey(new Date());
    const todayRequestByUser = new Map<number, EmployeeRequest>();
    for (const request of absenceDocuments) {
      if (getDateKey(String(request.target_date)) === todayKey && !todayRequestByUser.has(request.user_id)) {
        todayRequestByUser.set(request.user_id, request);
      }
    }

    const todayWorkforce = users.reduce<{
      present: Array<{
        userId: number;
        userName: string;
        departmentName: string;
        lastRecordAt: Date;
        lastRecordType: TimeRecord['record_type'];
        lastRecordMethod: TimeRecord['method'];
        isRemote: boolean;
        workType: User['work_type'];
      }>;
      statuses: Array<{
        userId: number;
        userName: string;
        departmentName: string;
        requestType: EmployeeRequest['request_type'];
        requestStatus: EmployeeRequest['status'];
        reason: string;
        hasRecordToday: boolean;
        lastRecordAt: Date | null;
        isRemote: boolean;
        workType: User['work_type'];
      }>;
      absent: Array<{
        userId: number;
        userName: string;
        departmentName: string;
        scheduleEntryTime: string;
      }>;
    }>((acc, user) => {
      const records = todayRecordMap.get(user.id) ?? [];
      const lastRecord = records[records.length - 1] ?? null;
      const dayRequest = todayRequestByUser.get(user.id);
      const departmentName = user.department?.name ?? 'Sem setor';
      const isRemote = Boolean(lastRecord && (lastRecord.method === 'web' || lastRecord.photo_url));
      const scheduleSummary = getScheduleSummary(user.schedule);
      const requiredMinutesPerDay = scheduleSummary?.daily_workload_minutes ?? 0;
      const workDays = scheduleSummary?.work_days ?? [1, 2, 3, 4, 5];
      const isScheduledToday = requiredMinutesPerDay > 0 && shouldRequireWorkday({
        dateKey: todayKey,
        requiredMinutesPerDay,
        holidayDates: reportingContext.holidayDates,
        justifiedAbsenceDates: reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set<string>(),
        workDays,
        customWorkload: scheduleSummary?.custom_workload,
      });

      if (dayRequest && dayRequest.request_type !== 'time_adjustment') {
        acc.statuses.push({
          userId: user.id,
          userName: user.name,
          departmentName,
          requestType: dayRequest.request_type,
          requestStatus: dayRequest.status,
          reason: dayRequest.reason,
          hasRecordToday: Boolean(lastRecord),
          lastRecordAt: lastRecord?.record_time ?? null,
          isRemote,
          workType: user.work_type,
        });
      } else if (lastRecord) {
        acc.present.push({
          userId: user.id,
          userName: user.name,
          departmentName,
          lastRecordAt: lastRecord.record_time,
          lastRecordType: lastRecord.record_type,
          lastRecordMethod: lastRecord.method,
          isRemote,
          workType: user.work_type,
        });
      } else if (isScheduledToday) {
        acc.absent.push({
          userId: user.id,
          userName: user.name,
          departmentName,
          scheduleEntryTime: user.schedule?.entry_time ? String(user.schedule.entry_time).slice(0, 5) : '09:00',
        });
      }
      return acc;
    }, { present: [], statuses: [], absent: [] });

    return res.json({
      success: true,
      data: {
        metrics: {
          totalEmployees: users.length,
          presentToday,
          missingToday: Math.max(users.length - presentToday, 0),
          lateToday,
          pendingApprovals: (periodRecords.filter((record) => record.status === 'pending_approval').length) + absenceDocuments.filter(req => req.status === 'pending').length,
          adjustedRecords: periodRecords.filter((record) => record.status === 'adjusted').length,
          rejectedRecords: periodRecords.filter((record) => record.status === 'rejected').length,
          pinFallbacks,
          biometricFailures,
        },
        lateArrivals,
        todayTimeRecords,
        missingClockIns,
        todayWorkforce,
        bankHours,
        company: reportingContext.companyProfile
          ? {
              legalName: reportingContext.companyProfile.legal_name,
              tradeName: reportingContext.companyProfile.trade_name,
              nightShiftStart,
              nightShiftEnd,
              lateToleranceMinutes,
              lunchToleranceMinutes,
            }
          : null,
        holidays: reportingContext.holidays.map((holiday) => ({
          id: holiday.id,
          name: holiday.name,
          holidayDate: holiday.holiday_date,
          isPaid: holiday.is_paid,
        })),
        departmentBreakdown: Array.from(departmentBreakdownMap.values())
          .map((item) => ({
            ...item,
            missingToday: Math.max(item.totalEmployees - item.presentToday, 0),
          }))
          .sort((a, b) => b.totalEmployees - a.totalEmployees || a.departmentName.localeCompare(b.departmentName)),
        exceptionQueue,
        absenceDocumentStats,
        absenceDocuments: absenceDocuments.map((item) => ({
          id: item.id,
          userId: item.user_id,
          userName: item.requester?.name ?? 'Sem vínculo',
          registrationNumber: item.requester?.registration_number ?? null,
          departmentName: item.requester?.department?.name ?? 'Sem setor',
          requestType: item.request_type,
          status: item.status,
          targetDate: String(item.target_date),
          absenceStartTime: item.absence_start_time ?? null,
          absenceEndTime: item.absence_end_time ?? null,
          reason: item.reason,
          attachmentName: item.attachment_name ?? null,
          attachmentUrl: item.attachment_url ?? null,
          adminComment: item.admin_comment ?? null,
          reviewedAt: item.reviewed_at ?? null,
          reviewedByName: item.reviewer?.name ?? null,
        })),
        period: { start, end },
      },
    });
  } catch (error) {
    console.error('Get HR summary error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar relatório executivo de RH.' });
  }
};

export const getCumulativeBankHours = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const requestedUserId = typeof req.query.userId === 'string' ? Number(req.query.userId) : null;
    if (requester.role !== 'employee' && !requestedUserId) {
      return res.status(400).json({ success: false, error: 'Informe o colaborador para consultar o saldo geral.' });
    }
    if (requestedUserId !== null && (!Number.isInteger(requestedUserId) || requestedUserId <= 0)) {
      return res.status(400).json({ success: false, error: 'Colaborador inválido.' });
    }

    const scopedUsers = await getScopedUsers(req, null, requestedUserId);
    const user = scopedUsers[0] ?? null;

    if (!user) {
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado no seu escopo de acesso.' });
    }

    const firstRecord = user.hire_date
      ? null
      : await TimeRecord.findOne({
          where: { user_id: user.id },
          attributes: ['record_time'],
          order: [['record_time', 'ASC']],
        });
    const todayKey = getDateKey(new Date());
    const configuredStartKey = user.hire_date ?? (firstRecord ? getDateKey(firstRecord.record_time) : todayKey);
    const startKey = configuredStartKey > todayKey ? todayKey : configuredStartKey;
    const { start, end } = getPeriodBounds(startKey, todayKey);
    const [records, reportingContext] = await Promise.all([
      TimeRecord.findAll({
        where: {
          user_id: user.id,
          record_time: { [Op.between]: [start, end] },
        },
        order: [['record_time', 'ASC']],
      }),
      getReportingContext([user.id], start, end),
    ]);

    const metrics = buildAttendanceMetrics(records, user.schedule, {
      start,
      end,
      holidayDates: reportingContext.holidayDates,
      unpaidHolidayDates: reportingContext.unpaidHolidayDates,
      allHolidayDates: reportingContext.allHolidayDates,
      justifiedAbsenceDates: reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set<string>(),
      partialAbsenceMinutesByDate: reportingContext.partialAbsenceMinutesByUser.get(user.id) ?? new Map<string, number>(),
      partialAbsenceStartTimeByDate: reportingContext.partialAbsenceStartTimeByUser.get(user.id) ?? new Map<string, string>(),
      externalWorkDates: reportingContext.externalWorkByUser.get(user.id) ?? new Set<string>(),
      nightShiftStart: reportingContext.companyProfile?.night_shift_start ?? '22:00',
      nightShiftEnd: reportingContext.companyProfile?.night_shift_end ?? '05:00',
      lateToleranceMinutes: Number(reportingContext.companyProfile?.late_tolerance_minutes ?? 5),
      lunchToleranceMinutes: Number(reportingContext.companyProfile?.lunch_tolerance_minutes ?? 10),
      hireDate: user.hire_date,
      nonWorkingFromDate: getNonWorkingFromDate(user),
    });

    return res.json({
      success: true,
      data: {
        bankHours: metrics,
        period: { start: getDateKey(start), end: getDateKey(end) },
      },
    });
  } catch (error) {
    console.error('Get cumulative bank hours error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao calcular saldo geral do banco de horas.' });
  }
};

export const getAttendanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const isManagement = ['admin', 'manager'].includes(requester.role);
    const departmentId = isManagement && req.query.departmentId ? Number(req.query.departmentId) : null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    
    const { start, end } = getPeriodBounds(
      typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      typeof req.query.endDate === 'string' ? req.query.endDate : undefined
    );
    const { start: todayStart, end: todayEnd } = getTodayBounds();

    const users = await getScopedUsers(req, departmentId, userId);
    const userIds = users.map((user) => user.id);

    if (!userIds.length) {
      return res.json({ success: true, data: [] });
    }

    const reportingContext = await getReportingContext(userIds, start, end);
    const nightShiftStart = reportingContext.companyProfile?.night_shift_start ?? '22:00';
    const nightShiftEnd = reportingContext.companyProfile?.night_shift_end ?? '05:00';
    const lateToleranceMinutes = Number(reportingContext.companyProfile?.late_tolerance_minutes ?? 5);
    const lunchToleranceMinutes = Number(reportingContext.companyProfile?.lunch_tolerance_minutes ?? 10);

    const records = (await TimeRecord.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        record_time: { [Op.between]: [start, end] },
      },
      order: [['record_time', 'ASC']],
    })) as TimeRecord[];

    const biometricEvents = await BiometricEvent.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        created_at: { [Op.between]: [start, end] },
        event_type: { [Op.in]: ['pin_fallback', 'verification_failure'] },
      },
    });

    const todayRecords = (await TimeRecord.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        status: { [Op.ne]: 'rejected' },
        record_time: { [Op.between]: [todayStart, todayEnd] },
      },
      order: [['record_time', 'ASC']],
    })) as TimeRecord[];

    const recordsByUser = new Map<number, TimeRecord[]>();
    for (const record of records) {
      const bucket = recordsByUser.get(record.user_id) ?? [];
      bucket.push(record);
      recordsByUser.set(record.user_id, bucket);
    }

    const eventsByUser = new Map<number, BiometricEvent[]>();
    for (const event of biometricEvents) {
      const userId = event.user_id ?? 0;
      const bucket = eventsByUser.get(userId) ?? [];
      bucket.push(event);
      eventsByUser.set(userId, bucket);
    }

    const todayRecordsByUser = new Map<number, TimeRecord[]>();
    for (const record of todayRecords) {
      const bucket = todayRecordsByUser.get(record.user_id) ?? [];
      bucket.push(record);
      todayRecordsByUser.set(record.user_id, bucket);
    }

    const rows = users.map((user) => {
      const userRecords = recordsByUser.get(user.id) ?? [];
      const userEvents = eventsByUser.get(user.id) ?? [];
      const dailyView = buildDailyTimeline(getDateKey(new Date()), todayRecordsByUser.get(user.id) ?? [], user.schedule, {
        lunchToleranceMinutes,
        lateToleranceMinutes,
        isJustified: (reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set()).has(getDateKey(new Date())),
        partialAbsenceMinutes: reportingContext.partialAbsenceMinutesByUser.get(user.id)?.get(getDateKey(new Date())) ?? 0,
        partialAbsenceStartTime: reportingContext.partialAbsenceStartTimeByUser.get(user.id)?.get(getDateKey(new Date())) ?? null,
        isExternalWork: (reportingContext.externalWorkByUser.get(user.id) ?? new Set()).has(getDateKey(new Date())),
        hireDate: user.hire_date,
        nonWorkingFromDate: getNonWorkingFromDate(user),
      });
      const uniqueDays = new Set(
        userRecords
          .filter((record) => record.status !== 'rejected')
          .map((record) => getDateKey(record.record_time))
      );
      const dateKeys = getDateKeysInRange(start, end);
      const allDailyViews = dateKeys.map(dateKey => {
         const bounds = getDayBoundsForDate(dateKey);
         const dayRecords = userRecords.filter(r => {
           const rt = new Date(r.record_time).getTime();
           return rt >= bounds.start.getTime() && rt <= bounds.end.getTime();
         });
         const timeline = dayRecords.map(record => ({
            id: record.id,
            recordTime: record.record_time,
            timeLabel: formatTimeLabel(record.record_time),
            recordType: record.record_type,
            method: record.method,
            mapUrl: getGeoMapLink(record),
            photoUrl: record.photo_url ?? null,
         }));
         return {
           date: dateKey,
           timeline,
           holidayType: reportingContext.holidayDates.has(dateKey)
             ? 'paid' as const
             : reportingContext.unpaidHolidayDates.has(dateKey)
               ? 'unpaid' as const
               : null,
           ...buildDailyTimeline(dateKey, dayRecords, user.schedule, { 
             lunchToleranceMinutes, 
             lateToleranceMinutes,
             isHoliday: reportingContext.holidayDates.has(dateKey),
             isJustified: (reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set()).has(dateKey),
             partialAbsenceMinutes: reportingContext.partialAbsenceMinutesByUser.get(user.id)?.get(dateKey) ?? 0,
             partialAbsenceStartTime: reportingContext.partialAbsenceStartTimeByUser.get(user.id)?.get(dateKey) ?? null,
             isExternalWork: (reportingContext.externalWorkByUser.get(user.id) ?? new Set()).has(dateKey),
             hireDate: user.hire_date,
             nonWorkingFromDate: getNonWorkingFromDate(user),
           })
         };
      });

      const bankHours = buildAttendanceMetrics(userRecords, user.schedule, {
        start,
        end,
        holidayDates: reportingContext.holidayDates,
        unpaidHolidayDates: reportingContext.unpaidHolidayDates,
        allHolidayDates: reportingContext.allHolidayDates,
        justifiedAbsenceDates: reportingContext.justifiedAbsencesByUser.get(user.id) ?? new Set<string>(),
        partialAbsenceMinutesByDate: reportingContext.partialAbsenceMinutesByUser.get(user.id) ?? new Map<string, number>(),
        partialAbsenceStartTimeByDate: reportingContext.partialAbsenceStartTimeByUser.get(user.id) ?? new Map<string, string>(),
        externalWorkDates: reportingContext.externalWorkByUser.get(user.id) ?? new Set<string>(),
        nightShiftStart,
        nightShiftEnd,
        lateToleranceMinutes,
        lunchToleranceMinutes,
        hireDate: user.hire_date,
        nonWorkingFromDate: getNonWorkingFromDate(user),
      });
      const firstRecord = userRecords[0] ?? null;
      const lastRecord = userRecords[userRecords.length - 1] ?? null;

      return {
        userId: user.id,
        name: user.name,
        registrationNumber: user.registration_number,
        departmentName: user.department?.name ?? 'Sem setor',
        managerName: user.manager?.name ?? 'Sem gestor',
        daysPresent: uniqueDays.size,
        totalRecords: userRecords.length,
        pendingApprovals: userRecords.filter((record) => record.status === 'pending_approval').length,
        adjustedRecords: userRecords.filter((record) => record.status === 'adjusted').length,
        rejectedRecords: userRecords.filter((record) => record.status === 'rejected').length,
        pinFallbacks: userEvents.filter((event) => event.event_type === 'pin_fallback').length,
        biometricFailures: userEvents.filter((event) => event.event_type === 'verification_failure').length,
        firstRecordAt: firstRecord?.record_time ?? null,
        lastRecordAt: lastRecord?.record_time ?? null,
        schedule: getScheduleSummary(user.schedule),
        dailyView,
        allDailyViews,
        bankHours,
        maps: {
          lastRecordMapUrl: getGeoMapLink(lastRecord),
        },
      };
    });

    return res.json({
      success: true,
      data: rows.sort((a, b) => b.pendingApprovals - a.pendingApprovals || b.biometricFailures - a.biometricFailures || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    console.error('Get attendance report error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar relatório de assiduidade.' });
  }
};

export const getDailySheetReport = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const isManagement = ['admin', 'manager'].includes(requester.role);
    const userId = isManagement && req.query.userId ? Number(req.query.userId) : requester.id;
    
    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Colaborador inválido para o espelho diário.' });
    }

    const scopedUser = await getScopedUser(req, userId);
    if (!scopedUser) {
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado no escopo atual.' });
    }

    const { date, start, end } = getDayBoundsForDate(typeof req.query.date === 'string' ? req.query.date : undefined);
    const schedule = getScheduleSummary(scopedUser.schedule);
    const reportingContext = await getReportingContext([scopedUser.id], start, end);
    const nightShiftStart = reportingContext.companyProfile?.night_shift_start ?? '22:00';
    const nightShiftEnd = reportingContext.companyProfile?.night_shift_end ?? '05:00';
    const lateToleranceMinutes = Number(reportingContext.companyProfile?.late_tolerance_minutes ?? 5);
    const lunchToleranceMinutes = Number(reportingContext.companyProfile?.lunch_tolerance_minutes ?? 10);

    const dayRecords = (await TimeRecord.findAll({
      where: {
        user_id: scopedUser.id,
        record_time: { [Op.between]: [start, end] },
      },
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['record_time', 'ASC']],
    })) as Array<TimeRecord & { reviewer?: User | null }>;

    const isBeforeHire = isDateBeforeHire(date, scopedUser.hire_date);
    const isOutsideEmployment = isDateOutsideEmployment(date, getNonWorkingFromDate(scopedUser));
    const calculationRecords = isBeforeHire || isOutsideEmployment ? [] : dayRecords;
    const partialAbsenceMinutes = reportingContext.partialAbsenceMinutesByUser.get(scopedUser.id)?.get(date) ?? 0;
    const partialAbsenceStartTime = reportingContext.partialAbsenceStartTimeByUser.get(scopedUser.id)?.get(date) ?? null;
    const isExternalWork = (reportingContext.externalWorkByUser.get(scopedUser.id) ?? new Set()).has(date);

    const dailyTimeline = buildDailyTimeline(date, calculationRecords, scopedUser.schedule, {
      lunchToleranceMinutes, 
      lateToleranceMinutes,
      isHoliday: reportingContext.holidayDates.has(date),
      isJustified: (reportingContext.justifiedAbsencesByUser.get(scopedUser.id) ?? new Set()).has(date),
      partialAbsenceMinutes,
      partialAbsenceStartTime,
      isExternalWork,
      hireDate: scopedUser.hire_date,
      nonWorkingFromDate: getNonWorkingFromDate(scopedUser),
    });
    const workedSummary = getWorkedMinutesForDay(calculationRecords, scopedUser.schedule, {
      lunchToleranceMinutes,
      justifiedExitTime: partialAbsenceStartTime,
    });
    const validRecords = calculationRecords.filter((record) => record.status !== 'rejected');
    const justifiedDates = reportingContext.justifiedAbsencesByUser.get(scopedUser.id) ?? new Set<string>();
    const weekday = getWeekday(date);
    let expectedMinutesForDay = schedule?.daily_workload_minutes ?? 0;
    if (schedule?.custom_workload && typeof schedule.custom_workload[weekday] === 'number') {
      expectedMinutesForDay = schedule.custom_workload[weekday];
    }

    const requiresWorkday = shouldRequireWorkday({
      dateKey: date,
      requiredMinutesPerDay: schedule?.daily_workload_minutes ?? 0,
      holidayDates: reportingContext.holidayDates,
      justifiedAbsenceDates: justifiedDates,
      workDays: schedule?.work_days ?? [1, 2, 3, 4, 5],
      customWorkload: schedule?.custom_workload,
      hireDate: scopedUser.hire_date,
    });
    
    const requiredMinutes = dailyTimeline.requiredMinutes ?? (requiresWorkday ? expectedMinutesForDay : 0);
    const lateMinutes = getLateMinutes({
      scheduleEntryTime: schedule?.entry_time,
      actualEntryTime: validRecords.find((record) => record.record_type === 'entry')?.record_time ?? null,
      lateToleranceMinutes,
    });
    const nightMinutes = getNightMinutesBetween(workedSummary.entryTime, workedSummary.exitTime, nightShiftStart, nightShiftEnd);

    const timeline = dayRecords.map((record) => ({
      id: record.id,
      recordTime: record.record_time,
      timeLabel: formatTimeLabel(record.record_time),
      recordType: record.record_type,
      method: record.method,
      status: record.status,
      geo:
        record.latitude !== null && record.longitude !== null
          ? `${record.latitude}, ${record.longitude}`
          : null,
      mapUrl: getGeoMapLink(record),
      photoUrl: record.photo_url ?? null,
      deviceInfo: record.device_info ?? null,
      reviewReason: record.review_reason ?? null,
      reviewedAt: record.reviewed_at ?? null,
      reviewedByName: record.reviewer?.name ?? null,
    }));

    return res.json({
      success: true,
      data: {
        collaborator: {
          userId: scopedUser.id,
          name: scopedUser.name,
          registrationNumber: scopedUser.registration_number,
          departmentName: scopedUser.department?.name ?? 'Sem setor',
          managerName: scopedUser.manager?.name ?? 'Sem gestor',
        },
        date,
        schedule,
        summary: {
          status: dailyTimeline.status,
          workedMinutes: dailyTimeline.workedMinutes,
          requiredMinutes,
          balanceMinutes: dailyTimeline.balanceMinutes,
          lateMinutes,
          nightMinutes,
          holidayWorkedMinutes: reportingContext.allHolidayDates.has(date) ? workedSummary.workedMinutes : 0,
          isHoliday: reportingContext.allHolidayDates.has(date),
          isJustifiedAbsence: !isBeforeHire && !isOutsideEmployment && (justifiedDates.has(date) || partialAbsenceMinutes > 0),
          recordCount: dailyTimeline.recordCount,
          hasCompleteJourney: workedSummary.hasCompleteJourney || dailyTimeline.status === 'complete',
          entryTime: dailyTimeline.entryTime,
          lunchStartTime: dailyTimeline.lunchStartTime,
          lunchEndTime: dailyTimeline.lunchEndTime,
          exitTime: dailyTimeline.exitTime,
        },
        company: reportingContext.companyProfile
          ? {
              legalName: reportingContext.companyProfile.legal_name,
              nightShiftStart,
              nightShiftEnd,
              lateToleranceMinutes,
              lunchToleranceMinutes,
            }
          : null,
        timeline,
      },
    });
  } catch (error) {
    console.error('Get daily sheet report error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar espelho diário do colaborador.' });
  }
};

export const getRemoteRecords = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito.' });
    }

    const { startDate, endDate, departmentId, userId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate e endDate são obrigatórios.' });
    }

    const start = new Date(`${startDate}T00:00:00.000`);
    const end = new Date(`${endDate}T23:59:59.999`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ success: false, error: 'Datas inválidas.' });
    }

    const whereUser: Record<string, unknown> = { requires_time_tracking: true };
    if (userId) {
      whereUser.id = Number(userId);
    } else if (departmentId) {
      whereUser.department_id = Number(departmentId);
    }
    if (req.user.role === 'manager') {
      whereUser.id = { [Op.in]: await getManagedUserIds(req.user.id, null, 'view_reports') };
    }

    const users = await User.findAll({
      where: Object.keys(whereUser).length > 0 ? whereUser : undefined,
      attributes: ['id'],
    });

    if (!users.length) {
      return res.json({ success: true, data: [] });
    }

    const userIds = users.map((u) => u.id);

    const records = await TimeRecord.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        record_time: { [Op.between]: [start, end] },
        method: 'web',
        latitude: { [Op.not]: null },
        longitude: { [Op.not]: null }
      },
      include: [
        {
          model: User,
          attributes: ['id', 'name', 'registration_number', 'department_id', 'manager_id'],
        },
      ],
      order: [['record_time', 'DESC']],
    });

    return res.json({ success: true, data: records });
  } catch (error) {
    console.error('Remote records error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao buscar registros remotos.' });
  }
};

export const getMonthlyClosings = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || !['admin', 'manager'].includes(requester.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao RH administrativo.' });
    }

    const year = Math.max(2000, Math.min(2100, Number(req.query.year) || new Date().getFullYear()));
    const periodMonths = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    const closureRecords = (await MonthlyClosing.findAll({
      where: {
        period_month: { [Op.in]: periodMonths },
      },
      include: [
        { model: User, as: 'closedByUser', attributes: ['id', 'name'], required: false },
        { model: User, as: 'reopenedByUser', attributes: ['id', 'name'], required: false },
      ],
      order: [['period_month', 'DESC']],
    })) as Array<MonthlyClosing & { closedByUser?: User | null; reopenedByUser?: User | null }>;

    const recordMap = new Map(closureRecords.map((record) => [record.period_month, record]));
    const now = new Date();
    const currentPeriodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return res.json({
      success: true,
      data: periodMonths
        .slice()
        .reverse()
        .map((periodMonth) => {
          const record = recordMap.get(periodMonth) ?? null;
          return {
            ...serializeMonthlyClosing(record, periodMonth),
            isCurrentMonth: periodMonth === currentPeriodMonth,
            canClose: periodMonth <= currentPeriodMonth && (!record || record.status === 'open'),
            canReopen: Boolean(record && record.status === 'closed'),
          };
        }),
    });
  } catch (error) {
    console.error('Get monthly closings error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar fechamentos mensais.' });
  }
};

export const closeMonthlyClosing = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Somente administradores podem fechar a competência.' });
    }

    const periodMonth = typeof req.body.periodMonth === 'string' ? req.body.periodMonth : '';
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : null;
    const bounds = getMonthBounds(periodMonth);
    if (!bounds) {
      return res.status(400).json({ success: false, error: 'Competência inválida. Use o formato AAAA-MM.' });
    }

    const currentPeriodMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    if (periodMonth > currentPeriodMonth) {
      return res.status(400).json({ success: false, error: 'Não é possível fechar uma competência futura.' });
    }

    const snapshot = await buildMonthlyClosingSnapshot(periodMonth);
    const existing = await MonthlyClosing.findOne({ where: { period_month: periodMonth } });

    if (existing?.status === 'closed') {
      return res.status(400).json({ success: false, error: 'Essa competência já está fechada.' });
    }

    const record = existing
      ? await existing.update({
          period_start: snapshot.periodStart,
          period_end: snapshot.periodEnd,
          status: 'closed',
          snapshot,
          notes,
          reopen_reason: null,
          closed_by: requester.id,
          closed_at: new Date(),
          reopened_by: null,
          reopened_at: null,
        })
      : await MonthlyClosing.create({
          period_month: periodMonth,
          period_start: snapshot.periodStart,
          period_end: snapshot.periodEnd,
          status: 'closed',
          snapshot,
          notes,
          closed_by: requester.id,
          closed_at: new Date(),
        });

    const hydrated = (await MonthlyClosing.findByPk(record.id, {
      include: [
        { model: User, as: 'closedByUser', attributes: ['id', 'name'], required: false },
        { model: User, as: 'reopenedByUser', attributes: ['id', 'name'], required: false },
      ],
    })) as (MonthlyClosing & { closedByUser?: User | null; reopenedByUser?: User | null }) | null;

    return res.json({
      success: true,
      message: 'Competência fechada com sucesso.',
      data: serializeMonthlyClosing(hydrated, periodMonth),
    });
  } catch (error) {
    console.error('Close monthly closing error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao fechar a competência mensal.' });
  }
};

export const reopenMonthlyClosing = async (req: AuthRequest, res: Response) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Somente administradores podem reabrir a competência.' });
    }

    const periodMonth = typeof req.body.periodMonth === 'string' ? req.body.periodMonth : '';
    const reopenReason = typeof req.body.reason === 'string' ? req.body.reason.trim() : null;

    if (!getMonthBounds(periodMonth)) {
      return res.status(400).json({ success: false, error: 'Competência inválida. Use o formato AAAA-MM.' });
    }

    const record = await MonthlyClosing.findOne({ where: { period_month: periodMonth } });
    if (!record || record.status !== 'closed') {
      return res.status(404).json({ success: false, error: 'Nenhum fechamento encontrado para a competência informada.' });
    }

    await record.update({
      status: 'open',
      reopen_reason: reopenReason,
      reopened_by: requester.id,
      reopened_at: new Date(),
    });

    const hydrated = (await MonthlyClosing.findByPk(record.id, {
      include: [
        { model: User, as: 'closedByUser', attributes: ['id', 'name'], required: false },
        { model: User, as: 'reopenedByUser', attributes: ['id', 'name'], required: false },
      ],
    })) as (MonthlyClosing & { closedByUser?: User | null; reopenedByUser?: User | null }) | null;

    return res.json({
      success: true,
      message: 'Competência reaberta com sucesso.',
      data: serializeMonthlyClosing(hydrated, periodMonth),
    });
  } catch (error) {
    console.error('Reopen monthly closing error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao reabrir a competência mensal.' });
  }
};
