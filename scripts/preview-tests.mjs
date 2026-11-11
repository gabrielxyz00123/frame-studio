import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('public');
/* mesmos cabeçalhos da Vercel (incluindo o CSP), para a prévia acusar violações antes da publicação */
const vercelHeaders = JSON.parse(await readFile('vercel.json', 'utf8')).headers.flatMap(h => h.headers);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4319');
    if (url.pathname === '/api/higgsfield'||url.pathname==='/api/worker') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(url.searchParams.get('action') === 'config' ? { configured: false, backgroundReady: false } : { count: 0 }));
    }
    if (url.pathname === '/__fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile('tests/browser-fixture.js')); }
    if (url.pathname === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end('window.FRAME_CONFIG={url:"https://fixture.example.test",publishableKey:"fixture-public"};'); }
    const path = resolve(root, url.pathname === '/' ? 'index.html' : '.' + url.pathname);
    if (!path.startsWith(root + sep)) { res.statusCode = 403; return res.end(); }
    const text = ['.html', '.js', '.mjs', '.css', '.json'].includes(extname(path));
    let body = text ? await readFile(path, 'utf8') : await readFile(path); /* binários (modelo do detector de rosto) sem conversão */
    if (extname(path) === '.html') body = body.replace('vendor/supabase-js-2.102.0.js', '/__fixture.js');
    if (extname(path) === '.css') body = body.replace(/^@import[^;]+;/, '');
    res.setHeader('Content-Type', { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css' }[extname(path)] || 'text/plain');
    if (!url.searchParams.has('sem-cabecalhos')) for (const h of vercelHeaders) res.setHeader(h.key, h.value);
    res.setHeader('Cache-Control', 'no-store'); res.end(body);
  } catch { res.statusCode = 404; res.end(); }
}).listen(4319, '127.0.0.1', () => console.log('Fixture preview: http://127.0.0.1:4319 (fake data only)'));
