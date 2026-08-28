import { AsyncLocalStorage } from 'node:async_hooks';

type TenantContext = {
  companyId: number | null;
  bypass: boolean;
};

const storage = new AsyncLocalStorage<TenantContext>();

export const runWithTenant = <T>(companyId: number, callback: () => T): T =>
  storage.run({ companyId, bypass: false }, callback);

export const runWithoutTenant = <T>(callback: () => T): T =>
  storage.run({ companyId: null, bypass: true }, callback);

export const getTenantContext = () => storage.getStore();
