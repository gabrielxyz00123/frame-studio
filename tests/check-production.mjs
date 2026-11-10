import {reviewKey,REVIEW_VERSION} from '../public/identity-policy.mjs';
import assert from 'node:assert/strict';
import handler from '../api/higgsfield.js';
const ids=Array.from({length:9},(_,i)=>`${i+1}`.repeat(8)+'-'+`${i+1}`.repeat(4)+'-4'+`${i+1}`.repeat(3)+'-8'+`${i+1}`.repeat(3)+'-'+`${i+1}`.repeat(12));
const [userId,modelId,mediaId,frameId,model2,requestId,attemptId,batchId,foreignId]=ids;
const records=new Map([[modelId,{identity:'identity A',photoPath:userId+'/photo'}],[model2,{identity:'identity B',photoPath:userId+'/photo2'}],[mediaId,{type:'video/mp4',path:userId+'/source',duration:15}],[frameId,{type:'image/png',path:userId+'/frame'}],[batchId,{leaseToken:'lease',leaseUntil:Date.now()/1000+180}]]);
let calls=[],status='completed',upload=0,bodyBytes=0;
const original=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{const u=String(url);if(u.endsWith('/auth/v1/user'))return Response.json({id:userId,email:'gks.exec@gmail.com'});if(u.includes('/rest/v1/frame_library')){assert.ok(u.includes('owner_id=eq.'+userId));const id=new URL(u).searchParams.get('id').slice(3);return Response.json(records.has(id)?[{data:records.get(id)}]:[]);}if(u.includes('/storage/v1/object/sign/')&&u.includes('/generated/')&&!upload)return new Response('{}',{status:404});if(u.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/frame-private/'+userId+'/asset?token=signed'});if(u.includes('/storage/v1/object/info/'))return new Response('',{status:404});if(u.includes('/storage/v1/object/frame-private/')){upload++;if(Buffer.isBuffer(options.body))bodyBytes+=options.body.length;else for await(const chunk of options.body)bodyBytes+=chunk.byteLength;return Response.json({Key:'stored'});}if(u==='https://cdn.example.test/result.mp4')return new Response(new Uint8Array([0,1,2,3]),{headers:{'content-type':'video/mp4','content-length':'4'}});if(u.endsWith('/status'))return Response.json({status,images:[{url:'https://cdn.example.test/frame.png'}],video:{url:'https://cdn.example.test/result.mp4'}});if(u.startsWith('https://api.higgsfield.ai/estimate/'))return Response.json({usd:'0.31'});if(u.startsWith('https://api.higgsfield.ai/alibaba/')){calls.push({url:u,input:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return Response.json({request_id:requestId,status:'queued',status_url:'https://api.higgsfield.ai/requests/'+requestId+'/status'});}throw Error('Unexpected '+u);};
async function call(action,body){let result;
 if(action==='submit'&&['frame','multi'].includes(body.mode)){
  body={...body,productionId:batchId,leaseToken:'lease'};
  if(body.mode==='multi'&&!body.frameJob&&!body.frameMediaId)body.frameMediaId=frameId;
  const source={mode:body.mode,mediaId:body.mediaId,modelId:body.modelId,target:body.target||'',cast:body.cast,frameJob:body.frameJob?{...body.frameJob,status:'completed'}:undefined,frameMediaId:body.frameMediaId};
  const batch={leaseToken:'lease',leaseUntil:Date.now()/1000+180,mode:body.mode,modelId:body.modelId,cast:body.cast,sources:[source],jobs:[{attemptId,sourceIndex:0}]};
  source.identityReview={version:REVIEW_VERSION,key:reviewKey(batch,source)};records.set(batchId,batch);
 }
 const res={setHeader(){},status(code){this.code=code;return this;},json(data){result={code:this.code,data};return this;}};await handler({method:'POST',query:{action},body:{credentials:'fixture:secret',...body},headers:{authorization:'Bearer fixture',host:'studio.test',origin:'https://studio.test'}},res);return result;}
const common={mode:'direct',attemptId,modelId,mediaId,duration:15,resolution:'1080p',ratio:'9:16',directPrompt:'Replace {{target}} with {{identity}}',basePrompt:''};
try{
 assert.equal((await call('submit',{...common,duration:16})).code,400);assert.equal(calls.length,0);
 const beforeEstimate=calls.length;assert.equal((await call('estimate',common)).data.usd,.31);assert.equal(calls.length,beforeEstimate);assert.equal((await call('estimate-frame',{modelId,frameMediaId:frameId,editPrompt:'Edit {{identity}}'})).data.usd,.31);assert.equal(calls.length,beforeEstimate);
 let r=await call('submit',{...common,mode:'multi',multiPrompt:'Keep assignments',cast:[{modelId,target:'left'},{modelId:model2,target:'right'}]});assert.equal(r.code,202);assert.equal(calls.at(-1).input.image_urls.length,3);assert.match(calls.at(-1).input.prompt,/identity A/);assert.match(calls.at(-1).input.prompt,/identity B/);
 assert.equal((await call('submit',{...common,mode:'multi',multiPrompt:'x',cast:[{modelId,target:'same'},{modelId:model2,target:'same'}]})).code,409);
 const count=calls.length;assert.equal((await call('submit',{...common,mode:'multi',multiPrompt:'x',cast:[{modelId,target:'left'},{modelId:foreignId,target:'right'}]})).code,404);assert.equal(calls.length,count);
 r=await call('edit-frame',{attemptId,modelId,frameMediaId:frameId,editPrompt:'Image 1 scene, image 2 {{identity}}',ratio:'16:9'});assert.equal(r.code,202);assert.match(calls.at(-1).url,/qwen-image-3\/edit$/);assert.equal(calls.at(-1).input.image_urls.length,2);assert.match(calls.at(-1).input.prompt,/identity A/);const frameJob=r.data;
 r=await call('submit',{...common,mode:'frame',framePrompt:'Use edited scene',frameJob});assert.equal(r.code,202);assert.equal(calls.at(-1).input.image_urls[0],'https://cdn.example.test/frame.png');assert.equal(calls.at(-1).input.image_urls.length,2);assert.equal(calls.at(-1).input.video_urls.length,1);assert.match(calls.at(-1).url,/wan-3.0\/reference-to-video$/);
 status='in_progress';assert.equal((await call('submit',{...common,mode:'frame',framePrompt:'x',frameJob})).code,409);status='completed';assert.equal((await call('submit',{...common,mode:'frame',framePrompt:'x',frameJob:{...frameJob,ticket:'forged'}})).code,403);
 assert.equal((await call('submit',{...common,mode:'frame',framePrompt:'x',frameMediaId:frameId})).code,202);
 assert.equal((await call('submit',{...common,productionId:batchId,leaseToken:'wrong'})).code,409);assert.equal((await call('submit',{...common,productionId:batchId,leaseToken:'lease'})).code,202);
 r=await call('archive',frameJob);assert.equal(r.code,200);assert.equal(upload,1);assert.equal(bodyBytes,4);assert.match(r.data.videoPath,new RegExp('^'+userId+'/generated/'));assert.match(r.data.downloadUrl,/download=/);
 assert.equal((await call('archive',{...frameJob,ticket:'forged'})).code,403);assert.equal(upload,1);assert.ok(!JSON.stringify(r.data).includes('fixture:secret'));
 console.log('PASS: multi-person mapping and ownership; automatic/manual first frame; completed-image gate and ticket isolation; 15-second output limit; cross-session lease; private video copy and authenticated download.');
}finally{globalThis.fetch=original;}
