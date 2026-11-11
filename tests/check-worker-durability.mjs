import assert from 'node:assert/strict';
import {createCipheriv,randomBytes} from 'node:crypto';
import {runWorker} from '../api/worker.js';
const owner='11111111-1111-4111-8111-111111111111',batchId='22222222-2222-4222-8222-222222222222',modelId='33333333-3333-4333-8333-333333333333',mediaId='44444444-4444-4444-8444-444444444444',requestId='55555555-5555-4555-8555-555555555555',frameId='66666666-6666-4666-8666-666666666666';
const wrapping=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',wrapping,iv);cipher.setAAD(Buffer.from(owner));const encrypted=Buffer.concat([cipher.update('fixture:key','utf8'),cipher.final()]);
const ciphertext=['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
process.env.FRAME_CREDENTIAL_KEY=wrapping.toString('base64');process.env.SUPABASE_SERVICE_KEY='fixture-service';
for(const name of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])delete process.env[name];
let row,loss=false,submissions=0,saves=[];
function reset(mode='direct'){row={id:batchId,owner_id:owner,data:{mode,modelId,target:'main person',frameMethod:'auto',directPrompt:'Replace {{target}} with {{identity}}',framePrompt:'Use frame',editPrompt:'Edit {{identity}}',basePrompt:'',duration:5,resolution:'480p',ratio:'9:16',serverQueue:true,status:'ready',sources:[{mediaId,duration:3,...(mode==='frame'?{originalFrameId:frameId,frameRatio:'9:16'}:{})}],jobs:[{attemptId:'77777777-7777-4777-8777-777777777777',sourceIndex:0,status:'prepared'}]}};saves=[];submissions=0;}
globalThis.fetch=async(url,options={})=>{
 const address=String(url);
 if(address.includes('kind=eq.batch&deleted=eq.false'))return Response.json(['ready','running'].includes(row.data.status)?[structuredClone(row)]:[]);
 if(address.includes('/rest/v1/frame_library')&&options.method==='PATCH'){row.data=JSON.parse(options.body).data;saves.push(structuredClone(row.data));return Response.json([structuredClone(row)]);}
 if(address.includes('/rest/v1/frame_credentials'))return Response.json([{ciphertext}]);
 if(address.includes('/rest/v1/frame_library')){const data=address.includes(modelId)?{identity:'Fixture identity',photoPath:owner+'/photo'}:address.includes(frameId)?{type:'image/png',path:owner+'/frame'}:{type:'video/mp4',duration:3,path:owner+'/video'};assert.ok(address.includes('owner_id=eq.'+owner));return Response.json([{data}]);}
 if(address.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/frame-private/'+owner+'/source?token=fixture'});
 if(address.includes('/estimate/'))return Response.json({usd:.5});
 if(address.includes('api.higgsfield.ai/alibaba/')){
  submissions++;
  const job=row.data.jobs[0];assert.ok(job.status==='submitting'||job.frameJob?.status==='submitting','state must be durable BEFORE a paid request');
  if(loss)throw Error('Connection lost after request transmission');
  return Response.json({request_id:requestId,status:'queued',status_url:'https://api.higgsfield.ai/requests/'+requestId+'/status'});
 }
 if(address.endsWith('/status'))return Response.json({status:'in_progress'});
 throw Error('Unexpected fixture request '+address);
};
reset();await runWorker();assert.equal(submissions,1);assert.equal(row.data.jobs[0].requestId,requestId);assert.ok(saves.some(data=>data.jobs[0].status==='submitting'));assert.ok(saves.some(data=>data.jobs[0].requestId===requestId));
await runWorker();assert.equal(submissions,1,'known requests must be polled instead of resubmitted');
reset();loss=true;await runWorker();assert.equal(submissions,1);assert.equal(row.data.jobs[0].status,'uncertain');assert.equal(row.data.status,'paused');await runWorker();assert.equal(submissions,1);
loss=false;reset('frame');await runWorker();assert.equal(submissions,1,'automatic first frame is edited by the server, as in production');assert.equal(row.data.jobs[0].frameJob.requestId,requestId,'frame request ID saved right after billing');assert.ok(saves.some(d=>d.jobs[0].frameJob?.status==='submitting'),'frame state saved BEFORE the paid request');
console.log('PASS: production worker persists video/frame state before billing, saves accepted request IDs, polls known requests and never retries ambiguous video submissions; automatic first-frame edits are saved before and after billing.');
