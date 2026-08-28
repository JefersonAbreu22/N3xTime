import { Request } from 'express';
import { AuditLog } from '../models/AuditLog.js';

type CreateLogParams = {
  user_id?: number | null;
  action: string;
  entity_name: string;
  entity_id?: number | null;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string | null;
  device_info?: string | null;
};

export const AuditService = {
  async log(params: CreateLogParams, req?: Request) {
    try {
      let ip_address = params.ip_address;
      let device_info = params.device_info;

      if (req) {
        if (!ip_address) {
          ip_address = req.ip || req.socket?.remoteAddress || null;
        }
        if (!device_info) {
          device_info = req.headers['user-agent'] || null;
        }
      }

      await AuditLog.create({
        user_id: params.user_id || null,
        action: params.action,
        entity_name: params.entity_name,
        entity_id: params.entity_id || null,
        old_value: params.old_value ? JSON.stringify(params.old_value) : null,
        new_value: params.new_value ? JSON.stringify(params.new_value) : null,
        ip_address,
        device_info,
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Fail silently to not break main flows
    }
  },
};
