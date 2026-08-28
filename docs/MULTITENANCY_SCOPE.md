# Escopo multitenant do N3xtime

## Objetivo

Transformar a plataforma de ponto em um SaaS com várias empresas no mesmo banco, garantindo que usuários, configurações, biometria, registros, relatórios e quiosques de uma empresa nunca sejam acessados por outra.

## Hierarquia proposta

```text
Plataforma N3xtime
└── Empresa (tenant)
    ├── Administrador da empresa
    ├── Gestores
    │   └── Colaboradores gerenciados
    └── Colaboradores
```

- A empresa é a raiz do tenant.
- Cada usuário operacional pertence a exatamente uma empresa.
- O administrador possui todas as permissões administrativas, mas somente dentro da própria empresa.
- O gestor acessa apenas os colaboradores permitidos pela hierarquia atual de gestão e departamento.
- O colaborador acessa somente os próprios registros e solicitações.
- A administração global da plataforma deve ficar em um plano de controle separado, sem acesso operacional implícito aos dados de ponto.

## Identificação da empresa

O login dos usuários usa somente `e-mail + senha`. O e-mail é globalmente único entre as contas operacionais; depois de localizar o usuário, o backend obtém seu `company_id`, valida a situação da empresa e emite o JWT com o tenant correto. O cliente não informa, escolhe ou troca esse valor.

CPF e número de matrícula continuam únicos apenas dentro de cada empresa. Caso futuramente um mesmo usuário precise participar de várias empresas, o modelo deverá evoluir para identidade global + tabela de vínculos e seleção de ambiente após o login.

O quiosque usa somente uma chave exclusiva. Um fingerprint SHA-256 localiza a empresa e o hash `bcrypt` valida o segredo; a chave original nunca é armazenada. Sua sessão recebe o `companyId` encontrado e só carrega biometria e marcações daquele tenant.

## Modelo de dados

### Cadastro global

- `companies`: identidade do tenant, slug, status e credencial do quiosque.

### Dados pertencentes à empresa

Todas as tabelas abaixo possuem `company_id` obrigatório:

- `company_profiles`
- `users`
- `departments`
- `work_schedules`
- `holidays`
- `kiosk_controls`
- `time_records`
- `attendance_summaries`
- `employee_requests`
- `monthly_closings`
- `biometric_samples`
- `biometric_events`
- `audit_logs`
- `email_delivery_logs`
- `email_delivery_failures`
- `remote_photo_evidences`
- `department_hierarchy_levels`
- `department_leader_assignments`

`users.email` é globalmente único. As unicidades de `users.cpf`, `users.registration_number`, `holidays.holiday_date` e `monthly_closings.period_month` são compostas com `company_id`. `company_profiles` e `kiosk_controls` permitem somente um registro por empresa.

## Isolamento e autorização

O isolamento possui quatro camadas:

1. O login localiza o e-mail globalmente único e deriva a empresa pelo vínculo imutável `users.company_id`.
2. O token assinado transporta o `companyId` resolvido pelo servidor.
3. Um contexto por requisição injeta `company_id` em todas as consultas e gravações dos models operacionais.
4. Operações em models de tenant sem contexto são rejeitadas; referências como gestor, departamento, escala, usuário e registro são validadas dentro da mesma empresa.

O papel `admin` continua sendo o administrador da empresa. Ele não recebe permissão para consultar outra empresa nem para informar um `company_id` arbitrário na API.

## Provisionamento de empresa

O cadastro de uma nova empresa deve ser transacional:

1. validar CNPJ/slug e dados do administrador;
2. criar `companies`;
3. criar `company_profiles` com configurações padrão;
4. cadastrar a chave exclusiva e criar `kiosk_controls` bloqueado por padrão;
5. criar o primeiro usuário com papel `admin`;
6. registrar o evento no log de auditoria;
7. confirmar tudo ou desfazer tudo em caso de erro.

O `KIOSK_ACCESS_KEY` do `.env` serve apenas para o bootstrap da empresa inicial via `npm run seed:admin`. As demais chaves são cadastradas no plano de controle ao criar a empresa. O admin do tenant pode substituí-la confirmando sua senha; a rotação revoga todas as sessões de terminal existentes.

## Matriz resumida de permissões

| Recurso | Admin da empresa | Gestor | Colaborador | Quiosque |
|---|---:|---:|---:|---:|
| Configuração da empresa | editar | consultar | não | não |
| Departamentos e escalas | gerenciar | consultar | não | não |
| Usuários | gerenciar | equipe permitida | próprio perfil | não |
| Biometria | gerenciar | equipe permitida | não | consultar para identificação |
| Registros de ponto | todos do tenant | equipe permitida | próprios | criar |
| Solicitações | revisar todas | equipe permitida | próprias | não |
| Relatórios e fechamento | todos do tenant | equipe permitida | próprios quando aplicável | não |
| Quiosque | liberar/revogar | não | não | operar |

## Fases recomendadas

### Fase 1 — fundação concluída

- tabela de empresas;
- `company_id` em todas as tabelas operacionais;
- isolamento automático no backend;
- JWT, login, recuperação de senha e quiosque conscientes da empresa;
- chaves únicas por tenant;
- criação do primeiro tenant e administrador;
- login e recuperação por e-mail, com descoberta automática da empresa, e quiosque com identificador próprio.

### Fase 2 — plano de controle concluída

- usuário global da plataforma em `platform_users`;
- autenticação unificada em `/login`, com descoberta automática do perfil Super Admin;
- tela e API para cadastrar, suspender e reativar empresas;
- provisionamento transacional da empresa, perfil, quiosque e primeiro administrador;
- senha temporária com troca obrigatória no primeiro acesso;
- trilha global em `platform_audit_logs`;
- suspensão com bloqueio imediato dos tokens do tenant e revogação do quiosque.
- chave exclusiva cadastrada no provisionamento e rotação pelo admin da empresa.

### Fase 3 — segurança e operação SaaS

- testes automatizados de tentativa de acesso cruzado em cada endpoint;
- limites por plano, retenção, exportação e exclusão de dados;
- armazenamento de uploads separado por empresa;
- métricas, filas e logs sempre etiquetados por tenant;
- backup e restauração por empresa;
- política LGPD para biometria, consentimento, retenção e descarte.

### Fase 4 — escala

- índices orientados pelos relatórios mais usados;
- jobs de cálculo e fechamento particionados por tenant;
- rate limit por empresa e por terminal;
- opção futura de banco dedicado para clientes que exigirem isolamento físico.

## Critérios de aceite

- Uma requisição autenticada nunca consegue ler, alterar ou excluir dados de outro `companyId`.
- Um e-mail operacional pertence a uma única conta; CPF, matrícula, feriado e competência de fechamento podem existir em tenants distintos.
- Suspender uma empresa bloqueia novos logins e sessões de quiosque.
- Revogar o quiosque de uma empresa não afeta os demais.
- Relatórios e cálculos retornam somente dados do tenant autenticado.
- Uploads e e-mails não expõem nomes, caminhos ou destinatários de outro tenant.
- Testes de integração cobrem admin, gestor, colaborador e quiosque em pelo menos duas empresas.
