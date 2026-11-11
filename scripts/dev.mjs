import './build.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import handler from '../api/higgsfield.js';
import worker from '../api/worker.js';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||3000);
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/higgsfield'||url.pathname==='/api/worker'){
  let data='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576){res.writeHead(413);res.end('Requisição muito grande.');return;}data+=chunk;}
  req.body=data?JSON.parse(data):undefined;req.query=Object.fromEntries(url.searchParams);
  res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
  await (url.pathname==='/api/worker'?worker:handler)(req,res);return;
 }
 const requested=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,''),path=resolve(root,requested);
 if(!path.startsWith(resolve(root)+sep)){res.writeHead(403);res.end();return;}
 const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch(e){res.statusCode=e.code==='ENOENT'?404:500;res.end('Não foi possível atender esta solicitação.');}
}).listen(port,'127.0.0.1',()=>console.log('Frame Studio local: http://localhost:'+port));
