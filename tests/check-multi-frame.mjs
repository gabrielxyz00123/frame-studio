import assert from 'node:assert/strict';
import {createCipheriv,randomBytes} from 'node:crypto';
import {runWorker} from '../api/worker.js';
/* Várias pessoas com primeiro quadro enviado pelo usuário (1 ou 2 pessoas trocadas):
   o quadro precisa ser @img1 e as identidades @img2, @img3 — sem deslocar a numeração. */
const owner='11111111-1111-4111-8111-111111111111',batchId='22222222-2222-4222-8222-222222222222',modelA='33333333-3333-4333-8333-333333333333',modelB='88888888-8888-4888-8888-888888888888',mediaId='44444444-4444-4444-8444-444444444444',requestId='55555555-5555-4555-8555-555555555555',frameId='66666666-6666-4666-8666-666666666666';
const wrapping=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',wrapping,iv);cipher.setAAD(Buffer.from(owner));const encrypted=Buffer.concat([cipher.update('fixture:key','utf8'),cipher.final()]);
const ciphertext=['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
process.env.FRAME_CREDENTIAL_KEY=wrapping.toString('base64');process.env.SUPABASE_SERVICE_KEY='fixture-service';
for(const name of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])delete process.env[name];
let row,sent=[];
function reset(cast){sent=[];row={id:batchId,owner_id:owner,data:{mode:'multi',modelId:cast[0].modelId,cast,multiPrompt:'Keep every person distinct',basePrompt:'',editPrompt:'Edit',duration:5,resolution:'480p',ratio:'9:16',serverQueue:true,status:'ready',frameMethod:'manual',sources:[{mediaId,duration:3,mode:'multi',cast,modelId:cast[0].modelId,frameMediaId:frameId}],jobs:[{attemptId:'77777777-7777-4777-8777-777777777777',sourceIndex:0,status:'prepared'}]}};}
globalThis.fetch=async(url,options={})=>{
 const address=String(url);
 if(address.includes('kind=eq.batch&deleted=eq.false'))return Response.json(['ready','running'].includes(row.data.status)?[structuredClone(row)]:[]);
 if(address.includes('/rest/v1/frame_library')&&options.method==='PATCH'){row.data=JSON.parse(options.body).data;return Response.json([structuredClone(row)]);}
 if(address.includes('/rest/v1/frame_credentials'))return Response.json([{ciphertext}]);
 if(address.includes('/rest/v1/frame_library')){
  const data=address.includes(modelA)?{identity:'Identity A',photoPath:owner+'/photo-a'}:address.includes(modelB)?{identity:'Identity B',photoPath:owner+'/photo-b'}:address.includes(frameId)?{type:'image/png',path:owner+'/edited-frame'}:{type:'video/mp4',duration:3,path:owner+'/video'};
  return Response.json([{data}]);
 }
 if(address.includes('/storage/v1/object/sign/')){const path=address.split('/storage/v1/object/sign/')[1].split('?')[0];return Response.json({signedURL:'/object/sign/'+path+'?token=fixture'});}
 if(address.includes('/estimate/'))return Response.json({usd:.5});
 if(address.includes('api.higgsfield.ai/alibaba/')){sent.push(JSON.parse(options.body));return Response.json({request_id:requestId,status:'queued',status_url:'https://api.higgsfield.ai/requests/'+requestId+'/status'});}
 if(address.endsWith('/status'))return Response.json({status:'in_progress'});
 throw Error('Unexpected fixture request '+address);
};
function body(){assert.equal(sent.length,1,'exactly one paid video request, no automatic frame edit');const b=sent[0];return b.input||b;}

reset([{modelId:modelA,target:'the woman on the left'}]);await runWorker();
let b=body();
assert.equal(b.image_urls.length,2);assert.match(b.image_urls[0],/edited-frame/);assert.match(b.image_urls[1],/photo-a/);
assert.match(b.prompt,/Replacement identity is @img2: Identity A/);assert.match(b.prompt,/@img1 is an already edited scene frame/);
assert.match(b.prompt,/Unlisted people keep their own original face/);

reset([{modelId:modelA,target:'the woman on the left'},{modelId:modelB,target:'the man on the right'}]);await runWorker();
b=body();
assert.equal(b.image_urls.length,3);assert.match(b.image_urls[0],/edited-frame/);assert.match(b.image_urls[1],/photo-a/);assert.match(b.image_urls[2],/photo-b/);
assert.match(b.prompt,/@img2: Identity A/);assert.match(b.prompt,/@img3: Identity B/);
assert.equal((b.prompt.match(/FRAME REFERENCE PRIORITY/g)||[]).length,1,'frame instruction appears once');

console.log('PASS: multi-person with user-supplied first frame (1 and 2 people): frame is @img1, identities follow as @img2/@img3, no automatic frame edit is billed.');
