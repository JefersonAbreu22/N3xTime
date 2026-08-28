# Migrations do banco

O schema do banco e versionado pelo Prisma Migrate em `backend/prisma`. A aplicacao continua usando Sequelize para consultas e persistencia; o Prisma e responsavel somente pela evolucao estrutural do MySQL.

O backend nao executa `sequelize.sync()` nem altera tabelas durante a inicializacao. As migrations devem ser aplicadas antes de iniciar ou reiniciar a API.

## Banco novo (producao vazia)

Crie primeiro o database MySQL e conceda ao usuario da aplicacao permissoes de DDL. Depois, no diretorio `backend`:

```bash
npm ci
npm run db:schema:validate
npm run db:migrate:deploy
npm run build
```

Para criar os usuarios iniciais, depois das migrations:

```bash
npm run seed:platform-admin
npm run seed:admin
```

Por fim, inicie ou recarregue a API pelo PM2.

## Banco existente criado pelo Sequelize

Faca backup antes de adotar o historico do Prisma. Nunca execute a migration inicial diretamente em um banco que ja tenha as tabelas.

Primeiro compare o banco com o schema final:

```bash
npm run db:schema:diff
```

Se a diferenca mostrar somente as colunas `employee_requests.absence_start_time` e `employee_requests.absence_end_time`, registre a migration inicial como ja aplicada e execute o deploy:

```bash
npx prisma migrate resolve --config prisma.config.ts --applied 20260828120000_init
npm run db:migrate:deploy
```

Se a comparacao nao mostrar diferencas porque essas duas colunas ja existem, registre as duas migrations como aplicadas:

```bash
npx prisma migrate resolve --config prisma.config.ts --applied 20260828120000_init
npx prisma migrate resolve --config prisma.config.ts --applied 20260828121000_add_request_absence_times
```

Se aparecer qualquer outra diferenca, nao faca o baseline ate revisar o drift.

## Criando migrations futuras

Altere `backend/prisma/schema.prisma` e, em um ambiente de desenvolvimento com banco descartavel, execute:

```bash
npm run db:migrate:dev -- --name nome_da_alteracao
```

Revise o SQL gerado, valide e versione a pasta nova em `prisma/migrations`. Em producao use somente `npm run db:migrate:deploy`; nao use `migrate dev` nem `db push`.

## Configuracao

O Prisma aceita `DATABASE_URL`. Quando ela nao estiver definida, `prisma.config.ts` monta a conexao usando `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASS`, as mesmas variaveis usadas pelo Sequelize.
