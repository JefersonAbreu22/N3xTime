import crypto from 'node:crypto';

export const normalizeKioskKey = (value: string) => value.trim();

export const fingerprintKioskKey = (value: string) =>
  crypto.createHash('sha256').update(normalizeKioskKey(value), 'utf8').digest('hex');
