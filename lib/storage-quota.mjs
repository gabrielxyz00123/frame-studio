/* Cota de armazenamento por conta (R2 + Supabase Storage).
   FRAME_STORAGE_QUOTA_MB define o limite; o padrão é 20 GB por conta.
   O mesmo valor precisa estar em public.frame_storage_quota() (migração storage-quota.sql),
   que protege o envio direto ao Supabase Storage. */
import {r2Config,presign} from '../api/_r2.js';
import {parseList} from './r2-cleanup.mjs';
export const MB=1048576;
export function quotaBytes(env=process.env){const mb=Number(env.FRAME_STORAGE_QUOTA_MB);return Math.round((Number.isFinite(mb)&&mb>0?mb:20480)*MB);}
/* tamanho máximo por envio, conforme o tipo e a pasta */
export function maxUploadBytes(path,type){
 if(type==='audio/wav')return 60*MB;
 if(type.startsWith('image/'))return 15*MB;
 if(/\/shared\/[^/]+$/.test(path))return 500*MB;/* mesma regra de frame_shared.size */
 return 50*MB;
}
/* soma os objetos do dono no R2; para de listar assim que passa de stopAt */
export async function r2Usage(owner,stopAt=Infinity,deadline=Date.now()+8000){
 const cfg=r2Config();if(!cfg)return 0;
 let cursor=null,total=0;
 do{
  if(Date.now()>deadline)throw Object.assign(Error('Não foi possível conferir o espaço usado agora. Tente de novo.'),{status:503});
  const query={'list-type':'2','encoding-type':'url',prefix:owner+'/','max-keys':'1000'};if(cursor)query['continuation-token']=cursor;
  const r=await fetch(presign(cfg,'GET','',{expires:60,query}),{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Object.assign(Error('Não foi possível conferir o espaço usado agora. Tente de novo.'),{status:503});
  const page=parseList(await r.text(),owner);
  for(const o of page.objects)total+=o.bytes;
  cursor=page.token;
 }while(cursor&&total<=stopAt);
 return total;
}
/* uso no Supabase Storage via função SQL (somente da própria conta: usa auth.uid()) */
export async function supabaseUsage(token,supabase,publicKey){
 const r=await fetch(supabase+'/rest/v1/rpc/frame_storage_used',{method:'POST',headers:{apikey:publicKey,Authorization:token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
 if(r.status===404)return 0;/* migração ainda não aplicada: a cota vale só para o R2 */
 if(!r.ok)throw Object.assign(Error('Não foi possível conferir o espaço usado agora. Tente de novo.'),{status:503});
 const n=Number(await r.json());return Number.isFinite(n)&&n>0?n:0;
}
export function formatGB(bytes){return (bytes/1073741824).toLocaleString('pt-BR',{maximumFractionDigits:1})+' GB';}
