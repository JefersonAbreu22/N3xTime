import { WorkSchedule } from '../models/WorkSchedule.js';
import { TimeRecord } from '../models/TimeRecord.js';

export const parseDateInput = (value?: string | Date | null, endOfDay = false) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return endOfDay
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
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

export const getDateKey = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
  return (hours * 60) + minutes;
};

export const getTimeRangeMinutes = (startTime?: string | null, endTime?: string | null) => {
  if (!startTime || !endTime) return 0;
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  return Math.max(endMinutes - startMinutes, 0);
};

export const applyPartialAbsenceCredit = ({
  requiredMinutes,
  workedMinutes,
  absenceMinutes,
}: {
  requiredMinutes: number;
  workedMinutes: number;
  absenceMinutes: number;
}) => {
  // A declaração cobre somente a parte da jornada que ainda não foi trabalhada.
  // Isso evita crédito duplicado quando o intervalo declarado coincide com horas
  // já abrangidas pelas marcações de entrada e saída.
  const uncoveredMinutes = Math.max(requiredMinutes - workedMinutes, 0);
  const creditedMinutes = Math.min(Math.max(absenceMinutes, 0), uncoveredMinutes);
  return {
    creditedMinutes,
    requiredMinutes: Math.max(requiredMinutes - creditedMinutes, 0),
  };
};

export const getScheduleSummary = (schedule?: WorkSchedule | null) => {
  if (!schedule || !schedule.entry_time || !schedule.exit_time) return null;
  const entry = String(schedule.entry_time).slice(0, 5);
  const exit = String(schedule.exit_time).slice(0, 5);
  const lunchDuration = Number(schedule.lunch_duration ?? 0);
  const workDays = Array.isArray(schedule.work_days) && schedule.work_days.length
    ? schedule.work_days.map(Number).filter((day) => day >= 0 && day <= 6)
    : [1, 2, 3, 4, 5];
  return {
    entry_time: entry,
    exit_time: exit,
    lunch_duration: lunchDuration,
    flexible_lunch: Boolean(schedule.flexible_lunch),
    work_days: workDays,
    daily_workload_minutes: Math.max(timeToMinutes(exit) - timeToMinutes(entry) - lunchDuration, 0),
  };
};

export const getLateMinutes = ({
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

export const getNightMinutesBetween = (startValue: Date | string | null, endValue: Date | string | null, nightStart = '22:00', nightEnd = '05:00') => {
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

export const getWorkedMinutesForDay = (
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

  const hasActualExit = Boolean(exitRecord && entryRecord.id !== exitRecord.id);
  let effectiveExitTime: Date | string | null = hasActualExit ? exitRecord!.record_time : null;

  if (!effectiveExitTime && options?.justifiedExitTime) {
    const [hours, minutes] = String(options.justifiedExitTime).slice(0, 5).split(':').map(Number);
    const justifiedExit = new Date(entryRecord.record_time);
    justifiedExit.setHours(hours, minutes, 0, 0);
    const lastRecordTime = validRecords.reduce(
      (latest, record) => Math.max(latest, new Date(record.record_time).getTime()),
      new Date(entryRecord.record_time).getTime()
    );

    if (Number.isFinite(hours) && Number.isFinite(minutes) && justifiedExit.getTime() >= lastRecordTime) {
      effectiveExitTime = justifiedExit;
    }
  }

  if (!effectiveExitTime) {
    return {
      workedMinutes: 0,
      hasCompleteJourney: false,
      entryTime: entryRecord.record_time,
      exitTime: null,
      deductedLunchMinutes: 0,
    };
  }

  const rawWorkedMinutes = Math.round((new Date(effectiveExitTime).getTime() - new Date(entryRecord.record_time).getTime()) / 60000);
  let actualLunchMinutes = null;
  if (lunchStartRecord && lunchEndRecord) {
    actualLunchMinutes = Math.max(
      Math.round((new Date(lunchEndRecord.record_time).getTime() - new Date(lunchStartRecord.record_time).getTime()) / 60000),
      0
    );
  }

  const lunchToleranceMinutes = Math.max(Number(options?.lunchToleranceMinutes ?? 0), 0);
  let deductedLunchMinutes = 0;

  if (actualLunchMinutes !== null) {
    deductedLunchMinutes = actualLunchMinutes;
  }

  const hasCompleteJourney = hasActualExit;
  const workedMinutes = Math.max(rawWorkedMinutes - deductedLunchMinutes, 0);

  return {
    workedMinutes,
    hasCompleteJourney,
    entryTime: entryRecord.record_time,
    exitTime: hasActualExit ? exitRecord!.record_time : null,
    deductedLunchMinutes,
  };
};

export const shouldRequireWorkday = ({
  dateKey,
  requiredMinutesPerDay,
  holidayDates,
  justifiedAbsenceDates,
  workDays,
  hireDate,
}: {
  dateKey: string;
  requiredMinutesPerDay: number;
  holidayDates: Set<string>;
  justifiedAbsenceDates: Set<string>;
  workDays: number[];
  hireDate?: string | null;
}) => {
  if (hireDate && dateKey < hireDate) return false;
  if (!requiredMinutesPerDay) return false;
  
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.getDay();
  
  if (!workDays.includes(weekday)) return false;
  if (holidayDates.has(dateKey)) return false;
  if (justifiedAbsenceDates.has(dateKey)) return false;
  return true;
};
