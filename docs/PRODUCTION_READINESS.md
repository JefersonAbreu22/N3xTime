# N3xTime — Production Readiness

Este documento complementa o deploy da branch `monorepo`.

## 1. Variáveis obrigatórias

Em `apps/api/.env`:

```env
NODE_ENV=production
PORT=4989
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=n3xtime
DB_USER=n3xtime_app
DB_PASS=...
DB_TRANSFER_NAME=n3xtime_transfer_staging
DB_TRANSFER_USER=n3xtime_transfer
DB_TRANSFER_PASS=...
JWT_SECRET=...
APP_PUBLIC_URL=https://www.n3xtime.com.br
```

`JWT_SECRET` deve possuir pelo menos 32 caracteres.

## 2. Usuários MySQL separados

A conta usada diariamente pela API não deve possuir permissão para criar ou remover bancos.

Exemplo:

```sql
CREATE DATABASE IF NOT EXISTS n3xtime_transfer_staging
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'n3xtime_app'@'127.0.0.1' IDENTIFIED BY 'SENHA_FORTE_APP';
GRANT SELECT, INSERT, UPDATE, DELETE ON n3xtime.* TO 'n3xtime_app'@'127.0.0.1';

CREATE USER 'n3xtime_transfer'@'127.0.0.1' IDENTIFIED BY 'SENHA_FORTE_TRANSFER';
GRANT ALL PRIVILEGES ON n3xtime_transfer_staging.* TO 'n3xtime_transfer'@'127.0.0.1';

FLUSH PRIVILEGES;
```

As migrations precisam de uma credencial com DDL. Use uma conta de deploy/migration somente durante `prisma migrate deploy`, preferencialmente via `DATABASE_URL`, e não como `DB_USER` da API.

## 3. Preflight

Antes de reiniciar o PM2:

```bash
pnpm install --frozen-lockfile
pnpm preflight
pnpm db:migrate:status
```

Em ambiente de homologação/teste, execute também:

```bash
pnpm test:multitenancy
```

## 4. Migrations

Faça backup antes de qualquer migration.

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Nunca use `prisma migrate dev` em produção.

## 5. Health checks

- `GET /api/health/live`: processo Node está respondendo.
- `GET /api/health/ready`: processo e conexão MySQL estão disponíveis.

O proxy/reverse proxy deve considerar a aplicação pronta somente quando `/api/health/ready` retornar HTTP 200.

## 6. Backup de desastre

O backup por empresa do painel é um recurso de portabilidade do tenant; ele não substitui o backup completo do servidor.

Antes do primeiro go-live e diariamente depois dele, mantenha cópia de:

- banco MySQL completo;
- `apps/api/api/uploads`;
- `apps/api/.env` em cofre seguro;
- configuração Apache/SSL e PM2.

Teste uma restauração em ambiente separado antes de considerar o backup validado.

## 7. PM2 e proxy

O `ecosystem.config.cjs` mantém os dois processos somente no loopback:

- web: `127.0.0.1:4979`
- API: `127.0.0.1:4989`
- proxy interno do web: `http://127.0.0.1:4989`

Apache/Nginx deve ser a única camada exposta publicamente.

## 8. GitHub

O workflow `.github/workflows/ci.yml` valida schema, build, typecheck, lint e teste multitenant. Após o primeiro run verde, proteja a branch de produção exigindo esse check antes de merge.
