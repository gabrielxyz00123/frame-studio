import {r2Config,presign,r2Exists,validKey} from './_r2.js';
const SUPABASE='https://hwhkseomjxoqjrylmqaz.supabase.co';
const PUBLIC_KEY='sb_publishable_oJvYE2n7-MjHwTwzN668mQ_orC-JqwJ';
const error=(status,message)=>Object.assign(new Error(message),{status});
const types=new Set(['image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime','audio/wav']);
export default async function handler(req,res){res.setHeader('Cache-Control','private, no-store');try{
 if(req.method!=='POST')throw error(405,'Operação não disponível.');
 const host=req.headers.host,origin=req.headers.origin;if(origin!==`https://${host}`&&origin!==`http://${host}`)throw error(403,'Origem inválida.');
 const token=req.headers.authorization;if(!/^Bearer [^\s]+$/.test(token||''))throw error(401,'Entre no Frame Studio.');
 const auth=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:token},signal:AbortSignal.timeout(10000)});if(!auth.ok)throw error(401,'Sua sessão expirou. Entre novamente.');const user=await auth.json();
 const cfg=r2Config();if(!cfg)throw error(503,'Armazenamento R2 não configurado.');
 const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});const path=body.path;
 if(!validKey(user.id,path))throw error(400,'Arquivo inválido.');
 const action=req.query.action;
 if(action==='put'){const type=types.has(body.contentType)?body.contentType:'application/octet-stream';return res.status(200).json({url:presign(cfg,'PUT',path,{expires:900}),contentType:type});}
 if(action==='get'){if(!(await r2Exists(cfg,path)))return res.status(200).json({missing:true});const secs=Math.min(7200,Math.max(60,Number(body.secs)||3600));const query={};if(typeof body.download==='string'&&body.download){const name=body.download.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120);query['response-content-disposition']='attachment; filename="'+name+'"';}return res.status(200).json({url:presign(cfg,'GET',path,{expires:secs,query})});}
 if(action==='share'){if(!path.startsWith(user.id+'/generated/'))throw error(400,'Só vídeos gerados podem ser compartilhados.');if(!(await r2Exists(cfg,path)))return res.status(200).json({missing:true});const secs=Math.min(604800,Math.max(3600,Number(body.secs)||604800));return res.status(200).json({url:presign(cfg,'GET',path,{expires:secs}),secs});}
 if(action==='delete'){if(path.startsWith(user.id+'/generated/'))throw error(400,'Vídeos gerados não podem ser apagados aqui.');const r=await fetch(presign(cfg,'DELETE',path,{expires:60}),{method:'DELETE',signal:AbortSignal.timeout(10000)});return res.status(200).json({deleted:r.ok||r.status===404});}
 throw error(405,'Operação não disponível.');
}catch(e){const status=e.status||500;return res.status(status).json({error:status===500?'Falha no armazenamento. Tente novamente.':e.message})}}