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

## 3. Usar a inbox

- Mensagens recebidas chegam pelo webhook e aparecem em `Atendimento`.
- Selecione uma conversa na lateral.
- Digite a resposta no campo inferior e clique em `Enviar`.

## 4. Render

Depois do deploy, configure a URL publica da API no frontend (`VITE_API_BASE_URL`) e use a URL do webhook mostrada no painel. O webhook precisa ser acessivel publicamente pela WaSenderAPI.

## Observacao

A WaSenderAPI usa sessao de WhatsApp. Ela permite testar rapido, mas tem mais risco operacional que a API oficial da Meta. Use um numero de teste no free trial antes de conectar o numero principal da loja.
