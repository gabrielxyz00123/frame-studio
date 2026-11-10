/* Audio handling is independent of the progress UI. WAVs keep their actual MIME. */
(function () {
  const cache = new WeakMap();
  function encodeWav(samples, rate = 16000) {
    const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const text = (at, value) => [...value].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); data.setUint32(4, 36 + samples.length * 2, true);
    text(8, 'WAVE'); text(12, 'fmt '); data.setUint32(16, 16, true);
    data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true);
    data.setUint16(32, 2, true); data.setUint16(34, 16, true);
    text(36, 'data'); data.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => {
      const n = Math.max(-1, Math.min(1, sample));
      data.setInt16(44 + i * 2, n < 0 ? n * 32768 : n * 32767, true);
    });
    return new Blob([data], { type: 'audio/wav' });
  }
  async function decode(blob, maxSeconds) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.OfflineAudioContext) return null;
    const context = new AC();
    let source;
    try { source = await context.decodeAudioData(await blob.arrayBuffer()); }
    catch { return null; }
    finally { await context.close().catch(() => {}); }
    if (!source || source.duration < 1) return null;
    const rate = 16000, length = Math.min(Math.floor(source.duration * rate), Math.floor(maxSeconds * rate));
    async function render(sampleRate){const frames=Math.min(Math.floor(source.duration*sampleRate),Math.floor(maxSeconds*sampleRate));const off=new window.OfflineAudioContext(1,frames,sampleRate);const input=off.createBufferSource();input.buffer=source;input.connect(off.destination);input.start(0);return (await off.startRendering()).getChannelData(0);}
    const offline = new window.OfflineAudioContext(1, length, rate);
    const node = offline.createBufferSource(); node.buffer = source;
    node.connect(offline.destination); node.start(0);
    const samples = (await offline.startRendering()).getChannelData(0);
    if (!samples.some(n => Math.abs(n) >= .005)) return null;
    let hi=null;try{hi=encodeWav(await render(44100),44100);}catch{}
    return { blob: encodeWav(samples, rate), hi, duration: length / rate };
  }
  window.encodeAudioWav = encodeWav;
  window.extractAudioWav = (blob, maxSeconds = 15) => {
    // Cache by Blob identity, not size: different videos can have the same size.
    if (!cache.has(blob)) cache.set(blob, decode(blob, maxSeconds));
    return cache.get(blob);
  };
  window.uploadReferenceAudio = async (blob, user, client) => {
    try {
      const wav = await window.extractAudioWav(blob);
      if (!wav) return {};
      const path = user.id + '/' + crypto.randomUUID() + '.wav';
      const uploaded = await client.storage.from('frame-private').upload(path, wav.blob, { contentType: 'audio/wav', upsert: false });
      if (uploaded.error) throw uploaded.error;
      const result={audioPath:path,audioDuration:wav.duration};
      if(wav.hi){try{const hiPath=user.id+'/'+crypto.randomUUID()+'-hi.wav';const hi=await client.storage.from('frame-private').upload(hiPath,wav.hi,{contentType:'audio/wav',upsert:false});if(!hi.error)result.audioHiPath=hiPath;else result.audioHighQualityWarning='A fala de referência foi salva; a cópia de alta qualidade não foi enviada.';}catch{result.audioHighQualityWarning='A fala de referência foi salva; a cópia de alta qualidade não foi enviada.';}}
      return result;
    } catch {
      return { audioReferenceWarning: 'Não foi possível preparar a fala de referência. Confira o áudio e a sincronização do resultado.' };
    }
  };
})();
