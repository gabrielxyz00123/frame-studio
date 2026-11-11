/* Link público de um vídeo compartilhado: /api/share?id=<uuid>.
   A cada acesso confere se o link existe, não foi revogado e não expirou, e só então
   redireciona para uma URL assinada do R2 que vale 5 minutos. Revogar tem efeito imediato. */
import {r2Config,presign,r2Exists} from './_r2.js';
const SUPABASE='https://hwhkseomjxoqjrylmqaz.supabase.co';
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function page(res,status,text){res.setHeader('Content-Type','text/plain; charset=utf-8');res.statusCode=status;res.end(text);}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex');
 try{
  if(req.method!=='GET'&&req.method!=='HEAD')return page(res,405,'Operação não disponível.');
  const id=String((req.query&&req.query.id)||'');
  if(!idPattern.test(id))return page(res,404,'Link inválido ou expirado.');
  const key=(process.env.SUPABASE_SERVICE_KEY||'').trim(),cfg=r2Config();
  if(!key||!cfg)return page(res,503,'Compartilhamento indisponível no momento.');
  const now=new Date().toISOString();
  const r=await fetch(SUPABASE+'/rest/v1/frame_share_links?id=eq.'+id+'&revoked_at=is.null&expires_at=gt.'+encodeURIComponent(now)+'&select=owner_id,path,expires_at',{headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})},signal:AbortSignal.timeout(8000)});
  if(!r.ok)return page(res,503,'Compartilhamento indisponível no momento.');
  const row=(await r.json())[0];
  /* defesa extra além da constraint do banco: o caminho tem que ser um vídeo gerado do dono do link */
  if(!row||typeof row.path!=='string'||!row.path.startsWith(row.owner_id+'/generated/')||row.path.includes('..'))return page(res,404,'Link inválido, revogado ou expirado.');
  if(!(await r2Exists(cfg,row.path)))return page(res,404,'O vídeo deste link não está mais disponível.');
  res.statusCode=302;res.setHeader('Location',presign(cfg,'GET',row.path,{expires:300}));res.end();
 }catch(e){console.error('share:',e.message);return page(res,500,'Não foi possível abrir o link.');}
}
