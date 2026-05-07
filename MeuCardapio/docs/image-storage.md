# Imagens do Cardapio

O app salva apenas a URL da imagem em `categories.imageUrl` e `products.imageUrl`.
Nao salve o binario da imagem no banco: isso aumenta custo, backup, latencia e tamanho das respostas da API.

Opcoes gratuitas viaveis:

- Supabase Storage: melhor encaixe se o projeto ja usar Supabase. Crie um bucket publico `menu-images`, envie a imagem e grave a URL publica no cadastro.
- Cloudinary free tier: bom para redimensionar e otimizar imagens automaticamente. Grave a URL HTTPS retornada pelo upload.
- GitHub Pages/static assets: serve para testes e imagens fixas, mas nao e ideal para lojistas subirem imagens pelo painel.

Para producao, prefira Supabase Storage ou Cloudinary. O banco deve guardar somente metadados:

```json
{
  "name": "Pizza 35cm",
  "imageUrl": "https://..."
}
```

