/* Corte de vídeo no navegador.
   Reproduz só o trecho escolhido e grava em MP4 (MediaRecorder), então o que
   é enviado e cobrado já é curto. Leva o mesmo tempo do trecho (corte em tempo real). */
(function () {
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2'
  ]; // só H.264 + AAC, que o provedor aceita com segurança
  const MAX_OUTPUT_BYTES = 50 * 1048576;

  function pickMime() {
    if (!window.MediaRecorder) return null;
    return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) || null;
  }

  function waitFor(el, event, ms, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(Error(message)); }, ms);
      function ok() { cleanup(); resolve(); }
      function bad() { cleanup(); reject(Error(message)); }
      function cleanup() { clearTimeout(timer); el.removeEventListener(event, ok); el.removeEventListener('error', bad); }
      el.addEventListener(event, ok);
      el.addEventListener('error', bad);
    });
  }

  window.trimSupported = () => !!pickMime();

  /* trimVideo(file, startSeconds, lengthSeconds, onProgress?, options?) -> Promise<Blob>
     options (usado em testes): { mime, outType, videoBitsPerSecond } */
  window.trimVideo = async function trimVideo(file, start, length, onProgress, options) {
    options = options || {};
    const mime = options.mime || pickMime();
    if (!mime) throw Error('Este navegador não consegue cortar vídeo em MP4. Use Chrome, Brave ou Edge atualizado, ou desligue o corte.');
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw Error('Este navegador não consegue cortar vídeo. Use Chrome, Brave ou Edge atualizado.');

    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    v.preload = 'auto';
    v.playsInline = true;
    document.body.append(v);

    let ctx = null, recorder = null, tracks = [];
    try {
      v.src = url;
      await waitFor(v, 'loadedmetadata', 15000, 'Não foi possível ler o vídeo para cortar.');
      const total = v.duration;
      if (!Number.isFinite(total) || start >= total - 0.2) throw Error('O início do corte passa do fim do vídeo.');
      const len = Math.min(length, total - start);

      v.currentTime = start;
      await waitFor(v, 'seeked', 15000, 'Não foi possível posicionar o vídeo no início do corte.');

      ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaElementSource(v).connect(dest); // áudio vai só para a gravação, sem tocar nas caixas de som
      const capture = v.captureStream ? v.captureStream() : v.mozCaptureStream();
      const stream = new MediaStream([...capture.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      tracks = stream.getTracks();
      if (!stream.getVideoTracks().length) throw Error('O vídeo não tem imagem para cortar.');

      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: options.videoBitsPerSecond || 6000000,
        audioBitsPerSecond: 128000
      });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = e => reject((e && e.error) || Error('Falha ao gravar o corte.'));
      });

      recorder.start();
      try { await v.play(); } catch { throw Error('O navegador bloqueou a reprodução para o corte. Clique na página e tente de novo.'); }

      const began = performance.now();
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          const done = v.currentTime - start;
          if (onProgress) onProgress(Math.max(0, Math.min(1, done / len)));
          if (done >= len || v.ended) { clearInterval(timer); resolve(); }
          else if (performance.now() - began > (len + 20) * 1000) { clearInterval(timer); reject(Error('O corte demorou mais que o esperado.')); }
        }, 40);
      });
      v.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: options.outType || 'video/mp4' });
      if (!blob.size) throw Error('O corte não gerou arquivo. Tente de novo.');
      if (blob.size > MAX_OUTPUT_BYTES) throw Error('O trecho cortado passou de 50 MB. Use um trecho menor.');
      return blob;
    } finally {
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
      tracks.forEach(t => { try { t.stop(); } catch {} });
      try { if (ctx) await ctx.close(); } catch {}
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
      URL.revokeObjectURL(url);
    }
  };
})();
