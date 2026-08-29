import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getJwtSecret } from '../config/security.js';
import { Account } from '../models/Account.js';
import { Company } from '../models/Company.js';
import { CompanyMembership } from '../models/CompanyMembership.js';
import { PlatformUser } from '../models/PlatformUser.js';
import { User } from '../models/User.js';
import type { AuthRequest } from '../middlewares/authMiddleware.js';
import { authenticateAccount, listAccountCompanies, syncAccountPassword } from '../services/identityService.js';
import { sendPasswordResetEmail } from '../services/PasswordResetEmailService.js';
import { PASSWORD_POLICY_MESSAGE, passwordSchema } from '../validation/passwordPolicy.js';
import { runWithoutTenant, runWithTenant } from '../tenancy/tenantContext.js';
import { allLeadershipPermissions, getEffectiveLeadershipPermissions } from '../utils/leadership.js';
import crypto from 'crypto';

const fingerprint = (hash: string) => crypto.createHash('sha256').update(hash).digest('hex');
const publicUrl = () => (process.env.APP_PUBLIC_URL?.trim() || 'http://localhost:3979').replace(/\/$/, '');

const buildTenantSession = async (account: Account, membership: CompanyMembership) => {
  const [company, user, companies] = await Promise.all([
    Company.findOne({ where: { id: membership.company_id, status: 'active' } }),
    runWithoutTenant(() => User.findOne({ where: { id: membership.user_id, company_id: membership.company_id, status: 'active' } })),
    listAccountCompanies(account.id),
  ]);
  if (!company || !user) return null;
  const leadershipPermissions = user.role === 'admin'
    ? allLeadershipPermissions
    : user.role === 'manager'
      ? await runWithTenant(company.id, () => getEffectiveLeadershipPermissions(user.id))
      : [];
  const token = jwt.sign({
    id: user.id,
    accountId: account.id,
    membershipId: membership.id,
    role: user.role,
    scope: 'tenant',
    companyId: company.id,
  }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '12h' });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: account.email,
      role: user.role,
      company: { id: company.id, slug: company.slug, name: company.trade_name || company.legal_name },
      available_companies: companies,
      must_change_password: user.must_change_password,
      remote_clock_in_enabled: user.remote_clock_in_enabled,
      requires_time_tracking: user.requires_time_tracking,
      department_id: user.department_id,
      leadership_permissions: leadershipPermissions,
      is_platform_admin: false,
    },
  };
};

export const loginWithAccount = async (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().trim().email().max(255).transform(v => v.toLowerCase()), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });

  const platformUser = await PlatformUser.findOne({ where: { email: parsed.data.email, status: 'active' } });
  if (platformUser && await bcrypt.compare(parsed.data.password, platformUser.password_hash)) {
    const token = jwt.sign({ id: platformUser.id, role: 'platform_admin', scope: 'platform' }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
    return res.json({ success: true, data: { token, user: { id: platformUser.id, name: platformUser.name, email: platformUser.email, role: 'platform_admin', is_platform_admin: true } } });
  }

  const account = await authenticateAccount(parsed.data.email, parsed.data.password);
  if (!account) return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
  const companies = await listAccountCompanies(account.id);
  if (!companies.length) return res.status(403).json({ success: false, error: 'Esta conta não possui empresa ativa.' });
  if (companies.length === 1) {
    const membership = await CompanyMembership.findByPk(companies[0].membershipId);
    const session = membership ? await buildTenantSession(account, membership) : null;
    if (!session) return res.status(403).json({ success: false, error: 'Vínculo de empresa inválido.' });
    return res.json({ success: true, data: session });
  }

  const selectionToken = jwt.sign({ accountId: account.id, scope: 'account', purpose: 'company-selection' }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '10m' });
  return res.json({ success: true, data: { requires_company_selection: true, selection_token: selectionToken, companies } });
};

export const selectAccountCompany = async (req: Request, res: Response) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const companyId = Number(req.body?.companyId);
  if (!token || !Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ success: false, error: 'Empresa inválida.' });
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as { scope?: string; accountId?: number; companyId?: number };
    const accountId = Number(payload.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0 || !['account', 'tenant'].includes(String(payload.scope))) throw new Error('invalid scope');
    const account = await Account.findOne({ where: { id: accountId, status: 'active' } });
    const membership = account ? await CompanyMembership.findOne({ where: { account_id: account.id, company_id: companyId, status: 'active' } }) : null;
    if (!account || !membership) return res.status(403).json({ success: false, error: 'A conta não possui acesso a esta empresa.' });
    const session = await buildTenantSession(account, membership);
    if (!session) return res.status(403).json({ success: false, error: 'Empresa indisponível.' });
    return res.json({ success: true, data: session });
  } catch {
    return res.status(401).json({ success: false, error: 'Sessão de seleção inválida ou expirada.' });
  }
};

export const getAccountCurrentSession = async (req: AuthRequest, res: Response) => {
  const accountId = Number(req.user?.accountId);
  const membershipId = Number(req.user?.membershipId);
  if (!accountId || !membershipId || req.user?.scope !== 'tenant') return res.status(401).json({ success: false, error: 'Sessão de empresa inválida.' });
  const account = await Account.findOne({ where: { id: accountId, status: 'active' } });
  const membership = account ? await CompanyMembership.findOne({ where: { id: membershipId, account_id: accountId, company_id: req.user.companyId, status: 'active' } }) : null;
  const session = account && membership ? await buildTenantSession(account, membership) : null;
  if (!session) return res.status(403).json({ success: false, error: 'Sessão indisponível.' });
  return res.json({ success: true, data: { user: session.user } });
};

export const changeAccountPassword = async (req: AuthRequest, res: Response) => {
  const parsed = z.object({ current_password: z.string().min(1).max(200), new_password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: PASSWORD_POLICY_MESSAGE });
  const account = await Account.findByPk(Number(req.user?.accountId));
  if (!account || !(await bcrypt.compare(parsed.data.current_password, account.password_hash))) return res.status(400).json({ success: false, error: 'Senha atual inválida.' });
  const hash = await bcrypt.hash(parsed.data.new_password, 12);
  await syncAccountPassword(account, hash);
  return res.json({ success: true, message: 'Senha alterada em todas as empresas vinculadas.' });
};

export const requestAccountPasswordReset = async (req: Request, res: Response) => {
  const generic = { success: true, message: 'Se o e-mail estiver cadastrado e ativo, enviaremos as instruções para redefinir a senha.' };
  const email = z.string().trim().email().safeParse(req.body?.email);
  if (!email.success) return res.status(400).json({ success: false, error: 'Informe um e-mail válido.' });
  const account = await Account.findOne({ where: { email: email.data.toLowerCase(), status: 'active' } });
  if (!account) return res.json(generic);
  const companies = await listAccountCompanies(account.id);
  if (!companies.length) return res.json(generic);
  const representative = await runWithoutTenant(() => User.findByPk(companies[0].userId));
  if (!representative) return res.json(generic);
  const token = jwt.sign({ sub: String(account.id), purpose: 'account-password-reset', passwordFingerprint: fingerprint(account.password_hash) }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '30m', issuer: 'n3xtime-password-reset' });
  const resetUrl = new URL('/reset-password', publicUrl()); resetUrl.searchParams.set('token', token);
  try { await runWithTenant(companies[0].companyId, () => sendPasswordResetEmail(representative, resetUrl.toString())); } catch (error) { console.error('Password reset email error:', error); }
  return res.json(generic);
};

export const resetAccountPassword = async (req: Request, res: Response) => {
  const parsed = z.object({ token: z.string().min(20).max(4000), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: PASSWORD_POLICY_MESSAGE });
  try {
    const payload = jwt.verify(parsed.data.token, getJwtSecret(), { issuer: 'n3xtime-password-reset', algorithms: ['HS256'] }) as { sub?: string; purpose?: string; passwordFingerprint?: string };
    const account = await Account.findByPk(Number(payload.sub));
    if (!account || payload.purpose !== 'account-password-reset' || fingerprint(account.password_hash) !== payload.passwordFingerprint) throw new Error('invalid');
    if (await bcrypt.compare(parsed.data.password, account.password_hash)) return res.status(400).json({ success: false, error: 'A nova senha deve ser diferente da senha atual.' });
    await syncAccountPassword(account, await bcrypt.hash(parsed.data.password, 12));
    return res.json({ success: true, message: 'Senha redefinida com sucesso.' });
  } catch {
    return res.status(400).json({ success: false, error: 'Este link é inválido ou expirou. Solicite uma nova redefinição.' });
  }
};
