/* Barra de progresso da geração.
   A Higgsfield informa só o estado (na fila / gerando / concluído), sem porcentagem.
   Por isso a barra é uma ESTIMATIVA: avança por etapa e, dentro da etapa, por tempo,
   e só chega a 100% quando o vídeo termina de verdade. */
(function () {
  const $ = s => document.querySelector(s);
  const BASE = { prepare: 0.03, frame: 0.05, submit: 0.08, queued: 0.10, in_progress: 0.25, completed: 0.96, archive: 0.96, between: 0 };
  const LABELS = {
    prepare: 'Preparando', frame: 'Editando o primeiro quadro', submit: 'Enviando à Higgsfield',
    queued: 'Na fila da Higgsfield', in_progress: 'Gerando o vídeo', completed: 'Guardando o vídeo',
    archive: 'Guardando o vídeo', between: 'Saída concluída'
  };
  let st = null, timer = null;

  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function fraction(stage, t, tau) {
    if (stage === 'queued') return 0.10 + 0.15 * (1 - Math.exp(-t / 20));
    if (stage === 'in_progress') return 0.25 + 0.70 * (1 - Math.exp(-t / tau));
    return BASE[stage] ?? 0;
  }

  function paint(pct, title, detail, mode) {
    const box = $('#gen-progress');
    if (!box) return;
    pct = Math.max(0, Math.min(100, pct));
    box.hidden = false;
    box.dataset.mode = mode || 'run';
    $('#gen-progress-title').textContent = title;
    $('#gen-progress-pct').textContent = Math.round(pct) + '%';
    $('#gen-bar-fill').style.width = Math.max(2, pct) + '%';
    box.querySelector('[role=progressbar]').setAttribute('aria-valuenow', String(Math.round(pct)));
    $('#gen-progress-detail').textContent = detail || '';
  }

  function tick() {
    if (!st || st.kind !== 'run') return;
    const t = (Date.now() - st.stageStart) / 1000;
    const pct = 100 * (st.done + fraction(st.stage, t, st.tau)) / st.total;
    st.pct = pct;
    const waiting = st.stage === 'queued' || st.stage === 'in_progress';
    paint(
      pct,
      'Saída ' + Math.min(st.job + 1, st.total) + ' de ' + st.total + ' · ' + (LABELS[st.stage] || st.stage),
      waiting ? 'Tempo nesta etapa: ' + fmt(t) + '. A barra é uma estimativa: a Higgsfield não informa a porcentagem real.' : '',
      'run'
    );
  }

  window.genProgress = {
    /* porcentagem atual (0 a 100) enquanto uma geração roda; senão null */
    current() { return st && st.kind === 'run' && typeof st.pct === 'number' ? st.pct : null; },
    /* total de saídas, quantas já terminaram, e tempo típico (segundos) da geração */
    begin(total, done, tau) {
      clearInterval(timer);
      st = { kind: 'run', total: Math.max(1, total), done: done || 0, job: done || 0, stage: 'prepare', stageStart: Date.now(), tau: tau || 90 };
      timer = setInterval(tick, 500);
      tick();
    },
    stage(job, stage) {
      if (!st || st.kind !== 'run') return;
      st.job = job;
      if (st.stage !== stage) { st.stage = stage; st.stageStart = Date.now(); }
      tick();
    },
    jobDone(ok) {
      if (!st || st.kind !== 'run') return;
      if (ok) st.done += 1;
      st.stage = 'between';
      st.stageStart = Date.now();
      tick();
    },
    end(ok, text) {
      clearInterval(timer);
      const pct = ok ? 100 : (st ? 100 * st.done / st.total : 0);
      paint(pct, ok ? 'Concluído' : 'Pausado', text || '', ok ? 'done' : 'error');
      st = null;
    },
    /* preparo dos arquivos: i = arquivo atual (0...), f = fração (0 a 1) dentro dele */
    prep(i, total, label, f) {
      clearInterval(timer);
      st = { kind: 'prep' };
      paint(100 * (i + f) / Math.max(1, total), 'Preparando arquivos · ' + (i + 1) + ' de ' + total, label, 'prep');
    },
    hide() {
      clearInterval(timer);
      st = null;
      const box = $('#gen-progress');
      if (box) box.hidden = true;
    }
  };
})();

/* Áudio de referência: extrai a fala do trecho cortado e guarda junto do vídeo,
   para o modelo usar a fala original (sem inventar outra). */
(function () {
  const pending = [];
  async function extractAudioWav(blob, maxSeconds) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.OfflineAudioContext) return null;
    const ctx = new AC();
    let buf;
    try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } catch { return null; } finally { try { await ctx.close(); } catch {} }
    if (!buf || buf.duration < 1) return null;
    const rate = 16000, len = Math.min(Math.round(buf.duration * rate), Math.round(maxSeconds * rate));
    const off = new OfflineAudioContext(1, len, rate), node = off.createBufferSource();
    node.buffer = buf; node.connect(off.destination); node.start(0);
    const out = (await off.startRendering()).getChannelData(0);
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak < 0.005) return null;
    const dv = new DataView(new ArrayBuffer(44 + out.length * 2));
    const w = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + out.length * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, out.length * 2, true);
    for (let i = 0; i < out.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 32767, true);
    return { blob: new Blob([dv], { type: 'video/mp4' }), duration: Math.round(out.length / rate * 100) / 100 };
  }
  window.extractAudioWav = extractAudioWav;

  const origTrim = window.trimVideo;
  if (origTrim) {
    window.trimVideo = async function () {
      const blob = await origTrim.apply(this, arguments);
      try { const wav = await extractAudioWav(blob, 15); if (wav) pending.push({ size: blob.size, wav }); } catch (e) { console.warn('Sem áudio de referência:', e); }
      return blob;
    };
  }

  function wrap(fn) {
    if (typeof fn !== 'function' || fn.audioWrapped) return fn;
    const wrapped = async function (method, input) {
      if (method === 'POST' && input && input.kind === 'media' && input.data && input.data.type === 'video/mp4') {
        const i = pending.findIndex(p => p.size === input.data.size);
        if (i >= 0) {
          const item = pending.splice(i, 1)[0];
          try {
            const { data: { user } } = await studioClient.auth.getUser();
            const path = user.id + '/' + crypto.randomUUID();
            const r = await studioClient.storage.from('frame-private').upload(path, item.wav.blob, { contentType: 'video/mp4', upsert: false });
            if (!r.error) input = { ...input, data: { ...input.data, audioPath: path, audioDuration: item.wav.duration } };
          } catch (e) { console.warn('Áudio de referência não enviado:', e); }
        }
      }
      return fn.call(this, method, input);
    };
    wrapped.audioWrapped = true;
    return wrapped;
  }
  let current = wrap(window.studioApi);
  Object.defineProperty(window, 'studioApi', { configurable: true, get: () => current, set: v => { current = wrap(v); } });
})();
