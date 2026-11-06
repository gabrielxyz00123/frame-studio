# Frame Studio

Aplicação web privada para preparar e gerar vídeos com a API da Higgsfield. A geração de vídeo usa **Wan 3.0 Reference-to-Video**. O projeto Vercel existente é `frame-studio`, publicado em https://frame-studio-mauve.vercel.app.

## Fluxo: do upload ao MP4

1. O usuário entra com e-mail e senha pelo Supabase Auth. Biblioteca, modelos, prompts, lotes e arquivos pertencem à conta, protegidos por RLS.
2. Cadastra uma modelo com foto e características. As características ficam separadas dos prompts operacionais.
3. Escolhe **Troca direta**, **Com primeiro frame** ou **Múltiplas pessoas** (2 a 4 associações de pessoa e modelo).
4. Adiciona os vídeos. O corte opcional acontece no navegador, antes do upload, para enviar apenas o trecho escolhido. Sem corte, a referência deve ser MP4 de 1–15 segundos, até 50 MB. O recorte aceita origem maior (até 500 MB), produzindo MP4 H.264/AAC de até 50 MB.
5. Os arquivos vão para o bucket privado `frame-private`. O servidor cria URLs temporárias para a Higgsfield acessar as referências.
6. O site tenta consultar o preço da conta em `/estimate/<modelo>`. Se o provedor não retornar um preço numérico, exibe uma estimativa da tabela pública **sem desconto**, identificada como tal. A geração só começa depois da confirmação do usuário.
7. O lote é enviado sequencialmente. Um bloqueio temporário no banco evita que duas sessões processem o mesmo lote. A página consulta o estado de cada pedido até finalizar.
8. O vídeo aparece no player em **Meus lotes**. O servidor tenta guardar uma cópia privada no Supabase e o botão **Baixar MP4** gera uma URL temporária de download. Se a cópia falhar, o resultado original do provedor continua disponível enquanto não expirar.

**Mantenha a aba aberta** durante a execução do lote. Ao fechar, a Higgsfield continua o pedido que já recebeu, mas os próximos envios aguardam **Retomar lote**. Não há worker permanente, cron ou webhook configurado. Uma falha de comunicação ambígua não é reenviada automaticamente.

## Regras atuais

- Máximo de **15 segundos por vídeo gerado**, validado na interface e no servidor; mínimo de 2 segundos.
- Até 300 vídeos de origem e 300 saídas no total por lote. As variações são distribuídas entre as referências.
- Resoluções: 480p, 720p e 1080p. Proporções: 16:9, 4:3, 1:1, 3:4, 9:16 e automático.
- Os **valores totais estimados e as confirmações de custo usam 3 casas decimais**, com vírgula na interface. As tarifas por segundo são mostradas separadamente.
- Wan 3.0 recebe imagem e vídeo como referências. O modo com quadro editado **não garante reprodução exata do primeiro frame nem transferência perfeita de movimento**; esses resultados precisam ser avaliados.
- O percentual da barra de progresso é uma estimativa da interface. A Higgsfield informa estados, não uma porcentagem real.

## APIs e arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `api/higgsfield.js` | Função Node.js da Vercel. Valida o usuário, propriedade dos arquivos e bloqueio do lote; chama a Higgsfield; consulta preços/status; criptografa credenciais; arquiva o vídeo. |
| `public/generation.js` | Preparação, orçamento, confirmação, fila sequencial, pausa/retomada, player e download. |
| `public/trim.js` | Corte local e recodificação de vídeo/áudio com MediaRecorder e Web Audio. |
| `public/progress.js` | Progresso estimado por etapa. |
| `public/auth.js` | Supabase Auth, biblioteca privada e upload da foto da modelo. |
| `public/prompts.js` / `public/defaults.js` | Prompts separados e seus padrões. |
| `public/app.js` | Navegação, modelos, seleção dos arquivos, rascunhos e lixeira de lotes. |
| `public/index.html` / `public/style.css` | Interface. |
| `scripts/build.mjs` | Gera `public/config.js` a partir das variáveis públicas do Supabase. |
| `supabase/schema.sql` | Estrutura completa para configurar **um projeto Supabase novo** de desenvolvimento. |
| `supabase/migrations/` | Histórico dos ajustes já feitos. Alguns arquivos incluem operações pontuais da implantação original; não os reaplique indiscriminadamente em produção. |

A origem da API é `https://api.higgsfield.ai`. Chamadas em `api/higgsfield.js`:

- `alibaba/wan-3.0/reference-to-video`: os três fluxos de vídeo.
- `alibaba/qwen-image-3/edit`: edição opcional do primeiro quadro; a animação continua no Wan.
- `/estimate/<modelo>`: orçamento da conta, quando disponível.
- `/requests/<id>/status`: estado e arquivo final.
- `/files/generate-upload-url`: validação das credenciais, sem geração paga.

## Onde o áudio é tratado

- `public/trim.js`: `trimVideo()` cria um `AudioContext`, conecta o áudio do elemento de vídeo a `createMediaStreamDestination()` e inclui essas faixas no `MediaStream` gravado. O MP4 recortado usa AAC a 128 kbit/s quando o navegador suporta essa combinação. O áudio da origem não é reproduzido nas caixas durante o corte.
- `public/generation.js`: o plano define `generateAudio: true` e envia essa opção ao servidor.
- `api/higgsfield.js`: converte a opção para **`generate_audio`** no pedido ao Wan. Também contém `referenceAudio()`: quando o registro da mídia tem `audioPath`, lê um WAV privado (até 15 MB), envia pela API de arquivos da Higgsfield e inclui `audio_urls` com instruções de fala. O fluxo atual de upload da interface não cria esse WAV automaticamente; portanto esse caminho depende de uma mídia previamente preparada com `audioPath`.
- O áudio final é produzido pelo provedor dentro do MP4. **Não há uma etapa de extrair e recolocar o áudio original no vídeo final**, nem garantia de preservação idêntica da voz ou sincronização perfeita. Para mudar isso, esses são os pontos a alterar.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha localmente. O arquivo de exemplo contém somente nomes, sem valores. Nunca envie `.env.local` ou segredos ao Git.

| Nome | Uso |
| --- | --- |
| `SUPABASE_URL` | Obrigatória: URL do projeto Supabase; usada pelo servidor e pelo build da configuração pública. |
| `SUPABASE_PUBLISHABLE_KEY` | Obrigatória: chave pública publishable/anon do Supabase. É entregue ao navegador no build; a proteção dos dados depende de RLS. |
| `FRAME_CREDENTIAL_KEY` | Obrigatória para salvar chaves: segredo base64 de 32 bytes para AES-256-GCM, exclusivo do servidor. **Não trocar sem planejar a migração das credenciais já criptografadas.** |
| `HF_CREDENTIALS` | Opcional: credencial global de fallback em formato ID:Secret. No uso normal, cada usuário salva a própria chave criptografada no Supabase. |
| `HF_TEST_EMAILS` | Opcional: lista de e-mails autorizados a usar a credencial global de fallback. |
| `PORT` | Opcional, apenas para o servidor local; padrão 3000. |

A chave Higgsfield de cada usuário fica criptografada na tabela `frame_credentials`, vinculada ao `owner_id`; ela **não é uma variável global da Vercel** e não deve ser copiada para o repositório. Na Vercel ficam o segredo de criptografia e as variáveis de configuração do servidor. Valores de produção não estão neste repositório.

## Rodar localmente

Requisitos: **Node.js 22** e npm. O app e o servidor local usam APIs nativas do Node; não é necessário instalar dependências de runtime.

```sh
git clone https://github.com/gabrielxyz00123/frame-studio.git
cd frame-studio
cp .env.example .env.local
# Preencha .env.local com seu projeto de desenvolvimento.
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env.local` em vez de `cp`, se preferir. Acesse http://localhost:3000.

Use preferencialmente um **Supabase de desenvolvimento**. Execute `supabase/schema.sql` no SQL Editor desse projeto e configure os redirecionamentos de autenticação para localhost. Gere um segredo de criptografia próprio para desenvolvimento; não reutilize o segredo de produção. Depois entre pelo site local e cadastre sua chave da Higgsfield em Integração. Gerações reais, inclusive em localhost, podem consumir saldo do provedor.

```sh
npm run build  # gera a configuração pública do Supabase
npm test      # testes simulados; não enviam gerações pagas
```

Não use apenas um servidor de arquivos estáticos: as rotas `/api/higgsfield` também precisam funcionar. O comando `npm run dev` inclui essa rota.

## Publicação e continuidade por outro desenvolvedor

O repositório é privado. O desenvolvedor/Claude deve usar uma conexão GitHub autorizada pelo proprietário; ter a URL não concede acesso aos segredos ou aos dados da biblioteca.

O projeto Vercel existente deve estar ligado a este repositório, com **Production Branch = main**, framework Other, diretório raiz na raiz do repositório, build `npm run build` e saída `public`. Cada push em main deve criar uma publicação de produção. Antes de publicar, configure as variáveis obrigatórias na Vercel. `public/config.js` é gerado e ignorado pelo Git, para não versionar valores de chave.

A cópia inicial dos arquivos públicos foi obtida diretamente da publicação ativa, preservando também o recorte, a confirmação em diálogo próprio e a barra de progresso. As alterações de configuração para usar variáveis estão identificadas pelo build e por este README.
