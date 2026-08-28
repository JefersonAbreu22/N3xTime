import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { syncDatabase } from '../models/index.js';
import { User } from '../models/User.js';
import { Company } from '../models/Company.js';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { KioskControl } from '../models/KioskControl.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { fingerprintKioskKey } from '../utils/kioskKey.js';

dotenv.config();

const run = async () => {
  await syncDatabase();

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrador';
  const cpf = process.env.ADMIN_CPF;
  const registrationNumber = process.env.ADMIN_REGISTRATION_NUMBER;
  const companyLegalName = process.env.COMPANY_LEGAL_NAME || 'Empresa inicial';
  const companyTradeName = process.env.COMPANY_TRADE_NAME || null;
  const companySlug = (process.env.COMPANY_SLUG || 'empresa-inicial').trim().toLowerCase();
  const kioskAccessKey = process.env.KIOSK_ACCESS_KEY;

  if (!email || !password || !cpf || !registrationNumber || !kioskAccessKey) {
    throw new Error('Defina KIOSK_ACCESS_KEY e os dados ADMIN_* no .env');
  }

  const [company] = await Company.findOrCreate({
    where: { slug: companySlug },
    defaults: {
      legal_name: companyLegalName,
      trade_name: companyTradeName,
      status: 'active',
      kiosk_access_key_hash: await bcrypt.hash(kioskAccessKey, 12),
      kiosk_access_key_fingerprint: fingerprintKioskKey(kioskAccessKey),
    },
  });

  if (!company.kiosk_access_key_fingerprint) {
    await company.update({
      kiosk_access_key_hash: await bcrypt.hash(kioskAccessKey, 12),
      kiosk_access_key_fingerprint: fingerprintKioskKey(kioskAccessKey),
    });
  }

  const existing = await runWithTenant(company.id, () => User.findOne({ where: { email } }));
  if (existing) {
    console.log('Admin da empresa já existe.');
    return;
  }

  await runWithTenant(company.id, async () => {
    await CompanyProfile.findOrCreate({
      where: {},
      defaults: { legal_name: companyLegalName, trade_name: companyTradeName },
    });
    await KioskControl.findOrCreate({
      where: {},
      defaults: { session_version: 1, terminal_enabled: false },
    });
    await User.create({
      name,
      cpf,
      registration_number: registrationNumber,
      email,
      password_hash: await bcrypt.hash(password, 12),
      role: 'admin',
      work_type: 'presential',
      department_id: null,
      manager_id: null,
      schedule_id: null,
      pin_code: null,
      status: 'active',
    });
  });

  console.log(`Empresa ${companySlug} e admin criados com sucesso.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
