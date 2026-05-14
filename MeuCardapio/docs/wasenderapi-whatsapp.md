# Integracao WhatsApp com WaSenderAPI

Este fluxo conecta o painel de Atendimento do MeuCardapio a uma sessao da WaSenderAPI.

## 1. Criar credenciais

1. Entre na WaSenderAPI.
2. Crie ou copie seu **Personal Access Token** em `Settings > Personal Access Token`.
3. No MeuCardapio, abra `Atendimento`.
4. Cole o token em `Personal Access Token`.
5. Informe o telefone com DDI e DDD, sem sinais. Exemplo: `5547999999999`.
6. Se a sessao ja existir na WaSenderAPI, informe tambem o `ID numerico da sessao`. O backend usa o Personal Access Token para buscar e salvar automaticamente a API key da sessao.
7. Confira o campo `Webhook URL`. Ele deve apontar para:

```text
https://SUA-API-DO-RENDER/api/stores/ID-DA-LOJA/whatsapp/webhook
```

### Personal Access Token x API key

- Endpoints de conta/sessao (`/api/whatsapp-sessions`, criar, atualizar, conectar, QR Code e detalhes da sessao) usam `Authorization: Bearer PERSONAL_ACCESS_TOKEN`.
- Endpoints da sessao conectada (`/api/status`, `/api/contacts`, `/api/send-message`, `/api/on-whatsapp`) usam `Authorization: Bearer API_KEY_DA_SESSAO`.
- O MeuCardapio agora tenta obter a API key sozinho pelo endpoint de detalhes da sessao quando voce salva PAT + ID numerico da sessao. Voce so precisa colar a API key manualmente se a WaSenderAPI nao retornar esse campo.

## 2. Criar e conectar sessao

1. Clique em `Salvar`.
2. Clique em `Criar/conectar`.
3. Escaneie o QR Code retornado pela WaSenderAPI com o WhatsApp do numero.
4. Clique em `Status` para confirmar a conexao.

Quando a sessao for criada, a API key da sessao fica salva no backend. Campos secretos ja salvos aparecem como `salvo` no painel e podem ficar em branco nos proximos acessos.

## 3. Espelhar conversas reais

- Clique em `Sincronizar sessao` no painel para importar contatos, nomes/fotos e mensagens registradas pela WaSenderAPI.
- Contatos retornados por `/api/contacts` entram na lista mesmo sem mensagem salva. Use a aba `Contatos` para ver somente esses contatos.
- Conversas com mensagens reais entram por webhook (`chats.upsert`, `messages.upsert`, `messages.received` e `message.sent`) depois que a sessao esta conectada com o webhook atualizado.
- O endpoint de logs (`/api/whatsapp-sessions/{id}/message-logs`) recupera mensagens enviadas pela API quando `log_messages` esta ativo. A propria doc informa que, se o log estiver desligado, `content` e `to` podem vir vazios.
- A WaSenderAPI nao documenta um endpoint REST para baixar todo o historico antigo do WhatsApp como o app oficial faz. Historico anterior so entra se vier pelos logs da WaSenderAPI; mensagens novas entram pelo webhook a partir da conexao.
- Se a WaSenderAPI demorar ao listar contatos, o painel mantem o que ja esta salvo e continua recebendo novas conversas pelo webhook.
- Selecione uma conversa na lateral.
- Digite a resposta no campo inferior e clique em `Enviar`.
- Ao iniciar envio para um numero digitado, o backend consulta se o numero existe no WhatsApp antes de criar a conversa.
- Pedido sem WhatsApp, ou com numero que nao existe no WhatsApp, continua aparecendo em `Pedidos`, mas nao abre conversa na inbox.

## 4. Robo de atendimento

- O robo responde mensagens recebidas pelo webhook quando a integracao esta com `Robo ativo`.
- Ele reconhece intencoes comuns por palavras-chave e pontuacao: `WELCOME`, `MAKE_ORDER`, `VIEW_CATALOG`, `OPENING_HOURS`, `DELIVERY_INFO`, `PAYMENT_METHODS`, `ORDER_STATUS`, `STORE_ADDRESS`, `PROMOTIONS`, `HUMAN_SUPPORT` e `UNKNOWN`.
- Saudacoes como `oi`, `ola`, `bom dia`, `boa tarde` e `boa noite` recebem uma mensagem de boas-vindas com link do cardapio e instrucoes para pedido/atendente.
- Mensagens de audio, imagem, video, documento, localizacao e contato sao registradas; o robo pede resposta em texto ou encaminha o cliente para o cardapio/atendente quando necessario.
- Quando um pedido e criado com WhatsApp valido, o backend valida o numero na WaSenderAPI e envia a confirmacao do pedido pelo robo.
- Quando o status do pedido muda, o backend tambem envia uma atualizacao para o mesmo WhatsApp, se o robo estiver ativo.
- Ao consultar `pedido`, `status`, `andamento`, `cade` ou termos parecidos, o robo busca o pedido mais recente vinculado ao telefone do cliente e retorna status, total e entrega/retirada.
- As mensagens configuraveis de boas-vindas e fallback aceitam placeholders: `{username}`, `{link}`, `{saudacao}` e `{divide}`.
- Ao enviar mensagem manual pela inbox, o robo pausa automaticamente naquela conversa ate o fim do dia.
- Na conversa selecionada, use:
  - `Pausar hoje` para silenciar o robo ate 23:59.
  - `Pausar sem prazo` para atendimento humano sem retorno automatico.
  - `Retomar bot` para o robo voltar a responder.
  - `Cardapio` para enviar o link do cardapio digital sem criar conversa falsa.

### Treinamento do robo

O campo `JSON de treino` no painel do WhatsApp permite configurar respostas, palavras-chave, FAQ, intencoes personalizadas e regras de atendimento humano. Exemplo:

```json
{
  "orderMode": "catalog_only",
  "deliveryEnabled": true,
  "pickupEnabled": true,
  "paymentMethods": "Pix, cartao e dinheiro",
  "deliveryRegions": "Centro, Vila Nova, Bairro Alto",
  "deliveryFees": "Centro R$ 5,00; demais bairros R$ 8,00",
  "averagePrepTime": "30 a 45 minutos",
  "promotions": "Confira as ofertas no catalogo online.",
  "responses": {
    "WELCOME": "Ola, {nome_cliente}! Seja bem-vindo a {nome_da_loja}.\n\nResponda com uma opcao:\n1 - Ver produtos / catalogo\n2 - Fazer pedido\n3 - Acompanhar pedido\n4 - Entrega ou retirada\n5 - Formas de pagamento\n6 - Horario e endereco\n7 - Falar com atendente",
    "MAKE_ORDER": "Para fazer seu pedido, acesse:\n{link_catalogo}\n\nDepois responda 3 para acompanhar.",
    "UNKNOWN": "Nao entendi muito bem. Digite pedido, catalogo, horario, entrega, pagamento ou atendente."
  },
  "intentKeywords": {
    "MAKE_ORDER": ["quero pedir", "fazer pedido", "comprar"],
    "VIEW_CATALOG": ["catalogo", "cardapio", "produtos"],
    "HUMAN_SUPPORT": ["atendente", "humano", "cancelar", "reembolso"]
  },
  "faq": [
    {
      "question": "Tem produto sem lactose?",
      "keywords": ["sem lactose", "lactose"],
      "answer": "Temos algumas opcoes. Consulte o catalogo: {link_catalogo}",
      "enabled": true,
      "callHumanAfterAnswer": false
    }
  ],
  "customIntents": [
    {
      "id": "BULK_ORDER",
      "name": "Pedido em grande quantidade",
      "keywords": ["atacado", "grande quantidade", "evento"],
      "response": "Vou chamar um atendente para montar uma condicao especial.",
      "enabled": true,
      "humanEscalation": true
    }
  ],
  "humanRules": {
    "keywords": ["pedido errado", "nao chegou", "atrasou", "quero reembolso"],
    "pauseMode": "today"
  }
}
```

Variaveis aceitas nas respostas: `{nome_da_loja}`, `{tipo_negocio}`, `{nome_cliente}`, `{link_catalogo}`, `{horario_funcionamento}`, `{endereco_loja}`, `{formas_pagamento}`, `{lista_bairros_entrega}`, `{tempo_medio_preparo}`, `{link_acompanhamento}`, `{numero_pedido}`, `{saudacao}`, `{divide}`.

O painel tambem tem um teste de mensagem. Ele salva temporariamente a configuracao atual, envia a mensagem para o endpoint de teste e mostra intencao detectada, confianca, acao de atendimento humano e resposta final.

## 5. Render

Depois do deploy, configure a URL publica da API no frontend (`VITE_API_BASE_URL`) e use a URL do webhook mostrada no painel. O webhook precisa ser acessivel publicamente pela WaSenderAPI.

## Observacao

A WaSenderAPI usa sessao de WhatsApp. Ela permite testar rapido, mas tem mais risco operacional que a API oficial da Meta. Use um numero de teste no free trial antes de conectar o numero principal da loja.
