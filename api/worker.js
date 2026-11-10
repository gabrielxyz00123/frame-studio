import {validateCast,validatePhotos,assertReviewed,frameIdentityRule,videoIdentityRule,multiIdentityRule} from '../public/identity-policy.mjs';
/* Fila no servidor: roda a cada minuto (chamado por um agendador externo) e avanca os lotes marcados com serverQueue.
   Fica desligada enquanto SUPABASE_SERVICE_KEY e CRON_SECRET nao existirem. Cada acao usa so os dados do dono do lote. */
import {createHmac,timingSafeEqual,createDecipheriv,randomUUID} from 'node:crypto';
import {r2Config,presign,r2Exists,r2Put,validKey} from './_r2.js';
import {cleanMp4,fscNote} from './_clean.js';
import {spawn} from 'node:child_process';
import {writeFile,readFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const SUPABASE='https://hwhkseomjxoqjrylmqaz.supabase.co';
const HF='https://api.higgsfield.ai';
const MODEL='alibaba/wan-3.0/reference-to-video';
const EDIT_MODEL='alibaba/qwen-image-3/edit';
const TERMINAL=['completed','failed','nsfw','canceled'];
const idPattern=/^[a-f0-9-]{36}$/i;
const error=(status,message)=>Object.assign(new Error(message),{status});
const IMG_TYPES=['image/png','image/jpeg','image/webp'];

function sign(key,value){return createHmac('sha256',key).update(value).digest('base64url');}
function srvKey(){return (process.env.SUPABASE_SERVICE_KEY||'').trim();}
async function readJSON(r){try{return await r.json();}catch{return {};}}

/* ---------- Supabase com a chave de servico ---------- */
async function sb(path,{method='GET',body,headers={},binary=false}={}){
  const key=srvKey(),h={apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),...(binary?{}:{'Content-Type':'application/json'}),...headers};
  const r=await fetch(SUPABASE+path,{method,headers:h,body:body===undefined?undefined:(binary?body:JSON.stringify(body)),duplex:binary?'half':undefined,signal:AbortSignal.timeout(binary?45000:15000)});
  const data=binary&&!r.ok?{}:await readJSON(r);
  if(!r.ok){const why=String((data&&(data.message||data.error||data.hint||data.msg))||'').replace(/[A-Za-z0-9_\-]{40,}/g,'***').slice(0,160);throw error(502,'Falha ao acessar o banco ('+r.status+')'+(why?': '+why:'')+'.');}
  return data;
}
async function ownedRecord(owner,id,kind){
  if(!idPattern.test(id||''))throw error(400,'Referencia invalida.');
  const rows=await sb(`/rest/v1/frame_library?id=eq.${id}&owner_id=eq.${owner}&kind=eq.${kind}&deleted=eq.false&select=data`);
  if(!rows.length)throw error(404,'Referencia nao encontrada na biblioteca.');
  return rows[0].data;
}
async function signedMedia(owner,path){
  if(typeof path!=='string'||!path.startsWith(owner+'/')||path.includes('..'))throw error(400,'Arquivo invalido.');
  const r2=r2Config();
  if(r2&&validKey(owner,path)&&await r2Exists(r2,path))return presign(r2,'GET',path,{expires:7200});
  const res=await sb('/storage/v1/object/sign/frame-private/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',body:{expiresIn:7200}});
  if(!res.signedURL)throw error(502,'Nao foi possivel preparar a referencia.');
  const url=new URL(res.signedURL.startsWith('/object/')?'/storage/v1'+res.signedURL:res.signedURL,SUPABASE+'/storage/v1/');
  if(url.origin!==SUPABASE)throw error(502,'Endereco de referencia invalido.');
  return url.href;
}

/* ---------- chave da Higgsfield salva do usuario ---------- */
function wrappingKey(){const key=Buffer.from(process.env.FRAME_CREDENTIAL_KEY||'','base64');if(key.length!==32)throw error(503,'O salvamento protegido da chave nao esta configurado.');return key;}
function decryptCredential(value,owner){
  try{
    const [version,iv,tag,data]=value.split('.');if(version!=='v1')throw Error();
    const d=createDecipheriv('aes-256-gcm',wrappingKey(),Buffer.from(iv,'base64url'));d.setAAD(Buffer.from(owner));d.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([d.update(Buffer.from(data,'base64url')),d.final()]).toString('utf8');
  }catch{throw error(503,'Nao foi possivel ler a chave salva da Higgsfield.');}
}
async function credentialFor(owner){
  const rows=await sb(`/rest/v1/frame_credentials?owner_id=eq.${owner}&select=ciphertext`);
  if(!rows[0]||!rows[0].ciphertext)throw error(503,'Salve a chave da Higgsfield na conta (aba Integracao) para usar a fila no servidor.');
  return decryptCredential(rows[0].ciphertext,owner);
}

/* ---------- Higgsfield ---------- */
async function enqueue(key,owner,input,model,attemptId){
  if(!idPattern.test(attemptId||''))throw error(400,'Identificador invalido.');
  const r=await fetch(HF+'/'+model,{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json','Idempotency-Key':sign(key,owner+':'+model+':'+attemptId)},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(25000)});
  const result=await readJSON(r);
  if(!r.ok){
    if(r.status===402)throw error(402,'Saldo insuficiente na Higgsfield.');
    if(r.status===401||r.status===403)throw error(401,'A Higgsfield recusou as credenciais.');
    if(r.status===429)throw error(429,'Limite temporario da Higgsfield.');
    if(r.status>=500)throw error(503,'Higgsfield indisponivel (HTTP '+r.status+').');
    throw error(422,'A Higgsfield recusou a solicitacao (HTTP '+r.status+').');
  }
  if(!idPattern.test(result.request_id||''))throw error(502,'Resposta de acompanhamento invalida.');
  let url;try{url=new URL(result.status_url);}catch{throw error(502,'Resposta de acompanhamento invalida.');}
  if(url.origin!==HF||url.pathname!==`/requests/${result.request_id}/status`||url.search||url.hash)throw error(502,'Endereco de acompanhamento invalido.');
  return {requestId:result.request_id,status:result.status,statusUrl:url.href,ticket:sign(key,owner+':'+result.request_id),model};
}
async function estimatePrice(key,input,model){
  const r=await fetch(HF+'/estimate/'+model,{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(25000)});
  const result=await readJSON(r),usd=Number(result.usd);
  if(!r.ok||result.usd===undefined||!Number.isFinite(usd)||usd<0)return null;
  return usd;
}
async function hfStatus(key,job){
  if(!idPattern.test(job.requestId||''))throw error(400,'Pedido invalido.');
  let url;try{url=new URL(job.statusUrl||'');}catch{throw error(400,'Endereco de acompanhamento invalido.');}
  if(url.origin!==HF||url.pathname!==`/requests/${job.requestId}/status`||url.search||url.hash)throw error(400,'Endereco de acompanhamento invalido.');
  const r=await fetch(url,{headers:{Authorization:'Key '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw error(502,'Nao foi possivel consultar o pedido.');
  return readJSON(r);
}
const NO_TEXT='NO ON-SCREEN TEXT (mandatory, overrides anything above): the output video must contain no subtitles, captions, lyrics, titles, stickers, emojis, usernames, watermarks or logos at any moment. If @vid1 or @img1 shows any text overlay, do not reproduce it: rebuild the clean scene behind it. Never write the spoken words or the audio as text on screen.';
const OUTFIT_DEFAULT='OUTFIT CHANGE (overrides any instruction to keep, preserve or copy the original clothing): the replaced person wears the specific outfit below instead of the original clothing. {{outfit}} Reproduce the garments faithfully: cut, color, fabric, pattern and fit, adapted naturally to the body and pose. Do not change identity, pose, background or lighting because of the outfit. People who are not replaced keep their own clothes.';
function outfitOf(b,s){const o=(s&&s.outfit)||(b&&b.outfit);if(!o||typeof o!=='object')return null;const text=typeof o.text==='string'?o.text.trim().slice(0,500):'',mediaId=typeof o.mediaId==='string'?o.mediaId:'';if(!text&&!mediaId)return null;return {text,mediaId,prompt:typeof o.prompt==='string'&&o.prompt.trim()?o.prompt.trim().slice(0,4000):OUTFIT_DEFAULT};}
function outfitPrompt(o,ref){return o.prompt.replaceAll('{{outfit}}',[ref,o.text?'Outfit description: '+o.text+'.':''].filter(Boolean).join(' '));}
async function outfitImage(owner,o){if(!o.mediaId)return null;const m=await ownedRecord(owner,o.mediaId,'media');if(!IMG_TYPES.includes(m.type))throw error(400,'A foto da roupa deve ser PNG, JPEG ou WebP.');return signedMedia(owner,m.path);}
function outputImage(result){const url=result.images&&result.images[0]&&result.images[0].url;return typeof url==='string'&&url.startsWith('https://')?url:null;}
function outputVideo(result){const url=result.video&&result.video.url;return typeof url==='string'&&url.startsWith('https://')?url:null;}
function failMessage(r){
  const raw=[r&&r.error,r&&r.message,r&&r.reason,r&&r.detail].find(v=>typeof v==='string'&&v.trim());const extra=raw?' Detalhe: '+raw.trim().slice(0,200):'';
  if(r.status==='nsfw')return 'A Higgsfield recusou este video pela moderacao de conteudo (NSFW).'+extra;
  if(r.status==='canceled')return 'A geracao foi cancelada na Higgsfield.'+extra;
  return 'A Higgsfield nao concluiu esta geracao (falhou).'+extra;
}
function promptText(value,label,required=false){const t=typeof value==='string'?value.trim():'';if(t.length>20000||(required&&!t))throw error(400,'Preencha '+label+' com ate 20.000 caracteres.');return t;}

/* ---------- montagem dos pedidos (mesma logica de api/higgsfield.js) ---------- */
export async function buildFrameEdit(owner,b,s,cast,target,modelId){
  const frame=await ownedRecord(owner,s.originalFrameId,'media');
  if(!IMG_TYPES.includes(frame.type))throw error(400,'Primeiro quadro invalido.');
  let prompt,photoUrls=[];
  if(Array.isArray(cast)&&cast.length){
    if(cast.length>4)throw error(400,'Associe de 1 a 4 pessoas as modelos.');
    validateCast(cast);const castModels=[];const seen=new Set(),lines=[];
    for(const [i,person] of cast.entries()){
      const t=promptText(person.target,'a posicao de cada pessoa',true);
      if(t.length>200||seen.has(t.toLowerCase()))throw error(400,'Identifique cada pessoa de forma distinta.');seen.add(t.toLowerCase());
      const m=await ownedRecord(owner,person.modelId,'model');castModels.push(m);photoUrls.push(await signedMedia(owner,m.photoPath));
      lines.push(`Person ${i+1}: ${t}. Replace with the identity of Image ${i+2}: ${String(m.identity||'')}`);
    }
    validatePhotos(castModels);prompt=[multiIdentityRule(),'Image 1 is the source scene frame. The other images are identity sheets, one per replacement person. Replace ONLY the people listed below in Image 1, each with the identity of its assigned image. Each sheet supplies only face, hair and skin; do not copy its outfit or layout. Never blend or exchange identities. Preserve pose, expression, framing, clothing, background, lighting, objects and every unlisted person. Natural skin texture on every replaced person: no tattoos, no marks copied from the original people, and no new tattoos anywhere. Remove text and reconstruct surfaces naturally. Output one photorealistic scene frame, not a collage.',...lines].join('\n');
  }else{
    const model=await ownedRecord(owner,modelId,'model');
    prompt=promptText(b.editPrompt,'o prompt de edicao do quadro',true).replaceAll('{{identity}}',String(model.identity||'')).replaceAll('{{target}}',String(target||'the main person').slice(0,200));
    prompt+='\n\n'+frameIdentityRule(target);photoUrls=[await signedMedia(owner,model.photoPath)];
  }
  const outfit=outfitOf(b,s);
  if(outfit){let ref='';const oi=await outfitImage(owner,outfit);if(oi){photoUrls.push(oi);ref='The outfit is shown in Image '+(photoUrls.length+1)+'.';}prompt+='\n\n'+outfitPrompt(outfit,ref);}
  if(prompt.length>20000)throw error(400,'Reduza o prompt de edicao.');
  const frameRatio=['1:1','2:3','3:2','3:4','4:3','7:9','9:7','9:16','16:9','21:9'].includes(s.frameRatio)?s.frameRatio:'9:16';
  return {prompt,image_urls:[await signedMedia(owner,frame.path),...photoUrls],resolution:'1k',aspect_ratio:frameRatio,prompt_extend:false,enable_thinking:false};
}
export async function buildVideo(owner,key,b,s,j,frameImageUrl){
  const smode=s.mode||b.mode,smodel=s.modelId||b.modelId,scast=s.cast||b.cast,starget=(s.target!=null&&s.mode)?s.target:b.target;
  if(!['direct','frame','multi'].includes(smode))throw error(422,'Fluxo invalido.');
  const duration=Number(s.out||b.duration),resolution=b.resolution,ratio=b.ratio;
  if(!Number.isInteger(duration)||duration<2||duration>15||!['480p','720p','1080p'].includes(resolution)||!['16:9','4:3','1:1','3:4','9:16','adaptive'].includes(ratio))throw error(400,'Parametros invalidos.');
  const media=await ownedRecord(owner,s.mediaId,'media');
  if(media.type!=='video/mp4'||!Number.isFinite(media.duration)||media.duration<1||media.duration>15)throw error(400,'Use um MP4 de 1 a 15 segundos.');
  let imageUrls=[],prompt;const base=promptText(b.basePrompt,'o prompt base');
  if(smode==='multi'){
    if(!Array.isArray(scast)||scast.length<1||scast.length>4)throw error(400,'Associe de 1 a 4 pessoas as modelos.');
    validateCast(scast);const castModels=[];const targets=new Set(),mapping=[];let frameUrl=frameImageUrl||null;
    if(!frameUrl&&s.frameMediaId){const f=await ownedRecord(owner,s.frameMediaId,'media');if(!IMG_TYPES.includes(f.type))throw error(400,'Quadro invalido.');frameUrl=await signedMedia(owner,f.path);}
    const off=frameUrl?1:0;
    for(const [i,person] of scast.entries()){
      const t=promptText(person.target,'a posicao de cada pessoa',true);
      if(t.length>200||targets.has(t.toLowerCase()))throw error(400,'Identifique cada pessoa de forma distinta.');targets.add(t.toLowerCase());
      const model=await ownedRecord(owner,person.modelId,'model');castModels.push(model);imageUrls.push(await signedMedia(owner,model.photoPath));
      mapping.push(`Person ${i+1}: ${t}. Replacement identity is @img${i+1+off}: ${String(model.identity||'')}`);
    }
    if(/\{\{identity\}\}|\{\{target\}\}/.test(base))throw error(400,'Prompt base invalido para varias pessoas.');
    prompt=[base,promptText(b.multiPrompt,'o prompt de multiplas pessoas',true),'CAST MAPPING — mandatory priority over conflicting single-person instructions. Apply each identity ONLY to its matched person. Never blend or exchange identities. Unlisted people remain unchanged.',...mapping,...(frameUrl?['FRAME REFERENCE PRIORITY: @img1 is an already edited scene frame where the replacements are applied. Match those faces, hair and skin exactly and keep them consistent through the whole video; the other images are the same identities for reference. @vid1 defines motion, timing, clothing and scene. Replaced people must have no tattoos. Exact opening-frame reproduction is not required.']:[])].filter(Boolean).join('\n\n');
    validatePhotos(castModels);prompt+='\n\n'+multiIdentityRule();if(frameUrl)imageUrls=[frameUrl,...imageUrls];
  }else{
    const model=await ownedRecord(owner,smodel,'model'),identity=String(model.identity||''),target=String(starget||'the main person').slice(0,200);
    const flowPrompt=promptText(smode==='frame'?b.framePrompt:b.directPrompt,'o prompt do fluxo',true);
    prompt=[...new Set([base,flowPrompt].filter(Boolean))].join('\n\n').replaceAll('{{identity}}',identity).replaceAll('{{target}}',target);
    if(smode==='frame'){
      prompt+='\n\nFRAME REFERENCE PRIORITY: @img1 is an edited scene frame, not an identity sheet. Use its person identity and appearance as the visual reference; @vid1 defines motion, timing, clothing and scene. An edited frame IS supplied. This overrides any conflicting description of @img1 or absence of an edited frame above. Preserve the mapped identity throughout the video. Exact opening-frame reproduction is not required.';
      if(frameImageUrl)imageUrls=[frameImageUrl];
      else{const f=await ownedRecord(owner,s.frameMediaId,'media');if(!IMG_TYPES.includes(f.type))throw error(400,'Envie o primeiro quadro editado.');imageUrls=[await signedMedia(owner,f.path)];}
    imageUrls.push(await signedMedia(owner,model.photoPath));prompt+='\n\n'+videoIdentityRule(target);
     }else imageUrls=[await signedMedia(owner,model.photoPath)];
  }
  const outfit=outfitOf(b,s);
  if(outfit){let ref='';if(frameImageUrl){ref='The outfit is already applied in @img1 (the edited frame). Keep exactly that outfit for the whole video and ignore the clothing seen in @vid1.';}else{const oi=await outfitImage(owner,outfit);if(oi){imageUrls.push(oi);ref='The outfit is shown in @img'+imageUrls.length+'. Keep exactly that outfit for the whole video and ignore the clothing seen in @vid1.';}else ref='Ignore the clothing seen in @vid1 and keep this outfit for the whole video.';}prompt+='\n\n'+outfitPrompt(outfit,ref);}
  if(smode==='frame'||smode==='multi')prompt+='\n\n'+NO_TEXT;
 if(prompt.length>20000)throw error(400,'A soma dos prompts ultrapassa 20.000 caracteres.');
  let audioUrl=null;
  if(typeof media.audioPath==='string'){
    audioUrl=await referenceAudio(owner,key,media);
    prompt+='\n\nAUDIO: Audio 1 is the original soundtrack of @vid1 (it may be speech, music, ambient sound or a mix). Keep its exact timing. The output must start at the very first frame of @vid1 with the same framing, camera angle and pose, and follow @vid1 shot by shot until the end. Never add an intro, a new scene, a different angle or a person talking to the camera that is not in @vid1. Only if the person in @vid1 is actually speaking or singing, match the lips to Audio 1 word for word; otherwise keep the mouth natural. Do not invent, change, translate or add speech.';
  }
  if(smode==='frame')prompt+='\n\n'+videoIdentityRule(starget);if(smode==='multi')prompt+='\n\n'+multiIdentityRule();
  const input={prompt,image_urls:imageUrls,video_urls:[await signedMedia(owner,media.path)],duration,resolution,aspect_ratio:ratio,generate_audio:!!b.generateAudio,prompt_extend:false,enable_thinking:false};
  if(audioUrl)input.audio_urls=[audioUrl];
  return {input,smode};
}
async function referenceAudio(owner,key,media){
  const src=await signedMedia(owner,media.audioPath),got=await fetch(src,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!got.ok)throw error(502,'Nao foi possivel ler o audio de referencia.');
  const bytes=Buffer.from(await got.arrayBuffer());
  if(bytes.length<1000||bytes.length>15*1048576||bytes.toString('latin1',0,4)!=='RIFF')throw error(400,'Audio de referencia invalido.');
  const up=await fetch(HF+'/files/generate-upload-url',{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},body:JSON.stringify({content_type:'audio/wav'}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!up.ok)throw error(502,'A Higgsfield nao preparou o envio do audio.');
  const slot=await up.json();if(!slot.upload_url||!slot.public_url)throw error(502,'Resposta inesperada ao enviar o audio.');
  const put=await fetch(slot.upload_url,{method:'PUT',headers:{...(slot.upload_headers||{'Content-Type':'audio/wav'})},body:bytes,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!put.ok)throw error(502,'Nao foi possivel enviar o audio para a Higgsfield.');
  return slot.public_url;
}

/* ---------- trocar o audio pelo original (sem recodificar a imagem) ---------- */
async function ffmpegPath(){try{const m=await import('@ffmpeg-installer/ffmpeg');return (m.default&&m.default.path)||m.path||null;}catch{return null;}}
function runFfmpeg(bin,args){
  return new Promise((resolve,reject)=>{
    const p=spawn(bin,args,{stdio:['ignore','ignore','pipe']});let err='';
    p.stderr.on('data',d=>{err=(err+d).slice(-600);});
    const t=setTimeout(()=>{p.kill('SIGKILL');reject(Error('ffmpeg demorou demais.'));},20000);
    p.on('error',e=>{clearTimeout(t);reject(e);});
    p.on('close',c=>{clearTimeout(t);c===0?resolve():reject(Error('ffmpeg falhou: '+err.trim().split('\n').pop()));});
  });
}
async function muxVoice(owner,b,j,buf){
  const s=(b.sources||[])[j.sourceIndex];
  if(!s||!s.mediaId)return null;
  return muxWithMedia(owner,await ownedRecord(owner,s.mediaId,'media'),buf);
}
async function muxWithMedia(owner,media,buf){
  const audioPath=media.audioHiPath||media.audioPath;
  if(typeof audioPath!=='string')return null;
  const bin=await ffmpegPath();if(!bin)throw error(503,'ffmpeg indisponivel.');
  const a=await fetch(await signedMedia(owner,audioPath),{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!a.ok)throw error(502,'Nao foi possivel ler o audio original.');
  const dir=await mkdtemp(join(tmpdir(),'mux-'));
  try{
    await writeFile(join(dir,'v.mp4'),buf);await writeFile(join(dir,'a.wav'),Buffer.from(await a.arrayBuffer()));
    await runFfmpeg(bin,['-y','-v','error','-i',join(dir,'v.mp4'),'-i',join(dir,'a.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af','apad','-c:a','aac','-b:a','192k','-ar','48000','-ac','1','-shortest','-movflags','+faststart',join(dir,'o.mp4')]);
    const out=await readFile(join(dir,'o.mp4'));
    return out.length>1000?out:null;
  }finally{rm(dir,{recursive:true,force:true}).catch(()=>{});}
}

async function putVideo(owner,path,buf){
  const objectPath=path.split('/').map(encodeURIComponent).join('/'),r2=r2Config();
  if(r2&&validKey(owner,path)){if(!(await r2Put(r2,path,buf,'video/mp4')))throw error(502,'Nao foi possivel guardar o video.');}
  else{
    const key=srvKey(),r=await fetch(SUPABASE+'/storage/v1/object/frame-private/'+objectPath,{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'video/mp4','x-upsert':'false'},body:buf,signal:AbortSignal.timeout(30000)});
    if(!r.ok&&r.status!==409)throw error(502,'Nao foi possivel guardar o video.');
  }
}

/* limpa os metadados do MP4 no proprio arquivo; se algo falhar, devolve o original e avisa */
function cleanBuf(buf){
  try{
    const r=cleanMp4(new Uint8Array(buf.buffer,buf.byteOffset,buf.length));
    if(r.ok&&r.data&&r.data.length===buf.length)return {buf:Buffer.from(r.data.buffer,r.data.byteOffset,r.data.length),clean:r.clean===true,note:r.clean?'':fscNote(r.report)};
    return {buf,clean:false,note:fscNote(r.report)||'Nao foi possivel limpar.'};
  }catch(e){return {buf,clean:false,note:'Falha na limpeza.'};}
}

/* ---------- guardar o video pronto ---------- */
async function archive(owner,j,b){
  const videoUrl=j.videoUrl;
  if(typeof videoUrl!=='string'||!videoUrl.startsWith('https://'))throw error(409,'Video ainda sem endereco.');
  const path=owner+'/generated/'+j.requestId+'.mp4',objectPath=path.split('/').map(encodeURIComponent).join('/');
  let existing=null;try{existing=await signedMedia(owner,path);}catch{}
  if(!existing){
    const v=await fetch(videoUrl,{signal:AbortSignal.timeout(25000)});
    if(!v.ok)throw error(502,'Nao foi possivel obter o video gerado.');
    let buf=Buffer.from(await v.arrayBuffer());
    if(buf.length>50*1048576)throw error(413,'Video maior que 50 MB.');
    if(b&&!j.audioMerged){
      try{const out=await muxVoice(owner,b,j,buf);if(out){buf=out;j.audioMerged=true;j.audioMergeError='';}}
      catch(e){j.audioMergeError=e.message;}
    }
    const cl=cleanBuf(buf);j.metaClean=cl.clean;j.metaNote=cl.note;
    await putVideo(owner,path,cl.buf);
  }
  j.videoPath=path;j.videoUrl=await signedMedia(owner,path);j.archiveError='';
}

/* ---------- avancar um trabalho ---------- */
function isFrameEdit(b,s){
  const smode=s.mode||b.mode;
  if(!s.originalFrameId||s.frameMediaId)return false;
  return (smode==='frame'&&!!(s.mode||b.frameMethod==='auto'))||(smode==='multi'&&!!s.useFrame);
}
function resetForRetry(j){j.retried=true;j.lastError=j.error||'';delete j.requestId;delete j.statusUrl;delete j.ticket;delete j.error;delete j.videoUrl;delete j.downloadUrl;delete j.videoPath;j.attemptId=randomUUID();j.status='prepared';}

async function pollJob(ctx,j){
  const r=await hfStatus(ctx.key,j);
  j.status=r.status||j.status;
  if(r.status==='completed'){
    j.videoUrl=outputVideo(r)||j.videoUrl;
    try{await archive(ctx.owner,j,ctx.b);}catch(e){j.archiveError=e.message;j.archiveTries=(j.archiveTries||0)+1;}
    ctx.b.srvFails=0;
  }else if(['failed','nsfw','canceled'].includes(r.status)){
    j.error=failMessage(r);
    if(r.status==='failed'&&!j.retried&&ctx.autoRetry){resetForRetry(j);}
    else ctx.b.srvFails=(ctx.b.srvFails||0)+1;
  }
}
async function submitJob(ctx,j){
  const {b,owner,key}=ctx,s=b.sources[j.sourceIndex];
  assertReviewed(b,s);let frameImageUrl=null;
  if(isFrameEdit(b,s)){
    const smode=s.mode||b.mode;
    let fj=j.frameJob&&j.frameJob.requestId?j.frameJob:(s.frameJob&&s.frameJob.requestId?s.frameJob:null);
    if(fj&&!j.frameJob)j.frameJob=fj;
    if(!fj){
      const cast=smode==='multi'?(s.cast||b.cast):null,target=(s.target!=null&&s.mode)?s.target:b.target,modelId=s.modelId||b.modelId;
      const input=await buildFrameEdit(owner,b,s,cast,target,smode==='multi'?(cast&&cast[0]&&cast[0].modelId):modelId);
      const attemptId=(j.frameJob&&j.frameJob.attemptId)||randomUUID();
      j.frameJob={attemptId,status:'submitting'};await ctx.persist();
      Object.assign(j.frameJob,await enqueue(key,owner,input,EDIT_MODEL,attemptId));await ctx.persist();
      j.stage='frame';return 'frame';
    }
    const st=await hfStatus(key,fj);
    fj.status=st.status;
    if(st.status==='completed'&&outputImage(st)){fj.imageUrl=outputImage(st);frameImageUrl=fj.imageUrl;}
    else if(['failed','nsfw','canceled'].includes(st.status)){j.status='failed';j.error='A edicao do quadro falhou ('+st.status+').';ctx.b.srvFails=(ctx.b.srvFails||0)+1;return 'failed';}
    else {j.stage='frame';return 'frame';}
  }else if(j.frameJob&&j.frameJob.requestId){
    const st=await hfStatus(key,j.frameJob);
    if(st.status!=='completed'||!outputImage(st))return 'frame';
    frameImageUrl=outputImage(st);
  }else if(s.frameJob&&s.frameJob.requestId){
    const st=await hfStatus(key,s.frameJob);
    if(st.status!=='completed'||!outputImage(st))throw error(409,'A edicao do primeiro quadro nao esta concluida.');
    frameImageUrl=outputImage(st);j.frameJob=s.frameJob;
  }
  const {input,smode}=await buildVideo(owner,key,b,s,j,frameImageUrl);
  const pk=Math.ceil(Number(s.duration)||0)+'|'+(s.out||b.duration)+'|'+b.resolution+'|'+smode;
  ctx.prices=ctx.prices||{};
  if(!(pk in ctx.prices))ctx.prices[pk]=await estimatePrice(key,input,MODEL).catch(()=>null);
  if(ctx.prices[pk]!=null)j.priceUsd=ctx.prices[pk];
  j.status='submitting';await ctx.persist();
  Object.assign(j,await enqueue(key,owner,input,MODEL,j.attemptId));await ctx.persist();
  j.stage='queued';return 'submitted';
}

/* ---------- um lote ---------- */
async function runBatch(row,budget,persist){
  const owner=row.owner_id,b=row.data;
  const ctx={owner,b,key:null,autoRetry:b.autoRetry===true,prices:{},persist};
  const conc=Math.max(1,Math.min(10,Number(b.serverConc)||3));
  let note='';
  try{ctx.key=await credentialFor(owner);}
  catch(e){b.status='paused';b.productionStatus='Pausado: '+e.message;return 'paused';}
  const jobs=b.jobs||[];
  /* 1) acompanhar os que ja foram enviados */
  const flying=jobs.filter(j=>!TERMINAL.includes(j.status)&&j.requestId);
  await Promise.all(flying.map(async j=>{try{await pollJob(ctx,j);}catch(e){j.pollError=e.message;}}));
  /* videos prontos que ainda nao foram guardados */
  await Promise.all(jobs.filter(j=>j.status==='completed'&&j.requestId&&!j.videoPath&&j.videoUrl).map(async j=>{try{await archive(owner,j,b);}catch(e){j.archiveError=e.message;j.archiveTries=(j.archiveTries||0)+1;}}));
  /* 2) enviar novos, respeitando a simultaneidade */
  let inflight=jobs.filter(j=>!TERMINAL.includes(j.status)&&(j.requestId||(j.frameJob&&j.frameJob.requestId))).length;
  try{for(const j of jobs)if(!TERMINAL.includes(j.status)&&!j.requestId)assertReviewed(b,b.sources[j.sourceIndex]);}catch(e){b.status='paused';b.productionStatus='Pausado: '+e.message;await ctx.persist();return 'paused';}
  const waiting=jobs.filter(j=>!TERMINAL.includes(j.status)&&!j.requestId);
  for(const j of waiting){
    if(['uncertain','submitting'].includes(j.status)||(['uncertain','submitting'].includes(j.frameJob?.status)&&!j.frameJob?.requestId)){j.status='uncertain';b.status='paused';b.productionStatus='Pedido sem confirmação. Confira Requests antes de reenviar.';await ctx.persist();return 'paused';}
    if(Date.now()>budget)break;
    if((b.srvFails||0)>=3)break;
    const inFrame=!!(j.frameJob&&j.frameJob.requestId);
    if(!inFrame&&inflight>=conc)continue;
    j.tries=(j.tries||0);
    try{
      const res=await submitJob(ctx,j);
      if(!inFrame&&(res==='submitted'||res==='frame'))inflight++;
      j.tries=0;
    }catch(e){
      if((j.status==='submitting'&&!j.requestId)||(j.frameJob?.status==='submitting'&&!j.frameJob?.requestId)){if(!e.status||e.status>=500){j.status='uncertain';if(j.frameJob&&!j.frameJob.requestId)j.frameJob.status='uncertain';j.error='Envio sem confirmação. Confira Requests antes de reenviar.';b.status='paused';b.productionStatus=j.error;await ctx.persist();return 'paused';}j.status='prepared';if(j.frameJob&&!j.frameJob.requestId)j.frameJob.status='prepared';}
      if(e.status===409||e.status===402||e.status===401){b.status='paused';b.productionStatus='Pausado: '+e.message;note='paused';break;}
      if(e.status===429){note='limite';break;}
      if(e.status&&e.status<500&&e.status!==429){j.status='failed';j.error=e.message;b.srvFails=(b.srvFails||0)+1;}
      else{j.tries++;j.pollError=e.message;if(j.tries>=3){j.status='failed';j.error='Falha ao enviar apos 3 tentativas: '+e.message;b.srvFails=(b.srvFails||0)+1;}}
    }
  }
  /* 3) estado do lote */
  if(note==='paused')return 'paused';
  if((b.srvFails||0)>=3){b.status='paused';b.productionStatus='Pausado: tres geracoes seguidas falharam. Veja o motivo em cada saida.';return 'paused';}
  if(jobs.every(j=>TERMINAL.includes(j.status)&&(j.status!=='completed'||j.videoPath||(j.archiveTries||0)>=5))){
    b.status='completed';b.productionStatus='Processamento encerrado (servidor)';b.serverQueue=false;return 'completed';
  }
  b.status='running';
  const done=jobs.filter(j=>TERMINAL.includes(j.status)).length;
  b.productionStatus='Gerando no servidor: '+done+' de '+jobs.length+' prontos';
  return 'running';
}

/* ---------- reserva do lote (compativel com a reserva do navegador) ---------- */
async function claim(row){
  const d=row.data,now=Date.now()/1000;
  if(Number(d.leaseUntil||0)>now)return null;
  const token='srv-'+randomUUID(),nd={...d,leaseToken:token,leaseUntil:now+100};
  const filter=d.leaseToken?'data->>leaseToken=eq.'+encodeURIComponent(d.leaseToken):'data->>leaseToken=is.null';
  const rows=await sb(`/rest/v1/frame_library?id=eq.${row.id}&owner_id=eq.${row.owner_id}&${filter}`,{method:'PATCH',body:{data:nd},headers:{Prefer:'return=representation'}});
  return rows.length?{token,data:nd}:null;
}
async function saveBatch(row,token,data){
  const rows=await sb(`/rest/v1/frame_library?id=eq.${row.id}&owner_id=eq.${row.owner_id}&data->>leaseToken=eq.${encodeURIComponent(token)}`,{method:'PATCH',body:{data},headers:{Prefer:'return=representation'}});
  if(!rows.length)throw error(409,'A reserva do lote foi perdida.');
}

export async function runWorker(){
  const started=Date.now(),budget=started+45000,out={batches:0,results:[]};
  const rows=await sb('/rest/v1/frame_library?kind=eq.batch&deleted=eq.false&data->>serverQueue=eq.true&data->>status=in.(ready,running)&select=id,owner_id,data&order=created_at.asc&limit=6');
  for(const row of rows){
    if(Date.now()>budget)break;
    let got=null;
    try{got=await claim(row);}catch{got=null;}
    if(!got){out.results.push({id:row.id,skipped:true});continue;}
    const work={id:row.id,owner_id:row.owner_id,data:got.data};
    let result='error';
    try{
      result=await runBatch(work,budget,()=>saveBatch(work,got.token,work.data));
    }catch(e){
      work.data.pollError=e.message;result='error';
    }
    const fin={...work.data};delete fin.leaseToken;delete fin.leaseUntil;
    try{await saveBatch(work,got.token,fin);}catch(e){result='save-failed';}
    out.batches++;out.results.push({id:row.id,result});
  }
  return out;
}

/* ---------- troca de audio pedida pelo navegador (mesmo metodo do servidor) ---------- */
const PUBLIC_KEY='sb_publishable_oJvYE2n7-MjHwTwzN668mQ_orC-JqwJ';
async function muxForUser(req){
  const token=req.headers.authorization;
  if(!/^Bearer [^\s]+$/.test(token||''))throw error(401,'Entre no Frame Studio.');
  const auth=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:token},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)throw error(401,'Sua sessao expirou. Entre novamente.');
  const user=await auth.json(),owner=user&&user.id;
  if(!idPattern.test(owner||''))throw error(401,'Sessao invalida.');
  const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
  const videoPath=body.videoPath;
  if(typeof videoPath!=='string'||!videoPath.startsWith(owner+'/generated/')||videoPath.includes('..'))throw error(400,'Video invalido.');
  const media=await ownedRecord(owner,body.mediaId,'media');
  const src=await fetch(await signedMedia(owner,videoPath),{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!src.ok)throw error(502,'Nao foi possivel ler o video gerado.');
  const buf=Buffer.from(await src.arrayBuffer());
  if(buf.length>50*1048576)throw error(413,'Video maior que 50 MB.');
  const out=await muxWithMedia(owner,media,buf);
  if(!out)throw error(422,'Este video nao tem audio original guardado.');
  const base=videoPath.replace(/\.mp4$/,'').replace(/-voz-[a-f0-9]{8}$/,'');
  const path=base+'-voz-'+randomUUID().slice(0,8)+'.mp4';
  const cl=cleanBuf(out);
  await putVideo(owner,path,cl.buf);
  return {path,metaClean:cl.clean,metaNote:cl.note};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='POST'&&req.query&&req.query.mux){
    try{if(!srvKey())throw error(503,'Servidor nao configurado.');return res.status(200).json(await muxForUser(req));}
    catch(e){console.error('mux:',e.message);return res.status(e.status||500).json({error:e.message||'Falha.'});}
  }
  try{
    const secret=(process.env.CRON_SECRET||'').trim();
    if(req.method==='GET'&&req.query&&req.query.probe)return res.status(200).json({configured:!!(secret&&srvKey())});
    if(!secret||!srvKey())return res.status(503).json({error:'Fila no servidor nao configurada.'});
    const supplied=String(req.headers.authorization||'');
    const a=Buffer.from('Bearer '+secret),b=Buffer.from(supplied);
    if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Nao autorizado.'});
    return res.status(200).json(await runWorker());
  }catch(e){console.error('worker:',e.message);return res.status(e.status||500).json({error:e.message||'Falha.'});}
}
