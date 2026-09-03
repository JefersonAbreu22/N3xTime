import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { KioskControl } from '../models/KioskControl.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { Account } from '../models/Account.js';
import { Company } from '../models/Company.js';
import { CompanyMembership } from '../models/CompanyMembership.js';
import { PlatformUser } from '../models/PlatformUser.js';
import { User } from '../models/User.js';
import { getJwtSecret } from '../config/security.js';
import { releaseExpiredRestriction } from '../services/UserAccessService.js';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    accountId?: number;
    membershipId?: number;
    role: string;
    companyId: number | null;
    scope?: 'tenant' | 'kiosk' | 'platform';
    kioskVersion?: number;
    impersonatedBy?: number;
  };
}

const getKioskControl = async () => {
  let control = await KioskControl.findOne();
  if (!control) {
    control = await KioskControl.create({ session_version: 1, terminal_enabled: false });
  }
  return control;
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i);
  const token = bearerMatch?.[1];

  if (!token || token.length > 8192) {
    return res.status(401).json({ success: false, error: 'Token não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    }) as { id: number; accountId?: number; membershipId?: number; role: string; scope?: 'tenant' | 'kiosk' | 'platform'; companyId?: number; kioskVersion?: number; impersonatedBy?: number };
    if (decoded.role === 'platform_admin' && decoded.scope === 'platform') {
      const platformUser = await PlatformUser.findOne({ where: { id: decoded.id, status: 'active' } });
      if (!platformUser) {
        return res.status(403).json({ success: false, error: 'Administrador global inativo.' });
      }
      if (!req.originalUrl.startsWith('/api/platform/')) {
        return res.status(403).json({ success: false, error: 'Selecione uma empresa no Painel Super Admin para acessar estes dados.' });
      }
      req.user = { ...decoded, companyId: null };
      return next();
    }
    const companyId = Number(decoded.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(403).json({ success: false, error: 'Token sem contexto de empresa.' });
    }
    const company = await Company.findByPk(companyId);
    if (!company || company.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Empresa inativa ou suspensa.' });
    }
    if (decoded.role === 'kiosk') {
      const control = await runWithTenant(companyId, getKioskControl);
      if (!control.terminal_enabled || !decoded.kioskVersion || decoded.kioskVersion !== control.session_version) {
        return res.status(403).json({ success: false, error: 'Sessão do terminal revogada ou expirada.' });
      }
    } else {
      if (decoded.impersonatedBy) {
        const platformUser = await PlatformUser.findOne({ where: { id: decoded.impersonatedBy, status: 'active' }, attributes: ['id'] });
        if (!platformUser) return res.status(403).json({ success: false, error: 'Sessão de acesso global inválida.' });
      } else {
        const accountId = Number(decoded.accountId);
        const membershipId = Number(decoded.membershipId);
        if (!Number.isInteger(accountId) || accountId <= 0 || !Number.isInteger(membershipId) || membershipId <= 0) {
          return res.status(403).json({ success: false, error: 'Sessão sem vínculo de conta válido.' });
        }

        const [account, membership] = await Promise.all([
          Account.findOne({ where: { id: accountId, status: 'active' }, attributes: ['id'] }),
          CompanyMembership.findOne({
            where: {
              id: membershipId,
              account_id: accountId,
              company_id: companyId,
              user_id: decoded.id,
              status: 'active',
            },
            attributes: ['id'],
          }),
        ]);
        if (!account || !membership) {
          return res.status(403).json({ success: false, error: 'Acesso à empresa revogado ou inválido.' });
        }
      }
      const authenticatedUser = await runWithTenant(companyId, () => User.findByPk(decoded.id));
      if (authenticatedUser) {
        await runWithTenant(companyId, () => releaseExpiredRestriction(authenticatedUser));
      }
      if (!authenticatedUser || authenticatedUser.status !== 'active') {
        return res.status(403).json({ success: false, error: 'Usuário inativo ou não encontrado.' });
      }
      if (!decoded.impersonatedBy && authenticatedUser.must_change_password && !req.originalUrl.startsWith('/api/auth/password/change')) {
        return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Troque a senha temporária antes de continuar.' });
      }
    }
    const synchronizedRole = decoded.role === 'kiosk' ? decoded.role : (await runWithTenant(companyId, () =>
      User.findOne({ where: { id: decoded.id, status: 'active' }, attributes: ['role'] })
    ))?.role || decoded.role;
    req.user = { ...decoded, role: synchronizedRole, companyId };
    return runWithTenant(companyId, () => next());
  } catch (_err) {
    return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Permissão insuficiente.' });
    }
    next();
  };
};
