import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const requiredDatabaseVariable = (name: 'DB_HOST' | 'DB_NAME' | 'DB_USER' | 'DB_PASS') => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nao configurado para o Prisma.`);
  return value;
};

const databaseUrl = process.env.DATABASE_URL?.trim() || (() => {
  const host = requiredDatabaseVariable('DB_HOST');
  const database = requiredDatabaseVariable('DB_NAME');
  const user = encodeURIComponent(requiredDatabaseVariable('DB_USER'));
  const password = encodeURIComponent(requiredDatabaseVariable('DB_PASS'));
  const port = Number(process.env.DB_PORT || 3306);

  return `mysql://${user}:${password}@${host}:${port}/${encodeURIComponent(database)}`;
})();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
