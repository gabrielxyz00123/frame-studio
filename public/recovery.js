/* A new paid attempt is allowed only after a definitive failure or rejection. */
(function () {
  window.retryableJob = job => job.status === 'failed';
  window.prepareFailedRetry = (batch, randomUUID = () => crypto.randomUUID()) => {
    const copy = structuredClone(batch);
    let count = 0;
    copy.jobs = copy.jobs.map(job => {
      if (!window.retryableJob(job)) return job;
      count++;
      return {
        attemptId: randomUUID(), sourceIndex: job.sourceIndex, variation: job.variation,
        status: 'prepared', attempts: [...(job.attempts || []), {
          attemptId: job.attemptId, requestId: job.requestId, status: job.status,
          error: job.error, finishedAt: new Date().toISOString()
        }]
      };
    });
    if (!count) throw Error('Não há falhas confirmadas para tentar novamente.');
    copy.status = 'paused'; copy.productionStatus = 'Falhas preparadas para nova tentativa';
    return copy;
  };
  window.retryFailedProduction = async batch => {
    // Recheck remote terminal status; never retry uncertain, submitting or refused content.
    for (const job of batch.jobs.filter(window.retryableJob)) {
      if (job.requestId) {
        const latest = await testAPI('status', job);
        if (latest.status !== 'failed') throw Error('O provedor não confirmou a falha. Atualize o lote antes de tentar novamente.');
      }
    }
    const next = window.prepareFailedRetry(batch);
    let quote;
    try { quote = await quoteBatch(next, true); }
    catch {
      const rate = RATES[next.resolution];
      const amount = next.jobs.filter(j => j.status === 'prepared').reduce((total, j) => total + (Math.ceil(next.sources[j.sourceIndex].duration) + (next.sources[j.sourceIndex].out||next.duration)) * rate, 0);
      quote = { estimatedCost: amount, priceSource: 'public-table' };
    }
    const count = batch.jobs.filter(window.retryableJob).length;
    if (!await askConfirm('Tentar novamente ' + count + ' saída(s) com falha confirmada? Esta é uma nova geração e pode gerar nova cobrança. Estimativa ' + (quote.priceSource === 'public-table' ? 'pública sem desconto: ' : 'da conta: ') + money(quote.estimatedCost) + '. Saídas concluídas ou sem confirmação não serão reenviadas.')) return;
    await saveProduction(next);
    if(next.serverMode){next.serverQueue=true;next.status='ready';next.productionStatus='Na fila do servidor';await saveProduction(next);renderBatches();}else await window.runProduction(next);
  };
})();
