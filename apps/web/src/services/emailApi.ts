import { http } from './http';

export type SmtpStatus = {
  configured: boolean;
  missing: string[];
  host: string | null;
  port: number | null;
  secure: boolean;
  from: string | null;
  timeRecordEmailEnabled: boolean;
};

export type SmtpTestResult = {
  recipient: string;
  messageId: string | null;
  smtpResponse: string | null;
  accepted: string[];
  rejected: string[];
  durationMs: number;
};

export type SmtpTestFailure = {
  success: false;
  error: string;
  data?: {
    stage?: 'configuration' | 'connection' | 'sending';
    smtpCode?: string | null;
    durationMs?: number;
  };
};

export const emailApi = {
  smtpStatus: async () => {
    const response = await http.get<{ success: true; data: SmtpStatus }>('/email/smtp/status');
    return response.data;
  },
  sendSmtpTest: async (recipient: string) => {
    const response = await http.post<{ success: true; message: string; data: SmtpTestResult }>('/email/smtp/test', { recipient });
    return response.data;
  },
};
