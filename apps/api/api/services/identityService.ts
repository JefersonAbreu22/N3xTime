import bcrypt from 'bcrypt';
import { Account } from '../models/Account.js';
import { Company } from '../models/Company.js';
import { CompanyMembership } from '../models/CompanyMembership.js';
import { User } from '../models/User.js';
import { runWithoutTenant, runWithTenant } from '../tenancy/tenantContext.js';
import { releaseExpiredRestriction } from './UserAccessService.js';

export type AccountCompany = {
  membershipId: number;
  companyId: number;
  userId: number;
  name: string;
  slug: string;
  role: 'admin' | 'manager' | 'employee';
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const ensureAccountForEmail = async (email: string, password?: string) => {
  const normalized = normalizeEmail(email);
  const tenantUsers = await runWithoutTenant(() => User.findAll({
    where: { email: normalized, status: 'active' },
    order: [['created_at', 'ASC']],
  }));

  let account = await Account.findOne({ where: { email: normalized, status: 'active' } });
  if (!account) {
    if (!tenantUsers.length) return null;
    let source = tenantUsers[0];
    if (password) {
      const matched = [] as User[];
      for (const user of tenantUsers) if (await bcrypt.compare(password, user.password_hash)) matched.push(user);
      if (!matched.length) return null;
      source = matched[0];
    }
    account = await Account.create({
      name: source.name,
      email: normalized,
      password_hash: source.password_hash,
      status: 'active',
    });
  }

  for (const user of tenantUsers) {
    await CompanyMembership.findOrCreate({
      where: { account_id: account.id, company_id: user.company_id },
      defaults: { account_id: account.id, company_id: user.company_id, user_id: user.id, status: 'active' },
    });
  }
  return account;
};

export const authenticateAccount = async (email: string, password: string) => {
  const account = await ensureAccountForEmail(email, password);
  if (!account || !(await bcrypt.compare(password, account.password_hash))) return null;
  return account;
};

export const listAccountCompanies = async (accountId: number): Promise<AccountCompany[]> => {
  const memberships = await CompanyMembership.findAll({
    where: { account_id: accountId, status: 'active' },
    order: [['company_id', 'ASC']],
  });
  const result: AccountCompany[] = [];
  for (const membership of memberships) {
    const [company, user] = await Promise.all([
      Company.findOne({ where: { id: membership.company_id, status: 'active' } }),
      runWithoutTenant(() => User.findOne({ where: { id: membership.user_id, company_id: membership.company_id } })),
    ]);
    if (!company || !user) continue;
    await runWithTenant(company.id, () => releaseExpiredRestriction(user));
    if (user.status !== 'active') continue;
    result.push({
      membershipId: membership.id,
      companyId: company.id,
      userId: user.id,
      name: company.trade_name || company.legal_name,
      slug: company.slug,
      role: user.role,
    });
  }
  return result;
};

export const syncAccountPassword = async (account: Account, passwordHash: string) => {
  account.password_hash = passwordHash;
  await account.save();
  const memberships = await CompanyMembership.findAll({ where: { account_id: account.id } });
  const userIds = memberships.map((item) => item.user_id);
  if (userIds.length) {
    await runWithoutTenant(() => User.update({ password_hash: passwordHash, must_change_password: false }, { where: { id: userIds } }));
  }
};
