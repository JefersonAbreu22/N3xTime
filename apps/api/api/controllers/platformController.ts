import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../config/database.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { Company, CompanyProfile, KioskControl, PlatformAuditLog, PlatformUser, User } from '../models/index.js';
import { runWithTenant, runWithoutTenant } from '../tenancy/tenantContext.js';
import { passwordSchema } from '../validation/passwordPolicy.js';
import { fingerprintKioskKey } from '../utils/kioskKey.js';
import { getJwtSecret } from '../config/security.js';

const createPlatformSession = (user: PlatformUser) => ({
  token: jwt.sign(
    { id: user.id, role: 'platform_admin', scope: 'platform' },
    getJwtSecret(),
    { expiresIn: '8h' }
  ),
  user: { id: user.id, name: user.name, email: user.email, role: 'platform_admin' as const },
});

const getPrimaryCompany = (transaction?: Transaction) => Company.findOne({
  attributes: ['id', 'status'],
  order: [['created_at', 'ASC'], ['id', 'ASC']],
  transaction,
});

const slugSchema = z.string().trim().min(2).max(80)
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'Slug inválido.');

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();

const provisionCompanySchema = z.object({
  legal_name: z.string().trim().min(2).max(255),
  trade_name: nullableText(255),
  slug: slugSchema,
  cnpj: nullableText(18),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal('')),
  phone: nullableText(30),
  address_line: nullableText(255),
  city: nullableText(120),
  state: nullableText(80),
  zip_code: nullableText(20),
  admin: z.object({
    name: z.string().trim().min(2).max(255),
    email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    password: passwordSchema,
    cpf: z.string().trim().min(11).max(14),
    registration_number: z.string().trim().min(1).max(50),
  }),
  kiosk_access_key: z.string().trim().min(12).max(200),
});

const writePlatformAudit = async (
  req: AuthRequest,
  action: string,
  companyId: number | null,
  metadata: Record<string, unknown> | null,
  transaction?: Transaction
) => PlatformAuditLog.create({
  platform_user_id: req.user!.id,
  company_id: companyId,
  action,
  metadata,
  ip_address: req.ip || null,
}, { transaction });

export const bootstrapPlatformSession = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.scope === 'platform' && req.user.role === 'platform_admin') {
      const platformUser = await PlatformUser.findOne({ where: { id: req.user.id, status: 'active' } });
      if (!platformUser) {
        return res.status(403).json({ success: false, error: 'Administrador global inativo.' });
      }
      return res.json({ success: true, data: createPlatformSession(platformUser) });
    }

    if (!req.user || req.user.scope !== 'tenant' || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acesso global não autorizado.' });
    }

    const tenantUser = await User.findOne({
      where: { id: req.user.id, status: 'active' },
      attributes: ['email'],
    });
    if (!tenantUser) {
      return res.status(403).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const platformUser = await PlatformUser.findOne({
      where: { email: tenantUser.email.toLowerCase(), status: 'active' },
    });
    if (!platformUser) {
      return res.status(403).json({ success: false, error: 'Este usuário não possui acesso global.' });
    }

    return res.json({ success: true, data: createPlatformSession(platformUser) });
  } catch (error) {
    console.error('Bootstrap platform session error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
  }
};

export const listCompanies = async (_req: AuthRequest, res: Response) => {
  try {
    const [companies, primaryCompany, userCounts] = await Promise.all([
      Company.findAll({ order: [['created_at', 'DESC'], ['id', 'DESC']] }),
      getPrimaryCompany(),
      runWithoutTenant(() => User.findAll({
        attributes: ['company_id', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        group: ['company_id'],
        raw: true,
      })) as unknown as Promise<Array<{ company_id: number; total: string | number }>>,
    ]);
    const countMap = new Map(userCounts.map((row) => [Number(row.company_id), Number(row.total)]));

    return res.json({
      success: true,
      data: companies.map((company) => ({
        id: company.id,
        legal_name: company.legal_name,
        trade_name: company.trade_name,
        slug: company.slug,
        cnpj: company.cnpj,
        status: company.status,
        users_count: countMap.get(company.id) ?? 0,
        is_primary: company.id === primaryCompany?.id,
        created_at: company.created_at,
      })),
    });
  } catch (error) {
    console.error('List platform companies error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao listar empresas.' });
  }
};

export const accessCompany = async (req: AuthRequest, res: Response) => {
  try {
    const companyId = Number(req.params.id);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({ success: false, error: 'Empresa inválida.' });
    }

    const company = await Company.findOne({ where: { id: companyId, status: 'active' } });
    if (!company) return res.status(404).json({ success: false, error: 'Empresa ativa não encontrada.' });

    const admin = await runWithTenant(company.id, () => User.findOne({
      where: { role: 'admin', status: 'active' },
      order: [['created_at', 'ASC']],
    }));
    if (!admin) return res.status(409).json({ success: false, error: 'A empresa não possui um administrador ativo.' });

    const token = jwt.sign(
      { id: admin.id, role: 'admin', scope: 'tenant', companyId: company.id, impersonatedBy: req.user!.id },
      getJwtSecret(),
      { expiresIn: '1h' }
    );

    await writePlatformAudit(req, 'company.accessed', company.id, {
      tenant_admin_id: admin.id,
      tenant_admin_email: admin.email,
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: 'admin',
          company: { id: company.id, slug: company.slug, name: company.trade_name || company.legal_name },
          remote_clock_in_enabled: admin.remote_clock_in_enabled,
          requires_time_tracking: admin.requires_time_tracking,
          must_change_password: false,
          is_platform_admin: true,
          is_impersonating: true,
        },
      },
    });
  } catch (error) {
    console.error('Platform company access error:', error);
    return res.status(500).json({ success: false, error: 'Não foi possível acessar o ambiente da empresa.' });
  }
};

export const getGlobalSnapshot = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      companyId: z.coerce.number().int().positive().optional(),
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Filtro de empresa inválido.' });

    const companyId = parsed.data.companyId ?? 0;
    if (companyId) {
      const company = await Company.findByPk(companyId, { attributes: ['id'] });
      if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
    }

    const replacements = { companyId };
    const [companies, companyBreakdown, collaborators, pendingRequests, emailFailures, reportBreakdown] = await Promise.all([
      Company.findAll({ attributes: ['id', 'legal_name', 'trade_name', 'slug', 'status'], order: [['legal_name', 'ASC']], raw: true }),
      sequelize.query(`
        SELECT c.id, c.legal_name, c.trade_name, c.slug, c.status,
          COALESCE(u.total, 0) AS collaborators,
          COALESCE(t.today_total, 0) AS records_today,
          COALESCE(t.month_total, 0) AS records_month,
          COALESCE(r.pending_total, 0) AS pending_requests,
          COALESCE(e.failure_total, 0) AS email_failures
        FROM companies c
        LEFT JOIN (
          SELECT company_id, COUNT(*) AS total FROM users WHERE status = 'active' AND requires_time_tracking = TRUE GROUP BY company_id
        ) u ON u.company_id = c.id
        LEFT JOIN (
          SELECT company_id,
            SUM(DATE(record_time) = CURDATE()) AS today_total,
            SUM(record_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS month_total
          FROM time_records GROUP BY company_id
        ) t ON t.company_id = c.id
        LEFT JOIN (
          SELECT company_id, COUNT(*) AS pending_total FROM employee_requests WHERE status = 'pending' GROUP BY company_id
        ) r ON r.company_id = c.id
        LEFT JOIN (
          SELECT company_id, COUNT(*) AS failure_total FROM email_delivery_failures GROUP BY company_id
        ) e ON e.company_id = c.id
        WHERE (:companyId = 0 OR c.id = :companyId)
        ORDER BY c.legal_name ASC
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT u.id, u.name, u.email, u.registration_number, u.role, u.work_type, u.status, u.requires_time_tracking,
          c.id AS company_id, COALESCE(c.trade_name, c.legal_name) AS company_name,
          COALESCE(d.name, 'Sem setor') AS department_name
        FROM users u
        INNER JOIN companies c ON c.id = u.company_id
        LEFT JOIN departments d ON d.id = u.department_id AND d.company_id = u.company_id
        WHERE (:companyId = 0 OR c.id = :companyId)
        ORDER BY c.legal_name, u.name
        LIMIT 500
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT r.id, r.request_type, r.status, r.target_date, r.reason, r.created_at,
          u.name AS user_name, u.registration_number,
          c.id AS company_id, COALESCE(c.trade_name, c.legal_name) AS company_name
        FROM employee_requests r
        INNER JOIN users u ON u.id = r.user_id AND u.company_id = r.company_id
        INNER JOIN companies c ON c.id = r.company_id
        WHERE r.status = 'pending' AND (:companyId = 0 OR c.id = :companyId)
        ORDER BY r.created_at DESC
        LIMIT 300
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT f.id, f.recipient, f.error_message, f.smtp_code, f.attempted_at,
          u.name AS user_name, tr.record_type, tr.record_time,
          c.id AS company_id, COALESCE(c.trade_name, c.legal_name) AS company_name
        FROM email_delivery_failures f
        INNER JOIN users u ON u.id = f.user_id AND u.company_id = f.company_id
        INNER JOIN time_records tr ON tr.id = f.record_id AND tr.company_id = f.company_id
        INNER JOIN companies c ON c.id = f.company_id
        WHERE (:companyId = 0 OR c.id = :companyId)
        ORDER BY f.attempted_at DESC
        LIMIT 300
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT c.id AS company_id, COALESCE(c.trade_name, c.legal_name) AS company_name,
          tr.record_type, tr.status, tr.method, COUNT(*) AS total
        FROM time_records tr
        INNER JOIN companies c ON c.id = tr.company_id
        WHERE tr.record_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND (:companyId = 0 OR c.id = :companyId)
        GROUP BY c.id, c.trade_name, c.legal_name, tr.record_type, tr.status, tr.method
        ORDER BY c.legal_name, total DESC
      `, { replacements, type: QueryTypes.SELECT }),
    ]);

    const breakdown = companyBreakdown as Array<Record<string, unknown>>;
    const sum = (field: string) => breakdown.reduce((total, row) => total + Number(row[field] || 0), 0);
    return res.json({
      success: true,
      data: {
        scope: { companyId: companyId || null },
        companies,
        metrics: {
          companies: breakdown.length,
          collaborators: sum('collaborators'),
          recordsToday: sum('records_today'),
          recordsMonth: sum('records_month'),
          pendingRequests: sum('pending_requests'),
          emailFailures: sum('email_failures'),
        },
        companyBreakdown,
        collaborators,
        pendingRequests,
        emailFailures,
        reportBreakdown,
      },
    });
  } catch (error) {
    console.error('Global platform snapshot error:', error);
    return res.status(500).json({ success: false, error: 'Não foi possível carregar a visão global.' });
  }
};

export const provisionCompany = async (req: AuthRequest, res: Response) => {
  const parsed = provisionCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    const validationError = (parsed as z.SafeParseError<unknown>).error;
    return res.status(400).json({ success: false, error: validationError.issues[0]?.message || 'Dados inválidos.' });
  }

  try {
    const payload = parsed.data;
    const kioskKeyFingerprint = fingerprintKioskKey(payload.kiosk_access_key);
    const existingKioskKey = await Company.findOne({ where: { kiosk_access_key_fingerprint: kioskKeyFingerprint } });
    if (existingKioskKey) {
      return res.status(409).json({ success: false, error: 'A chave do quiosque já está vinculada a outra empresa.' });
    }
    const duplicate = await Company.findOne({
      where: {
        [Op.or]: [
          { slug: payload.slug },
          ...(payload.cnpj ? [{ cnpj: payload.cnpj }] : []),
        ],
      },
    });
    if (duplicate) return res.status(409).json({ success: false, error: 'Slug ou CNPJ já cadastrado.' });

    const company = await sequelize.transaction(async (transaction) => {
      const createdCompany = await Company.create({
        legal_name: payload.legal_name,
        trade_name: payload.trade_name || null,
        slug: payload.slug,
        cnpj: payload.cnpj || null,
        status: 'active',
        kiosk_access_key_hash: await bcrypt.hash(payload.kiosk_access_key, 12),
        kiosk_access_key_fingerprint: kioskKeyFingerprint,
      }, { transaction });

      await runWithTenant(createdCompany.id, async () => {
        await CompanyProfile.create({
          legal_name: payload.legal_name,
          trade_name: payload.trade_name || null,
          cnpj: payload.cnpj || null,
          email: payload.email || null,
          phone: payload.phone || null,
          address_line: payload.address_line || null,
          city: payload.city || null,
          state: payload.state || null,
          zip_code: payload.zip_code || null,
        }, { transaction });
        await KioskControl.create({ session_version: 1, terminal_enabled: false }, { transaction });
        await User.create({
          name: payload.admin.name,
          cpf: payload.admin.cpf,
          registration_number: payload.admin.registration_number,
          email: payload.admin.email,
          password_hash: await bcrypt.hash(payload.admin.password, 12),
          role: 'admin',
          work_type: 'presential',
          status: 'active',
          must_change_password: true,
        }, { transaction });
      });

      await writePlatformAudit(req, 'company.provisioned', createdCompany.id, {
        slug: createdCompany.slug,
        admin_email: payload.admin.email,
      }, transaction);
      return createdCompany;
    });

    return res.status(201).json({
      success: true,
      message: 'Empresa e administrador provisionados com sucesso.',
      data: { id: company.id, slug: company.slug, status: company.status },
    });
  } catch (error) {
    console.error('Provision company error:', error);
    return res.status(500).json({ success: false, error: 'Não foi possível provisionar a empresa.' });
  }
};

export const updateCompanyStatus = async (req: AuthRequest, res: Response) => {
  try {
    const companyId = Number(req.params.id);
    const parsed = z.object({ status: z.enum(['active', 'inactive', 'suspended']), reason: z.string().trim().min(3).max(500) }).safeParse(req.body);
    if (!Number.isInteger(companyId) || companyId <= 0 || !parsed.success) {
      return res.status(400).json({ success: false, error: 'Empresa, status ou motivo inválido.' });
    }
    const company = await Company.findByPk(companyId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

    const primaryCompany = await getPrimaryCompany();
    if (company.id === primaryCompany?.id && parsed.data.status !== 'active') {
      return res.status(409).json({ success: false, error: 'A empresa principal da plataforma deve permanecer ativa e não pode ser suspensa.' });
    }

    await sequelize.transaction(async (transaction) => {
      await company.update({ status: parsed.data.status }, { transaction });
      if (parsed.data.status !== 'active') {
        await runWithTenant(company.id, async () => {
          const control = await KioskControl.findOne({ transaction });
          if (control) {
            await control.update({
              terminal_enabled: false,
              session_version: control.session_version + 1,
              last_revoked_at: new Date(),
              released_at: null,
            }, { transaction });
          }
        });
      }
      await writePlatformAudit(req, `company.${parsed.data.status}`, company.id, { reason: parsed.data.reason }, transaction);
    });

    return res.json({ success: true, data: { id: company.id, status: company.status } });
  } catch (error) {
    console.error('Update company status error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar o status da empresa.' });
  }
};

export const listPlatformLogs = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(10).max(100).default(50),
      companyId: z.coerce.number().int().positive().optional(),
      category: z.enum(['platform', 'audit', 'biometric', 'clock', 'request', 'email']).optional(),
      search: z.string().trim().max(120).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Filtros de logs inválidos.' });
    }

    const { page, limit, companyId, category, search, from, to } = parsed.data;
    const offset = (page - 1) * limit;
    const unionSql = `
      SELECT CONCAT('platform:', pal.id) AS id, pal.id AS source_id, 'platform' AS category,
        pal.action AS event, pal.company_id, COALESCE(c.trade_name, c.legal_name) AS company_name,
        pu.name AS actor_name, pu.email AS actor_email, NULL AS subject_name,
        pal.ip_address, NULL AS device_info, NULL AS success,
        CAST(pal.metadata AS CHAR) AS details, pal.created_at AS occurred_at
      FROM platform_audit_logs pal
      INNER JOIN platform_users pu ON pu.id = pal.platform_user_id
      LEFT JOIN companies c ON c.id = pal.company_id

      UNION ALL

      SELECT CONCAT('audit:', al.id), al.id, 'audit', al.action, al.company_id,
        COALESCE(c.trade_name, c.legal_name), u.name, u.email,
        CONCAT(al.entity_name, IF(al.entity_id IS NULL, '', CONCAT(' #', al.entity_id))),
        al.ip_address, al.device_info, NULL,
        JSON_OBJECT('entity', al.entity_name, 'entity_id', al.entity_id, 'old_value', al.old_value, 'new_value', al.new_value),
        al.created_at
      FROM audit_logs al
      LEFT JOIN companies c ON c.id = al.company_id
      LEFT JOIN users u ON u.id = al.user_id AND u.company_id = al.company_id

      UNION ALL

      SELECT CONCAT('biometric:', be.id), be.id, 'biometric', CONCAT('biometric.', be.event_type), be.company_id,
        COALESCE(c.trade_name, c.legal_name), COALESCE(triggered.name, subject.name),
        COALESCE(triggered.email, subject.email), subject.name, NULL, be.device_info, be.success,
        JSON_OBJECT('method', be.method, 'match_score', be.match_score, 'threshold', be.threshold, 'reason', be.reason, 'metadata', be.metadata),
        be.created_at
      FROM biometric_events be
      LEFT JOIN companies c ON c.id = be.company_id
      LEFT JOIN users subject ON subject.id = be.user_id AND subject.company_id = be.company_id
      LEFT JOIN users triggered ON triggered.id = be.triggered_by AND triggered.company_id = be.company_id

      UNION ALL

      SELECT CONCAT('clock:', tr.id), tr.id, 'clock', CONCAT('clock.', tr.record_type), tr.company_id,
        COALESCE(c.trade_name, c.legal_name), u.name, u.email, u.name, tr.ip_address, tr.device_info,
        IF(tr.status IN ('valid', 'adjusted'), 1, 0),
        JSON_OBJECT('record_time', tr.record_time, 'method', tr.method, 'status', tr.status, 'trust_level', tr.trust_level,
          'latitude', tr.latitude, 'longitude', tr.longitude, 'gps_accuracy', tr.gps_accuracy,
          'location_distance', tr.location_distance, 'location_status', tr.location_status,
          'reviewed_by', tr.reviewed_by, 'review_reason', tr.review_reason, 'reviewed_at', tr.reviewed_at),
        tr.created_at
      FROM time_records tr
      INNER JOIN companies c ON c.id = tr.company_id
      LEFT JOIN users u ON u.id = tr.user_id AND u.company_id = tr.company_id

      UNION ALL

      SELECT CONCAT('request:', er.id), er.id, 'request', CONCAT('request.', er.request_type, '.', er.status), er.company_id,
        COALESCE(c.trade_name, c.legal_name), COALESCE(reviewer.name, requester.name),
        COALESCE(reviewer.email, requester.email), requester.name, NULL, NULL,
        IF(er.status = 'approved', 1, IF(er.status = 'rejected', 0, NULL)),
        JSON_OBJECT('target_date', er.target_date, 'reason', er.reason, 'status', er.status,
          'requested_entry_time', er.requested_entry_time, 'requested_lunch_start', er.requested_lunch_start,
          'requested_lunch_end', er.requested_lunch_end, 'requested_exit_time', er.requested_exit_time,
          'attachment_name', er.attachment_name, 'admin_comment', er.admin_comment, 'reviewed_at', er.reviewed_at),
        er.created_at
      FROM employee_requests er
      INNER JOIN companies c ON c.id = er.company_id
      LEFT JOIN users requester ON requester.id = er.user_id AND requester.company_id = er.company_id
      LEFT JOIN users reviewer ON reviewer.id = er.reviewed_by AND reviewer.company_id = er.company_id

      UNION ALL

      SELECT CONCAT('email:', edl.id), edl.id, 'email', CONCAT('email.', edl.status), edl.company_id,
        COALESCE(c.trade_name, c.legal_name), u.name, u.email, edl.recipient, NULL, NULL,
        IF(edl.status = 'sent', 1, 0),
        JSON_OBJECT('record_id', edl.record_id, 'recipient', edl.recipient, 'smtp_code', edl.smtp_code,
          'message_id', edl.message_id, 'smtp_response', edl.smtp_response, 'error_message', edl.error_message),
        edl.attempted_at
      FROM email_delivery_logs edl
      INNER JOIN companies c ON c.id = edl.company_id
      LEFT JOIN users u ON u.id = edl.user_id AND u.company_id = edl.company_id
    `;
    const conditionParts = ['1 = 1'];
    if (companyId) conditionParts.push('activity.company_id = :companyId');
    if (category) conditionParts.push('activity.category = :category');
    if (search) conditionParts.push('(activity.event LIKE :searchLike OR activity.company_name LIKE :searchLike OR activity.actor_name LIKE :searchLike OR activity.actor_email LIKE :searchLike OR activity.subject_name LIKE :searchLike)');
    if (from) conditionParts.push('activity.occurred_at >= :fromDate');
    if (to) conditionParts.push('activity.occurred_at < DATE_ADD(:toDate, INTERVAL 1 DAY)');
    const conditions = conditionParts.join(' AND ');
    const replacements = {
      companyId: companyId ?? 0,
      category: category ?? '',
      search: search ?? '',
      searchLike: `%${search ?? ''}%`,
      fromDate: from ?? '',
      toDate: to ?? '',
      limit,
      offset,
    };

    const [items, countRows] = await Promise.all([
      sequelize.query(`SELECT * FROM (${unionSql}) activity WHERE ${conditions} ORDER BY occurred_at DESC LIMIT :limit OFFSET :offset`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
      sequelize.query<{ total: number | string }>(`SELECT COUNT(*) AS total FROM (${unionSql}) activity WHERE ${conditions}`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return res.json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  } catch (error) {
    console.error('List platform logs error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar os logs da plataforma.' });
  }
};
