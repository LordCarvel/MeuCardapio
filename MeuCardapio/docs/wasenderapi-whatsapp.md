# Integracao WhatsApp com WaSenderAPI

Este fluxo conecta o painel de Atendimento do MeuCardapio a uma sessao da WaSenderAPI.

## 1. Criar credenciais

1. Entre na WaSenderAPI.
2. Crie ou copie seu **Personal Access Token**.
3. No MeuCardapio, abra `Atendimento`.
4. Cole o token em `Personal Access Token`.
5. Informe o telefone com DDI e DDD, sem sinais. Exemplo: `5547999999999`.
6. Confira o campo `Webhook URL`. Ele deve apontar para:

```text
https://SUA-API-DO-RENDER/api/stores/ID-DA-LOJA/whatsapp/webhook
```

## 2. Criar e conectar sessao

1. Clique em `Salvar`.
2. Clique em `Criar/conectar`.
3. Escaneie o QR Code retornado pela WaSenderAPI com o WhatsApp do numero.
4. Clique em `Status` para confirmar a conexao.

Quando a sessao for criada, a API key da sessao fica salva no backend.

## 3. Espelhar conversas reais

- A inbox nao cria conversa a partir de pedido. Ela mostra somente conversas reais sincronizadas da sessao WhatsApp.
- Clique em `Puxar conversas` no painel para importar uma amostra paginada dos contatos/conversas sincronizados pela WaSenderAPI.
- Se a WaSenderAPI demorar ao listar contatos, o painel mantem as conversas ja salvas e continua recebendo novas conversas pelo webhook.
- Novas conversas e mensagens chegam pelo webhook (`chats.upsert`, `messages.upsert` e `messages.received`) e aparecem em `Atendimento`.
- Selecione uma conversa na lateral.
- Digite a resposta no campo inferior e clique em `Enviar`.
- Ao iniciar envio para um numero digitado, o backend consulta se o numero existe no WhatsApp antes de criar a conversa.
- Pedido sem WhatsApp, ou com numero que nao existe no WhatsApp, continua aparecendo em `Pedidos`, mas nao abre conversa na inbox.

## 4. Robo de atendimento

- O robo responde mensagens recebidas pelo webhook quando a integracao esta com `Robo ativo`.
- Ele reconhece intencoes comuns: pedir cardapio, consultar pedido, horario, pagamento, entrega, produtos do cardapio e chamar atendente.
- Quando um pedido e criado com WhatsApp valido, o backend envia a confirmacao do pedido pelo robo.
- Ao enviar mensagem manual pela inbox, o robo pausa automaticamente naquela conversa ate o fim do dia.
- Na conversa selecionada, use:
  - `Pausar hoje` para silenciar o robo ate 23:59.
  - `Pausar sem prazo` para atendimento humano sem retorno automatico.
  - `Retomar bot` para o robo voltar a responder.
  - `Cardapio` para enviar o link do cardapio digital sem criar conversa falsa.

## 5. Render

Depois do deploy, configure a URL publica da API no frontend (`VITE_API_BASE_URL`) e use a URL do webhook mostrada no painel. O webhook precisa ser acessivel publicamente pela WaSenderAPI.

## Observacao

A WaSenderAPI usa sessao de WhatsApp. Ela permite testar rapido, mas tem mais risco operacional que a API oficial da Meta. Use um numero de teste no free trial antes de conectar o numero principal da loja.
