import {createHmac,createHash} from 'node:crypto';
const hmac=(k,v)=>createHmac('sha256',k).update(v).digest();
const sha=v=>createHash('sha256').update(v).digest('hex');
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export function r2Config(env=process.env){const a=(env.R2_ACCOUNT_ID||'').trim(),k=(env.R2_ACCESS_KEY_ID||'').trim(),s=(env.R2_SECRET_ACCESS_KEY||'').trim(),b=(env.R2_BUCKET||'').trim();if(!a||!k||!s||!b)return null;return {host:a+'.r2.cloudflarestorage.com',bucket:b,accessKey:k,secret:s,region:'auto',pathStyle:true};}
export function validKey(userId,path){return typeof path==='string'&&typeof userId==='string'&&path.startsWith(userId+'/')&&path.length<=220&&/^[A-Za-z0-9\/._-]+$/.test(path)&&!path.includes('..')&&!path.includes('//')&&!path.endsWith('/');}
/* headers: cabeçalhos que passam a fazer parte da assinatura (ex.: content-length e content-type
   num PUT). O R2 recusa o envio se o navegador mandar valores diferentes dos assinados. */
export function presign(cfg,method,key,{expires=3600,query={},headers={},now=new Date()}={}){
 const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''),date=stamp.slice(0,8);
 const uri=(cfg.pathStyle?'/'+cfg.bucket:'')+'/'+key.split('/').map(enc).join('/');
 const scope=date+'/'+cfg.region+'/s3/aws4_request';
 const signed={host:cfg.host};for(const [k,v] of Object.entries(headers))signed[k.toLowerCase()]=String(v).trim();
 const names=Object.keys(signed).sort(),signedHeaders=names.join(';');
 const params={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':cfg.accessKey+'/'+scope,'X-Amz-Date':stamp,'X-Amz-Expires':String(expires),'X-Amz-SignedHeaders':signedHeaders,...query};
 const cq=Object.keys(params).sort().map(k=>enc(k)+'='+enc(params[k])).join('&');
 const creq=[method,uri,cq,names.map(n=>n+':'+signed[n]).join('\n')+'\n',signedHeaders,'UNSIGNED-PAYLOAD'].join('\n');
 const sts=['AWS4-HMAC-SHA256',stamp,scope,sha(creq)].join('\n');
 const k4=hmac(hmac(hmac(hmac('AWS4'+cfg.secret,date),cfg.region),'s3'),'aws4_request');
 const sig=createHmac('sha256',k4).update(sts).digest('hex');
 return 'https://'+cfg.host+uri+'?'+cq+'&X-Amz-Signature='+sig;
}
export async function r2Exists(cfg,key){try{const r=await fetch(presign(cfg,'HEAD',key,{expires:60}),{method:'HEAD',signal:AbortSignal.timeout(8000)});return r.ok}catch{return false}}
export async function r2Put(cfg,key,body,contentType){try{const r=await fetch(presign(cfg,'PUT',key,{expires:300}),{method:'PUT',headers:{'Content-Type':contentType||'application/octet-stream'},body,signal:AbortSignal.timeout(45000)});return r.ok}catch{return false}}
