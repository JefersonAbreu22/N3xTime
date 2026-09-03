import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const productionDatabase = String(process.env.DB_NAME || '').trim();
const testDatabase = String(process.env.TEST_DB_NAME || `${productionDatabase}_test`).trim();
if (!productionDatabase) throw new Error('DB_NAME não configurado.');
if (testDatabase === productionDatabase || !/^[a-zA-Z0-9_]+_test$/.test(testDatabase)) {
  throw new Error(`Banco de teste inseguro: ${testDatabase}. Use um nome terminado em _test.`);
}

const rootConnection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

await rootConnection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
await rootConnection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

process.env.DB_NAME = testDatabase;
process.env.JWT_SECRET = 'multitenancy-integration-secret-2026';
process.env.NODE_ENV = 'test';
process.env.DISABLE_TIME_RECORD_EMAIL = 'true';

const execFileAsync = promisify(execFile);
const databasePackageDir = path.resolve(process.cwd(), '../../packages/database');
const prismaCli = path.resolve(databasePackageDir, 'node_modules/prisma/build/index.js');
await execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'], {
  cwd: databasePackageDir,
  env: process.env,
});
await execFileAsync(process.execPath, [
  prismaCli,
  'migrate',
  'diff',
  '--config',
  'prisma.config.ts',
  '--from-config-datasource',
  '--to-schema',
  'prisma/schema.prisma',
  '--exit-code',
], {
  cwd: databasePackageDir,
  env: process.env,
});

const { sequelize } = await import('../config/database.js');
const { connectDatabase } = await import('../models/index.js');
const {
  Account,
  Company,
  CompanyMembership,
  CompanyProfile,
  Department,
  DepartmentHierarchyLevel,
  DepartmentLeaderAssignment,
  EmailDeliveryFailure,
  EmailDeliveryLog,
  EmployeeRequest,
  Holiday,
  KioskControl,
  PlatformUser,
  RemotePhotoEvidence,
  TimeRecord,
  User,
} = await import('../models/index.js');
const { runWithTenant, runWithoutTenant } = await import('../tenancy/tenantContext.js');
const { fingerprintKioskKey } = await import('../utils/kioskKey.js');
const { getManagedUserIds } = await import('../utils/leadership.js');
const { cleanExpiredRemotePhotos } = await import('../services/RemotePhotoRetentionService.js');
const { releaseAllExpiredRestrictions } = await import('../services/UserAccessService.js');
const { applyPartialAbsenceCredit } = await import('../services/AttendanceCalculator.js');
const { attemptTimeRecordEmail } = await import('../services/TimeRecordEmailService.js');
const { mapLegacyTenantColumns } = await import('../services/tenantTransferService.js');
const { default: app } = await import('../app.js');

type ApiResponse = { status: number; body: any; text: string };
type TestResult = { name: string; status: 'PASS' | 'FAIL' | 'RISK'; detail?: string };

const results: TestResult[] = [];
const run = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'FAIL', detail });
    console.error(`FAIL  ${name}: ${detail}`);
  }
};
let server: ReturnType<typeof app.listen> | null = null;
const cleanupFilePaths: string[] = [];

try {
  await connectDatabase();

  const serverAddress = await new Promise<{ port: number }>((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => {
      const address = instance.address();
      if (!address || typeof address === 'string') return reject(new Error('Porta efêmera indisponível.'));
      server = instance;
      resolve({ port: address.port });
    });
    instance.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${serverAddress.port}`;

  const api = async (url: string, options: { token?: string; method?: string; body?: unknown } = {}): Promise<ApiResponse> => {
    const response = await fetch(`${baseUrl}${url}`, {
      method: options.method || (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { status: response.status, body, text };
  };

  const password = 'TesteSeguro123';
  const passwordHash = await bcrypt.hash(password, 4);
  const kioskKeyA = 'tenant-a-kiosk-key-2026';
  const kioskKeyB = 'tenant-b-kiosk-key-2026';
  const companyA = await Company.create({
    legal_name: 'Tenant Alfa Ltda', trade_name: 'Tenant Alfa', slug: 'tenant-alfa', cnpj: '11.111.111/0001-11', status: 'active',
    kiosk_access_key_hash: await bcrypt.hash(kioskKeyA, 4), kiosk_access_key_fingerprint: fingerprintKioskKey(kioskKeyA),
  });
  const companyB = await Company.create({
    legal_name: 'Tenant Beta Ltda', trade_name: 'Tenant Beta', slug: 'tenant-beta', cnpj: '22.222.222/0001-22', status: 'active',
    kiosk_access_key_hash: await bcrypt.hash(kioskKeyB, 4), kiosk_access_key_fingerprint: fingerprintKioskKey(kioskKeyB),
  });

  const createTenantFixture = async (company: any, suffix: 'a' | 'b') => runWithTenant(company.id, async () => {
    const primaryDescriptor = Array.from({ length: 128 }, (_, index) => (suffix === 'a' ? 0.1 : 0.7) + index * 0.0001);
    const secondaryDescriptor = Array.from({ length: 128 }, (_, index) => (suffix === 'a' ? 0.35 : 0.9) + index * 0.0001);
    const profile = await CompanyProfile.create({ legal_name: company.legal_name, trade_name: company.trade_name });
    const kiosk = await KioskControl.create({ terminal_enabled: true, session_version: 1, released_at: new Date() });
    const department = await Department.create({ name: `Setor ${suffix.toUpperCase()}` });
    const secondDepartment = await Department.create({ name: `Operação ${suffix.toUpperCase()}` });
    const admin = await User.create({
      name: `Admin ${suffix.toUpperCase()}`, cpf: suffix === 'a' ? '11111111111' : '22222222222', registration_number: `ADM-${suffix}`,
      email: `admin.${suffix}@teste.local`, password_hash: passwordHash, role: 'admin', work_type: 'presential', status: 'active',
      department_id: null, manager_id: null, must_change_password: false, requires_time_tracking: false,
    });
    const manager = await User.create({
      name: `Lider ${suffix.toUpperCase()}`, cpf: suffix === 'a' ? '33333333333' : '44444444444', registration_number: `LID-${suffix}`,
      email: `lider.${suffix}@teste.local`, password_hash: passwordHash, role: 'manager', work_type: 'presential', status: 'active',
      department_id: department.id, manager_id: null, must_change_password: false, requires_time_tracking: false,
    });
    const employee = await User.create({
      name: `Colaborador ${suffix.toUpperCase()}`, cpf: suffix === 'a' ? '55555555555' : '66666666666', registration_number: `COL-${suffix}`,
      email: `colaborador.${suffix}@teste.local`, password_hash: passwordHash, role: 'employee', work_type: 'presential', status: 'active',
      department_id: department.id, manager_id: manager.id, must_change_password: false, requires_time_tracking: true,
      facial_descriptor: JSON.stringify(primaryDescriptor), remote_clock_in_enabled: true,
    });
    const secondEmployee = await User.create({
      name: `Operador ${suffix.toUpperCase()}`, cpf: suffix === 'a' ? '77777777777' : '88888888888', registration_number: `OPE-${suffix}`,
      email: `operador.${suffix}@teste.local`, password_hash: passwordHash, role: 'employee', work_type: 'remote', status: 'active',
      department_id: secondDepartment.id, manager_id: manager.id, must_change_password: false, requires_time_tracking: true,
      facial_descriptor: JSON.stringify(secondaryDescriptor),
    });
    const level = await DepartmentHierarchyLevel.create({ department_id: department.id, name: 'Liderança', position: 1 });
    const secondLevel = await DepartmentHierarchyLevel.create({ department_id: secondDepartment.id, name: 'Liderança', position: 1 });
    const assignment = await DepartmentLeaderAssignment.create({
      department_id: department.id, level_id: level.id, user_id: manager.id, permissions: ['view_team', 'view_time_records', 'view_reports'],
    });
    await DepartmentLeaderAssignment.create({
      department_id: secondDepartment.id, level_id: secondLevel.id, user_id: manager.id, permissions: ['view_team', 'view_time_records', 'view_reports'],
    });
    const now = new Date();
    now.setHours(8, suffix === 'a' ? 1 : 2, 0, 0);
    const record = await TimeRecord.create({
      user_id: employee.id, record_time: now, record_type: 'entry', method: suffix === 'a' ? 'facial' : 'web', status: 'valid', trust_level: 'high',
      photo_url: `/uploads/remote_photos/tenant-${suffix}.jpg`,
    });
    await RemotePhotoEvidence.create({
      record_id: record.id, photo_data: Buffer.from(`photo-${suffix}`), mime_type: 'image/jpeg',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), deleted_at: null,
    });
    const request = await EmployeeRequest.create({
      user_id: employee.id, target_manager_id: manager.id, target_department_id: department.id, request_type: 'day_off',
      target_date: now.toISOString().slice(0, 10), reason: `Solicitação exclusiva ${suffix.toUpperCase()}`,
      attachment_name: `comprovante-${suffix}.pdf`, attachment_url: `/uploads/requests/tenant-${suffix}.pdf`,
    });
    const holiday = await Holiday.create({ name: `Feriado ${suffix.toUpperCase()}`, holiday_date: '2026-12-25', is_paid: true });
    return { profile, kiosk, department, secondDepartment, admin, manager, employee, secondEmployee, level, assignment, record, request, holiday, primaryDescriptor, secondaryDescriptor };
  });

  const tenantA = await createTenantFixture(companyA, 'a');
  const tenantB = await createTenantFixture(companyB, 'b');

  const createIdentity = async (user: any, company: any) => {
    const account = await Account.create({
      name: user.name,
      email: String(user.email).toLowerCase(),
      password_hash: user.password_hash,
      status: 'active',
    });
    const membership = await CompanyMembership.create({
      account_id: account.id,
      company_id: company.id,
      user_id: user.id,
      status: 'active',
    });
    return { account, membership };
  };

  const identityAdminA = await createIdentity(tenantA.admin, companyA);
  const identityAdminB = await createIdentity(tenantB.admin, companyB);
  const identityManagerA = await createIdentity(tenantA.manager, companyA);
  const identityEmployeeA = await createIdentity(tenantA.employee, companyA);

  const uploadsDirectory = path.resolve(process.cwd(), 'api', 'uploads');
  const requestsDirectory = path.join(uploadsDirectory, 'requests');
  const remotePhotosDirectory = path.join(uploadsDirectory, 'remote_photos');
  await fs.mkdir(requestsDirectory, { recursive: true });
  await fs.mkdir(remotePhotosDirectory, { recursive: true });
  for (const suffix of ['a', 'b']) {
    const requestPath = path.join(requestsDirectory, `tenant-${suffix}.pdf`);
    await fs.writeFile(requestPath, `attachment-${suffix}`, 'utf8');
    cleanupFilePaths.push(requestPath);
  }
  const platformUser = await PlatformUser.create({ name: 'Super Admin Teste', email: tenantA.admin.email, password_hash: passwordHash, status: 'active' });

  const signTenant = (user: any, company: any, identity: { account: any; membership: any }) => jwt.sign(
    {
      id: user.id,
      accountId: identity.account.id,
      membershipId: identity.membership.id,
      role: user.role,
      scope: 'tenant',
      companyId: company.id,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '10m' },
  );
  const adminTokenA = signTenant(tenantA.admin, companyA, identityAdminA);
  const adminTokenB = signTenant(tenantB.admin, companyB, identityAdminB);
  const managerTokenA = signTenant(tenantA.manager, companyA, identityManagerA);
  const employeeTokenA = signTenant(tenantA.employee, companyA, identityEmployeeA);
  const platformToken = jwt.sign(
    { id: platformUser.id, role: 'platform_admin', scope: 'platform' }, process.env.JWT_SECRET!, { expiresIn: '10m' }
  );
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  await run('bloqueio de e-mail por configuração é auditado e isolado por tenant', async () => {
    await attemptTimeRecordEmail(tenantA.employee, tenantA.record);

    const [logsA, failuresA, logsB, failuresB] = await Promise.all([
      runWithTenant(companyA.id, () => EmailDeliveryLog.findAll({ where: { record_id: tenantA.record.id } })),
      runWithTenant(companyA.id, () => EmailDeliveryFailure.findAll({ where: { record_id: tenantA.record.id } })),
      runWithTenant(companyB.id, () => EmailDeliveryLog.findAll({ where: { record_id: tenantA.record.id } })),
      runWithTenant(companyB.id, () => EmailDeliveryFailure.findAll({ where: { record_id: tenantA.record.id } })),
    ]);

    assert.equal(logsA.length, 1);
    assert.equal(logsA[0].status, 'failed');
    assert.equal(logsA[0].smtp_code, 'EMAIL_DISABLED');
    assert.equal(failuresA.length, 1);
    assert.equal(failuresA[0].smtp_code, 'EMAIL_DISABLED');
    assert.equal(logsB.length, 0);
    assert.equal(failuresB.length, 0);

    const [pageA, pageB] = await Promise.all([
      api('/api/records/email-logs', { token: adminTokenA }),
      api('/api/records/email-logs', { token: adminTokenB }),
    ]);
    assert.equal(pageA.status, 200);
    assert.equal(pageA.body.data[0].smtp_code, 'EMAIL_DISABLED');
    assert.equal(pageB.status, 200);
    assert.equal(pageB.body.data.length, 0);
  });

  await run('diagnóstico SMTP expõe apenas dados seguros e exige administrador', async () => {
    const [anonymous, manager, admin] = await Promise.all([
      api('/api/email/smtp/status'),
      api('/api/email/smtp/status', { token: managerTokenA }),
      api('/api/email/smtp/status', { token: adminTokenA }),
    ]);

    assert.equal(anonymous.status, 401);
    assert.equal(manager.status, 403);
    assert.equal(admin.status, 200);
    assert.equal(typeof admin.body.data.configured, 'boolean');
    assert.equal(typeof admin.body.data.timeRecordEmailEnabled, 'boolean');
    assert.equal(Object.hasOwn(admin.body.data, 'user'), false);
    assert.equal(Object.hasOwn(admin.body.data, 'pass'), false);
  });

  await run('abono parcial preserva o crédito positivo da regra legada', () => {
    const joaoGabriel = applyPartialAbsenceCredit({ requiredMinutes: 540, workedMinutes: 261, absenceMinutes: 346 });
    const joaoMiguel = applyPartialAbsenceCredit({ requiredMinutes: 540, workedMinutes: 204, absenceMinutes: 447 });
    assert.equal(joaoGabriel.creditedMinutes, 346);
    assert.equal(joaoGabriel.requiredMinutes, 194);
    assert.equal(261 - joaoGabriel.requiredMinutes, 67);
    assert.equal(joaoMiguel.creditedMinutes, 447);
    assert.equal(joaoMiguel.requiredMinutes, 93);
    assert.equal(204 - joaoMiguel.requiredMinutes, 111);
  });
  await run('importador converte os campos legados de intervalo abonado', () => {
    assert.deepEqual(mapLegacyTenantColumns('employee_requests', {
      excused_start_time: '08:00',
      excused_end_time: '13:46',
    }), {
      absence_start_time: '08:00',
      absence_end_time: '13:46',
    });
    assert.deepEqual(mapLegacyTenantColumns('employee_requests', {
      absence_start_time: '09:00',
      absence_end_time: '10:00',
      excused_start_time: '08:00',
      excused_end_time: '13:46',
    }), {
      absence_start_time: '09:00',
      absence_end_time: '10:00',
    });
  });

  await run('consultas de model exigem contexto de tenant', async () => {
    await assert.rejects(() => User.findAll(), /sem contexto multitenant/i);
  });
  await run('bypass explícito consulta os dois tenants', async () => {
    const users = await runWithoutTenant(() => User.findAll());
    assert(users.some((user: any) => user.company_id === companyA.id));
    assert(users.some((user: any) => user.company_id === companyB.id));
  });
  await run('guard de referência bloqueia vínculo cruzado entre tenants', async () => {
    await assert.rejects(() => runWithTenant(companyA.id, () => DepartmentLeaderAssignment.create({
      department_id: tenantA.department.id, level_id: tenantA.level.id, user_id: tenantB.employee.id, permissions: ['view_team'],
    })), /não pertence|nao pertence/i);
  });
  await run('login comum descobre automaticamente o tenant correto', async () => {
    const response = await api('/api/auth/login', { body: { email: tenantB.employee.email, password } });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.company.id, companyB.id);
  });
  await run('login unificado reconhece o Super Admin', async () => {
    const response = await api('/api/auth/login', { body: { email: tenantA.admin.email, password } });
    assert.equal(response.status, 200);
    const decoded = jwt.verify(response.body.data.token, process.env.JWT_SECRET!) as any;
    assert.equal(decoded.scope, 'platform');
  });
  await run('endpoint protegido rejeita requisição sem token', async () => {
    assert.equal((await api('/api/users/team')).status, 401);
  });
  await run('sessão empresarial retorna somente a empresa autenticada', async () => {
    const response = await api('/api/auth/me', { token: adminTokenB });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.company.id, companyB.id);
  });

  await run('mesmo login acessa duas empresas sem misturar os tenants', async () => {
    const sharedEmail = 'socio.multitenant@teste.local';
    const payloadBase = {
      name: 'Sócio Multitenant',
      email: sharedEmail,
      password,
      work_type: 'presential',
      role: 'employee',
    };
    const createdA = await api('/api/users', {
      token: adminTokenA,
      body: { ...payloadBase, cpf: '90909090901', registration_number: 'SOC-A' },
    });
    const createdB = await api('/api/users', {
      token: adminTokenB,
      body: { ...payloadBase, cpf: '90909090902', registration_number: 'SOC-B' },
    });
    assert.equal(createdA.status, 200);
    assert.equal(createdB.status, 200);

    const login = await api('/api/auth/login', { body: { email: sharedEmail, password } });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.requires_company_selection, true);
    const companyIds = login.body.data.companies.map((item: any) => item.companyId).sort((a: number, b: number) => a - b);
    assert.deepEqual(companyIds, [companyA.id, companyB.id].sort((a, b) => a - b));

    const selectedA = await api('/api/auth/company/select', {
      token: login.body.data.selection_token,
      body: { companyId: companyA.id },
    });
    const selectedB = await api('/api/auth/company/select', {
      token: login.body.data.selection_token,
      body: { companyId: companyB.id },
    });
    assert.equal(selectedA.body.data.user.company.id, companyA.id);
    assert.equal(selectedB.body.data.user.company.id, companyB.id);
    assert.notEqual(selectedA.body.data.user.id, selectedB.body.data.user.id);
  });

  await run('membership revogado invalida imediatamente uma sessão tenant', async () => {
    await identityEmployeeA.membership.update({ status: 'inactive' });
    try {
      const response = await api('/api/auth/me', { token: employeeTokenA });
      assert.equal(response.status, 403);
    } finally {
      await identityEmployeeA.membership.update({ status: 'active' });
    }
  });
  await run('listagem de equipe do tenant A não contém usuários do tenant B', async () => {
    const response = await api('/api/users/team', { token: adminTokenA });
    assert.equal(response.status, 200);
    const serialized = JSON.stringify(response.body.data);
    assert(serialized.includes(tenantA.employee.email));
    assert(!serialized.includes(tenantB.employee.email));
  });
  await run('hub de afastamentos bloqueia a sessão e permanece isolado por empresa', async () => {
    const suspension = await api(`/api/users/${tenantA.employee.id}/status`, {
      token: adminTokenA,
      method: 'PATCH',
      body: {
        status: 'suspended',
        restriction_type: 'temporary_suspension',
        start_date: today,
        end_date: today,
        reason: 'Suspensão temporária para validar o isolamento multitenant.',
      },
    });
    assert.equal(suspension.status, 200);
    assert.equal(suspension.body.data.status, 'suspended');

    try {
      assert.equal((await api('/api/auth/me', { token: employeeTokenA })).status, 403);

      const teamA = await api('/api/users/team', { token: adminTokenA });
      assert.equal(teamA.status, 200);
      const suspendedUser = teamA.body.data.find((item: any) => item.id === tenantA.employee.id);
      assert.equal(suspendedUser?.status, 'suspended');
      assert.equal(suspendedUser?.suspension_type, 'temporary_suspension');

      const dashboardA = await api(`/api/reports/hr-summary?startDate=${today}&endDate=${today}&operationalOnly=true`, { token: adminTokenA });
      assert.equal(dashboardA.status, 200);
      assert(!JSON.stringify(dashboardA.body.data).includes(tenantA.employee.name));

      const crossTenant = await api(`/api/users/${tenantA.employee.id}/status`, {
        token: adminTokenB,
        method: 'PATCH',
        body: { status: 'active' },
      });
      assert.equal(crossTenant.status, 404);
      const preserved = await runWithTenant(companyA.id, () => User.findByPk(tenantA.employee.id));
      assert.equal(preserved?.status, 'suspended');
    } finally {
      const reactivation = await api(`/api/users/${tenantA.employee.id}/status`, {
        token: adminTokenA,
        method: 'PATCH',
        body: { status: 'active' },
      });
      assert.equal(reactivation.status, 200);
    }

    assert.equal((await api('/api/auth/me', { token: employeeTokenA })).status, 200);
  });
  await run('líder só aplica afastamento com a permissão manage_team', async () => {
    const denied = await api(`/api/users/${tenantA.employee.id}/status`, {
      token: managerTokenA,
      method: 'PATCH',
      body: {
        status: 'suspended',
        restriction_type: 'other_leave',
        start_date: today,
        reason: 'Tentativa sem a permissão necessária.',
      },
    });
    assert.equal(denied.status, 403);

    await runWithTenant(companyA.id, () => tenantA.assignment.update({
      permissions: ['view_team', 'view_time_records', 'view_reports', 'manage_team'],
    }));
    try {
      const allowed = await api(`/api/users/${tenantA.employee.id}/status`, {
        token: managerTokenA,
        method: 'PATCH',
        body: {
          status: 'suspended',
          restriction_type: 'other_leave',
          start_date: today,
          reason: 'Afastamento autorizado pelo líder responsável.',
        },
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.data.status, 'suspended');

      const reactivation = await api(`/api/users/${tenantA.employee.id}/status`, {
        token: managerTokenA,
        method: 'PATCH',
        body: { status: 'active' },
      });
      assert.equal(reactivation.status, 200);
    } finally {
      await runWithTenant(companyA.id, () => tenantA.assignment.update({
        permissions: ['view_team', 'view_time_records', 'view_reports'],
      }));
      await api(`/api/users/${tenantA.employee.id}/status`, {
        token: adminTokenA,
        method: 'PATCH',
        body: { status: 'active' },
      });
    }
  });
  await run('afastamento vencido é encerrado automaticamente no tenant correto', async () => {
    await runWithTenant(companyA.id, async () => {
      const user = await User.findByPk(tenantA.employee.id);
      assert(user);
      await user.update({
        status: 'suspended',
        suspended_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
        suspended_by: tenantA.admin.id,
        suspension_reason: 'Afastamento vencido para retorno automático.',
        suspension_type: 'temporary_suspension',
        suspension_start_date: today,
        suspension_end_at: new Date(Date.now() - 60 * 1000),
      });
    });

    assert.equal(await releaseAllExpiredRestrictions(), 1);
    const released = await runWithTenant(companyA.id, () => User.findByPk(tenantA.employee.id));
    assert.equal(released?.status, 'active');
    assert.equal(released?.suspension_type, null);
    assert.equal(released?.suspension_end_at, null);
    assert.equal((await api('/api/auth/me', { token: employeeTokenA })).status, 200);

    const untouched = await runWithTenant(companyB.id, () => User.findByPk(tenantB.employee.id));
    assert.equal(untouched?.status, 'active');
  });
  await run('requisições concorrentes mantêm contextos de empresa independentes', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      api('/api/users/team', { token: index % 2 === 0 ? adminTokenA : adminTokenB })
    ));
    responses.forEach((response, index) => {
      assert.equal(response.status, 200);
      const serialized = JSON.stringify(response.body.data);
      const ownEmployee = index % 2 === 0 ? tenantA.employee.email : tenantB.employee.email;
      const otherEmployee = index % 2 === 0 ? tenantB.employee.email : tenantA.employee.email;
      assert(serialized.includes(ownEmployee));
      assert(!serialized.includes(otherEmployee));
    });
  });
  await run('listagem de setores e hierarquias permanece isolada', async () => {
    const response = await api('/api/departments', { token: adminTokenA });
    assert.equal(response.status, 200);
    const serialized = JSON.stringify(response.body.data);
    assert(serialized.includes(tenantA.department.name));
    assert(!serialized.includes(tenantB.department.name));
  });
  await run('perfil empresarial não vaza dados de outro tenant', async () => {
    const response = await api('/api/company', { token: adminTokenA });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.legal_name, companyA.legal_name);
    assert.notEqual(response.body.data.legal_name, companyB.legal_name);
  });
  await run('feriados com a mesma data coexistem e são isolados', async () => {
    const response = await api('/api/holidays', { token: adminTokenA });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].name, tenantA.holiday.name);
  });
  await run('registros recentes do tenant A não contêm marcações do tenant B', async () => {
    const response = await api('/api/records/recent', { token: adminTokenA });
    assert.equal(response.status, 200);
    const ids = response.body.data.map((item: any) => item.id);
    assert(ids.includes(tenantA.record.id));
    assert(!ids.includes(tenantB.record.id));
  });
  await run('colaborador consulta somente as próprias marcações', async () => {
    const response = await api('/api/records/me', { token: employeeTokenA });
    assert.equal(response.status, 200);
    assert(response.body.data.every((item: any) => item.user_id === tenantA.employee.id));
  });
  await run('relatório de presença do tenant A não contém o tenant B', async () => {
    const response = await api(`/api/reports/attendance?startDate=${today}&endDate=${today}`, { token: adminTokenA });
    assert.equal(response.status, 200);
    const serialized = JSON.stringify(response.body.data);
    assert(serialized.includes(tenantA.employee.name));
    assert(!serialized.includes(tenantB.employee.name));
  });
  await run('dashboard agrupa as batidas por setor sem vazar outro tenant', async () => {
    const response = await api(`/api/reports/hr-summary?startDate=${today}&endDate=${today}&operationalOnly=true`, { token: adminTokenA });
    assert.equal(response.status, 200);
    const departments = response.body.data.todayTimeRecords;
    assert(Array.isArray(departments));
    const department = departments.find((item: any) => item.departmentId === tenantA.department.id);
    assert.equal(department?.departmentName, tenantA.department.name);
    const collaborator = department?.collaborators.find((item: any) => item.userId === tenantA.employee.id);
    assert.equal(collaborator?.userName, tenantA.employee.name);
    assert.equal(collaborator?.records[0]?.recordType, 'entry');
    assert(!JSON.stringify(departments).includes(tenantB.employee.name));
  });
  await run('consulta cumulativa rejeita colaborador de outro tenant', async () => {
    const response = await api(`/api/reports/cumulative-bank-hours?userId=${tenantB.employee.id}`, { token: adminTokenA });
    assert.equal(response.status, 404);
  });
  await run('alteração direta de setor de outro tenant é bloqueada', async () => {
    const response = await api(`/api/departments/${tenantB.department.id}`, { token: adminTokenA, method: 'PUT', body: { name: 'Tentativa cruzada' } });
    assert.equal(response.status, 404);
    const preserved = await runWithTenant(companyB.id, () => Department.findByPk(tenantB.department.id));
    assert.equal(preserved?.name, tenantB.department.name);
  });
  await run('inativação direta de usuário de outro tenant é bloqueada', async () => {
    const response = await api(`/api/users/${tenantB.employee.id}`, { token: adminTokenA, method: 'DELETE' });
    assert.equal(response.status, 404);
    const preserved = await runWithTenant(companyB.id, () => User.findByPk(tenantB.employee.id));
    assert.equal(preserved?.status, 'active');
  });
  await run('ajuste direto de marcação de outro tenant é bloqueado', async () => {
    const response = await api(`/api/records/${tenantB.record.id}/status`, {
      token: adminTokenA, method: 'PATCH', body: { status: 'rejected', reason: 'Tentativa cruzada' },
    });
    assert.equal(response.status, 404);
  });
  await run('revisão direta de solicitação de outro tenant é bloqueada', async () => {
    const response = await api(`/api/requests/${tenantB.request.id}/review`, {
      token: adminTokenA, method: 'PATCH', body: { status: 'rejected', admin_comment: 'Tentativa cruzada' },
    });
    assert.equal(response.status, 404);
  });
  await run('cadastro com departamento de outro tenant não persiste usuário', async () => {
    const email = 'cross-tenant@teste.local';
    const response = await api('/api/users', { token: adminTokenA, body: {
      name: 'Tentativa Cruzada', cpf: '99999999999', registration_number: 'CROSS-1', email, password,
      work_type: 'presential', role: 'employee', department_id: tenantB.department.id,
    } });
    assert.equal(response.status, 400);
    const created = await runWithoutTenant(() => User.findOne({ where: { email } }));
    assert.equal(created, null);
  });
  await run('líder multissetorial enxerga equipes dos dois setores permitidos', async () => {
    const ids = await runWithTenant(companyA.id, () => getManagedUserIds(tenantA.manager.id, tenantA.department.id, 'view_team'));
    assert(ids.includes(tenantA.employee.id));
    assert(ids.includes(tenantA.secondEmployee.id));
    assert(!ids.includes(tenantB.employee.id));
  });
  await run('líder sem permissão de ajuste não altera marcação', async () => {
    const response = await api(`/api/records/${tenantA.record.id}/status`, {
      token: managerTokenA, method: 'PATCH', body: { status: 'rejected', reason: 'Sem permissão' },
    });
    assert.equal(response.status, 403);
  });
  await run('líder sem permissão de aprovação não revisa solicitação', async () => {
    const response = await api(`/api/requests/${tenantA.request.id}/review`, {
      token: managerTokenA, method: 'PATCH', body: { status: 'rejected', admin_comment: 'Sem permissão' },
    });
    assert.equal(response.status, 404);
  });
  await run('token global não acessa endpoints operacionais sem escolher empresa', async () => {
    assert.equal((await api('/api/users/team', { token: platformToken })).status, 403);
  });
  await run('token empresarial não acessa endpoints globais', async () => {
    assert.equal((await api('/api/platform/companies', { token: adminTokenB })).status, 403);
  });
  await run('Super Admin lista empresas sem misturar sessão operacional', async () => {
    const response = await api('/api/platform/companies', { token: platformToken });
    assert.equal(response.status, 200);
    const ids = response.body.data.map((item: any) => item.id);
    assert(ids.includes(companyA.id));
    assert(ids.includes(companyB.id));
  });
  await run('provisionamento não cria admin e o painel permite cadastrar e editar o acesso', async () => {
    const provisioned = await api('/api/platform/companies', {
      token: platformToken,
      body: {
        legal_name: 'Tenant Gama Ltda',
        trade_name: 'Tenant Gama',
        slug: 'tenant-gama',
        cnpj: '33.333.333/0001-33',
        email: 'contato@tenant-gama.local',
        phone: '(11) 3333-3333',
        address_line: 'Rua do Teste, 33',
        city: 'São Paulo',
        state: 'SP',
        zip_code: '03333-333',
        kiosk_access_key: 'tenant-gama-kiosk-key-2026',
      },
    });
    assert.equal(provisioned.status, 201);
    const companyId = provisioned.body.data.id;

    const adminsBefore = await api(`/api/platform/companies/${companyId}/admins`, { token: platformToken });
    assert.equal(adminsBefore.status, 200);
    assert.deepEqual(adminsBefore.body.data, []);
    assert.equal((await api(`/api/platform/companies/${companyId}/access`, {
      token: platformToken,
      method: 'POST',
    })).status, 409);

    const updatedCompany = await api(`/api/platform/companies/${companyId}`, {
      token: platformToken,
      method: 'PATCH',
      body: {
        legal_name: 'Tenant Gama Serviços Ltda',
        trade_name: 'Tenant Gama Atualizada',
        slug: 'tenant-gama',
        cnpj: '33.333.333/0001-33',
        email: 'novo-contato@tenant-gama.local',
        phone: '(11) 3333-4444',
        address_line: 'Rua do Teste, 44',
        city: 'São Paulo',
        state: 'SP',
        zip_code: '04444-444',
      },
    });
    assert.equal(updatedCompany.status, 200);
    assert.equal(updatedCompany.body.data.trade_name, 'Tenant Gama Atualizada');

    const createdAdmin = await api(`/api/platform/companies/${companyId}/admins`, {
      token: platformToken,
      body: {
        name: 'Admin Tenant Gama',
        email: 'admin@tenant-gama.local',
        password,
        cpf: '33333333333',
        registration_number: 'ADM-GAMA-1',
      },
    });
    assert.equal(createdAdmin.status, 201);

    const updatedAdmin = await api(`/api/platform/companies/${companyId}/admins/${createdAdmin.body.data.id}`, {
      token: platformToken,
      method: 'PUT',
      body: {
        name: 'Administrador Tenant Gama',
        email: 'admin@tenant-gama.local',
        password: '',
        cpf: '33333333333',
        registration_number: 'ADM-GAMA-1',
        status: 'active',
      },
    });
    assert.equal(updatedAdmin.status, 200);

    const adminsAfter = await api(`/api/platform/companies/${companyId}/admins`, { token: platformToken });
    assert.equal(adminsAfter.status, 200);
    assert.equal(adminsAfter.body.data.length, 1);
    assert.equal(adminsAfter.body.data[0].name, 'Administrador Tenant Gama');

    const access = await api(`/api/platform/companies/${companyId}/access`, {
      token: platformToken,
      method: 'POST',
    });
    assert.equal(access.status, 200);
    assert.equal(access.body.data.user.company.id, companyId);
  });
  await run('acesso explícito do Super Admin cria sessão do tenant escolhido', async () => {
    const response = await api(`/api/platform/companies/${companyB.id}/access`, { token: platformToken, method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.company.id, companyB.id);
    const tenantResponse = await api('/api/users/team', { token: response.body.data.token });
    assert.equal(tenantResponse.status, 200);
    assert(JSON.stringify(tenantResponse.body.data).includes(tenantB.employee.email));
    assert(!JSON.stringify(tenantResponse.body.data).includes(tenantA.employee.email));
  });
  await run('empresa principal não pode ser suspensa', async () => {
    const response = await api(`/api/platform/companies/${companyA.id}/status`, {
      token: platformToken, method: 'PATCH', body: { status: 'suspended', reason: 'Teste de proteção' },
    });
    assert.equal(response.status, 409);
  });
  await run('suspensão bloqueia token e preserva dados; reativação restaura acesso', async () => {
    const before = await runWithTenant(companyB.id, () => User.count());
    const suspended = await api(`/api/platform/companies/${companyB.id}/status`, {
      token: platformToken, method: 'PATCH', body: { status: 'suspended', reason: 'Teste automatizado' },
    });
    assert.equal(suspended.status, 200);
    assert.equal((await api('/api/users/team', { token: adminTokenB })).status, 403);
    const during = await runWithTenant(companyB.id, () => User.count());
    assert.equal(during, before);
    const active = await api(`/api/platform/companies/${companyB.id}/status`, {
      token: platformToken, method: 'PATCH', body: { status: 'active', reason: 'Fim do teste automatizado' },
    });
    assert.equal(active.status, 200);
    assert.equal((await api('/api/users/team', { token: adminTokenB })).status, 200);
    const released = await api('/api/auth/kiosk/release', { token: adminTokenB, method: 'POST' });
    assert.equal(released.status, 200);
  });
  await run('chave de kiosk resolve e isola a empresa correta', async () => {
    const companyPageA = await api('/api/auth/kiosk/company/tenant-alfa');
    const loginA = await api('/api/auth/kiosk/login', { body: { accessKey: kioskKeyA, companySlug: 'tenant-alfa' } });
    const loginB = await api('/api/auth/kiosk/login', { body: { accessKey: kioskKeyB, companySlug: 'tenant-beta' } });
    const crossCompanyLogin = await api('/api/auth/kiosk/login', { body: { accessKey: kioskKeyB, companySlug: 'tenant-alfa' } });
    assert.equal(companyPageA.status, 200);
    assert.equal(companyPageA.body.data.name, 'Tenant Alfa');
    assert.equal(loginA.status, 200);
    assert.equal(loginB.status, 200);
    assert.equal(crossCompanyLogin.status, 401);
    assert.equal(loginA.body.data.company.slug, 'tenant-alfa');
    assert.equal(loginB.body.data.company.slug, 'tenant-beta');
    const facesA = await api('/api/auth/faces', { token: loginA.body.data.token });
    const facesB = await api('/api/auth/faces', { token: loginB.body.data.token });
    const statusA = await api('/api/auth/kiosk/status', { token: loginA.body.data.token });
    const statusB = await api('/api/auth/kiosk/status', { token: loginB.body.data.token });
    assert.equal(facesA.status, 200);
    assert.equal(facesB.status, 200);
    assert.equal(statusA.status, 200);
    assert.equal(statusB.status, 200);
    assert.equal(statusA.body.data.terminalEnabled, true);
    assert.equal(statusB.body.data.terminalEnabled, true);
    assert.equal(statusA.body.data.company.slug, 'tenant-alfa');
    assert.equal(statusB.body.data.company.slug, 'tenant-beta');
    assert(JSON.stringify(facesA.body.data).includes(tenantA.employee.name));
    assert(!JSON.stringify(facesA.body.data).includes(tenantB.employee.name));
    assert(JSON.stringify(facesB.body.data).includes(tenantB.employee.name));
    assert(!JSON.stringify(facesB.body.data).includes(tenantA.employee.name));
  });
  await run('servidor recalcula a identidade e rejeita colaborador facial incorreto', async () => {
    const kioskLogin = await api('/api/auth/kiosk/login', { body: { accessKey: kioskKeyA } });
    const biometricContext = {
      livenessVerified: true, livenessStep: 'verified', poseDirection: 'center', challengeDirection: 'left',
      yaw: 0, pitch: 0, faceDetected: true, scannedAt: new Date().toISOString(), source: 'face-api',
      antiConfusionValidated: true, consistentFaceFrames: 2, requiredConsistentFaceFrames: 2,
      livenessFramesPerStep: 2, livenessIdentityBound: true,
    };
    const mismatch = await api('/api/records', { token: kioskLogin.body.data.token, body: {
      userId: tenantA.employee.id, record_type: 'lunch_start', method: 'facial', biometric_score: 1,
      biometric_threshold: 0.52, detected_descriptor: tenantA.secondaryDescriptor, biometric_context: biometricContext,
    } });
    assert.equal(mismatch.status, 422);

    const confirmed = await api('/api/records', { token: kioskLogin.body.data.token, body: {
      userId: tenantA.employee.id, record_type: 'lunch_start', method: 'facial', biometric_score: 1,
      biometric_threshold: 0.52, detected_descriptor: tenantA.primaryDescriptor, biometric_context: biometricContext,
    } });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.meta.userName, tenantA.employee.name);
  });

  await run('rotas públicas antigas de uploads permanecem fechadas', async () => {
    assert.equal((await api('/api/uploads/requests/tenant-a.pdf')).status, 404);
    assert.equal((await api('/uploads/requests/tenant-a.pdf')).status, 404);
  });
  await run('foto remota exige autenticação e respeita usuário e tenant', async () => {
    assert.equal((await api(`/api/files/records/${tenantA.record.id}/photo`)).status, 401);
    const ownPhoto = await api(`/api/files/records/${tenantA.record.id}/photo`, { token: employeeTokenA });
    assert.equal(ownPhoto.status, 200);
    assert.equal(ownPhoto.text, 'photo-a');
    assert.equal((await api(`/api/files/records/${tenantB.record.id}/photo`, { token: employeeTokenA })).status, 404);
    assert.equal((await api(`/api/files/records/${tenantA.record.id}/photo`, { token: managerTokenA })).status, 200);
  });
  await run('anexo exige autenticação, tenant e permissão de aprovação', async () => {
    assert.equal((await api(`/api/files/requests/${tenantA.request.id}/attachment`)).status, 401);
    assert.equal((await api(`/api/files/requests/${tenantA.request.id}/attachment`, { token: employeeTokenA })).status, 200);
    assert.equal((await api(`/api/files/requests/${tenantB.request.id}/attachment`, { token: adminTokenA })).status, 404);
    assert.equal((await api(`/api/files/requests/${tenantA.request.id}/attachment`, { token: managerTokenA })).status, 403);
    assert.equal((await api(`/api/files/requests/${tenantA.request.id}/attachment`, { token: adminTokenA })).status, 200);
  });
  await run('retenção remove somente a foto vencida e preserva o ponto remoto', async () => {
    const expired = await runWithTenant(companyA.id, async () => {
      const createdAt = new Date();
      createdAt.setUTCMonth(createdAt.getUTCMonth() - 4);
      const record = await TimeRecord.create({
        user_id: tenantA.employee.id, record_time: createdAt, record_type: 'entry', method: 'web', status: 'valid',
        trust_level: 'medium', photo_url: '/uploads/remote_photos/expired-retention-test.jpg', created_at: createdAt,
      });
      await RemotePhotoEvidence.create({
        record_id: record.id, photo_data: Buffer.from('expired-photo'), mime_type: 'image/jpeg',
        expires_at: new Date(Date.now() - 60_000), deleted_at: null,
      });
      return record;
    });
    const expiredFilePath = path.join(remotePhotosDirectory, 'expired-retention-test.jpg');
    await fs.writeFile(expiredFilePath, 'expired-photo', 'utf8');
    cleanupFilePaths.push(expiredFilePath);
    const retention = await cleanExpiredRemotePhotos();
    assert.equal(retention.removed, 1);
    await runWithTenant(companyA.id, async () => {
      const preserved = await TimeRecord.findByPk(expired.id);
      const evidence = await RemotePhotoEvidence.scope('withPhotoData').findOne({ where: { record_id: expired.id } });
      assert.equal(preserved?.method, 'web');
      assert.equal(preserved?.photo_url, null);
      assert.equal(evidence?.photo_data, null);
      assert(evidence?.deleted_at);
    });
    assert.equal((await api(`/api/files/records/${expired.id}/photo`, { token: employeeTokenA })).status, 404);
  });

  const failed = results.filter((item) => item.status === 'FAIL');
  const risks = results.filter((item) => item.status === 'RISK');
  console.log('\n=== RESUMO MULTITENANCY ===');
  console.log(`Banco temporário: ${testDatabase}`);
  console.log(`Aprovados: ${results.filter((item) => item.status === 'PASS').length}`);
  console.log(`Falhas funcionais: ${failed.length}`);
  console.log(`Riscos confirmados: ${risks.length}`);
  if (failed.length) process.exitCode = 1;
  else if (risks.length) process.exitCode = 2;
} finally {
  await Promise.all(cleanupFilePaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await sequelize.close().catch(() => undefined);
  await rootConnection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``).catch(() => undefined);
  await rootConnection.end().catch(() => undefined);
}
