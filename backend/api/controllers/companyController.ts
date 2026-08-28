import { Response } from 'express';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { Company, CompanyProfile, KioskControl, User } from '../models/index.js';
import { sequelize } from '../config/database.js';
import { fingerprintKioskKey } from '../utils/kioskKey.js';
import { AuditService } from '../services/AuditService.js';

const companySchema = z.object({
  legal_name: z.string().trim().min(2),
  trade_name: z.string().trim().max(255).optional().nullable(),
  cnpj: z.string().trim().max(18).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(30).optional().nullable(),
  address_line: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  zip_code: z.string().trim().max(20).optional().nullable(),
  night_shift_start: z.string().regex(/^\d{2}:\d{2}$/),
  night_shift_end: z.string().regex(/^\d{2}:\d{2}$/),
  late_tolerance_minutes: z.number().int().min(0).max(180),
  lunch_tolerance_minutes: z.number().int().min(0).max(180),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  allowed_radius: z.number().int().min(0).nullable().optional(),
  block_outside_area: z.boolean().default(false),
});

const ensureCompanyProfile = async () => {
  const existing = await CompanyProfile.findOne();
  if (existing) return existing;
  return CompanyProfile.create({
    legal_name: 'Empresa não configurada',
    night_shift_start: '22:00',
    night_shift_end: '05:00',
    late_tolerance_minutes: 5,
    lunch_tolerance_minutes: 10,
  });
};

export const getCompanyProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito à administração.' });
    }

    const profile = await ensureCompanyProfile();
    return res.json({ success: true, data: profile });
  } catch (error) {
    console.error('Get company profile error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar os dados da empresa.' });
  }
};

export const updateCompanyProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Somente administradores podem editar a empresa.' });
    }

    const payload = companySchema.parse(req.body);
    const profile = await ensureCompanyProfile();
    Object.assign(profile, {
      legal_name: payload.legal_name,
      trade_name: payload.trade_name || null,
      cnpj: payload.cnpj || null,
      email: payload.email || null,
      phone: payload.phone || null,
      address_line: payload.address_line || null,
      city: payload.city || null,
      state: payload.state || null,
      zip_code: payload.zip_code || null,
      night_shift_start: payload.night_shift_start,
      night_shift_end: payload.night_shift_end,
      late_tolerance_minutes: payload.late_tolerance_minutes,
      lunch_tolerance_minutes: payload.lunch_tolerance_minutes,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      allowed_radius: payload.allowed_radius ?? null,
      block_outside_area: payload.block_outside_area ?? false,
    });
    await profile.save();
    await Company.update(
      { legal_name: payload.legal_name, trade_name: payload.trade_name || null, cnpj: payload.cnpj || null },
      { where: { id: req.user.companyId } }
    );

    return res.json({ success: true, data: profile, message: 'Dados da empresa atualizados.' });
  } catch (error) {
    console.error('Update company profile error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar os dados da empresa.' });
  }
};

export const rotateKioskAccessKey = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin' || !req.user.companyId) {
      return res.status(403).json({ success: false, error: 'Somente administradores podem alterar a chave do quiosque.' });
    }
    const parsed = z.object({
      current_password: z.string().min(1).max(200),
      new_key: z.string().trim().min(12).max(200),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Informe sua senha e uma nova chave com pelo menos 12 caracteres.' });
    }

    const admin = await User.findByPk(req.user.id);
    if (!admin || !(await bcrypt.compare(parsed.data.current_password, admin.password_hash))) {
      return res.status(400).json({ success: false, error: 'Senha do administrador inválida.' });
    }

    const fingerprint = fingerprintKioskKey(parsed.data.new_key);
    const duplicate = await Company.findOne({
      where: { kiosk_access_key_fingerprint: fingerprint, id: { [Op.ne]: req.user.companyId } },
    });
    if (duplicate) return res.status(409).json({ success: false, error: 'Esta chave já está vinculada a outra empresa.' });

    await sequelize.transaction(async (transaction) => {
      const company = await Company.findByPk(req.user!.companyId!, { transaction });
      if (!company) throw new Error('Empresa não encontrada.');
      await company.update({
        kiosk_access_key_hash: await bcrypt.hash(parsed.data.new_key, 12),
        kiosk_access_key_fingerprint: fingerprint,
      }, { transaction });

      const control = await KioskControl.findOne({ transaction });
      if (control) {
        await control.update({
          session_version: control.session_version + 1,
          terminal_enabled: false,
          last_revoked_at: new Date(),
          released_at: null,
        }, { transaction });
      }
    });

    await AuditService.log({
      user_id: req.user.id,
      action: 'ROTATE_KIOSK_ACCESS_KEY',
      entity_name: 'companies',
      entity_id: req.user.companyId,
      new_value: { kiosk_sessions_revoked: true },
    }, req);

    return res.json({ success: true, message: 'Chave alterada e sessões anteriores do quiosque revogadas.' });
  } catch (error) {
    console.error('Rotate kiosk key error:', error);
    return res.status(500).json({ success: false, error: 'Não foi possível alterar a chave do quiosque.' });
  }
};
