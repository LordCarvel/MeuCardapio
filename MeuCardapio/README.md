# MeuCardapio Ops

Painel front-end para operacao local de pedidos, cardapio, entregas, loja, usuarios e configuracoes. Nesta etapa os dados ficam no navegador via `localStorage`, em um workspace que pode guardar varias lojas/perfis locais.

## Rodar Local

```bash
npm install
npm run dev
```

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

O Vite esta configurado com `base: './'`, entao o `dist/` funciona em subpastas como GitHub Pages.

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
