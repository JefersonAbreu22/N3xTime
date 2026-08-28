import { http } from './http';

type DailyBalance = {
  date: string;
  entryTime: string | null;
  exitTime: string | null;
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
};

export type BankHoursMetrics = {
  workedMinutesTotal: number;
  requiredMinutesTotal: number;
  expectedMinutesTotal: number;
  balanceMinutesTotal: number;
  overtimeMinutes: number;
  deficitMinutes: number;
  nightMinutesTotal: number;
  holidayWorkedMinutes: number;
  completeDays: number;
  incompleteDays: number;
  absenceDays: number;
  justifiedDays: number;
  lateMinutesTotal: number;
  dailyBalances: DailyBalance[];
  latestDailyBalance: DailyBalance | null;
  monthlyBreakdown: Array<{
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
  }>;
};

export type MonthlyClosingResponse = {
  success: boolean;
  message?: string;
  data: Array<{
    id: number | null;
    periodMonth: string;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    status: 'open' | 'closed';
    notes: string | null;
    reopenReason: string | null;
    closedAt: string | null;
    closedByName: string | null;
    reopenedAt: string | null;
    reopenedByName: string | null;
    isCurrentMonth: boolean;
    canClose: boolean;
    canReopen: boolean;
    snapshot: {
      periodMonth: string;
      periodLabel: string;
      periodStart: string;
      periodEnd: string;
      totalEmployees: number;
      bankHours: BankHoursMetrics;
    } | null;
  }>;
};

export type MonthlyClosingMutationResponse = {
  success: boolean;
  message?: string;
  data: MonthlyClosingResponse['data'][number];
};

type DailyView = {
  date?: string;
  holidayType?: 'paid' | 'unpaid' | null;
  status: 'absent' | 'in_progress' | 'complete';
  entryTime: string | null;
  lunchStartTime: string | null;
  lunchEndTime: string | null;
  exitTime: string | null;
  workedMinutes: number;
  expectedMinutes?: number;
  balanceMinutes: number;
  recordCount: number;
  timeline?: Array<{
    id: number;
    recordTime: string;
    timeLabel: string | null;
    recordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | 'auto';
    method: 'facial' | 'pin' | 'manual' | 'web';
    mapUrl: string | null;
    photoUrl: string | null;
  }>;
};

export type DailySheetResponse = {
  success: boolean;
  data: {
    collaborator: {
      userId: number;
      name: string;
      registrationNumber: string;
      departmentName: string;
      managerName: string;
    };
    date: string;
    schedule: {
      entry_time: string;
      exit_time: string;
      lunch_duration: number;
      flexible_lunch: boolean;
      work_days: number[];
      daily_workload_minutes: number;
    } | null;
    summary: {
      status: 'absent' | 'in_progress' | 'complete';
      workedMinutes: number;
      requiredMinutes: number;
      balanceMinutes: number;
      lateMinutes: number;
      nightMinutes: number;
      holidayWorkedMinutes: number;
      isHoliday: boolean;
      isJustifiedAbsence: boolean;
      recordCount: number;
      hasCompleteJourney: boolean;
      entryTime: string | null;
      lunchStartTime: string | null;
      lunchEndTime: string | null;
      exitTime: string | null;
    };
    timeline: Array<{
      id: number;
      recordTime: string;
      timeLabel: string | null;
      recordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | 'auto';
      method: 'facial' | 'pin' | 'manual' | 'web';
      status: 'valid' | 'pending_approval' | 'rejected' | 'adjusted';
      geo: string | null;
      mapUrl: string | null;
      photoUrl: string | null;
      deviceInfo: string | null;
      reviewReason: string | null;
      reviewedAt: string | null;
      reviewedByName: string | null;
    }>;
    company: {
      legalName: string;
      nightShiftStart: string;
      nightShiftEnd: string;
      lateToleranceMinutes: number;
      lunchToleranceMinutes: number;
    } | null;
  };
};

export type HrSummaryResponse = {
  success: boolean;
  data: {
    metrics: {
      totalEmployees: number;
      presentToday: number;
      missingToday: number;
      lateToday: number;
      pendingApprovals: number;
      adjustedRecords: number;
      rejectedRecords: number;
      pinFallbacks: number;
      biometricFailures: number;
    };
    bankHours: BankHoursMetrics;
    missingClockIns?: Array<{
      userId: number;
      userName: string;
      departmentName: string;
      scheduleEntryTime: string;
      delayMinutes?: number;
    }>;
    todayWorkforce?: {
      present: Array<{
        userId: number;
        userName: string;
        departmentName: string;
        lastRecordAt: string;
        lastRecordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | 'auto';
        lastRecordMethod: 'facial' | 'pin' | 'manual' | 'web';
        isRemote: boolean;
      }>;
      statuses: Array<{
        userId: number;
        userName: string;
        departmentName: string;
        requestType: 'medical_certificate' | 'declaration' | 'vacation' | 'day_off' | 'external_work';
        requestStatus: 'pending' | 'approved' | 'rejected';
        reason: string;
        hasRecordToday: boolean;
        lastRecordAt: string | null;
        isRemote: boolean;
      }>;
      absent: Array<{
        userId: number;
        userName: string;
        departmentName: string;
        scheduleEntryTime: string;
      }>;
    };
    company: {
      legalName: string;
      tradeName: string | null;
      nightShiftStart: string;
      nightShiftEnd: string;
      lateToleranceMinutes: number;
      lunchToleranceMinutes: number;
    } | null;
    holidays: Array<{
      id: number;
      name: string;
      holidayDate: string;
      isPaid: boolean;
    }>;
    departmentBreakdown: Array<{
      departmentId: number | null;
      departmentName: string;
      totalEmployees: number;
      presentToday: number;
      missingToday: number;
      lateToday: number;
      pendingApprovals: number;
    }>;
    exceptionQueue: Array<{
      id: number;
      recordTime: string;
      recordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | 'auto';
      method: 'facial' | 'pin' | 'manual' | 'web';
      status: 'valid' | 'pending_approval' | 'rejected' | 'adjusted';
      trustLevel?: 'high' | 'medium' | 'low';
      gpsAccuracy?: number | null;
      ipAddress?: string | null;
      userName: string;
      registrationNumber: string | null;
      departmentName: string;
      reviewReason: string | null;
      reviewedAt: string | null;
      reviewedByName: string | null;
      mapUrl?: string | null;
      photoUrl?: string | null;
    }>;
    absenceDocumentStats: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      medicalCertificates: number;
      declarations: number;
      vacations: number;
      dayOffs: number;
      withAttachment: number;
    };
    absenceDocuments: Array<{
      id: number;
      userId: number;
      userName: string;
      registrationNumber: string | null;
      departmentName: string;
      requestType: 'medical_certificate' | 'declaration' | 'vacation' | 'day_off' | 'external_work';
      status: 'pending' | 'approved' | 'rejected';
      targetDate: string;
      absenceStartTime: string | null;
      absenceEndTime: string | null;
      reason: string;
      attachmentName: string | null;
      attachmentUrl: string | null;
      adminComment: string | null;
      reviewedAt: string | null;
      reviewedByName: string | null;
    }>;
    period: { start: string; end: string };
  };
};

export type CumulativeBankHoursResponse = {
  success: boolean;
  data: {
    bankHours: BankHoursMetrics;
    period: { start: string; end: string };
  };
};

export type AttendanceReportResponse = {
  success: boolean;
  data: Array<{
    userId: number;
    name: string;
    registrationNumber: string;
    departmentName: string;
    managerName: string;
    daysPresent: number;
    totalRecords: number;
    pendingApprovals: number;
    adjustedRecords: number;
    rejectedRecords: number;
    pinFallbacks: number;
    biometricFailures: number;
    firstRecordAt: string | null;
    lastRecordAt: string | null;
    schedule: {
      entry_time: string;
      exit_time: string;
      lunch_duration: number;
      flexible_lunch: boolean;
      work_days: number[];
      daily_workload_minutes: number;
    } | null;
    dailyView: DailyView;
    allDailyViews: DailyView[];
    bankHours: BankHoursMetrics;
    maps: {
      lastRecordMapUrl: string | null;
    };
  }>;
};

type ReportFilters = {
  startDate?: string;
  endDate?: string;
  departmentId?: number | null;
  userId?: number | null;
};

const buildParams = (filters?: ReportFilters) => {
  const params: Record<string, string | number> = {};
  if (filters?.startDate) params.startDate = filters.startDate;
  if (filters?.endDate) params.endDate = filters.endDate;
  if (filters?.departmentId) params.departmentId = filters.departmentId;
  if (filters?.userId) params.userId = filters.userId;
  return params;
};

import { TimeRecord } from './recordsApi';

// ... other code ...

export const reportsApi = {
  hrSummary: async (filters?: ReportFilters) => {
    const res = await http.get<HrSummaryResponse>('/reports/hr-summary', { params: buildParams(filters) });
    return res.data;
  },
  cumulativeBankHours: async (userId?: number | null) => {
    const res = await http.get<CumulativeBankHoursResponse>('/reports/cumulative-bank-hours', {
      params: userId ? { userId } : undefined,
    });
    return res.data;
  },
  attendance: async (filters?: ReportFilters) => {
    const res = await http.get<AttendanceReportResponse>('/reports/attendance', { params: buildParams(filters) });
    return res.data;
  },
  remoteRecords: async (params: { startDate: string; endDate: string; departmentId?: number | null; userId?: number | null }) => {
    const res = await http.get<{ success: boolean; data: TimeRecord[] }>('/reports/remote-records', { params });
    return res.data;
  },
  dailySheet: async (userId: number, date: string) => {
    const res = await http.get<DailySheetResponse>('/reports/daily-sheet', { params: { userId, date } });
    return res.data;
  },
  monthlyClosures: async (year?: number) => {
    const res = await http.get<MonthlyClosingResponse>('/reports/monthly-closures', { params: year ? { year } : undefined });
    return res.data;
  },
  closeMonthlyClosure: async (periodMonth: string, notes?: string) => {
    const res = await http.post<MonthlyClosingMutationResponse>('/reports/monthly-closures/close', { periodMonth, notes });
    return res.data;
  },
  reopenMonthlyClosure: async (periodMonth: string, reason?: string) => {
    const res = await http.post<MonthlyClosingMutationResponse>('/reports/monthly-closures/reopen', { periodMonth, reason });
    return res.data;
  },
};
