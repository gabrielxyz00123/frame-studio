import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const window = {};
const context = { window, Blob, DataView, ArrayBuffer, WeakMap, crypto: { randomUUID: () => 'audio-id' } };
vm.createContext(context); vm.runInContext(readFileSync('public/audio.js', 'utf8'), context);
const encoded = window.encodeAudioWav(new Float32Array([-1, 0, 1]));
assert.equal(encoded.type, 'audio/wav');
const bytes = new DataView(await encoded.arrayBuffer());
assert.equal(Buffer.from(bytes.buffer).toString('ascii', 0, 4), 'RIFF');
assert.equal(Buffer.from(bytes.buffer).toString('ascii', 8, 12), 'WAVE');
assert.equal(bytes.getUint32(24, true), 16000); assert.equal(bytes.getInt16(44, true), -32768); assert.equal(bytes.getInt16(48, true), 32767);
let decoded = 0, closed = 0, renderedSample;
window.AudioContext = class {
  async decodeAudioData(input) { decoded++; return { duration: 1, sample: new Uint8Array(input)[0] / 10 }; }
  async close() { closed++; }
};
window.OfflineAudioContext = class {
  createBufferSource() { const source = { connect() {}, start() { renderedSample = this.buffer.sample; } }; return source; }
  async startRendering() { return { getChannelData: () => new Float32Array(16000).fill(renderedSample) }; }
};
const one = new Blob([new Uint8Array([1])]), two = new Blob([new Uint8Array([5])]);
const first = await window.extractAudioWav(one), second = await window.extractAudioWav(two);
assert.notDeepEqual(Buffer.from(await first.blob.arrayBuffer()), Buffer.from(await second.blob.arrayBuffer()));
await window.extractAudioWav(one); assert.equal(decoded, 2); assert.equal(closed, 2);
let uploaded;
const client = { storage: { from: () => ({ upload: async (...args) => { uploaded = args; return {}; } }) } };
const audio = await window.uploadReferenceAudio(one, { id: 'owner' }, client);
assert.equal(audio.audioPath, 'owner/audio-id.wav');assert.equal(audio.audioHiPath,'owner/audio-id-hi.wav'); assert.equal(uploaded[1].type, 'audio/wav'); assert.equal(uploaded[2].contentType, 'audio/wav');
client.storage.from = () => ({ upload: async () => ({ error: Error('offline') }) });
assert.match((await window.uploadReferenceAudio(two, { id: 'owner' }, client)).audioReferenceWarning, /sincronização/);
console.log('PASS: WAV header and PCM encoding, correct MIME, identity cache for same-size videos, audio on untrimmed videos, closed decoder and upload failure warning.');
