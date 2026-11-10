import {listR2,removeR2} from './r2-cleanup.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
const RETENTION_MS = 30 * 86400000;
const MAX_OBJECTS = 5000;
export function referencedPaths(rows, owner) {
  const paths = new Set();
  const visit = value => {
    if (typeof value === 'string' && value.startsWith(owner + '/') && !value.includes('..')) paths.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  rows.forEach(row => visit(row.data));
  return paths;
}
const mac = payload => createHmac('sha256', Buffer.from(process.env.FRAME_CREDENTIAL_KEY || '', 'base64')).update(payload).digest('base64url');
export function cleanupToken(manifest) { const payload = Buffer.from(JSON.stringify(manifest)).toString('base64url'); return payload + '.' + mac(payload); }
export function readCleanupToken(token, owner) {
  const [payload, signature] = String(token || '').split('.');
  const a = Buffer.from(signature || ''), b = Buffer.from(mac(payload || ''));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Error('Revise a lista de arquivos novamente.');
  const parsed = JSON.parse(Buffer.from(payload, 'base64url'));
  if (parsed.owner !== owner || parsed.expires < Date.now() || !Array.isArray(parsed.paths) || parsed.paths.length > 4) throw Error('A revisão da limpeza expirou.');
  return parsed;
}
export async function cleanupAction(action, body, user, token, db) {
  const deadline=Date.now()+35000;
  if (Buffer.from(process.env.FRAME_CREDENTIAL_KEY || '', 'base64').length !== 32) throw Object.assign(Error('Configure o salvamento protegido antes de usar a limpeza.'), { status: 503 });
  let rows = [];
  for (let offset = 0; ; offset += 500) {
    if(Date.now()>deadline)throw Object.assign(Error('A revisão demorou mais que o esperado. Nenhum arquivo foi excluído.'),{status:409});
    const page = await db(`/rest/v1/frame_library?owner_id=eq.${user.id}&select=id,data&order=id&offset=${offset}&limit=500`, token);
    rows.push(...page); if (page.length < 500) break;
  }
  const protectedPaths = referencedPaths(rows, user.id); // Includes trash and media registry.
  const objects = [];
  async function list(prefix, depth = 0) {
    if (depth > 8) throw Object.assign(Error('A biblioteca exige uma revisão de limpeza em partes.'), { status: 409 });
    for (let offset = 0; ; offset += 100) {
      if(Date.now()>deadline)throw Object.assign(Error('A revisão demorou mais que o esperado. Nenhum arquivo foi excluído.'),{status:409});
      const page = await db('/storage/v1/object/list/frame-private', token, { method: 'POST', body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }) });
      for (const item of page) {
        if (!item.name || item.name.includes('/') || item.name.includes('..')) continue;
        const path = prefix + '/' + item.name;
        if (!item.id) await list(path, depth + 1);
        else objects.push({ path, created: item.created_at, bytes: Number(item.metadata?.size || 0),store:'supabase' });
        if (objects.length > MAX_OBJECTS) throw Object.assign(Error('A biblioteca é grande. Faça a revisão por partes antes de limpar.'), { status: 409 });
      }
      if (page.length < 100) break;
    }
  }
  await list(user.id);objects.push(...await listR2(user.id,deadline));
  if(Date.now()>deadline)throw Object.assign(Error('A revisão demorou mais que o esperado. Nenhum arquivo foi excluído.'),{status:409});
  const eligible = objects.filter(item => !protectedPaths.has(item.path) && Number.isFinite(Date.parse(item.created)) && Date.parse(item.created) < Date.now() - RETENTION_MS);
  if (action === 'cleanup-preview') {
    const candidates = eligible.slice(0, 4);
    return { count: candidates.length, bytes: candidates.reduce((n, item) => n + item.bytes, 0), retentionDays: 30, hasMore: eligible.length > candidates.length,
      token: cleanupToken({ owner: user.id, expires: Date.now() + 10 * 60000, paths: candidates.map(item => ({ path: item.path, created: item.created, store:item.store })) }) };
  }
  if (body.confirmed !== true) throw Object.assign(Error('Confirme a lista antes de remover os arquivos.'), { status: 400 });
  let manifest;
  try { manifest = readCleanupToken(body.token, user.id); }
  catch (error) { throw Object.assign(error, { status: 409 }); }
  // Recompute protection and age before deletion. Never delete registered or trashed assets.
  const safe = manifest.paths.filter(item => eligible.some(current => current.path === item.path && current.created === item.created&&current.store===item.store));
  const legacy=safe.filter(item=>item.store==='supabase').map(item=>item.path);
  await Promise.all([
    ...(legacy.length?[db('/storage/v1/object/frame-private',token,{method:'DELETE',body:JSON.stringify({prefixes:legacy})})]:[]),
    ...safe.filter(item=>item.store==='r2').map(item=>removeR2(user.id,item.path))
  ]);
  return { removed: safe.length, retained: manifest.paths.length - safe.length };
}
