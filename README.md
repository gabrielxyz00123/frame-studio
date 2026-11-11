# Frame Studio

Base: a publicação de produção `dpl_DH8FMZPtSsc4a18tkKELdHC2DjfR` (11/11/2026, com marcação por clique), lida da Vercel com hashes conferidos. Sobre ela foram aplicadas **só** correções de segurança, de fila e de cobrança. O fluxo de geração, os prompts e as telas são os mesmos da produção.

```sh
npm test                          # testes com respostas simuladas, sem gerações pagas
node scripts/preview-tests.mjs    # prévia com dados falsos e os mesmos cabeçalhos da Vercel (CSP)
```

## O que mudou em relação à produção

| Área | Mudança | Arquivos |
|---|---|---|
| Fila do servidor | Rodízio entre donos (`pickFair`), lotes atendidos há mais tempo primeiro (`srvLastRun`), fatia de tempo por lote, quarentena após 3 erros seguidos | `api/worker.js` |
| Cobrança dupla | Estado salvo antes e depois de cada chamada paga; envio sem confirmação vira "incerto" e pausa o lote, sem reenviar | `api/worker.js` |
| Downloads | URL do vídeo sempre consultada de novo na Higgsfield (nunca a salva no lote); todo download para ao passar do limite | `api/_limits.js`, `api/worker.js`, `api/higgsfield.js` |
| Armazenamento | Upload no R2 assinado com tamanho e tipo; limite por tipo; cota por conta (padrão 20 GB, `FRAME_STORAGE_QUOTA_MB`); erro de cota não cai no Supabase | `api/_r2.js`, `api/storage.js`, `lib/storage-quota.mjs`, `public/auth.js` |
| Compartilhamento | Links passam por `/api/share`, revogáveis, com URL do R2 de 5 minutos; botão "Revogar links" | `api/share.js`, `api/storage.js`, `public/tools2.js` |
| Chave global | Sem e-mails fixos no código: `HF_SERVER_KEY_USER_IDS` ou `HF_TEST_EMAILS` (só e-mail confirmado) | `api/higgsfield.js` |
| Cadastro | "Cadastre-se" escondido quando o cadastro está fechado no Supabase | `public/auth.js` |
| CSP | `script-src 'self' 'wasm-unsafe-eval'`; Supabase JS, JSZip e face-api servidos de `public/vendor/` (hashes conferidos com as CDNs) | `vercel.json`, `public/index.html`, `public/theme-init.js`, `public/library.js`, `public/faces.js` |

## Pendências fora do código

- Migrações `supabase/migrations/share-links.sql` e `storage-quota.sql` (aplicar primeiro em desenvolvimento; ver comentários no topo de cada uma). Sem elas: "Copiar link" mostra aviso e a cota não vale no Supabase.
- Links antigos (URL direta do R2, até 7 dias) expiram sozinhos; para cortar antes, girar a chave do R2.
- Este código não está no GitHub; publicar a partir da branch `main` antiga desfaz estas correções e a marcação por clique.
