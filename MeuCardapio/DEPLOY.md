# Deploy do MeuCardapio

Este projeto usa 3 servicos em producao:

1. Supabase: banco PostgreSQL.
2. Render: backend Spring Boot em Docker.
3. GitHub Pages: front-end Vite/React.

A ordem certa e esta:

1. Criar o banco no Supabase e copiar os dados de conexao.
2. Subir a API no Render usando esses dados.
3. Publicar o front no GitHub Pages apontando para a API do Render.

Nunca coloque senha do Supabase no front-end. O front usa somente `VITE_API_BASE_URL`; a API no Render usa as variaveis `DATABASE_*`.

## Antes de comecar

Voce precisa ter:

- Repositorio no GitHub: `https://github.com/LordCarvel/MeuCardapio`.
- Branch principal: `main`.
- Conta no Supabase.
- Conta no Render conectada ao GitHub.
- GitHub Pages habilitado pelo repositorio.

Arquivos importantes deste deploy:

- `render.yaml`, na raiz do repositorio.
- `.github/workflows/deploy-pages.yml`, na raiz do repositorio.
- `MeuCardapio/vite.config.js`, com base `/MeuCardapio/` no build do GitHub Pages para rotas da SPA como `/loja/{id}`.
- `MeuCardapio/backend/Dockerfile`, usado pelo Render.

## 1. Supabase: banco PostgreSQL

### 1.1 Criar o projeto

1. Acesse o Supabase.
2. Clique em `New project`.
3. Escolha a organizacao.
4. Defina um nome, por exemplo `meucardapio`.
5. Crie ou salve a senha do banco. Ela sera usada depois como `DATABASE_PASSWORD`.
6. Escolha a regiao mais proxima do publico ou do Render.
7. Aguarde o projeto ficar pronto.

### 1.2 Copiar os dados de conexao

1. Abra o projeto no Supabase.
2. Va em `Connect`.
3. Escolha `Session pooler`.
4. Copie:
   - host do pooler
   - porta
   - database
   - user
   - password

Para Render, prefira `Session pooler`, porque funciona bem com servicos hospedados e evita problema de IPv4/IPv6.

### 1.3 Montar as variaveis para o Render

Use este formato:

```text
DATABASE_URL=jdbc:postgresql://HOST_DO_POOLER:5432/postgres?sslmode=require
DATABASE_USERNAME=USUARIO_DO_POOLER
DATABASE_PASSWORD=SUA_SENHA_DO_SUPABASE
DATABASE_DRIVER=org.postgresql.Driver
```

Normalmente, no Supabase, o usuario do pooler fica assim:

```text
DATABASE_USERNAME=postgres.PROJECT_REF
```

Exemplo do formato final:

```text
DATABASE_URL=jdbc:postgresql://aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require
DATABASE_USERNAME=postgres.abcdefghijklmnopqrst
DATABASE_PASSWORD=SUA_SENHA_DO_SUPABASE
DATABASE_DRIVER=org.postgresql.Driver
```

Se voce decidir usar conexao direta em vez do pooler, use:

```text
DATABASE_URL=jdbc:postgresql://db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=SUA_SENHA_DO_SUPABASE
DATABASE_DRIVER=org.postgresql.Driver
```

### 1.4 O que o banco deve criar

Voce nao precisa criar tabelas manualmente. Quando a API iniciar no Render, o Flyway executa:

```text
MeuCardapio/backend/src/main/resources/db/migration/V1__create_core_schema.sql
```

Depois do primeiro deploy da API, confira no `Table Editor` do Supabase se existem estas tabelas:

```text
stores
products
orders
order_items
categories
store_users
app_logs
```

### 1.5 Avisos de RLS no Supabase

Se o Supabase mostrar erros como `RLS Disabled in Public` ou `Sensitive Columns Exposed`, isso significa que as tabelas do schema `public` estao expostas para a API REST do proprio Supabase.

Neste projeto, o front nao acessa o Supabase diretamente. O caminho correto e:

```text
Front GitHub Pages -> API Render -> PostgreSQL Supabase
```

Por isso, as tabelas devem ficar fechadas para acesso publico direto. A migration abaixo ja faz isso para projetos novos ou no proximo deploy da API:

```text
MeuCardapio/backend/src/main/resources/db/postgresql/V2__enable_supabase_rls.sql
```

Se voce quiser corrigir imediatamente pelo painel do Supabase, abra `SQL Editor` e rode:

```sql
alter table if exists public.stores enable row level security;
alter table if exists public.store_users enable row level security;
alter table if exists public.categories enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.order_items enable row level security;
alter table if exists public.app_logs enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
```

Depois disso, rode novamente o linter do Supabase. A API no Render deve continuar funcionando porque ela conecta pelo usuario PostgreSQL configurado em `DATABASE_USERNAME`, nao pelo acesso anonimo do Supabase.

## 2. Render: backend Spring Boot

O Render deve hospedar somente a API. O front nao sobe no Render.

A API publica fica neste formato:

```text
https://NOME-DO-SERVICO.onrender.com/api
```

O health check fica em:

```text
https://NOME-DO-SERVICO.onrender.com/api/health
```

### Opcao recomendada: Blueprint

Use esta opcao porque o repositorio ja tem `render.yaml` pronto na raiz.

1. Acesse o Render.
2. Clique em `New`.
3. Clique em `Blueprint`.
4. Conecte o repositorio `LordCarvel/MeuCardapio`.
5. Confirme que o Render encontrou o arquivo `render.yaml` na raiz.
6. Confirme o servico `meucardapio-api`.
7. Preencha as variaveis pedidas:

```text
DATABASE_URL
DATABASE_USERNAME
DATABASE_PASSWORD
APP_CORS_ALLOWED_ORIGINS
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
RESEND_API_KEY
RESEND_FROM
```

O `render.yaml` ja define:

```text
DATABASE_DRIVER=org.postgresql.Driver
```

Se o Render pedir tambem `DATABASE_DRIVER`, use exatamente:

```text
org.postgresql.Driver
```

### Envio de codigo por email

O login por codigo e a recuperacao de senha podem usar Resend por API HTTP ou SMTP. No Render free, prefira Resend, porque servicos gratuitos do Render podem bloquear trafego SMTP nas portas `25`, `465` e `587`.

#### Opcao recomendada no Render free: Resend

1. Crie uma conta em `https://resend.com`.
2. Crie uma API key.
3. No Render, configure:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
RESEND_FROM=MeuCardapio <onboarding@resend.dev>
```

Para teste inicial, `onboarding@resend.dev` funciona como remetente de sandbox do Resend. Para producao, valide um dominio seu no Resend e use um remetente desse dominio, por exemplo:

```text
RESEND_FROM=MeuCardapio <noreply@seudominio.com>
```

#### Opcao alternativa: Gmail SMTP

No Render, configure:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=seu-email@gmail.com
SMTP_PASSWORD=SENHA_DE_APP_DO_EMAIL
SMTP_FROM=seu-email@gmail.com
```

Para Gmail, nao use a senha normal da conta. Use uma senha de app criada nas configuracoes de seguranca da conta Google. Esta opcao pode exigir plano pago no Render porque depende de SMTP na porta `587`.

Endpoints disponiveis:

```text
POST /api/auth/request-signup-code
POST /api/auth/signup
POST /api/auth/request-code
POST /api/auth/verify-code
POST /api/auth/request-password-reset
POST /api/auth/reset-password
```

Teste para pedir codigo de login:

```powershell
$body = @{ email = "demo@meucardapio.local" } | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://NOME-DO-SERVICO.onrender.com/api/auth/request-code" `
  -ContentType "application/json" `
  -Body $body
```

Depois de receber o codigo por email:

```powershell
$body = @{
  email = "demo@meucardapio.local"
  code = "123456"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://NOME-DO-SERVICO.onrender.com/api/auth/verify-code" `
  -ContentType "application/json" `
  -Body $body
```

### Limpar cadastros de teste travados

Se voce testou cadastro por email e quer liberar um email que ficou cadastrado antes de concluir o teste, apague a loja desse email pelo `SQL Editor` do Supabase. Isso remove a loja e, por cascata, tambem remove o usuario, cardapio e pedidos dessa loja.

Para zerar todo o backend e manter apenas a estrutura das tabelas, rode:

```sql
begin;

truncate table
  public.auth_codes,
  public.app_logs,
  public.order_items,
  public.orders,
  public.products,
  public.categories,
  public.store_users,
  public.stores
restart identity cascade;

commit;
```

Nao apague a tabela `flyway_schema_history`. Ela registra quais migrations ja foram executadas.

O backend nao recria mais a loja demo automaticamente por padrao. Se algum dia quiser ligar o seed demo de novo no Render, configure:

```text
APP_DEMO_SEED_ENABLED=true
```

Troque os emails do exemplo pelos emails que voce quer liberar:

```sql
begin;

delete from public.stores
where id in (
  select store_id
  from public.store_users
  where lower(email) in (
    lower('email-de-teste@exemplo.com')
  )
);

delete from public.auth_codes
where lower(email) in (
  lower('email-de-teste@exemplo.com')
);

commit;
```

Para limpar apenas codigos de cadastro expirados, sem apagar nenhuma loja criada:

```sql
delete from public.auth_codes
where purpose = 'SIGNUP'
  and used_at is null
  and expires_at < now();
```

Para recuperacao de senha:

```powershell
$body = @{ email = "demo@meucardapio.local" } | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://NOME-DO-SERVICO.onrender.com/api/auth/request-password-reset" `
  -ContentType "application/json" `
  -Body $body
```

E depois:

```powershell
$body = @{
  email = "demo@meucardapio.local"
  code = "123456"
  password = "nova-senha"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://NOME-DO-SERVICO.onrender.com/api/auth/reset-password" `
  -ContentType "application/json" `
  -Body $body
```

### Valor correto do CORS

Em `APP_CORS_ALLOWED_ORIGINS`, coloque a origem do front, sem caminho no final.

Para este repositorio, a URL normal do GitHub Pages deve ser:

```text
https://lordcarvel.github.io
```

Nao coloque assim:

```text
https://lordcarvel.github.io/MeuCardapio
```

O CORS usa somente origem: protocolo + dominio + porta quando existir. Se um dia usar dominio proprio, separe por virgula:

```text
https://lordcarvel.github.io,https://www.seudominio.com
```

### Conferir configuracao do Blueprint

O `render.yaml` da raiz ja aponta para:

```text
Dockerfile Path: MeuCardapio/backend/Dockerfile
Docker Context: MeuCardapio/backend
Health Check Path: /api/health
```

Entao, no Blueprint, nao mude esses caminhos.

### Fazer o deploy

1. Clique para criar/aplicar o Blueprint.
2. Aguarde o build terminar.
3. Abra o servico criado no Render.
4. Copie a URL publica do servico.
5. Teste no navegador:

```text
https://NOME-DO-SERVICO.onrender.com/api/health
```

O esperado e uma resposta JSON da API.

Depois disso, guarde esta URL:

```text
https://NOME-DO-SERVICO.onrender.com/api
```

Ela sera usada no GitHub como `VITE_API_BASE_URL`.

### Opcao manual: Web Service sem Blueprint

Use so se nao quiser usar Blueprint.

1. Acesse o Render.
2. Clique em `New`.
3. Clique em `Web Service`.
4. Conecte o repositorio `LordCarvel/MeuCardapio`.
5. Escolha a branch `main`.
6. Em runtime, escolha `Docker`.
7. Configure:

```text
Name: meucardapio-api
Dockerfile Path: MeuCardapio/backend/Dockerfile
Docker Context: MeuCardapio/backend
Health Check Path: /api/health
```

8. Em variaveis de ambiente, adicione:

```text
DATABASE_URL=jdbc:postgresql://HOST_DO_POOLER:5432/postgres?sslmode=require
DATABASE_USERNAME=postgres.PROJECT_REF
DATABASE_PASSWORD=SUA_SENHA_DO_SUPABASE
DATABASE_DRIVER=org.postgresql.Driver
APP_CORS_ALLOWED_ORIGINS=https://lordcarvel.github.io
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
RESEND_FROM=MeuCardapio <onboarding@resend.dev>
```

9. Clique em deploy.
10. Teste:

```text
https://NOME-DO-SERVICO.onrender.com/api/health
```

## 3. GitHub Pages: front Vite/React

O GitHub Pages deve hospedar somente o front. Ele chama a API pelo valor de `VITE_API_BASE_URL`.

Neste projeto, o deploy automatico do front ja esta configurado em:

```text
.github/workflows/deploy-pages.yml
```

Esse workflow:

- roda quando houver push na branch `main`;
- instala dependencias em `MeuCardapio/`;
- faz build com `npm run build:pages`;
- gera `404.html` igual ao `index.html`, para o GitHub Pages entregar a mesma SPA em rotas diretas como `/MeuCardapio/loja/{id}`;
- publica `MeuCardapio/dist` no GitHub Pages;
- falha de proposito se `VITE_API_BASE_URL` estiver vazio ou apontando para `localhost`.

### 3.1 Configurar Pages

1. Abra o repositorio no GitHub.
2. Va em `Settings`.
3. Va em `Pages`.
4. Em `Build and deployment`, selecione:

```text
Source: GitHub Actions
```

5. Salve se o GitHub mostrar botao de salvar.

### 3.2 Criar a variavel da API

1. No GitHub, abra `Settings`.
2. Va em `Secrets and variables`.
3. Clique em `Actions`.
4. Abra a aba `Variables`, nao a aba `Secrets`.
5. Clique em `New repository variable`.
6. Crie:

```text
Name: VITE_API_BASE_URL
Value: https://NOME-DO-SERVICO.onrender.com/api
```

Exemplo:

```text
VITE_API_BASE_URL=https://meucardapio-api.onrender.com/api
```

Nao use:

```text
http://localhost:8080/api
```

Nao use a URL sem `/api` no final.

### 3.3 Publicar

Depois que a variavel existir, publique de uma destas formas.

Opcao A: push na `main`:

```bash
git add .
git commit -m "Prepare production deploy"
git push origin main
```

Opcao B: rodar manualmente:

1. No GitHub, abra `Actions`.
2. Clique em `Deploy GitHub Pages`.
3. Clique em `Run workflow`.
4. Escolha a branch `main`.
5. Confirme.

### 3.4 Conferir o deploy do Pages

1. Abra `Actions`.
2. Entre na execucao `Deploy GitHub Pages`.
3. Confirme que os jobs `build` e `deploy` ficaram verdes.
4. Abra a URL publicada:

```text
https://lordcarvel.github.io/MeuCardapio/
```

5. No app, abra a area de relatorios/diagnostico.
6. Confirme que ela mostra a API do Render, nao `localhost`.

## 4. Validacao local antes do deploy

Na raiz do front:

```bash
cd MeuCardapio
npm run build
```

Na pasta do backend:

```bash
cd MeuCardapio/backend
cmd /c mvnw.cmd test
cmd /c mvnw.cmd package -DskipTests
```

Se estiver no PowerShell ja dentro de `MeuCardapio/backend`, tambem pode usar:

```powershell
.\mvnw.cmd test
.\mvnw.cmd package -DskipTests
```

## 5. Checklist final de producao

Use esta ordem:

1. Supabase criado.
2. Senha do banco guardada.
3. Dados do Session pooler copiados.
4. Render criado por Blueprint ou Web Service manual.
5. Variaveis do Render preenchidas:

```text
DATABASE_URL
DATABASE_USERNAME
DATABASE_PASSWORD
DATABASE_DRIVER
APP_CORS_ALLOWED_ORIGINS
```

6. `APP_CORS_ALLOWED_ORIGINS` apontando para:

```text
https://lordcarvel.github.io
```

7. Health check da API funcionando:

```text
https://NOME-DO-SERVICO.onrender.com/api/health
```

8. GitHub Pages configurado com `Source: GitHub Actions`.
9. Variavel do GitHub criada:

```text
VITE_API_BASE_URL=https://NOME-DO-SERVICO.onrender.com/api
```

10. Workflow `Deploy GitHub Pages` verde.
11. Front abrindo:

```text
https://lordcarvel.github.io/MeuCardapio/
```

12. Diagnostico do front conectando na API.
13. Tabelas criadas no Supabase.

## 6. Como saber se funcionou 100%

Depois que Render e GitHub Pages estiverem publicados, faca estes testes nesta ordem.

### 6.1 Testar API diretamente

Abra no navegador:

```text
https://NOME-DO-SERVICO.onrender.com/api/health
```

Esperado:

```text
status UP
```

### 6.2 Testar banco via API

Abra:

```text
https://NOME-DO-SERVICO.onrender.com/api/stores
```

Esperado: uma lista JSON. Se a conta admin criou uma loja inicial ou se o seed demo rodou, a lista vem com pelo menos uma loja.

### 6.3 Testar front com API de producao

Abra:

```text
https://lordcarvel.github.io/MeuCardapio/
```

Entre no app, va em `Relatorios` e confira o bloco `Backend`.

Esperado:

```text
API conectada
```

Depois clique em `Gerar log`. Em seguida, confira no Supabase a tabela:

```text
app_logs
```

Se o log apareceu, o fluxo completo funcionou:

```text
GitHub Pages -> Render -> Supabase
```

## 7. Erros comuns

### Front abriu, mas nao conecta na API

Confira:

- `VITE_API_BASE_URL` no GitHub esta com `/api` no final.
- `VITE_API_BASE_URL` nao aponta para `localhost`.
- `APP_CORS_ALLOWED_ORIGINS` no Render tem `https://lordcarvel.github.io`.
- O deploy do Pages rodou depois de criar ou alterar `VITE_API_BASE_URL`.

### Render falha ao conectar no banco

Confira:

- `DATABASE_URL` comeca com `jdbc:postgresql://`.
- `DATABASE_URL` termina com `?sslmode=require`.
- `DATABASE_USERNAME` e o usuario correto do pooler.
- `DATABASE_PASSWORD` e a senha do banco Supabase.
- `DATABASE_DRIVER` e `org.postgresql.Driver`.

### Workflow do GitHub Pages falha em "Check production API URL"

Isso e esperado quando a variavel nao foi configurada corretamente. Crie ou corrija:

```text
Settings > Secrets and variables > Actions > Variables > VITE_API_BASE_URL
```

O valor deve ser:

```text
https://NOME-DO-SERVICO.onrender.com/api
```

### CORS bloqueado no navegador

No Render, corrija:

```text
APP_CORS_ALLOWED_ORIGINS=https://lordcarvel.github.io
```

Depois faca novo deploy/restart da API.

### GitHub Pages mostra tela antiga

1. Abra `Actions`.
2. Confirme que o workflow mais recente terminou com sucesso.
3. Recarregue a pagina com cache limpo.
4. Confira se a URL e:

```text
https://lordcarvel.github.io/MeuCardapio/
```
