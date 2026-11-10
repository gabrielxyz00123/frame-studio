# Frame Studio

Fonte recuperada da publicação atual da Vercel, com correções de áudio, prompts, paginação, limpeza e confiabilidade do worker.

Consulte [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) para escopo, atualização e limites da validação. A versão publicada contém recursos ausentes na antiga branch main; os arquivos de R2, compartilhamento, fila e ferramentas foram preservados.

```sh
npm test
npm run build
```

Os testes usam respostas simuladas e não enviam gerações pagas. O runtime declarado é Node 22.x. As dependências de FFmpeg são as da publicação Linux existente.

Para a prévia com dados fictícios, execute `node scripts/preview-tests.mjs` e abra `http://127.0.0.1:4319`. Para executar o aplicativo com os serviços reais, configure as variáveis do servidor e execute `npm run dev`; a configuração pública corresponde ao Supabase do projeto existente.

Segredos ficam nas variáveis de ambiente, nunca neste repositório. `public/config.js` contém somente a URL e a chave pública publishable, que já são entregues aos navegadores. As políticas do Supabase continuam responsáveis pelo isolamento entre contas.
