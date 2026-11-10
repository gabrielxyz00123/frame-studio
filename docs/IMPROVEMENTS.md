# Correções sobre a publicação atual do Frame Studio

Base recuperada da implantação Vercel `CxLv3JM9dyBTEmUfqh5MxUbpthFa`, observada em 10/11/2026. Essa fonte é mais recente que a main `0f0eb2c` do GitHub.

## O que foi preservado

Armazenamento R2 com fallback ao Supabase; compartilhamento; biblioteca de modelos; fila de produção; duração automática; múltiplas pessoas; troca de roupa; edição de primeiro frame; paralelismo; junção de áudio e limpeza de metadados. O carregamento de módulos via `defaults.js` permanece único, sem duplicar os scripts de ferramentas.

O worker já existe na versão publicada e seu endpoint de disponibilidade retornou `configured:true`. Isso confirma suas variáveis de configuração, mas não comprova que um agendador externo esteja chamando o endpoint regularmente. Não foi criado outro worker nem alterado o agendamento.

## Correções implementadas

- Áudio WAV com MIME correto, separado da barra de progresso. O cache distingue Blobs diferentes de mesmo tamanho. A extração também é tentada sem corte. Mantida a cópia de alta qualidade para o muxing já existente. Falhar no upload de alta qualidade não descarta a referência de áudio principal.
- Prompts da conta substituem os padrões iniciais, sem apagar edições em andamento ou aceitar respostas atrasadas de outra conta. A sincronização do editor avançado foi preservada.
- Histórico em páginas de 20 lotes; lixeira consultada separadamente; contagens totais de ativos e lixeira. Filtros e exportações indicam que consideram os lotes carregados. Os players existentes continuam carregando o vídeo sob demanda.
- Repetição manual de falhas confirmadas, com nova consulta ao provedor, nova confirmação de custo, UUID de tentativa e histórico. Concluídos, estados incertos e conteúdo recusado não são reenviados. Lotes de servidor permanecem no fluxo de servidor.
- Limpeza de arquivos órfãos antigos no R2 e no Supabase: 30 dias, revisão assinada por conta, validade de 10 minutos e nova verificação dos vínculos. Registros de mídia, modelos, lotes e lixeira são protegidos. Pequenas revisões de até 4 arquivos e timeout evitam uma exclusão longa em função de 60 segundos. Nenhum arquivo real foi apagado.
- Worker salva o estado de envio antes da chamada paga e grava os IDs recebidos imediatamente. Perda de resposta deixa a tentativa como incerta e pausa o lote, em vez de reenviar automaticamente. Isso vale para vídeo e edição de quadro. A preferência de repetir uma falha confirmada passa a ser registrada no lote de servidor.

## Atualização

1. Publicar primeiro uma versão de teste a partir desta fonte completa, mantendo as variáveis atuais da Vercel. Não trocar `FRAME_CREDENTIAL_KEY`: as chaves salvas dependem dela.
2. Executar `node scripts/check.mjs` e `node scripts/build.mjs`. O build valida a configuração pública já presente e sua correspondência com as APIs; não troca o projeto Supabase por variáveis de outro ambiente.
3. Aplicar e validar `supabase/migrations/reliability.sql` em desenvolvimento antes de produção. É uma migração aditiva: índice do histórico, aceitação de `audio/wav` no fallback e política de exclusão limitada à pasta do próprio usuário no bucket privado.
4. Preservar o agendador e `SUPABASE_SERVICE_KEY`/`CRON_SECRET` existentes. Não enviar uma geração real como teste sem confirmar seu custo.
5. Verificar a prévia e, depois, promover a publicação. Não há alteração automática de produção neste pacote.

## Validação

Treze suítes locais verificam os casos originais e áudio, prompts, paginação, limpeza nos dois armazenamentos, repetição e perda de resposta no worker. Runtime local: Node 24.22.1; o projeto declara Node 22.x e deve ser verificado também nesse runtime na CI.

A prévia local, com dados fictícios, confirmou contagem total de 45 lotes e carregamento inicial de 20, prompts salvos aplicados, fila, compartilhamento, roupa e paralelismo presentes, carregamento único de módulos e ausência de erros de console nos fluxos inspecionados.

Não foram executados SQL em produção, geração paga, reprodução audiovisual de uma geração real, teste do FFmpeg na Vercel nem um ciclo real do agendador. As mudanças não garantem consistência facial ou lip sync perfeitos: continuam dependendo do modelo generativo e da origem.

## Reversão

Voltar para a implantação Vercel anterior preserva dados e credenciais. Jobs `submitting`/`uncertain` devem ser reconciliados com Requests antes de nova tentativa. A migração aditiva não precisa ser removida para reverter o código.
