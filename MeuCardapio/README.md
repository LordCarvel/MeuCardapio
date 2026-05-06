# MeuCardapio Ops

Painel front-end para operacao local de pedidos, cardapio, entregas, loja, usuarios e configuracoes. Nesta etapa os dados ficam no navegador via `localStorage`, em um workspace que pode guardar varias lojas/perfis locais.

## Rodar Local

```bash
npm install
npm run dev
```

## Backend Spring Boot

O backend fica em `backend/` como um modulo Maven/Spring Boot padrao, para o IntelliJ IDEA importar e executar como projeto Java. Ele roda na porta `8080`.

```bash
cd backend
./mvnw spring-boot:run
```

No Windows, use:

```bash
cd backend
.\mvnw.cmd spring-boot:run
```

Endpoints principais:

- `GET /api/health`
- `GET /api/stores`
- `POST /api/stores`
- `GET /api/stores/{storeId}/products`
- `POST /api/stores/{storeId}/products`
- `GET /api/stores/{storeId}/orders`
- `POST /api/stores/{storeId}/orders`
- `PUT /api/stores/{storeId}/orders/{orderId}`
- `PATCH /api/stores/{storeId}/orders/{orderId}/status`
- `DELETE /api/stores/{storeId}/orders/{orderId}`
- `GET /api/logs`
- `POST /api/logs`
- `GET /api/reports/summary?storeId={storeId}`

Ao iniciar com banco vazio, a API cria uma loja demo:

- email: `demo@meucardapio.local`
- senha: `123456`

O front tem um painel de diagnostico na aba `Relatorios`. Ele consulta `VITE_API_BASE_URL` ou, por padrao, `http://localhost:8080/api`.

### Modo Piloto Controlado

No front, use o botao `Piloto off/Piloto online` no topo da tela para abrir o painel de teste real controlado.

Fluxo recomendado:

1. Suba o backend em `http://localhost:8080/api`.
2. Clique em `Ligar piloto` e confira se a loja da API aparece no painel.
3. Clique em `Backup JSON` antes de operar pedidos reais.
4. Deixe `Sincronizar novos pedidos` e `Sincronizar mudanca de status` como `Automaticamente`.
5. Se algum pedido ficar sem API, use `Sincronizar pendentes`.
6. Use `Log teste` para confirmar escrita em `app_logs`.

Durante o piloto, o front continua salvando no navegador. Se a API cair, os pedidos ficam marcados como pendentes e podem ser reenviados depois.

### IntelliJ IDEA

Abra a pasta `C:\Users\CPU\Downloads\MeuCardapio` no IntelliJ IDEA e use `Reload All Maven Projects`. O Maven raiz importa `MeuCardapio/backend` como modulo Spring Boot. Depois disso, rode a classe `MeuCardapioApplication` ou o goal `spring-boot:run` do modulo `backend`.

## Banco No Supabase

1. Crie um projeto em https://supabase.com.
2. Abra `Project Settings > Database`.
3. Copie os dados de conexao PostgreSQL. Para Java, use a conexao direta ou transaction pooler com SSL.
4. No terminal, configure as variaveis antes de subir o backend:

```bash
$env:DATABASE_URL="jdbc:postgresql://SEU_HOST:5432/postgres?sslmode=require"
$env:DATABASE_USERNAME="postgres"
$env:DATABASE_PASSWORD="SUA_SENHA_DO_SUPABASE"
$env:DATABASE_DRIVER="org.postgresql.Driver"
$env:APP_CORS_ALLOWED_ORIGINS="http://localhost:5173"
cd backend
.\mvnw.cmd spring-boot:run
```

5. Na primeira execucao, o Flyway cria as tabelas usando `backend/src/main/resources/db/migration/V1__create_core_schema.sql`.
6. Para conferir no Supabase, abra `Table Editor` e veja as tabelas `stores`, `products`, `orders` e `app_logs`.

Se publicar o front em outro dominio, adicione esse dominio em `APP_CORS_ALLOWED_ORIGINS`.

No primeiro acesso, o app abre o onboarding da loja para cadastrar:

- perfil comercial e fiscal
- endereco operacional
- parametros iniciais de atendimento
- usuario dono da operacao

Depois disso, o login passa a usar o usuario criado no onboarding. Cada perfil representa uma loja diferente dentro do MeuCardapio e precisa ser selecionado antes de abrir o painel principal.

## Build

```bash
npm run build
npm run preview
```

O Vite usa `base: './'` no build local e `/MeuCardapio/` no build do GitHub Pages. O deploy tambem gera `404.html` igual ao `index.html`, para rotas diretas da SPA como `/MeuCardapio/loja/{id}` abrirem no mesmo front.

## Deploy

Veja o passo a passo atualizado em [DEPLOY.md](DEPLOY.md). O fluxo recomendado e: backend Spring Boot no Render via Docker, banco PostgreSQL no Supabase e front Vite/React no GitHub Pages via GitHub Actions.

## Deploy Manual No GitHub Pages

1. Rode `npm run deploy`.
2. O pacote `gh-pages` publica o conteudo de `dist/` na branch `gh-pages`.
3. No GitHub, abra `Settings > Pages`.
4. Selecione `Deploy from a branch`.
5. Escolha a branch `gh-pages` e a pasta `/root`.

Nao ha GitHub Actions neste fluxo. O arquivo `public/.nojekyll` e copiado para o build para evitar processamento do Pages.

## Estrutura

```text
src/
  modules/
    store/
      StoreAccess.jsx
      StoreAccess.module.css
      StoreDeletePrompt.jsx
      StoreDeletePrompt.module.css
      StoreProfileForm.jsx
      StoreProfileForm.module.css
      storeAuth.js
      storeProfile.js
    storage/
      browserStorage.js
  App.jsx
  App.css
```

O dominio de loja/autenticacao foi separado em `src/modules/store`, incluindo onboarding, autenticacao e workspace multi-loja. O `App.jsx` ainda concentra a aplicacao legada e os proximos recortes naturais continuam sendo `orders`, `delivery`, `menu`, `settings` e `reports`.
