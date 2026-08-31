# Atualização do código em produção

Este guia descreve o processo de atualização do N3xTime no servidor de produção. Os comandos devem ser executados na raiz do projeto.

## 1. Antes da atualização

Confirme que:

- o código foi revisado, commitado e enviado para a branch `main`;
- o pipeline de CI terminou com sucesso;
- existe backup recente do banco MySQL;
- existe backup de `apps/api/api/uploads` e das configurações de produção;
- o arquivo `.env` do servidor está preservado e não será substituído pelo Git.

Entre no servidor e acesse o projeto:

```bash
cd /caminho/do/N3xTime
```

Verifique a branch, o commit atual e se existem alterações locais:

```bash
git status -sb
git log -1 --oneline
```

Não execute o `git pull` enquanto houver alterações locais não identificadas. Elas podem ser configurações ou trabalho ainda não versionado no servidor.

## 2. Baixar o código

Atualize a branch de produção sem criar merge automático:

```bash
git pull --ff-only origin main
```

Confira o commit recebido:

```bash
git log -1 --oneline
```

## 3. Instalar dependências e validar

Instale exatamente as versões registradas no lockfile:

```bash
pnpm install --frozen-lockfile
```

Valide encoding, schema do banco, API, frontend e TypeScript:

```bash
pnpm check:encoding
pnpm preflight
```

O `preflight` gera os builds de produção da API e do frontend. Não reinicie o PM2 caso alguma validação falhe.

## 4. Aplicar migrations

Consulte o estado das migrations:

```bash
pnpm db:migrate:status
```

Depois de confirmar o backup, aplique as migrations pendentes:

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Mesmo quando a atualização não possui migrations novas, o comando de deploy pode ser executado para confirmar que o banco está atualizado.

> Nunca use `prisma migrate dev` ou `db push` em produção.

## 5. Reiniciar o PM2

Reinicie a API e o frontend carregando as variáveis definidas no `ecosystem.config.cjs`:

```bash
pm2 restart ecosystem.config.cjs --update-env
pm2 save
```

Se for a primeira inicialização e os processos ainda não existirem:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Os processos esperados são:

- `n3xtimemulti-api`, na porta `4989`;
- `n3xtimemulti-web`, na porta `4979`.

## 6. Verificar a publicação

Confira o estado dos processos:

```bash
pm2 status
pm2 logs n3xtimemulti-api --lines 100 --nostream
pm2 logs n3xtimemulti-web --lines 100 --nostream
```

Valide a API diretamente no servidor e pelo domínio público:

```bash
curl -f http://127.0.0.1:4989/api/health/ready
curl -f https://www.n3xtime.com.br/api/health/ready
```

No Windows PowerShell, use `curl.exe` caso `curl` esteja configurado como um alias:

```powershell
curl.exe -f http://127.0.0.1:4989/api/health/ready
curl.exe -f https://www.n3xtime.com.br/api/health/ready
```

O endpoint deve responder com HTTP `200`. Também faça uma verificação funcional de login, painel e operação afetada pela atualização.

## Sequência resumida

```bash
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm check:encoding
pnpm preflight
pnpm db:migrate:status
pnpm db:migrate:deploy
pm2 restart ecosystem.config.cjs --update-env
pm2 save
pm2 status
curl -f http://127.0.0.1:4989/api/health/ready
curl -f https://www.n3xtime.com.br/api/health/ready
```

## Rollback básico

Se a aplicação falhar depois do restart:

1. consulte os logs do PM2 e identifique se a falha está no código, configuração ou banco;
2. volte para um commit anteriormente validado usando uma nova reversão versionada, preferencialmente com `git revert`;
3. reinstale as dependências e gere novamente os builds;
4. reinicie o PM2 e repita os health checks;
5. se uma migration incompatível tiver sido aplicada, siga o plano de restauração do backup. Não altere manualmente o histórico do Prisma.

Exemplo de reversão versionada:

```bash
git revert <hash-do-commit-problemático>
pnpm install --frozen-lockfile
pnpm preflight
pm2 restart ecosystem.config.cjs --update-env
```

Para detalhes adicionais sobre banco e preparação do ambiente, consulte [database-migrations.md](database-migrations.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
