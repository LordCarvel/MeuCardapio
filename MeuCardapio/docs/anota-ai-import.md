# Importacao de Cardapio do Anota AI

O desserializador le um arquivo HAR exportado pelo navegador e gera um backup JSON do MeuCardapio.
O HAR e o backup gerado contem dados da loja e ficam ignorados pelo git.

## Gerar HAR

1. Abra a loja no navegador.
2. Abra DevTools > Rede/Network.
3. Marque `Preservar log` e `Desabilitar cache`.
4. Recarregue a pagina e aguarde o cardapio aparecer.
5. Exporte a rede como HAR com conteudo.

## Converter

```powershell
npm run import:anota -- "$env:USERPROFILE\Downloads\pedido.anota.ai.har" meucardapio-backup-anota.json
```

O arquivo `meucardapio-backup-anota.json` pode ser importado no painel local do MeuCardapio.

## Importar pelo painel

No painel, abra **Cardapio** e clique em **Importar cardapio**.
O botao aceita o HAR capturado do Anota AI ou um JSON ja convertido, importa categorias e produtos para a loja atual e preserva pedidos, usuarios e configuracoes.
