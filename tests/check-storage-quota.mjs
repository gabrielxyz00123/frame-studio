import assert from 'node:assert/strict';
import storage from '../api/storage.js';
import share from '../api/share.js';
const owner='11111111-1111-4111-8111-111111111111',linkId='99999999-9999-4999-8999-999999999999';
Object.assign(process.env,{R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture-id',R2_SECRET_ACCESS_KEY:'fixture-secret',R2_BUCKET:'fixture-bucket',SUPABASE_SERVICE_KEY:'fixture-service',FRAME_STORAGE_QUOTA_MB:'100'});
let r2Bytes=0,sbBytes=0,links=[],listCalls=0;
const MB=1048576;
const original=globalThis.fetch;
globalThis.fetch=async(url,opts={})=>{
 const u=String(url);
 if(u.endsWith('/auth/v1/user'))return Response.json({id:owner});
 if(u.includes('list-type=2')){listCalls++;return new Response('<ListBucketResult><Contents><Key>'+owner+'%2Fa.mp4</Key><Size>'+r2Bytes+'</Size><LastModified>2026-01-01T00:00:00Z</LastModified></Contents><IsTruncated>false</IsTruncated></ListBucketResult>');}
 if(u.endsWith('/rest/v1/rpc/frame_storage_used'))return Response.json(sbBytes);
 if(opts.method==='HEAD')return new Response('',{status:200});
 if(u.includes('/rest/v1/frame_share_links')&&opts.method==='POST'){const row={...JSON.parse(opts.body),id:linkId,revoked_at:null};links.push(row);return Response.json([row],{status:201});}
 if(u.includes('/rest/v1/frame_share_links')&&opts.method==='PATCH'){let n=0;for(const l of links)if(!l.revoked_at&&u.includes(encodeURIComponent(l.path))){l.revoked_at=new Date().toISOString();n++;}return Response.json(links.filter(l=>l.revoked_at).slice(0,n));}
 if(u.includes('/rest/v1/frame_share_links')){assert.equal(opts.headers.apikey,'fixture-service');const l=links.find(x=>u.includes('id=eq.'+x.id)&&!x.revoked_at&&new Date(x.expires_at)>new Date());return Response.json(l?[{owner_id:l.owner_id,path:l.path,expires_at:l.expires_at}]:[]);}
 throw Error('Unexpected request '+u);
};
async function call(action,body){const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await storage({method:'POST',headers:{host:'studio.test',origin:'https://studio.test',authorization:'Bearer fixture'},query:{action},body},res);return res;}
async function open(id){const headers={};const res={statusCode:0,setHeader(k,v){headers[k.toLowerCase()]=v;},end(){}};await share({method:'GET',query:{id}},res);return {code:res.statusCode,location:headers.location};}
try{
 const video=owner+'/source.mp4';
 /* tipo e tamanho são obrigatórios e entram na assinatura */
 assert.equal((await call('put',{path:video,contentType:'text/html',size:10})).code,415);
 assert.equal((await call('put',{path:video,contentType:'video/mp4'})).code,400,'size is required');
 assert.equal((await call('put',{path:video,contentType:'video/mp4',size:51*MB})).code,413,'per-type size limit');
 assert.equal((await call('put',{path:owner+'/photo',contentType:'image/png',size:16*MB})).code,413);
 const ok=await call('put',{path:video,contentType:'video/mp4',size:5*MB});
 assert.equal(ok.code,200);
 const signed=new URL(ok.data.url);
 assert.equal(signed.searchParams.get('X-Amz-SignedHeaders'),'content-length;content-type;host','upload URL must be bound to the declared size and type');
 assert.equal(signed.searchParams.get('X-Amz-Expires'),'900');
 /* cota: soma R2 + Supabase */
 r2Bytes=60*MB;sbBytes=30*MB;
 const full=await call('put',{path:video,contentType:'video/mp4',size:20*MB});
 assert.equal(full.code,413);assert.match(full.data.error,/espaço de armazenamento está cheio/);
 assert.equal((await call('put',{path:video,contentType:'video/mp4',size:5*MB})).code,200,'uploads that fit in the remaining quota pass');
 assert.equal((await call('put',{path:owner+'/shared/'+linkId,contentType:'video/mp4',size:60*MB})).code,413,'shared videos still count against the quota');
 r2Bytes=0;sbBytes=0;
 /* links revogáveis */
 const gen=owner+'/generated/55555555-5555-4555-8555-555555555555.mp4';
 assert.equal((await call('share',{path:owner+'/source.mp4'})).code,400,'only generated videos can be shared');
 const link=await call('share',{path:gen,secs:999999999});
 assert.equal(link.code,200);assert.equal(link.data.url,'https://studio.test/api/share?id='+linkId);
 assert.ok(new Date(links[0].expires_at)-Date.now()<=604800*1000+5000,'links never last more than 7 days');
 const first=await open(linkId);
 assert.equal(first.code,302);
 assert.equal(new URL(first.location).searchParams.get('X-Amz-Expires'),'300','the R2 URL behind a share link lives for 5 minutes');
 assert.equal((await open('not-a-uuid')).code,404);
 const revoked=await call('unshare',{path:gen});
 assert.equal(revoked.code,200);assert.equal(revoked.data.revoked,1);
 assert.equal((await open(linkId)).code,404,'revoked links stop working immediately');
 assert.equal((await call('unshare',{path:'22222222-2222-4222-8222-222222222222/generated/x.mp4'})).code,400,'cannot revoke another account');
 console.log('PASS: uploads require an allowed type and size bound into the signature, per-type limits, account quota across R2 and Supabase, 7-day revocable share links served through 5-minute R2 URLs, and immediate revocation.');
}finally{globalThis.fetch=original;}
