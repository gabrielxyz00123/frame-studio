import {canReadShared} from '../lib/shared-access.mjs';
import {r2Config,presign,r2Exists,validKey} from './_r2.js';
import {quotaBytes,maxUploadBytes,r2Usage,supabaseUsage,formatGB,MB} from '../lib/storage-quota.mjs';
const SUPABASE='https://hwhkseomjxoqjrylmqaz.supabase.co';
const PUBLIC_KEY='sb_publishable_oJvYE2n7-MjHwTwzN668mQ_orC-JqwJ';
const error=(status,message)=>Object.assign(new Error(message),{status});
const types=new Set(['image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime','audio/wav']);
const SHARE_MAX_SECS=604800;
async function rest(path,token,options={}){
 const r=await fetch(SUPABASE+path,{...options,headers:{apikey:PUBLIC_KEY,Authorization:token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
 const data=await r.json().catch(()=>null);
 if(r.status===404&&/frame_share_links/.test(JSON.stringify(data||'')))throw error(503,'Links revogáveis ainda não foram ativados: aplique a migração share-links.sql.');
 if(!r.ok)throw error(502,'Não foi possível registrar o link.');
 return data;
}
export default async function handler(req,res){res.setHeader('Cache-Control','private, no-store');try{
 if(req.method!=='POST')throw error(405,'Operação não disponível.');
 const host=req.headers.host,origin=req.headers.origin;if(origin!==`https://${host}`&&origin!==`http://${host}`)throw error(403,'Origem inválida.');
 const token=req.headers.authorization;if(!/^Bearer [^\s]+$/.test(token||''))throw error(401,'Entre no Frame Studio.');
 const auth=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:token},signal:AbortSignal.timeout(10000)});if(!auth.ok)throw error(401,'Sua sessão expirou. Entre novamente.');const user=await auth.json();
 const cfg=r2Config();if(!cfg)throw error(503,'Armazenamento R2 não configurado.');
 const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});const path=body.path;
 if(!validKey(user.id,path)&&!(req.query.action==='get'&&await canReadShared(path,token,SUPABASE,PUBLIC_KEY)))throw error(400,'Arquivo inválido.');
 const action=req.query.action;
 if(action==='put'){
  /* tipo e tamanho entram na assinatura: o R2 recusa um corpo diferente do declarado */
  if(!types.has(body.contentType))throw error(415,'Tipo de arquivo não aceito.');
  const size=Number(body.size),max=maxUploadBytes(path,body.contentType);
  if(!Number.isInteger(size)||size<1)throw error(400,'Informe o tamanho do arquivo.');
  if(size>max)throw error(413,'Arquivo grande demais: o limite para este tipo é '+Math.round(max/MB)+' MB.');
  const quota=quotaBytes();
  const used=await r2Usage(user.id,quota)+await supabaseUsage(token,SUPABASE,PUBLIC_KEY);
  if(used+size>quota)throw error(413,'Seu espaço de armazenamento está cheio ('+formatGB(used)+' de '+formatGB(quota)+'). Apague vídeos antigos ou use Revisar arquivos sem uso em Integração.');
  return res.status(200).json({url:presign(cfg,'PUT',path,{expires:900,headers:{'content-length':size,'content-type':body.contentType}}),contentType:body.contentType});
 }
 if(action==='get'){if(!(await r2Exists(cfg,path)))return res.status(200).json({missing:true});const secs=Math.min(7200,Math.max(60,Number(body.secs)||3600));const query={};if(typeof body.download==='string'&&body.download){const name=body.download.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120);query['response-content-disposition']='attachment; filename="'+name+'"';}return res.status(200).json({url:presign(cfg,'GET',path,{expires:secs,query})});}
 if(action==='share'){
  /* o link aponta para /api/share, que confere revogação e validade a cada acesso;
     a URL assinada do R2 só é gerada na hora e vale 5 minutos */
  if(!path.startsWith(user.id+'/generated/'))throw error(400,'Só vídeos gerados podem ser compartilhados.');
  if(!(await r2Exists(cfg,path)))return res.status(200).json({missing:true});
  const secs=Math.min(SHARE_MAX_SECS,Math.max(3600,Number(body.secs)||SHARE_MAX_SECS));
  const rows=await rest('/rest/v1/frame_share_links',token,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,path,expires_at:new Date(Date.now()+secs*1000).toISOString()})});
  const id=rows&&rows[0]&&rows[0].id;if(!/^[a-f0-9-]{36}$/i.test(id||''))throw error(502,'Não foi possível registrar o link.');
  return res.status(200).json({url:'https://'+host+'/api/share?id='+id,secs,revocable:true});
 }
 if(action==='unshare'){
  if(!path.startsWith(user.id+'/generated/'))throw error(400,'Arquivo inválido.');
  const rows=await rest('/rest/v1/frame_share_links?owner_id=eq.'+user.id+'&path=eq.'+encodeURIComponent(path)+'&revoked_at=is.null',token,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({revoked_at:new Date().toISOString()})});
  return res.status(200).json({revoked:Array.isArray(rows)?rows.length:0});
 }
 if(action==='delete'){if(path.startsWith(user.id+'/generated/'))throw error(400,'Vídeos gerados não podem ser apagados aqui.');const r=await fetch(presign(cfg,'DELETE',path,{expires:60}),{method:'DELETE',signal:AbortSignal.timeout(10000)});return res.status(200).json({deleted:r.ok||r.status===404});}
 throw error(405,'Operação não disponível.');
}catch(e){const status=e.status||500;return res.status(status).json({error:status===500?'Falha no armazenamento. Tente novamente.':e.message})}}
