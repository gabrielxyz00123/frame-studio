import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const owner = 'owner';
const rows = [
  { id: 'model', kind: 'model', owner_id: owner, data: { name: 'Model' }, deleted: false },
  ...Array.from({ length: 45 }, (_, i) => ({ id: 'batch-' + i, owner_id: owner, kind: 'batch', data: {}, deleted: false })),
  ...Array.from({ length: 7 }, (_, i) => ({ id: 'trash-' + i, owner_id: owner, kind: 'batch', data: {}, deleted: true })),
  { id: 'private', owner_id: 'other', kind: 'batch', data: { secret: 'other account' }, deleted: false },
  { id: 'media', owner_id: owner, kind: 'media', data: { large: 'payload' }, deleted: false }
];
class Query {
  constructor() { this.filters = []; this.start = 0; this.end = Infinity; }
  select(_, options) { this.head = options?.head; return this; } order() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  range(start, end) { this.start = start; this.end = end; return this; }
  then(resolve, reject) { const filtered = rows.filter(row => this.filters.every(test => test(row))); return Promise.resolve({ data: this.head ? null : filtered.slice(this.start, this.end + 1), count: filtered.length }).then(resolve, reject); }
}
const client = { auth: { getUser: async () => ({ data: { user: { id: owner, email: 'fixture@example.test' } } }), getSession: async () => ({ data: {} }), onAuthStateChange() {} }, from: () => new Query() };
const window = { supabase: { createClient: () => client }, FRAME_CONFIG: {}, dispatchEvent() {} };
const nodes = new Map();
const context = { window, location: { origin: 'https://fixture.test' }, Event: class {}, document: { getElementById: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } } };
context.client=client;vm.createContext(context);const authSource=readFileSync('public/auth.js','utf8');vm.runInContext(authSource.slice(authSource.indexOf('window.studioApi='),authSource.indexOf('client.auth.getSession().then')),context);
const first = await window.studioApi('GET');
assert.equal(first.items.length, 21); assert.equal(first.nextOffset, 20); assert.equal(first.counts.active, 45); assert.equal(first.counts.trash, 7);
assert.equal(first.items.some(row => row.kind === 'media' || row.id === 'private' || row.deleted), false);
const second = await window.studioApi('GET', { offset: 20 }); assert.equal(second.items.length, 20); assert.equal(second.nextOffset, 40);
const last = await window.studioApi('GET', { offset: 40 }); assert.equal(last.items.length, 5); assert.equal(last.nextOffset, null);
const trash = await window.studioApi('GET', { deleted: true }); assert.equal(trash.items.filter(row => row.kind === 'batch').length, 7); assert.equal(trash.nextOffset, null);
console.log('PASS: 20-row pages, exact active/trash totals, independent trash queries, no media payloads or cross-account rows and correct end-of-history boundary.');
