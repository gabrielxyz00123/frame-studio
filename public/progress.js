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
    async function render(rate) {
      const len = Math.min(Math.round(buf.duration * rate), Math.round(maxSeconds * rate));
      const off = new OfflineAudioContext(1, len, rate), node = off.createBufferSource();
      node.buffer = buf; node.connect(off.destination); node.start(0);
      return (await off.startRendering()).getChannelData(0);
    }
    function encode(out, rate) {
      const dv = new DataView(new ArrayBuffer(44 + out.length * 2));
      const w = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + out.length * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, out.length * 2, true);
      for (let i = 0; i < out.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 32767, true);
      return new Blob([dv], { type: 'video/mp4' });
    }
    const out = await render(16000);
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak < 0.005) return null;
    /* cópia em qualidade melhor (44,1 kHz), usada só na junção final */
    let hi = null;
    try { hi = encode(await render(44100), 44100); } catch (e) { hi = null; }
    return { blob: encode(out, 16000), hi, duration: Math.round(out.length / 16000 * 100) / 100 };
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
            if (!r.error) {
              input = { ...input, data: { ...input.data, audioPath: path, audioDuration: item.wav.duration } };
              if (item.wav.hi) {
                try {
                  const hp = user.id + '/' + crypto.randomUUID();
                  const h = await studioClient.storage.from('frame-private').upload(hp, item.wav.hi, { contentType: 'video/mp4', upsert: false });
                  if (!h.error) input.data.audioHiPath = hp;
                } catch (e) { console.warn('Áudio de alta qualidade não enviado:', e); }
              }
            }
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

/* Junta a voz original ao vídeo gerado: o modelo inventa a fala, então a trilha
   do vídeo gerado é trocada pelo áudio original do trecho cortado. */
(function () {
  const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.4D401E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'];
  function waitFor(el, event, ms, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(Error(message)); }, ms);
      function ok() { cleanup(); resolve(); }
      function bad() { cleanup(); reject(Error(message)); }
      function cleanup() { clearTimeout(timer); el.removeEventListener(event, ok); el.removeEventListener('error', bad); }
      el.addEventListener(event, ok); el.addEventListener('error', bad);
    });
  }
  async function recordWithAudio(videoBlob, wavBuffer) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const mime = window.MediaRecorder && MIMES.find(t => MediaRecorder.isTypeSupported(t));
    if (!AC || !mime) throw Error('Este navegador não consegue juntar o áudio.');
    const ctx = new AC();
    const url = URL.createObjectURL(videoBlob);
    const v = document.createElement('video');
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    document.body.append(v);
    let recorder = null, tracks = [];
    try {
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const audio = await ctx.decodeAudioData(wavBuffer.slice(0));
      v.src = url;
      await waitFor(v, 'loadedmetadata', 15000, 'Não foi possível ler o vídeo gerado.');
      const length = v.duration;
      const dest = ctx.createMediaStreamDestination();
      const node = ctx.createBufferSource();
      node.buffer = audio; node.connect(dest);
      const capture = v.captureStream ? v.captureStream() : v.mozCaptureStream();
      const stream = new MediaStream([...capture.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      tracks = stream.getTracks();
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000, audioBitsPerSecond: 192000 });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = e => reject((e && e.error) || Error('Falha ao gravar.')); });
      recorder.start();
      node.start();
      await v.play();
      await waitFor(v, 'ended', (length + 20) * 1000, 'A junção demorou mais que o esperado.');
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      const out = new Blob(chunks, { type: 'video/mp4' });
      if (!out.size) throw Error('A junção não gerou arquivo.');
      return out;
    } finally {
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
      tracks.forEach(t => { try { t.stop(); } catch {} });
      try { await ctx.close(); } catch {}
      v.pause(); v.removeAttribute('src'); v.load(); v.remove();
      URL.revokeObjectURL(url);
    }
  }
  window.recordWithAudio = recordWithAudio;

  /* limpeza de metadados feita aqui no navegador (o mesmo código do servidor, carregado só quando precisa) */
  let cleanLoad = null;
  function ensureClean() {
    if (window.fsCleanMp4) return Promise.resolve(true);
    if (!cleanLoad) {
      cleanLoad = new Promise(resolve => {
        const sc = document.createElement('script');
        sc.src = 'clean.js?v=1';
        sc.onload = () => resolve(!!window.fsCleanMp4);
        sc.onerror = () => { sc.remove(); resolve(false); };
        document.head.append(sc);
      }).then(ok => { if (!ok) cleanLoad = null; return ok; });
    }
    return cleanLoad;
  }
  async function cleanBlob(blob) {
    try {
      if (!(await ensureClean())) return { blob, clean: false, note: 'O limpador não carregou.' };
      const r = window.fsCleanMp4(new Uint8Array(await blob.arrayBuffer()));
      if (!r.ok || !r.data || r.data.length !== blob.size) return { blob, clean: false, note: window.fsCleanNote(r.report) || 'Não foi possível limpar.' };
      return { blob: new Blob([r.data], { type: 'video/mp4' }), clean: r.clean === true, note: r.clean ? '' : window.fsCleanNote(r.report) };
    } catch (e) { return { blob, clean: false, note: 'Falha na limpeza: ' + (e && e.message) }; }
  }
  window.cleanVideoBlob = cleanBlob;

  async function muxOriginalAudio(job) {
    if (job.audioMerged || !job.videoPath) return;
    if (typeof activeBatch === 'undefined' || !activeBatch) return;
    const source = activeBatch.sources && activeBatch.sources[job.sourceIndex];
    if (!source || !source.mediaId) return;
    const rec = await studioClient.from('frame_library').select('data').eq('id', source.mediaId).maybeSingle();
    const md = (rec.data && rec.data.data) || {};
    const audioPath = md.audioHiPath || md.audioPath;
    if (!audioPath) return;
    const status = document.getElementById('production-status');
    /* 1º: o servidor troca o áudio (qualidade total, sem regravar o vídeo) */
    try {
      if (status) status.textContent = 'Juntando a voz original ao vídeo…';
      const sess = await studioClient.auth.getSession();
      const tk = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (tk) {
        const r = await fetch('/api/worker?mux=1', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ videoPath: job.videoPath, mediaId: source.mediaId }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.path) { job.rawVideoPath = job.videoPath; job.videoPath = j.path; job.audioMerged = true; job.audioMergeError = ''; job.metaClean = j.metaClean === true; job.metaNote = j.metaNote || ''; return; }
        console.warn('Troca de áudio no servidor falhou:', j.error || r.status);
      }
    } catch (e) { console.warn('Troca de áudio no servidor falhou:', e); }
    if (status) status.textContent = 'Juntando a voz original ao vídeo… (mantenha esta aba visível)';
    const bucket = studioClient.storage.from('frame-private');
    const [v, a] = await Promise.all([bucket.createSignedUrl(job.videoPath, 600), bucket.createSignedUrl(audioPath, 600)]);
    if (v.error || a.error) throw Error('Não foi possível ler os arquivos para juntar o áudio.');
    const [videoBlob, wavBuffer] = await Promise.all([fetch(v.data.signedUrl).then(r => r.blob()), fetch(a.data.signedUrl).then(r => r.arrayBuffer())]);
    const recorded = await recordWithAudio(videoBlob, wavBuffer);
    if (status) status.textContent = 'Limpando os metadados do vídeo…';
    const cleaned = await cleanBlob(recorded);
    const out = cleaned.blob;
    const { data: { user } } = await studioClient.auth.getUser();
    const path = user.id + '/generated/' + (job.requestId || crypto.randomUUID()) + '-voz-' + crypto.randomUUID().slice(0, 8) + '.mp4';
    const up = await bucket.upload(path, out, { contentType: 'video/mp4', upsert: false });
    if (up.error) throw up.error;
    job.rawVideoPath = job.videoPath;
    job.videoPath = path;
    job.audioMerged = true;
    job.audioMergeError = '';
    job.metaClean = cleaned.clean;
    job.metaNote = cleaned.note;
  }
  window.muxOriginalAudio = muxOriginalAudio;

  function install() {
    const orig = window.archiveJob;
    if (typeof orig !== 'function' || orig.audioMux) return;
    const wrapped = async function (job) {
      await orig.apply(this, arguments);
      try { await muxOriginalAudio(job); } catch (e) { console.warn('Áudio original não juntado:', e); job.audioMergeError = e.message; }
    };
    wrapped.audioMux = true;
    window.archiveJob = wrapped;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();

/* Selo na biblioteca: mostra se os metadados do vídeo foram limpos (vídeos antigos não mostram nada). */
(function () {
  const css = document.createElement('style');
  css.textContent = '.meta-badge{font-size:12px;font-weight:600}.meta-badge.ok{color:#1f9d55}.meta-badge.warn{color:#d97706}';
  document.head.append(css);
  function badges() {
    const grid = document.getElementById('lib-grid');
    if (document.hidden || !grid || !grid.offsetParent) return;
    document.querySelectorAll('#lib-grid .lib-card').forEach(card => {
      const it = card.__it, j = it && it.j, info = card.querySelector('.lib-info');
      if (!j || !info) return;
      let tag = card.querySelector('.meta-badge');
      const state = j.metaClean === true ? 'ok' : (j.metaClean === false ? 'warn' : '');
      if (!state) { if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement('span'); info.append(tag); }
      tag.className = 'meta-badge ' + state;
      tag.textContent = state === 'ok' ? 'Metadados limpos ✓' : 'Limpeza de metadados incompleta';
      tag.title = state === 'ok' ? 'Datas, nomes do codificador e textos internos foram removidos do arquivo.' : (j.metaNote || 'Nem tudo pôde ser removido.');
    });
  }
  setInterval(badges, 1500);
})();
