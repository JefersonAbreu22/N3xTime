# Histórico de implementação

Este documento registra, em formato semelhante a commits, as alterações realizadas na evolução da plataforma N3xtime. Os títulos seguem o padrão `tipo(escopo): descrição` e representam entregas lógicas; não correspondem necessariamente a hashes individuais do Git.

Data de consolidação: **07/08/2026**.

## feat(tenancy): transformar a plataforma em uma aplicação multitenant

### O que foi alterado

- Criada a tabela global `companies` para representar cada empresa da plataforma.
- Adicionado `company_id` obrigatório às entidades operacionais da empresa.
- Configurado isolamento automático por tenant nas consultas, inclusões, alterações e exclusões.
- Adicionadas validações para impedir referências cruzadas de usuário, setor, jornada, registro e demais entidades entre empresas.
- Ajustadas as restrições únicas para funcionarem no escopo da empresa quando aplicável.
- Configurado o banco `n3xtime_multitenant` como base compartilhada, mantendo isolamento lógico entre clientes.
- Mantida a possibilidade futura de bancos dedicados sem alterar o modelo atual de autenticação.

### Resultado

Todas as empresas utilizam o mesmo banco, mas cada requisição opera exclusivamente sobre o `company_id` autenticado.

## feat(auth): identificar automaticamente a empresa pelo usuário

### O que foi alterado

- Removida a necessidade de informar identificador, slug ou código da empresa no login.
- O login passou a utilizar somente e-mail e senha.
- O backend localiza o usuário, resolve seu vínculo empresarial e adiciona o `companyId` ao token.
- Empresas suspensas bloqueiam imediatamente novos acessos e sessões existentes.
- A sessão passou a sincronizar o papel e a situação atual do usuário a cada acesso protegido.

### Resultado

O usuário entra diretamente em sua empresa, sem precisar conhecer ou selecionar o tenant.

## feat(auth): reforçar segurança de senha e recuperação de acesso

### O que foi alterado

- Implementada política de senha segura no backend e no formulário de usuários.
- Adicionado fluxo de senha temporária com troca obrigatória no primeiro acesso.
- Criadas páginas e endpoints para esquecimento e redefinição de senha.
- Adicionado envio de recuperação por e-mail sem revelar se a conta existe.
- A sessão impede o acesso às demais funcionalidades enquanto a troca obrigatória estiver pendente.

## feat(platform): criar plano de controle para o Super Admin

### O que foi alterado

- Criadas as entidades `platform_users` e `platform_audit_logs`.
- Criado o Painel Super Admin para gerenciamento global das empresas.
- Adicionadas operações para cadastrar, consultar, suspender e reativar empresas.
- Separado o administrador global dos administradores operacionais de cada empresa.
- Adicionado acesso ao painel pela navegação principal para contas autorizadas.
- Mantido o mesmo layout, cabeçalho e sidebar utilizados pelo restante do dashboard.
- Centralizado o painel nas rotas `/dashboard/platform`.

### Resultado

O Super Admin administra a plataforma, mas não possui acesso operacional implícito aos dados das empresas.

## feat(companies): provisionar empresa e administrador de forma transacional

### O que foi alterado

- O cadastro de empresa passou a criar, em uma única transação:
  - empresa;
  - perfil e configurações iniciais;
  - controle do terminal;
  - primeiro usuário administrador;
  - credenciais iniciais de acesso.
- Erros durante o provisionamento desfazem toda a operação.
- Adicionada consulta automática de dados cadastrais ao informar o CNPJ.
- Reutilizada no Painel Super Admin a integração de CNPJ já existente nas configurações da empresa.
- Adicionado botão dedicado para o Super Admin acessar a empresa selecionada.

## fix(companies): proteger a empresa inicial e preservar dados na suspensão

### O que foi alterado

- A empresa inicial foi protegida contra suspensão.
- Suspender uma empresa altera somente seu estado de acesso.
- Usuários, pontos, biometrias, configurações, relatórios e demais dados permanecem intactos.
- Reativar a empresa restaura o acesso aos mesmos dados anteriores.
- Sessões de terminal são revogadas durante a suspensão.

## feat(kiosk): cadastrar uma chave exclusiva por empresa

### O que foi alterado

- A chave do terminal deixou de depender de uma configuração global fixa no `.env`.
- Cada empresa passou a possuir sua própria chave de liberação do quiosque.
- A chave é cadastrada durante o provisionamento da empresa.
- O segredo original não é armazenado; são mantidos fingerprint e hash seguro.
- O administrador da empresa pode rotacionar a chave mediante confirmação de senha.
- A rotação revoga sessões anteriores do terminal.
- O quiosque resolve automaticamente a empresa a partir da chave informada.

## feat(platform): permitir acesso explícito aos dados de uma empresa

### O que foi alterado

- Adicionado o fluxo **Acessar empresa** no Painel Super Admin.
- O acesso cria uma sessão empresarial identificada como impersonação do Super Admin.
- A interface exibe aviso de contexto e ação para retornar ao painel global.
- A entrada e a saída da empresa são registradas na auditoria.
- O Super Admin passou a visualizar dados operacionais somente após escolher explicitamente uma empresa.

## refactor(platform): remover visualização operacional global e endpoints obsoletos

### O que foi alterado

- Removido o comportamento que misturava dados de todas as empresas em Análises, RH, Colaboradores, Pendências e Relatórios.
- Removidos endpoints que ficaram sem uso após a adoção do acesso explícito à empresa.
- Mantido no plano global apenas o gerenciamento da plataforma e seus registros administrativos.
- As telas operacionais voltaram a trabalhar sempre com um único contexto empresarial.

## feat(audit): criar consulta global paginada de logs

### O que foi alterado

- Criada página dedicada a logs no Painel Super Admin.
- Adicionada paginação no backend e na interface.
- Unificados eventos relevantes de autenticação, plataforma, empresas, usuários, ponto, solicitações, biometria e entrega de e-mails.
- Adicionados filtros por empresa, categoria, evento, período e busca textual.
- Preservado o detalhamento de ator, empresa, entidade afetada, IP, dispositivo, resultado e metadados.

## refactor(auth): unificar todo o acesso em `/login`

### O que foi alterado

- Removida a página `/platform/login`.
- Removido o endpoint `/api/platform/auth/login`.
- Login empresarial e identificação do Super Admin passaram a utilizar `/login` e `/api/auth/login`.
- Mantido o bootstrap automático da sessão global para contas de plataforma.
- Logout e expiração de sessão passaram a limpar credenciais empresariais e globais.
- Rotas antigas ou desconhecidas redirecionam para `/login`.

## feat(users): permitir usuários dispensados do controle de ponto

### O que foi alterado

- Adicionado o campo `requires_time_tracking` ao cadastro do usuário.
- Criada a opção **Controla ponto** no formulário de colaboradores.
- Quando desativada, a pessoa fica fora de:
  - quiosque e identificação para marcação;
  - jornadas e cálculos de carga horária;
  - atrasos, ausências e banco de horas;
  - pendências e relatórios de ponto.
- O usuário continua podendo acessar o sistema conforme seu papel e permissões administrativas.

## feat(remote-clock): registrar origem remota e reter evidências por 90 dias

### O que foi alterado

- Criada a entidade `remote_photo_evidences` para evidências fotográficas de ponto remoto.
- Fotografias passaram a ser armazenadas no banco com vínculo à empresa e à marcação.
- Criado serviço agendado para remover fotografias com mais de três meses.
- A exclusão da fotografia não remove nem altera a marcação de ponto.
- Espelho e relatórios continuam identificando que o ponto foi realizado remotamente.
- Adicionados método, origem, GPS e indicadores de confiança aplicáveis à marcação.

## feat(email): registrar entregas e falhas de e-mail

### O que foi alterado

- Criadas as tabelas `email_delivery_logs` e `email_delivery_failures`.
- Registradas tentativas, entregas, respostas SMTP e mensagens de erro.
- Criada página administrativa para acompanhamento de falhas.
- Mantido o isolamento dos destinatários e registros por empresa.
- Eventos de entrega passaram a integrar a consulta global de logs.

## feat(reports): ampliar análises, espelho e relatórios operacionais

### O que foi alterado

- Criada área de Análises e Dashboard RH.
- Adicionados filtros por período, setor e colaborador.
- Evoluídos indicadores de presença, atraso, ausência, pendência e banco de horas.
- Incluídos dados de gestor, setor, matrícula, jornada e origem remota nos relatórios aplicáveis.
- Ajustados espelho, relatórios diários, fechamento e exportações.
- Usuários sem controle de ponto foram excluídos dos cálculos operacionais.
- Gestores passaram a receber somente os dados liberados pelo seu escopo de liderança.

## fix(tenant-session): sincronizar dados e navegação do administrador da empresa

### O que foi alterado

- Corrigida a identificação do papel do administrador empresarial após o login.
- Adicionada sincronização da sessão com `/api/auth/me`.
- Corrigido o carregamento de colaboradores, setores e configurações do tenant.
- Restaurada a sidebar completa para administradores da empresa.
- Alterações de papel, suspensão e contexto passaram a refletir sem depender de um token antigo.

## feat(leadership): criar hierarquia dinâmica por setor

### O que foi alterado

- Criadas as tabelas:
  - `department_hierarchy_levels`;
  - `department_leader_assignments`.
- Substituído o modelo operacional limitado a um único `manager_id` por níveis configuráveis.
- Permitida a criação de níveis como Diretoria, Gerência, Coordenação e Supervisão.
- Permitidos vários responsáveis no mesmo nível.
- Definidas permissões individuais para cada vínculo:
  - visualizar equipe;
  - editar equipe;
  - consultar ponto;
  - ajustar ponto;
  - aprovar solicitações;
  - visualizar relatórios;
  - gerenciar biometria.
- O nível 1 foi definido como o mais alto da estrutura.
- Líderes superiores podem alcançar colaboradores e líderes posicionados abaixo.
- Usuários do mesmo nível não administram uns aos outros.
- Solicitações são direcionadas ao nível mais próximo que possua permissão de aprovação.
- Sidebar, páginas, consultas e ações passaram a respeitar as permissões efetivas.
- Alterações da hierarquia são registradas na auditoria.
- Vínculos antigos por `manager_id` continuam funcionando enquanto o setor não for migrado para a nova estrutura.

## feat(leadership): permitir liderança multissetorial e seleção pesquisável

### O que foi alterado

- Um mesmo usuário passou a poder liderar mais de um setor.
- O líder não precisa pertencer formalmente ao setor que supervisiona.
- Mantida a proibição de repetir o mesmo usuário em dois níveis da mesma hierarquia.
- A remoção de um vínculo não afeta as lideranças mantidas em outros setores.
- O usuário só retorna ao papel de colaborador quando perde seu último vínculo de liderança.
- O seletor de responsável passou a permitir busca por nome, e-mail ou setor.
- Usuários já selecionados na hierarquia atual ficam indisponíveis para nova seleção.
- A aba **Colaboradores** passou a mostrar, ao expandir o setor:
  - níveis da hierarquia;
  - responsáveis de cada nível;
  - permissões concedidas;
  - indicação de líder pertencente a outro setor;
  - quantidade de níveis e líderes.
- A classificação exibida na equipe passou a considerar o vínculo naquele setor, e não somente o papel global `manager`.

## chore(runtime): validar compilação, sincronização e execução

### O que foi alterado

- Executadas compilações TypeScript do backend e frontend após as entregas.
- Sincronizadas as novas tabelas e colunas no banco configurado.
- Validados endpoints de autenticação, empresas, departamentos e hierarquia.
- Reiniciados os serviços de API e frontend pelo PM2.
- Confirmadas respostas HTTP de saúde para os dois serviços.

## feat(reports): padronizar PDFs com identificação da empresa

### O que foi alterado

- O gerador central de PDF passou a exigir e imprimir o nome da empresa.
- Adicionado cabeçalho empresarial em todas as páginas do documento.
- Adicionados data e hora de emissão, paginação e identificação do relatório.
- O nome normalizado da empresa passou a compor automaticamente o nome do arquivo.
- Aplicado o padrão ao espelho de ponto, banco de horas, solicitações, compliance e fechamentos.
- Adicionada exportação PDF à aba Indicadores, incluindo resumo executivo, riscos e detalhamento por setor.

## Estado consolidado

- Login único: `/login`.
- Painel Super Admin: `/dashboard/platform`.
- Administração de hierarquias: `/dashboard/team/departments`.
- Visualização da hierarquia: `/dashboard/team/employees`, ao expandir um setor.
- Banco: compartilhado entre empresas, com isolamento obrigatório por `company_id`.
- Acesso global aos dados operacionais: somente por entrada explícita em uma empresa.
- Retenção de fotografias remotas: três meses, sem perda do histórico da marcação.

## test(multitenancy): automatizar matriz de isolamento entre empresas

### O que foi alterado

- Criada uma suíte de integração reproduzível com duas empresas, usuários, setores, hierarquias, marcações, solicitações, feriados e kiosks independentes.
- Adicionadas travas para executar somente em banco com sufixo `_test`, diferente do banco principal.
- O servidor de teste utiliza porta efêmera e não altera PM2 nem portas configuradas.
- Validados 30 cenários de autenticação, autorização, isolamento, suspensão, reativação e acesso explícito do Super Admin.
- Confirmada aprovação dos builds de backend e frontend.
- Documentado o risco de exposição pública de fotos e anexos e o débito atual de lint do frontend.
- Adicionado o comando `npm run test:multitenancy` ao backend.

## fix(security): proteger evidências remotas e anexos por empresa

### O que foi alterado

- Removida a publicação estática das pastas `/uploads` e `/api/uploads`.
- Criados endpoints autenticados para fotos de registros e anexos de solicitações.
- Aplicadas validações de empresa, proprietário e permissões da hierarquia antes de entregar cada arquivo.
- Fotografias remotas passaram a ser lidas da evidência armazenada no banco, respeitando a retenção de três meses.
- O frontend passou a consumir arquivos privados com token e URL temporária em memória.
- A matriz foi ampliada para 35 cenários, incluindo arquivos privados, retenção e concorrência entre tenants.
- Corrigidos todos os erros e avisos do lint do frontend.
- Mantidos PM2 e portas sem alterações.

## feat(kiosk): ampliar câmera no iPad e reforçar reconhecimento facial

### O que foi alterado

- O breakpoint de tablet passou a iniciar em 820 px, atendendo iPad Pro em modo retrato.
- A câmera ocupa toda a altura útil da coluna esquerda e permanece visível enquanto as opções da direita são percorridas.
- Eliminado o espaço vazio abaixo da câmera em telas verticais grandes.
- Captura elevada para resolução ideal de 960 × 720 e vídeo mais fluido, mantendo inferências limitadas por trava de processamento.
- Modelos faciais passam a usar cache diário no servidor web, reduzindo o tempo de inicialização nas visitas seguintes.
- Reduzido o intervalo de leitura para resposta mais rápida.
- Leituras com mais de um rosto são bloqueadas sem tentar identificar ninguém.
- Imagens pouco nítidas são recusadas antes da comparação de identidade.
- Cada etapa da prova de vida exige confirmação em quadros consecutivos.
- A prova de vida fica vinculada ao mesmo rosto; troca de pessoa ou saída prolongada da câmera reinicia o desafio.
- Correspondências de menor confiança exigem um quadro adicional de confirmação.
- Falhas de envio não mantêm o colaborador bloqueado por um minuto para nova tentativa.
- Mensagens visuais distinguem claramente falha de leitura de ponto efetivamente não registrado.
- O descritor detectado passou a ser recalculado no backend contra todos os cadastros do tenant.
- O backend rejeita identidade divergente, leitura ambígua, score adulterado ou ausência das salvaguardas do desafio.
- A suíte passou para 36 cenários e inclui tentativa de registrar um colaborador usando o rosto de outro.
