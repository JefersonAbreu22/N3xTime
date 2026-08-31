# N3xTime

O N3xTime é uma plataforma SaaS multitenant para gestão de ponto, pessoas e rotinas de RH. O sistema reúne marcação por reconhecimento facial ou PIN, ponto remoto, hierarquia de líderes, solicitações, relatórios, fechamento mensal e administração de várias empresas em uma única aplicação.

## Principais recursos

- controle de entrada, almoço, retorno e saída;
- quiosque por empresa com identificação facial ou PIN;
- ponto remoto com localização, raio permitido e evidência fotográfica;
- cadastro de colaboradores, jornadas, departamentos e feriados;
- hierarquia de líderes por setor e permissões granulares;
- solicitações de ajuste, abono, folga e férias com fluxo de aprovação;
- banco de horas, espelho de ponto, indicadores e fechamento mensal;
- histórico biométrico, auditoria e acompanhamento de falhas de e-mail;
- painel Super Admin para provisionar, suspender, acessar, importar e exportar empresas;
- uma conta global pode possuir vínculo com mais de uma empresa.

## Perfis de acesso

| Perfil | Escopo |
|---|---|
| Super Admin | Administra a plataforma e as empresas, com acesso auditado aos tenants. |
| Administrador | Configura a própria empresa e gerencia pessoas, ponto, relatórios e permissões. |
| Líder | Acessa somente setores e ações liberados pela hierarquia configurada. |
| Colaborador | Consulta o próprio ponto e cria as próprias solicitações. |
| Quiosque | Registra ponto dos colaboradores da empresa vinculada à chave do terminal. |

Os dados operacionais possuem `company_id` e são filtrados pelo tenant presente na sessão. O cliente não escolhe livremente esse identificador.

## Arquitetura

```text
N3xTime
├── apps/
│   ├── api/       API HTTP, regras de negócio, autenticação e jobs
│   └── web/       aplicação React e servidor estático/proxy de produção
├── packages/
│   └── database/  schema e migrations do Prisma
├── docs/           operação, multitenancy e prontidão de produção
└── ecosystem.config.cjs  processos PM2 da API e do frontend
```

| Camada | Tecnologias |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query e Zustand |
| Backend | Node.js, Express, TypeScript, Sequelize e JWT |
| Banco | MySQL 8; Prisma Migrate para evolução estrutural |
| Biometria | face-api.js com modelos servidos pelo frontend |
| Produção | PM2, servidor web Node e proxy reverso Apache/Nginx |

A API é publicada sob `/api`. Em produção, o servidor web entrega a SPA e encaminha `/api` e `/uploads` para o processo da API.

## Requisitos

- Node.js 22;
- pnpm 11.24.0;
- MySQL 8 ou MariaDB compatível;
- Docker, opcional, para o banco local.

## Desenvolvimento local

1. Instale as dependências:

   ```bash
   corepack enable
   corepack prepare pnpm@11.24.0 --activate
   pnpm install --frozen-lockfile
   ```

2. Crie as configurações locais:

   ```powershell
   Copy-Item apps/api/.env.local.example apps/api/.env
   Copy-Item apps/web/.env.example apps/web/.env
   ```

   Para executar o Vite separado da API, configure em `apps/web/.env`:

   ```env
   VITE_API_BASE_URL=http://localhost:4989/api
   ```

3. Inicie o MySQL local e aplique as migrations:

   ```bash
   pnpm db:local:up
   pnpm db:migrate:deploy
   ```

4. Preencha as variáveis `ADMIN_*`, `COMPANY_*` e `KIOSK_ACCESS_KEY` se precisar criar a empresa inicial. Em seguida:

   ```bash
   pnpm --filter @n3xtime/api seed:admin
   pnpm admin:create
   ```

   `pnpm admin:create` abre um fluxo interativo para cadastrar o Super Admin da plataforma.

5. Inicie frontend e API:

   ```bash
   pnpm dev
   ```

Por padrão, o frontend Vite usa `http://localhost:5173` e a API usa a porta definida em `apps/api/.env` (`4989` no exemplo local).

## Variáveis importantes

As referências completas ficam em [apps/api/.env.example](apps/api/.env.example) e [apps/api/.env.local.example](apps/api/.env.local.example).

| Variável | Finalidade |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Conexão com o banco principal. |
| `DB_USER`, `DB_PASS` | Credenciais usadas pela aplicação. |
| `DB_TRANSFER_*` | Banco isolado de staging para importação de tenants. |
| `JWT_SECRET` | Assinatura das sessões; mínimo de 32 caracteres. |
| `APP_PUBLIC_URL` | URL pública usada em links como redefinição de senha. |
| `SMTP_*` | Envio de e-mails transacionais. |
| `KIOSK_ACCESS_KEY` | Chave de bootstrap do quiosque da empresa inicial. |
| `VITE_API_BASE_URL` | Endereço da API usado pelo frontend em desenvolvimento. |

Nunca versione arquivos `.env`, dumps de banco, uploads ou credenciais.

## Comandos úteis

| Comando | Ação |
|---|---|
| `pnpm dev` | Inicia API e frontend em desenvolvimento. |
| `pnpm build:api` | Compila a API. |
| `pnpm build:web` | Gera o frontend de produção. |
| `pnpm typecheck` | Valida os tipos do frontend. |
| `pnpm lint` | Executa o ESLint. |
| `pnpm check:encoding` | Verifica UTF-8, BOM e sequências conhecidas de mojibake. |
| `pnpm db:validate` | Valida o schema Prisma. |
| `pnpm db:migrate:deploy` | Aplica migrations pendentes. |
| `pnpm db:migrate:status` | Exibe o estado das migrations. |
| `pnpm test:multitenancy` | Executa os testes de isolamento entre empresas. |
| `pnpm preflight` | Valida banco, builds e tipos antes do deploy. |

## Encoding dos arquivos

Todo arquivo de texto deve ser salvo em **UTF-8 sem BOM**. O repositório inclui `.editorconfig` para orientar o editor e `pnpm check:encoding` para bloquear BOM, UTF-8 inválido e padrões comuns de texto recodificado.

Ao encontrar texto quebrado, corrija a string original; não aplique conversão em massa sem antes verificar os bytes, pois o terminal do Windows também pode exibir UTF-8 correto de forma incorreta dependendo da página de código.

## Produção

O [ecosystem.config.cjs](ecosystem.config.cjs) mantém dois processos:

- `n3xtimemulti-api`: API em `127.0.0.1:4989`;
- `n3xtimemulti-web`: frontend em `0.0.0.0:4979`, com proxy interno para a API.

Fluxo resumido de atualização:

```bash
pnpm install --frozen-lockfile
pnpm check:encoding
pnpm preflight
pnpm db:migrate:deploy
pm2 restart ecosystem.config.cjs --update-env
```

Antes de migrations, mantenha backup do banco, dos uploads e das configurações. Consulte [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) para o checklist completo e [docs/MULTITENANCY_SCOPE.md](docs/MULTITENANCY_SCOPE.md) para os detalhes de isolamento.

## Saúde da aplicação

- `GET /api/health/live`: confirma que o processo da API está ativo;
- `GET /api/health/ready`: confirma processo e conexão com o banco;
- `GET /api/health`: verificação simples de compatibilidade.

O proxy reverso deve considerar a aplicação pronta apenas quando `/api/health/ready` responder com HTTP 200.
