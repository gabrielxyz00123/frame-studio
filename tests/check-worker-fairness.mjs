import assert from 'node:assert/strict';
import {createCipheriv,randomBytes} from 'node:crypto';
import {runWorker,pickFair} from '../api/worker.js';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const wrapping=randomBytes(32);
function cipherFor(owner){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',wrapping,iv);c.setAAD(Buffer.from(owner));const e=Buffer.concat([c.update('fixture:key','utf8'),c.final()]);return ['v1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),e.toString('base64url')].join('.');}
process.env.FRAME_CREDENTIAL_KEY=wrapping.toString('base64');process.env.SUPABASE_SERVICE_KEY='fixture-service';
for(const name of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])delete process.env[name];

/* 1) rodizio: um dono com muitos lotes antigos nao bloqueia outro dono */
const rows=[...Array(8)].map((_,i)=>({id:id(i),owner_id:A,data:{}})).concat([{id:id(20),owner_id:B,data:{}},{id:id(21),owner_id:B,data:{}}]);
const picked=pickFair(rows);
assert.equal(picked.length,6);
assert.deepEqual(picked.slice(0,4).map(r=>r.owner_id),[A,B,A,B],'owners must alternate');
assert.ok(picked.some(r=>r.id===id(21)),'second owner must be served in the same run');

/* banco simulado */
let db=new Map(),fetched=[],archived=false,signedGenerated=false,pulledMB=0,queryUrl='';
function batch(rowId,owner,data){db.set(rowId,{id:rowId,owner_id:owner,data:{serverQueue:true,status:'running',resolution:'480p',ratio:'9:16',duration:5,...data}});}
const requestId='55555555-5555-4555-8555-555555555555';
globalThis.fetch=async(url,options={})=>{
 const address=String(url);fetched.push(address);
 if(address.includes('kind=eq.batch&deleted=eq.false')){queryUrl=address;return Response.json([...db.values()].filter(r=>['ready','running'].includes(r.data.status)).map(r=>structuredClone(r)));}
 if(address.includes('/rest/v1/frame_library')&&options.method==='PATCH'){const rowId=address.match(/id=eq\.([a-f0-9-]{36})/)[1];const row=db.get(rowId);row.data=JSON.parse(options.body).data;return Response.json([structuredClone(row)]);}
 if(address.includes('/rest/v1/frame_credentials')){const owner=address.match(/owner_id=eq\.([a-f0-9-]{36})/)[1];return Response.json([{ciphertext:cipherFor(owner)}]);}
 if(address.includes('/storage/v1/object/sign/')){if(address.includes('/generated/')&&!signedGenerated)return new Response('{}',{status:404});return Response.json({signedURL:'/object/sign/frame-private/x?token=fixture'});}
 if(address.includes('/storage/v1/object/frame-private/')&&options.method==='POST'){archived=true;signedGenerated=true;return Response.json({});}
 if(address.endsWith('/requests/'+requestId+'/status'))return Response.json({status:'completed',video:{url:'https://cdn.provider.test/out.mp4'}});
 if(address==='https://cdn.provider.test/out.mp4'){
  if(globalThis.hugeVideo){let n=0;return new Response(new ReadableStream({pull(c){if(n++>200){c.close();return;}pulledMB++;c.enqueue(new Uint8Array(1048576));}}));}
  return new Response(new Uint8Array(4096));
 }
 throw Error('Unexpected fixture request '+address);
};

/* 2) quarentena: lote que quebra o worker para depois de 3 tentativas */
batch(id(1),A,{jobs:5});
for(let i=0;i<3;i++)await runWorker();
assert.equal(db.get(id(1)).data.status,'paused','a batch that always crashes must be quarantined');
assert.equal(db.get(id(1)).data.srvErrors,3);
assert.ok(db.get(id(1)).data.srvLastRun,'served batches are rotated to the back of the queue');
assert.ok(queryUrl.includes('order=data->>srvLastRun.asc.nullsfirst'),'least recently served batches come first');
await runWorker();assert.equal(db.get(id(1)).data.srvErrors,3,'quarantined batches are no longer picked');

/* 3) URL salva no lote e ignorada: so a URL do status atual da Higgsfield e baixada */
db=new Map();fetched=[];
const job={attemptId:id(9),sourceIndex:0,status:'completed',requestId,statusUrl:'https://api.higgsfield.ai/requests/'+requestId+'/status',videoUrl:'https://169.254.169.254.attacker.test/huge'};
batch(id(2),B,{sources:[{mediaId:id(8)}],jobs:[job]});
await runWorker();
assert.ok(!fetched.some(u=>u.includes('attacker.test')),'stored videoUrl must never be fetched by the server');
assert.ok(fetched.includes('https://cdn.provider.test/out.mp4'));
assert.ok(archived);assert.ok(db.get(id(2)).data.jobs[0].videoPath.startsWith(B+'/generated/'));

/* 4) download para de ler assim que passa de 50 MB */
db=new Map();archived=false;signedGenerated=false;globalThis.hugeVideo=true;
batch(id(3),B,{sources:[{mediaId:id(8)}],jobs:[{...job,videoUrl:undefined}]});
await runWorker();
const saved=db.get(id(3)).data.jobs[0];
assert.ok(!archived,'oversized videos must not be stored');
assert.match(saved.archiveError,/50 MB/);
assert.ok(pulledMB<=52,'reading must stop right after the limit (read '+pulledMB+' MB)');
console.log('PASS: worker alternates owners, rotates served batches, quarantines crashing batches, ignores user-stored video URLs and stops oversized downloads at 50 MB.');
