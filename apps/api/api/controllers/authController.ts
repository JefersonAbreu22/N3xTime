import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { Op, col, fn } from 'sequelize';
import { User } from '../models/User.js';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { BiometricEvent } from '../models/BiometricEvent.js';
import { BiometricSample } from '../models/BiometricSample.js';
import { KioskControl } from '../models/KioskControl.js';
import { TimeRecord } from '../models/TimeRecord.js';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '../services/PasswordResetEmailService.js';
import { PASSWORD_POLICY_MESSAGE, passwordSchema } from '../validation/passwordPolicy.js';
import { Company } from '../models/Company.js';
import { PlatformUser } from '../models/PlatformUser.js';
import { runWithTenant, runWithoutTenant } from '../tenancy/tenantContext.js';
import { fingerprintKioskKey } from '../utils/kioskKey.js';
import { AuditService } from '../services/AuditService.js';
import { allLeadershipPermissions, getEffectiveLeadershipPermissions, getManagedUserIds, isManagerResponsibleForUser } from '../utils/leadership.js';

const getJwtSecret = () => process.env.JWT_SECRET || 'supersecret';
const getKioskTokenTtl = () => process.env.KIOSK_TOKEN_TTL || '7d';
const getPasswordFingerprint = (passwordHash: string) => crypto.createHash('sha256').update(passwordHash).digest('hex');
const getPasswordResetBaseUrl = () => {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return Number(process.env.PORT) === 3988 ? 'http://localhost:3978' : 'http://localhost:3979';
};
const MIN_RECOMMENDED_FACE_SAMPLES = 5;
const BIOMETRIC_ACTIVITY_LOOKBACK_DAYS = 7;
type KioskSuggestedRecordType = 'entry' | 'lunch_start' | 'lunch_end' | 'exit';

const getTodayBounds = () => {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
};

const getSuggestedKioskRecordType = (recordTypes: string[]): KioskSuggestedRecordType | null => {
  if (recordTypes.includes('exit')) return null;
  if (!recordTypes.includes('entry')) return 'entry';
  if (!recordTypes.includes('lunch_start')) return 'lunch_start';
  if (!recordTypes.includes('lunch_end')) return 'lunch_end';
  if (!recordTypes.includes('exit')) return 'exit';
  return null;
};
const getKioskControl = async () => {
  let control = await KioskControl.findOne();
  if (!control) {
    control = await KioskControl.create({ session_version: 1, terminal_enabled: false });
  }
  return control;
};

const getManagedUsersWhere = async (requester: NonNullable<AuthRequest['user']>, permission: 'view_team' | 'manage_biometrics' = 'view_team') =>
  requester.role === 'manager'
    ? { status: 'active', id: { [Op.in]: await getManagedUserIds(requester.id, null, permission) } }
    : { status: 'active' };

const averageDescriptors = (descriptors: number[][]) => {
  const validDescriptors = descriptors.filter((descriptor) => descriptor.length > 0);
  if (!validDescriptors.length) return [];

  const dimension = validDescriptors[0].length;
  const sum = new Array<number>(dimension).fill(0);

  for (const descriptor of validDescriptors) {
    if (descriptor.length !== dimension) {
      throw new Error('As amostras biométricas possuem dimensões incompatíveis.');
    }
    descriptor.forEach((value, index) => {
      sum[index] += value;
    });
  }

  return sum.map((value) => Number((value / validDescriptors.length).toFixed(8)));
};

const buildSampleStatsMap = async (userIds: number[]) => {
  if (!userIds.length) {
    return new Map<number, { sampleCount: number; lastSampleAt: string | null }>();
  }

  const rows = (await BiometricSample.findAll({
    where: { user_id: { [Op.in]: userIds } },
    attributes: [
      'user_id',
      [fn('COUNT', col('id')), 'sampleCount'],
      [fn('MAX', col('created_at')), 'lastSampleAt'],
    ],
    group: ['user_id'],
    raw: true,
  })) as unknown as Array<{ user_id: number; sampleCount: string | number; lastSampleAt: string | null }>;

  return new Map(
    rows.map((row) => [
      Number(row.user_id),
      {
        sampleCount: Number(row.sampleCount ?? 0),
        lastSampleAt: row.lastSampleAt ?? null,
      },
    ])
  );
};

const parseEventMetadata = (metadata: string | null) => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const getDeviceLabel = (deviceInfo: string | null) => {
  if (!deviceInfo) return 'Terminal não identificado';
  try {
    const parsed = JSON.parse(deviceInfo) as Record<string, unknown>;
    const platform = typeof parsed.platform === 'string' && parsed.platform.trim() ? parsed.platform.trim() : null;
    const ua = typeof parsed.ua === 'string' && parsed.ua.trim() ? parsed.ua.trim() : null;
    if (platform) return `Totem ${platform}`;
    if (ua) return ua.slice(0, 60);
  } catch {
    return deviceInfo.slice(0, 60);
  }
  return 'Terminal não identificado';
};

const registerBiometricEvent = async (payload: {
  userId?: number | null;
  eventType: 'enrollment' | 'verification_success' | 'verification_failure' | 'pin_fallback' | 'reset';
  method: 'facial' | 'pin' | 'manual' | 'web';
  success: boolean;
  matchScore?: number | null;
  threshold?: number | null;
  reason?: string | null;
  triggeredBy?: number | null;
  deviceInfo?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  try {
    await BiometricEvent.create({
      user_id: payload.userId ?? null,
      event_type: payload.eventType,
      method: payload.method,
      success: payload.success,
      match_score: payload.matchScore ?? null,
      threshold: payload.threshold ?? null,
      reason: payload.reason ?? null,
      triggered_by: payload.triggeredBy ?? null,
      device_info: payload.deviceInfo ?? null,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    });
  } catch (error) {
    console.error('Biometric event log error:', error);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const parsed = z.object({
      email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
      password: z.string().min(1).max(200),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    }

    const user = await runWithoutTenant(() =>
      User.findOne({ where: { email: parsed.data.email, status: 'active' } })
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
    }

    const company = await Company.findOne({ where: { id: user.company_id, status: 'active' } });
    if (!company) return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });

    const isMatch = await bcrypt.compare(parsed.data.password, user.password_hash);

    if (!isMatch) {
      await runWithTenant(company.id, () => AuditService.log({
        user_id: user.id,
        action: 'auth.login_failed',
        entity_name: 'session',
        entity_id: user.id,
        new_value: { reason: 'invalid_password' },
      }, req));
      return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
    }

    await runWithTenant(company.id, () => AuditService.log({
      user_id: user.id,
      action: 'auth.login_succeeded',
      entity_name: 'session',
      entity_id: user.id,
      new_value: { authentication_method: 'password' },
    }, req));

    const platformUser = await PlatformUser.findOne({
      where: { email: user.email.toLowerCase(), status: 'active' },
      attributes: ['id'],
    });
    const isPlatformAdmin = Boolean(platformUser);
    const leadershipPermissions = user.role === 'admin'
      ? allLeadershipPermissions
      : user.role === 'manager'
        ? await runWithTenant(company.id, () => getEffectiveLeadershipPermissions(user.id))
        : [];

    const token = jwt.sign(
      platformUser
        ? { id: platformUser.id, role: 'platform_admin', scope: 'platform' }
        : { id: user.id, role: user.role, scope: 'tenant', companyId: company.id },
      getJwtSecret(),
      { expiresIn: platformUser ? '8h' : '12h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: { id: company.id, slug: company.slug, name: company.trade_name || company.legal_name },
          must_change_password: user.must_change_password,
          remote_clock_in_enabled: user.remote_clock_in_enabled,
          requires_time_tracking: user.requires_time_tracking,
          department_id: user.department_id,
          leadership_permissions: leadershipPermissions,
          is_platform_admin: isPlatformAdmin,
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const getCurrentSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    if (!userId || !companyId || req.user?.scope !== 'tenant') {
      return res.status(401).json({ success: false, error: 'Sessão de empresa inválida.' });
    }

    const [user, company] = await Promise.all([
      User.findOne({ where: { id: userId, status: 'active' } }),
      Company.findOne({ where: { id: companyId, status: 'active' } }),
    ]);
    if (!user || !company) {
      return res.status(403).json({ success: false, error: 'Usuário ou empresa indisponível.' });
    }

    const isPlatformAdmin = Boolean(await PlatformUser.findOne({
      where: { email: user.email.toLowerCase(), status: 'active' },
      attributes: ['id'],
    }));
    const leadershipPermissions = user.role === 'admin'
      ? allLeadershipPermissions
      : user.role === 'manager'
        ? await getEffectiveLeadershipPermissions(user.id)
        : [];
    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: { id: company.id, slug: company.slug, name: company.trade_name || company.legal_name },
          must_change_password: user.must_change_password,
          remote_clock_in_enabled: user.remote_clock_in_enabled,
          requires_time_tracking: user.requires_time_tracking,
          department_id: user.department_id,
          leadership_permissions: leadershipPermissions,
          is_platform_admin: isPlatformAdmin,
          is_impersonating: Boolean(req.user?.impersonatedBy),
        },
      },
    });
  } catch (error) {
    console.error('Current session error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao sincronizar a sessão.' });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  const genericResponse = { success: true, message: 'Se o e-mail estiver cadastrado e ativo, enviaremos as instruções para redefinir a senha.' };
  try {
    const parsed = z.object({
      email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Informe um e-mail válido.' });
    const user = await runWithoutTenant(() =>
      User.findOne({ where: { email: parsed.data.email, status: 'active' } })
    );
    if (!user) return res.json(genericResponse);
    const company = await Company.findOne({ where: { id: user.company_id, status: 'active' } });
    if (!company) return res.json(genericResponse);

    const token = jwt.sign({ sub: String(user.id), companyId: company.id, purpose: 'password-reset', passwordFingerprint: getPasswordFingerprint(user.password_hash) }, getJwtSecret(), { expiresIn: '30m', issuer: 'n3xtime-password-reset' });
    const resetUrl = new URL('/reset-password', getPasswordResetBaseUrl());
    resetUrl.searchParams.set('token', token);
    try {
      await runWithTenant(company.id, () => sendPasswordResetEmail(user, resetUrl.toString()));
    } catch (emailError) {
      console.error('Password reset email error:', emailError);
    }
    return res.json(genericResponse);
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.json(genericResponse);
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const parsed = z.object({
      token: z.string().min(20).max(4000),
      password: passwordSchema,
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: PASSWORD_POLICY_MESSAGE });
    let payload: { sub?: string; companyId?: number; purpose?: string; passwordFingerprint?: string };
    try {
      payload = jwt.verify(parsed.data.token, getJwtSecret(), { issuer: 'n3xtime-password-reset' }) as typeof payload;
    } catch {
      return res.status(400).json({ success: false, error: 'Este link é inválido ou expirou. Solicite uma nova redefinição.' });
    }
    const userId = Number(payload.sub);
    const companyId = Number(payload.companyId);
    if (payload.purpose !== 'password-reset' || !Number.isInteger(userId) || userId <= 0 || !Number.isInteger(companyId) || companyId <= 0 || !payload.passwordFingerprint) {
      return res.status(400).json({ success: false, error: 'Este link é inválido ou expirou. Solicite uma nova redefinição.' });
    }
    const user = await runWithTenant(companyId, () => User.findOne({ where: { id: userId, status: 'active' } }));
    if (!user || getPasswordFingerprint(user.password_hash) !== payload.passwordFingerprint) {
      return res.status(400).json({ success: false, error: 'Este link já foi utilizado ou não é mais válido.' });
    }
    if (await bcrypt.compare(parsed.data.password, user.password_hash)) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ser diferente da senha atual.' });
    }
    user.password_hash = await bcrypt.hash(parsed.data.password, 12);
    await runWithTenant(companyId, () => user.save());
    return res.json({ success: true, message: 'Senha redefinida com sucesso. Você já pode entrar no sistema.' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ success: false, error: 'Não foi possível redefinir a senha.' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role === 'kiosk' || req.user.role === 'platform_admin') {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }
    const parsed = z.object({
      current_password: z.string().min(1).max(200),
      new_password: passwordSchema,
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: PASSWORD_POLICY_MESSAGE });

    const user = await User.findByPk(req.user.id);
    if (!user || !(await bcrypt.compare(parsed.data.current_password, user.password_hash))) {
      return res.status(400).json({ success: false, error: 'Senha atual inválida.' });
    }
    if (await bcrypt.compare(parsed.data.new_password, user.password_hash)) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ser diferente da senha atual.' });
    }
    await user.update({
      password_hash: await bcrypt.hash(parsed.data.new_password, 12),
      must_change_password: false,
    });
    return res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, error: 'Não foi possível alterar a senha.' });
  }
};

export const registerFace = async (req: Request, res: Response) => {
  try {
    const schema = z
      .object({
        userId: z.number().int().positive(),
        descriptor: z.array(z.number()).optional(),
        descriptors: z.array(z.array(z.number())).min(1).max(8).optional(),
        qualityScores: z.array(z.number().min(0).max(100)).max(8).optional(),
        replaceExisting: z.boolean().optional(),
      })
      .refine((value) => value.descriptor || value.descriptors?.length, {
        message: 'Informe ao menos uma amostra biométrica.',
      });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Dados inválidos para cadastro de face.' });
    }

    const { userId, descriptor, descriptors, qualityScores, replaceExisting = true } = parsed.data;
    const samples = descriptors?.length ? descriptors : descriptor ? [descriptor] : [];
    if (!samples.length) {
      return res.status(400).json({ success: false, error: 'Nenhuma amostra biométrica válida foi enviada.' });
    }

    const requester = (req as AuthRequest).user;
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    if (!user.requires_time_tracking) {
      return res.status(409).json({ success: false, error: 'Este usuário não está sujeito ao controle de ponto.' });
    }

    if (!requester) {
      return res.status(401).json({ success: false, error: 'Não autorizado.' });
    }

    if (requester.role === 'manager' && !await isManagerResponsibleForUser(requester.id, null, user, 'manage_biometrics')) {
      return res.status(403).json({ success: false, error: 'Você só pode registrar a biometria da sua própria equipe.' });
    }

    let existingSamples: number[][] = [];
    if (replaceExisting) {
      await BiometricSample.destroy({ where: { user_id: user.id } });
    } else {
      const rows = (await BiometricSample.findAll({
        where: { user_id: user.id },
        attributes: ['descriptor'],
        raw: true,
      })) as unknown as Array<{ descriptor: string }>;
      existingSamples = rows.flatMap((row) => {
        try {
          const parsed = JSON.parse(row.descriptor);
          return Array.isArray(parsed) && parsed.length ? [parsed as number[]] : [];
        } catch {
          return [];
        }
      });
    }

    const nextSampleIndex = replaceExisting ? 1 : (await BiometricSample.count({ where: { user_id: user.id } })) + 1;
    await BiometricSample.bulkCreate(
      samples.map((sample, index) => ({
        user_id: user.id,
        descriptor: JSON.stringify(sample),
        quality_score: qualityScores?.[index] ?? null,
        sample_index: nextSampleIndex + index,
        captured_by: requester.id,
      }))
    );

    // Keep the legacy average descriptor representative of the whole enrollment,
    // including samples added through the biometric reinforcement flow.
    user.facial_descriptor = JSON.stringify(averageDescriptors([...existingSamples, ...samples]));
    await user.save();

    await registerBiometricEvent({
      userId: user.id,
      eventType: 'enrollment',
      method: 'facial',
      success: true,
      triggeredBy: requester.id,
      metadata: {
        sampleCount: samples.length,
        replaceExisting,
      },
    });

    res.json({
      success: true,
      message: samples.length > 1 ? 'Biometria facial registrada com múltiplas amostras.' : 'Face registrada com sucesso.',
      data: {
        sampleCount: await BiometricSample.count({ where: { user_id: user.id } }),
      },
    });
  } catch (error) {
    console.error('Face register error:', error);
    res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const resetFace = async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      userId: z.number().int().positive(),
      reason: z.string().trim().min(3).max(255).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Dados inválidos para reset biométrico.' });
    }

    const requester = (req as AuthRequest).user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Não autorizado.' });
    }

    const { userId, reason } = parsed.data;
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    if (requester.role === 'manager' && !await isManagerResponsibleForUser(requester.id, null, user, 'manage_biometrics')) {
      return res.status(403).json({ success: false, error: 'Você só pode resetar a biometria da sua própria equipe.' });
    }

    const previousSampleCount = await BiometricSample.count({ where: { user_id: user.id } });
    await BiometricSample.destroy({ where: { user_id: user.id } });
    user.facial_descriptor = null;
    await user.save();

    await registerBiometricEvent({
      userId: user.id,
      eventType: 'reset',
      method: 'manual',
      success: true,
      triggeredBy: requester.id,
      reason: reason ?? 'Recadastro biométrico solicitado.',
      metadata: {
        previousSampleCount,
      },
    });

    return res.json({
      success: true,
      message: 'Biometria facial removida com sucesso. O colaborador já pode realizar novo cadastro.',
    });
  } catch (error) {
    console.error('Face reset error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno ao resetar a biometria facial.' });
  }
};

export const getFaces = async (req: Request, res: Response) => {
  try {
    const requester = (req as AuthRequest).user;
    if (!requester) {
      return res.status(401).json({ success: false, error: 'Não autorizado.' });
    }

    const where = { ...await getManagedUsersWhere(requester, 'manage_biometrics'), requires_time_tracking: true };

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'facial_descriptor', 'registration_number']
    });

    const sampleStatsMap = await buildSampleStatsMap(users.map((user) => user.id));
    const [sampleRows, todayRecords] = await Promise.all([
      BiometricSample.findAll({
      where: { user_id: { [Op.in]: users.map((user) => user.id) } },
      attributes: ['user_id', 'descriptor', 'sample_index'],
      order: [['user_id', 'ASC'], ['sample_index', 'ASC'], ['created_at', 'ASC']],
      raw: true,
      }) as unknown as Promise<Array<{ user_id: number; descriptor: string; sample_index: number }>>,
      TimeRecord.findAll({
        where: {
          user_id: { [Op.in]: users.map((user) => user.id) },
          status: { [Op.ne]: 'rejected' },
          record_time: { [Op.between]: [getTodayBounds().start, getTodayBounds().end] },
        },
        attributes: ['user_id', 'record_type'],
        order: [['record_time', 'ASC']],
        raw: true,
      }) as unknown as Promise<Array<{ user_id: number; record_type: string }>>,
    ]);

    const todayRecordTypesMap = new Map<number, string[]>();
    for (const record of todayRecords) {
      const existing = todayRecordTypesMap.get(Number(record.user_id)) ?? [];
      existing.push(record.record_type);
      todayRecordTypesMap.set(Number(record.user_id), existing);
    }

    const sampleDescriptorsMap = new Map<number, number[][]>();
    for (const row of sampleRows) {
      try {
        const parsedDescriptor = JSON.parse(row.descriptor);
        if (!Array.isArray(parsedDescriptor) || !parsedDescriptor.length) continue;
        const existing = sampleDescriptorsMap.get(Number(row.user_id)) ?? [];
        existing.push(parsedDescriptor);
        sampleDescriptorsMap.set(Number(row.user_id), existing);
      } catch (error) {
        console.error('Biometric sample parse error:', error);
      }
    }

    const faces = users
      .filter(u => u.facial_descriptor)
      .map(u => ({
        id: u.id,
        name: u.name,
        registration_number: u.registration_number,
        descriptor: JSON.parse(u.facial_descriptor!),
        sampleDescriptors: sampleDescriptorsMap.get(u.id) ?? [],
        sampleCount: sampleStatsMap.get(u.id)?.sampleCount ?? sampleDescriptorsMap.get(u.id)?.length ?? 1,
        biometricUpdatedAt: sampleStatsMap.get(u.id)?.lastSampleAt ?? null,
        suggestedRecordType: getSuggestedKioskRecordType(todayRecordTypesMap.get(u.id) ?? []),
      }));

    res.json({ success: true, data: faces });
  } catch (error) {
    console.error('Get faces error:', error);
    res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const getBiometricSummary = async (req: Request, res: Response) => {
  try {
    const requester = (req as AuthRequest).user;
    if (!requester || (requester.role !== 'admin' && requester.role !== 'manager')) {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }

    const users = await User.findAll({
      where: { ...await getManagedUsersWhere(requester, 'manage_biometrics'), requires_time_tracking: true },
      attributes: ['id', 'name', 'facial_descriptor'],
    });
    const userIds = users.map((user) => user.id);
    if (!userIds.length) {
      return res.json({
        success: true,
        data: {
          totalUsers: 0,
          usersWithBiometrics: 0,
          usersWithoutBiometrics: 0,
          usersWithLowCoverage: 0,
          totalSamples: 0,
          recommendedSampleCount: MIN_RECOMMENDED_FACE_SAMPLES,
          recentEnrollments: 0,
          recentVerifications: 0,
          recentResets: 0,
          pinFallbacks: 0,
          sampleCoverageRate: 0,
        },
      });
    }

    const sampleStatsMap = await buildSampleStatsMap(userIds);
    const since = new Date(Date.now() - BIOMETRIC_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const usersWithBiometrics = users.filter((user) => Boolean(user.facial_descriptor)).length;
    const usersWithoutBiometrics = users.length - usersWithBiometrics;
    const usersWithLowCoverage = users.filter((user) => {
      if (!user.facial_descriptor) return false;
      const sampleCount = sampleStatsMap.get(user.id)?.sampleCount ?? 1;
      return sampleCount < MIN_RECOMMENDED_FACE_SAMPLES;
    }).length;

    const [totalSamples, recentEvents] = await Promise.all([
      BiometricSample.count({ where: { user_id: { [Op.in]: userIds } } }),
      BiometricEvent.findAll({
        where: { user_id: { [Op.in]: userIds }, created_at: { [Op.gte]: since } },
        attributes: ['event_type', 'method', 'reason', 'device_info', 'metadata', 'success'],
        order: [['created_at', 'DESC']],
        raw: true,
      }) as unknown as Promise<
        Array<{
          event_type: 'enrollment' | 'verification_success' | 'verification_failure' | 'pin_fallback' | 'reset';
          method: 'facial' | 'pin' | 'manual' | 'web';
          reason: string | null;
          device_info: string | null;
          metadata: string | null;
          success: boolean;
        }>
      >,
    ]);

    const topReasons = new Map<string, number>();
    const deviceBreakdown = new Map<string, { successCount: number; failureCount: number; pinFallbackCount: number }>();
    let recentEnrollments = 0;
    let recentVerifications = 0;
    let recentVerificationFailures = 0;
    let recentResets = 0;
    let pinFallbacks = 0;
    let invalidPinAttempts = 0;
    let rateLimitedPinAttempts = 0;
    let lowConfidenceRejections = 0;

    for (const event of recentEvents) {
      if (event.event_type === 'enrollment') recentEnrollments += 1;
      if (event.event_type === 'verification_success') recentVerifications += 1;
      if (event.event_type === 'verification_failure') recentVerificationFailures += 1;
      if (event.event_type === 'reset') recentResets += 1;
      if (event.event_type === 'pin_fallback') pinFallbacks += 1;

      if (event.reason === 'pin_invalid') invalidPinAttempts += 1;
      if (event.reason === 'pin_rate_limited') rateLimitedPinAttempts += 1;
      if (event.reason === 'biometric_score_below_threshold') lowConfidenceRejections += 1;

      if (event.reason && event.event_type === 'verification_failure') {
        topReasons.set(event.reason, (topReasons.get(event.reason) ?? 0) + 1);
      }

      const deviceLabel = getDeviceLabel(event.device_info);
      const currentDevice = deviceBreakdown.get(deviceLabel) ?? {
        successCount: 0,
        failureCount: 0,
        pinFallbackCount: 0,
      };
      if (event.event_type === 'verification_success') currentDevice.successCount += 1;
      if (event.event_type === 'verification_failure') currentDevice.failureCount += 1;
      if (event.event_type === 'pin_fallback') currentDevice.pinFallbackCount += 1;
      deviceBreakdown.set(deviceLabel, currentDevice);
    }

    return res.json({
      success: true,
      data: {
        totalUsers: users.length,
        usersWithBiometrics,
        usersWithoutBiometrics,
        usersWithLowCoverage,
        totalSamples,
        recommendedSampleCount: MIN_RECOMMENDED_FACE_SAMPLES,
        recentEnrollments,
        recentVerifications,
        recentVerificationFailures,
        recentResets,
        pinFallbacks,
        invalidPinAttempts,
        rateLimitedPinAttempts,
        lowConfidenceRejections,
        sampleCoverageRate: users.length ? Number(((usersWithBiometrics / users.length) * 100).toFixed(1)) : 0,
        topFailureReasons: Array.from(topReasons.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([reason, count]) => ({ reason, count })),
        deviceBreakdown: Array.from(deviceBreakdown.entries())
          .map(([deviceLabel, metrics]) => ({
            deviceLabel,
            ...metrics,
          }))
          .sort((a, b) => (b.failureCount + b.pinFallbackCount + b.successCount) - (a.failureCount + a.pinFallbackCount + a.successCount))
          .slice(0, 5),
      },
    });
  } catch (error) {
    console.error('Biometric summary error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar o resumo biométrico.' });
  }
};

export const getBiometricHistory = async (req: Request, res: Response) => {
  try {
    const requester = (req as AuthRequest).user;
    if (!requester || (requester.role !== 'admin' && requester.role !== 'manager')) {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }

    const users = await User.findAll({
      where: { ...await getManagedUsersWhere(requester, 'manage_biometrics'), requires_time_tracking: true },
      attributes: ['id'],
    });
    const userIds = users.map((user) => user.id);
    if (!userIds.length) {
      return res.json({ success: true, data: [] });
    }

    const events = await BiometricEvent.findAll({
      where: { user_id: { [Op.in]: userIds } },
      include: [
        { model: User, attributes: ['id', 'name', 'registration_number'] },
        { model: User, as: 'triggeredByUser', attributes: ['id', 'name'], required: false },
      ],
      order: [['created_at', 'DESC']],
      limit: 30,
    });

    return res.json({
      success: true,
      data: events.map((event) => {
        const serialized = event.toJSON() as Record<string, unknown> & { metadata?: string | null };
        return {
          ...serialized,
          parsedMetadata: parseEventMetadata(typeof serialized.metadata === 'string' ? serialized.metadata : null),
        };
      }),
    });
  } catch (error) {
    console.error('Biometric history error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar o histórico biométrico.' });
  }
};

export const kioskLogin = async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      accessKey: z.string().trim().min(12).max(200),
      companySlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Chave do terminal inválida.' });
    }

    const company = await Company.findOne({
      where: {
        kiosk_access_key_fingerprint: fingerprintKioskKey(parsed.data.accessKey),
        status: 'active',
        ...(parsed.data.companySlug ? { slug: parsed.data.companySlug } : {}),
      },
    });
    if (!company?.kiosk_access_key_hash || !(await bcrypt.compare(parsed.data.accessKey, company.kiosk_access_key_hash))) {
      return res.status(401).json({ success: false, error: 'Chave de acesso do terminal inválida.' });
    }

    const control = await runWithTenant(company.id, getKioskControl);
    if (!control.terminal_enabled) {
      return res.status(403).json({
        success: false,
        error: 'O terminal está bloqueado. Faça a liberação primeiro nas configurações administrativas.',
      });
    }

    const token = jwt.sign(
      { id: 0, role: 'kiosk', scope: 'kiosk', companyId: company.id, kioskVersion: control.session_version },
      getJwtSecret(),
      { expiresIn: getKioskTokenTtl() as SignOptions['expiresIn'] }
    );

    return res.json({
      success: true,
      data: {
        token,
        mode: 'kiosk',
        company: {
          id: company.id,
          slug: company.slug,
          name: company.trade_name || company.legal_name,
        },
      },
    });
  } catch (error) {
    console.error('Kiosk login error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const getKioskCompany = async (req: Request, res: Response) => {
  try {
    const parsed = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).safeParse(req.params.companySlug);
    if (!parsed.success) {
      return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
    }

    const company = await Company.findOne({
      where: { slug: parsed.data, status: 'active' },
      attributes: ['id', 'slug', 'legal_name', 'trade_name'],
    });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Empresa não encontrada ou indisponível.' });
    }

    return res.json({
      success: true,
      data: { id: company.id, slug: company.slug, name: company.trade_name || company.legal_name },
    });
  } catch (error) {
    console.error('Kiosk company lookup error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao identificar a empresa.' });
  }
};

export const getKioskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(403).json({ success: false, error: 'Terminal sem contexto de empresa.' });
    const [control, company] = await Promise.all([
      getKioskControl(),
      Company.findByPk(companyId, { attributes: ['id', 'slug', 'legal_name', 'trade_name'] }),
    ]);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
    return res.json({
      success: true,
      data: {
        terminalEnabled: control.terminal_enabled,
        sessionVersion: control.session_version,
        lastRevokedAt: control.last_revoked_at,
        releasedAt: control.released_at,
        company: {
          id: company.id,
          slug: company.slug,
          name: company.trade_name || company.legal_name,
        },
      },
    });
  } catch (error) {
    console.error('Kiosk status error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar o status do terminal.' });
  }
};

export const releaseKioskSession = async (req: Request, res: Response) => {
  try {
    const control = await getKioskControl();
    control.terminal_enabled = true;
    control.released_at = new Date();
    await control.save();

    return res.json({
      success: true,
      message: 'Terminal liberado com sucesso pelo administrador.',
      data: {
        terminalEnabled: control.terminal_enabled,
        sessionVersion: control.session_version,
        releasedAt: control.released_at,
      },
    });
  } catch (error) {
    console.error('Kiosk release error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao liberar o terminal.' });
  }
};

export const revokeKioskSession = async (req: Request, res: Response) => {
  try {
    const control = await getKioskControl();
    control.session_version += 1;
    control.terminal_enabled = false;
    control.last_revoked_at = new Date();
    control.released_at = null;
    await control.save();

    return res.json({
      success: true,
      message: 'Sessão do terminal encerrada com sucesso pelo administrador.',
      data: {
        terminalEnabled: control.terminal_enabled,
        sessionVersion: control.session_version,
        lastRevokedAt: control.last_revoked_at,
      },
    });
  } catch (error) {
    console.error('Kiosk revoke error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao encerrar a sessão do terminal.' });
  }
};
