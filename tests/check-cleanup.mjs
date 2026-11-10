import assert from 'node:assert/strict';
import { cleanupAction, referencedPaths, cleanupToken, readCleanupToken } from '../lib/cleanup.mjs';
process.env.FRAME_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString('base64');
const owner = 'owner', old = new Date(Date.now() - 40 * 86400000).toISOString();
const rows = [{ data: { path: 'owner/registered' } }, { data: { sources: [{ path: 'owner/trash' }] }, deleted: true }];
assert.equal(referencedPaths(rows, owner).size, 2);
const ticket = cleanupToken({ owner, paths: [], expires: Date.now() + 10000 });
assert.throws(() => readCleanupToken(ticket, 'other')); assert.throws(() => readCleanupToken(ticket + 'x', owner));
assert.throws(() => readCleanupToken(cleanupToken({ owner, paths: [], expires: 0 }), owner));
let removed = [];
const db = async (path, token, options = {}) => {
  assert.equal(token, 'Bearer owner');
  if (path.startsWith('/rest/')) return rows;
  if (path.includes('/list/')) return ['registered', 'trash', 'orphan', 'recent'].map(name => ({ name, id: name, created_at: name === 'recent' ? new Date().toISOString() : old, metadata: { size: 100 } }));
  if (options.method === 'DELETE') { removed = JSON.parse(options.body).prefixes; return []; }
  throw Error('unexpected');
};
const preview = await cleanupAction('cleanup-preview', {}, { id: owner }, 'Bearer owner', db);
assert.equal(preview.count, 1); assert.equal(preview.bytes, 100);
await assert.rejects(cleanupAction('cleanup-confirm', { token: preview.token }, { id: owner }, 'Bearer owner', db), /Confirme/);
rows.push({ data: { path: 'owner/orphan' } });
const protectedAgain = await cleanupAction('cleanup-confirm', { confirmed: true, token: preview.token }, { id: owner }, 'Bearer owner', db);
assert.equal(protectedAgain.removed, 0); assert.equal(protectedAgain.retained, 1); assert.deepEqual(removed, []);
rows.pop(); await cleanupAction('cleanup-confirm', { confirmed: true, token: preview.token }, { id: owner }, 'Bearer owner', db);
assert.deepEqual(removed, ['owner/orphan']);
delete process.env.FRAME_CREDENTIAL_KEY;
console.log('PASS: cleanup excludes registered/trash/recent assets, isolates owners, rejects tampered/expired previews, requires confirmation and rechecks new references.');
