# Relatório de validação do multitenancy

Data da execução: 11/08/2026

## Resultado executivo

- 36 de 36 cenários funcionais, de segurança e de isolamento aprovados.
- Nenhuma falha funcional de multitenancy foi encontrada na matriz executada.
- O risco de acesso público aos arquivos foi corrigido e os testes confirmam autenticação, autorização e isolamento por empresa.
- Backend e frontend compilam para produção.
- O lint do frontend foi zerado.
- PM2 e as portas configuradas não foram alterados nem reiniciados.

## Como o teste foi executado

A suíte cria o banco temporário `n3xtime_multitenant_test`, sobe a aplicação somente em uma porta efêmera escolhida pelo sistema operacional, cadastra duas empresas completas e remove o banco ao terminar. Existe uma trava que impede a execução caso o nome do banco não termine em `_test` ou coincida com o banco principal.

Comando reproduzível:

```bash
cd backend
npm run test:multitenancy
```

O processo retorna código `0` quando não há falhas nem riscos, `1` quando existe falha funcional e `2` quando todos os testes funcionais passam, mas um risco de segurança é confirmado.

## Cobertura aprovada

- exigência de contexto de empresa nas consultas dos modelos;
- bypass global somente quando solicitado explicitamente;
- bloqueio de referências cruzadas entre empresas;
- login único com descoberta automática da empresa;
- reconhecimento do Super Admin pelo login unificado;
- autenticação obrigatória nas rotas privadas;
- isolamento do perfil empresarial, equipe, setores e hierarquias;
- coexistência de feriados iguais em empresas distintas;
- isolamento de marcações e relatórios de presença;
- colaborador limitado às próprias marcações;
- bloqueio de consultas, alterações, exclusões e aprovações cruzadas;
- proteção contra cadastro com setor pertencente a outra empresa;
- liderança em vários setores e aplicação das permissões granulares;
- separação entre token global e token operacional;
- listagem global de empresas pelo Super Admin;
- entrada explícita do Super Admin em uma empresa;
- proteção da empresa inicial contra suspensão;
- suspensão, preservação de dados e reativação da empresa;
- resolução da empresa pela chave do kiosk e isolamento das biometrias;
- bloqueio das antigas URLs públicas de arquivos;
- autorização de fotos e anexos por proprietário, liderança, administrador e empresa;
- retenção de fotos vencidas sem remoção do registro remoto;
- recálculo facial no servidor e rejeição de identidade incorreta;
- isolamento durante requisições concorrentes.

## Validações complementares

- `backend`: `npm run build` aprovado.
- `frontend`: `npm run build` aprovado.
- `frontend`: `npm run lint` aprovado sem erros ou avisos.
- O build do frontend também alerta sobre um chunk de reconhecimento facial acima de 500 kB.

## Melhorias implementadas

### Fotos e anexos protegidos

As exposições diretas de `/uploads` e `/api/uploads` foram removidas. Fotos e anexos agora são entregues por endpoints autenticados que:

- localizam o registro ou a solicitação pelo identificador, sem aceitar caminho físico arbitrário;
- aplicam `company_id` e as permissões de colaborador, líder ou administrador;
- permitem ao colaborador acessar apenas o próprio documento;
- retornam conteúdo privado sem cache público;
- leem as fotografias remotas diretamente da evidência biométrica armazenada no banco.

O frontend passou a baixar esses conteúdos autenticados como `Blob`, revogando as URLs temporárias ao desmontar os componentes.

### Qualidade estática

Foram corrigidos os 14 erros e 9 avisos encontrados. O comando `npm run lint` agora termina sem ocorrências.

### Prioridade média — ampliar a automação

- manter a matriz no CI para impedir regressões;
- adicionar testes de navegador para login, troca explícita de empresa, sidebar, hierarquias e emissão de PDF;
- adicionar testes de navegador para o fluxo completo de upload, pré-visualização e download;
- testar SMTP e consulta de CNPJ com serviços simulados, sem depender de provedores externos;
- executar carga prolongada com muitas empresas para medir índices e capacidade.

A suíte de integração já cobre a limpeza de uma foto vencida, a preservação permanente do ponto remoto, downloads autorizados e negados e vinte requisições concorrentes alternando entre duas empresas.

## Limites desta execução

Por decisão de escopo, não foram alterados nem testados PM2, portas fixas ou o processo publicado. A consulta externa de CNPJ, o envio SMTP real, impressão visual dos PDFs e o disparo temporal real do cron não fizeram parte desta matriz.
