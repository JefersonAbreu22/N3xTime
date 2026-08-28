import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectDatabase } from '../models/index.js';
import { PlatformUser } from '../models/PlatformUser.js';

dotenv.config();

const run = async () => {
  await connectDatabase();
  const name = process.env.PLATFORM_ADMIN_NAME || process.env.ADMIN_NAME || 'Administrador da Plataforma';
  const email = (process.env.PLATFORM_ADMIN_EMAIL || process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Defina PLATFORM_ADMIN_EMAIL e PLATFORM_ADMIN_PASSWORD no .env');
  }

  const [user, created] = await PlatformUser.findOrCreate({
    where: { email },
    defaults: { name, email, password_hash: await bcrypt.hash(password, 12), status: 'active' },
  });
  console.log(created ? `Administrador global ${user.email} criado.` : `Administrador global ${user.email} já existe.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
