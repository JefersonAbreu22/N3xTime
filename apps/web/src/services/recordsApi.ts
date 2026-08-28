import { http } from './http';
import { getKioskHeaders } from './authApi';

export type TimeRecord = {
  id: number;
  user_id: number;
  record_time: string;
  record_type: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | 'auto';
  method: 'facial' | 'pin' | 'manual' | 'web';
  latitude: string | null;
  longitude: string | null;
  location_distance?: number | null;
  location_status?: 'approved' | 'out_of_area' | null;
  photo_url?: string | null;
  map_url?: string | null;
  ip_address: string | null;
  device_info: string | null;
  status: 'valid' | 'pending_approval' | 'rejected' | 'adjusted';
  reviewed_by?: number | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  User?: { id: number; name: string; registration_number: string };
  reviewer?: { id: number; name: string } | null;
};

export type KioskRecordPayload = Partial<TimeRecord> & {
  userId: number;
  biometric_score?: number;
  biometric_threshold?: number;
  detected_descriptor?: number[];
  biometric_context?: {
    livenessVerified: boolean;
    livenessStep: string;
    poseDirection: string;
    challengeDirection: 'left' | 'right';
    yaw: number;
    pitch: number;
    faceDetected: boolean;
    scannedAt: string;
    source: 'face-api';
    antiConfusionValidated?: boolean;
    consistentFaceFrames?: number;
    requiredConsistentFaceFrames?: number;
    livenessFramesPerStep?: number;
    livenessIdentityBound?: boolean;
    candidateCount?: number;
    candidateDistanceGap?: number | null;
    requiredCandidateDistanceGap?: number;
  };
};

export type EmailDeliveryFailure = {
  id: number;
  record_id: number;
  user_id: number;
  recipient: string;
  error_message: string;
  smtp_code: string | null;
  attempted_at: string;
  created_at: string;
  user?: { id: number; name: string; email: string; registration_number: string | null };
  record?: Pick<TimeRecord, 'id' | 'record_time' | 'record_type' | 'method' | 'status'>;
};

export type EmailDeliveryLog = Omit<EmailDeliveryFailure, 'error_message'> & {
  status: 'sent' | 'failed';
  message_id: string | null;
  smtp_response: string | null;
  error_message: string | null;
};

export const recordsApi = {
  myRecords: async () => {
    const res = await http.get<{ success: boolean; data: TimeRecord[] }>('/records/me');
    return res.data;
  },
  recent: async () => {
    const res = await http.get<{ success: boolean; data: TimeRecord[] }>('/records/recent');
    return res.data;
  },
  emailFailures: async (limit = 100) => {
    const res = await http.get<{ success: boolean; data: EmailDeliveryFailure[] }>('/records/email-failures', { params: { limit } });
    return res.data;
  },
  emailLogs: async (limit = 100) => {
    const res = await http.get<{ success: boolean; data: EmailDeliveryLog[] }>('/records/email-logs', { params: { limit } });
    return res.data;
  },
  register: async (payload: Partial<TimeRecord> & { userId?: number }) => {
    const res = await http.post<{ success: boolean; data: TimeRecord }>('/records', payload);
    return res.data;
  },
  registerKiosk: async (payload: KioskRecordPayload) => {
    const res = await http.post<{
      success: boolean;
      data: TimeRecord;
      meta?: { userName?: string; recordType?: string; skippedLunch?: boolean };
      message?: string;
    }>('/records', payload, { headers: getKioskHeaders() });
    return res.data;
  },
  registerByPin: async (payload: { pinCode: string; record_type?: 'entry' | 'lunch_start' | 'lunch_end' | 'exit'; latitude?: number; longitude?: number; device_info?: string }) => {
    const res = await http.post<{
      success: boolean;
      data: TimeRecord;
      meta?: { userId?: number; userName?: string; recordType?: string; skippedLunch?: boolean };
      message?: string;
    }>('/records/pin', payload, { headers: getKioskHeaders() });
    return res.data;
  },
  logBiometricFailure: async (payload: {
    userId?: number | null;
    reason: string;
    biometric_score?: number | null;
    biometric_threshold?: number | null;
    device_info?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    const res = await http.post<{ success: boolean }>('/records/biometric-failure', payload, {
      headers: getKioskHeaders(),
    });
    return res.data;
  },
  updateStatus: async (
    id: number,
    payload: {
      status: TimeRecord['status'];
      reason?: string;
      adjusted_time?: string;
      adjusted_record_type?: Exclude<TimeRecord['record_type'], 'auto'>;
    }
  ) => {
    const res = await http.patch<{ success: boolean; data: TimeRecord; message?: string }>(`/records/${id}/status`, payload);
    return res.data;
  },
};
