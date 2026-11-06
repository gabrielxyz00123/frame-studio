import {createHmac,timingSafeEqual,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const SUPABASE=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const PUBLIC_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const HF='https://api.higgsfield.ai';
const MODEL='alibaba/wan-3.0/reference-to-video';
const idPattern=/^[a-f0-9-]{36}$/i;
const error=(status,message)=>Object.assign(new Error(message),{status});
function sign(key,value){return createHmac('sha256',key).update(value).digest('base64url')}
function ticket(key,userId,requestId){return sign(key,userId+':'+requestId)}
function validTicket(key,userId,requestId,value){if(typeof value!=='string')return false;const expected=Buffer.from(ticket(key,userId,requestId)),supplied=Buffer.from(value);return expected.length===supplied.length&&timingSafeEqual(expected,supplied)}
async function readJSON(response){try{return await response.json()}catch{return {}}}
async function db(path,token,options={}){const r=await fetch(SUPABASE+path,{...options,headers:{apikey:PUBLIC_KEY,Authorization:token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});const data=await readJSON(r);if(!r.ok)throw error(502,'Não foi possível acessar os arquivos da biblioteca.');return data}
async function ownedRecord(id,kind,user,token){if(!idPattern.test(id||''))throw error(400,'Referência inválida.');const rows=await db(`/rest/v1/frame_library?id=eq.${id}&owner_id=eq.${user.id}&kind=eq.${kind}&deleted=eq.false&select=data`,token);if(!rows.length)throw error(404,'Referência não encontrada na sua biblioteca.');return rows[0].data}
async function signedMedia(path,user,token){if(typeof path!=='string'||!path.startsWith(user.id+'/')||path.includes('..'))throw error(400,'Arquivo inválido.');const result=await db('/storage/v1/object/sign/frame-private/'+path.split('/').map(encodeURIComponent).join('/'),token,{method:'POST',body:JSON.stringify({expiresIn:7200})});if(!result.signedURL)throw error(502,'Não foi possível preparar a referência.');const url=new URL(result.signedURL.startsWith('/object/')?'/storage/v1'+result.signedURL:result.signedURL,SUPABASE+'/storage/v1/');if(url.origin!==SUPABASE)throw error(502,'Endereço de referência inválido.');return url.href}
async function referenceAudio(media,user,token,key){const src=await signedMedia(media.audioPath,user,token);const got=await fetch(src,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!got.ok)throw error(502,'Não foi possível ler o áudio de referência.');const bytes=Buffer.from(await got.arrayBuffer());if(bytes.length<1000||bytes.length>15*1048576||bytes.toString('latin1',0,4)!=='RIFF')throw error(400,'Áudio de referência inválido.');const up=await fetch(HF+'/files/generate-upload-url',{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},body:JSON.stringify({content_type:'audio/wav'}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!up.ok)throw error(502,'A Higgsfield não preparou o envio do áudio.');const slot=await up.json();if(!slot.upload_url||!slot.public_url)throw error(502,'Resposta inesperada da Higgsfield ao enviar o áudio.');const put=await fetch(slot.upload_url,{method:'PUT',headers:{...(slot.upload_headers||{'Content-Type':'audio/wav'})},body:bytes,redirect:'error',signal:AbortSignal.timeout(30000)});if(!put.ok)throw error(502,'Não foi possível enviar o áudio para a Higgsfield.');return slot.public_url}
/* Troca o áudio do vídeo gerado pelo áudio original do vídeo de origem (mesmo trecho), sem recodificar a imagem. */
async function originalAudio(generated,source){
 if(!source.length||source.length>50*1048576)return null;
 const {default:ffmpeg}=await import('ffmpeg-static');const {spawn}=await import('node:child_process');const {writeFile,readFile,rm,mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'fs-'));const g=join(dir,'g.mp4'),o=join(dir,'o.mp4'),f=join(dir,'f.mp4');
 try{await writeFile(g,generated);await writeFile(o,source);
  const run=args=>new Promise(resolve=>{let err='';const p=spawn(ffmpeg,args);p.stderr.on('data',d=>{if(err.length<20000)err+=d});const t=setTimeout(()=>p.kill('SIGKILL'),25000);p.on('close',c=>{clearTimeout(t);resolve({code:c,err})});p.on('error',()=>{clearTimeout(t);resolve({code:-1,err})});});
  const info=(await run(['-hide_banner','-i',g])).err.match(/Duration: (\d+):(\d+):([\d.]+)/);if(!info)return null;
  const seconds=(+info[1])*3600+(+info[2])*60+(+info[3]);if(!(seconds>0&&seconds<=60))return null;
  const {code}=await run(['-v','error','-y','-i',g,'-i',o,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-af','apad','-t',seconds.toFixed(3),'-movflags','+faststart',f]);
  if(code!==0)return null;const out=await readFile(f);return out.length>1000?out:null;
 }finally{await rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
async function requestStatus(body,key,user){
 if(!idPattern.test(body.requestId||'')||!validTicket(key,user.id,body.requestId,body.ticket))throw error(403,'Esse pedido não pertence à sua conta.');
 let url;try{url=new URL(body.statusUrl||'')}catch{throw error(400,'Endereço de acompanhamento inválido.')}
 if(url.origin!==HF||url.pathname!==`/requests/${body.requestId}/status`||url.search||url.hash)throw error(400,'Endereço de acompanhamento inválido.');
 const r=await fetch(url,{headers:{Authorization:'Key '+key},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw error(502,'Não foi possível consultar o pedido.');return readJSON(r);
}
async function enqueue(input,model,attemptId,key,user){
 if(!idPattern.test(attemptId||''))throw error(400,'Identificador de teste inválido.');
 const r=await fetch(HF+'/'+model,{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json','Idempotency-Key':sign(key,user.id+':'+model+':'+attemptId)},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(25000)}),result=await readJSON(r);
 if(!r.ok){if(r.status===402)throw error(402,'Saldo insuficiente na Higgsfield.');if(r.status===401||r.status===403)throw error(401,'A Higgsfield recusou as credenciais.');if(r.status===429)throw error(429,'Limite temporário. Aguarde antes de retomar.');if(r.status===404)throw error(502,'O modelo solicitado não está disponível neste endpoint ou nesta conta Higgsfield (HTTP 404).');throw error(502,'A Higgsfield recusou a solicitação (HTTP '+r.status+'). Confira os arquivos e parâmetros; nenhuma nova tentativa será enviada automaticamente.');}
 if(!idPattern.test(result.request_id||''))throw error(502,'Resposta de acompanhamento inválida.');let url;try{url=new URL(result.status_url)}catch{throw error(502,'Resposta de acompanhamento inválida.')}
 if(url.origin!==HF||url.pathname!==`/requests/${result.request_id}/status`||url.search||url.hash)throw error(502,'Endereço de acompanhamento inválido.');
 return {requestId:result.request_id,status:result.status,statusUrl:url.href,ticket:ticket(key,user.id,result.request_id),model};
}
async function verifyLease(body,user,token){if(!body.productionId)return;const batch=await ownedRecord(body.productionId,'batch',user,token);if(!body.leaseToken||batch.leaseToken!==body.leaseToken||Number(batch.leaseUntil||0)<Date.now()/1000)throw error(409,'O envio deste lote está bloqueado em outra sessão ou expirou. Retome o lote.');}
async function estimatePrice(input,model,key){const r=await fetch(HF+'/estimate/'+model,{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(25000)}),result=await readJSON(r);const usd=Number(result.usd);if(!r.ok||result.usd===undefined||!Number.isFinite(usd)||usd<0)throw error(502,'Consulta de preço da Higgsfield indisponível '+(r.ok?'(resposta sem valor)':'(HTTP '+r.status+')')+'. Nenhuma geração foi enviada.');return {usd,model,source:'higgsfield-account'};}
function promptText(value,label,required=false){const t=typeof value==='string'?value.trim():'';if(t.length>20000||(required&&!t))throw error(400,'Preencha '+label+' com até 20.000 caracteres.');return t;}
function outputImage(result){const url=result.images?.[0]?.url;return typeof url==='string'&&url.startsWith('https://')?url:null;}
function wrappingKey(){const key=Buffer.from(process.env.FRAME_CREDENTIAL_KEY||'','base64');if(key.length!==32)throw error(503,'O salvamento protegido da chave ainda não foi configurado.');return key;}
function encryptCredential(value,owner){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',wrappingKey(),iv);cipher.setAAD(Buffer.from(owner));const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');}
function decryptCredential(value,owner){try{const [version,iv,tag,data]=value.split('.');if(version!=='v1')throw Error();const decipher=createDecipheriv('aes-256-gcm',wrappingKey(),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}catch{throw error(503,'Não foi possível ler a chave salva. Cadastre a chave novamente em Integração.');}}
async function savedCredential(user,token){if(!process.env.FRAME_CREDENTIAL_KEY)return null;const rows=await db('/rest/v1/frame_credentials?owner_id=eq.'+user.id+'&select=ciphertext',token);return rows[0]?.ciphertext?decryptCredential(rows[0].ciphertext,user.id):null;}
async function persistCredential(value,user,token){const check=await fetch(HF+'/files/generate-upload-url',{method:'POST',headers:{Authorization:'Key '+value,'Content-Type':'application/json'},body:JSON.stringify({content_type:'image/png'}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!check.ok)throw error(401,'A Higgsfield não aceitou a chave para salvar. Confira suas credenciais.');const ciphertext=encryptCredential(value,user.id);await db('/rest/v1/frame_credentials?on_conflict=owner_id',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({owner_id:user.id,ciphertext,updated_at:new Date().toISOString()})});}
export default async function handler(req,res){res.setHeader('Cache-Control','private, no-store');try{const token=req.headers.authorization;if(!/^Bearer [^\s]+$/.test(token||''))throw error(401,'Entre no Frame Studio.');const auth=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:token},signal:AbortSignal.timeout(10000)});if(!auth.ok)throw error(401,'Sua sessão expirou. Entre novamente.');const user=await auth.json();const body=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body)||{}:{};const supplied=typeof body.credentials==='string'?body.credentials.trim():'';if(supplied&&(supplied.length>2000||!/^[-a-zA-Z0-9_]+:[^\s:]+$/.test(supplied)))throw error(400,'Cole a chave completa copiada da Higgsfield.');const allowed=(process.env.HF_TEST_EMAILS||'gks.exec@gmail.com,gabrielcavalho011@gmail.com,gabrielcavalho012@gmail.com').split(',').map(s=>s.trim().toLowerCase());const serverAllowed=allowed.includes((user.email||'').toLowerCase());const action=req.query.action;let key=supplied;if(!key&&action!=='disconnect')key=await savedCredential(user,token)||(serverAllowed?process.env.HF_CREDENTIALS?.trim():null);if(req.method==='POST'){const host=req.headers.host;const origin=req.headers.origin;if(origin!==`https://${host}`&&origin!==`http://${host}`)throw error(403,'Origem inválida.');}if(supplied&&process.env.FRAME_CREDENTIAL_KEY&&action!=='connect'&&action!=='disconnect'){let existing=null;try{existing=await savedCredential(user,token);}catch{}if(existing!==supplied)await persistCredential(supplied,user,token);}if(action==='disconnect'&&req.method==='POST'){await db('/rest/v1/frame_credentials?owner_id=eq.'+user.id,token,{method:'DELETE'});return res.status(200).json({configured:false,saved:false});}if(action==='config'&&req.method==='GET')return res.status(200).json({configured:!!key,model:MODEL,firstFrameReady:true,testOnly:false,connectionMode:supplied?'session':process.env.FRAME_CREDENTIAL_KEY?'saved':'server',saved:!!key&&!!process.env.FRAME_CREDENTIAL_KEY});if(!key)throw error(503,'Conecte sua conta Higgsfield na aba Integração.');if(action==='connect'&&req.method==='POST'){if(!supplied)throw error(400,'Cole a chave completa da Higgsfield.');const check=await fetch(HF+'/files/generate-upload-url',{method:'POST',headers:{Authorization:'Key '+key,'Content-Type':'application/json'},body:JSON.stringify({content_type:'image/png'}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!check.ok){if(check.status===401||check.status===403)throw error(401,'Chave incorreta ou revogada — a Higgsfield não aceitou esse código.');if(check.status===429)throw error(429,'Muitas tentativas. Aguarde um pouco e tente novamente.');throw error(502,'Não foi possível validar a conexão com a Higgsfield.');}if(body.save){const ciphertext=encryptCredential(supplied,user.id);await db('/rest/v1/frame_credentials?on_conflict=owner_id',token,{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({owner_id:user.id,ciphertext,updated_at:new Date().toISOString()})});}return res.status(200).json({configured:true,model:MODEL,firstFrameReady:true,testOnly:false,connectionMode:body.save?'saved':'session',saved:!!body.save});}
if(['edit-frame','estimate-frame'].includes(action)&&req.method==='POST'){
 await verifyLease(body,user,token);
 const model=await ownedRecord(body.modelId,'model',user,token),frame=await ownedRecord(body.frameMediaId,'media',user,token);
 if(!['image/png','image/jpeg','image/webp'].includes(frame.type))throw error(400,'Primeiro quadro inválido.');
 const prompt=promptText(body.editPrompt,'o prompt de edição do quadro',true).replaceAll('{{identity}}',String(model.identity||'')).replaceAll('{{target}}',String(body.target||'the main person').slice(0,200));
 if(prompt.length>20000)throw error(400,'Reduza o prompt de edição e as características.');
 const ratio=['1:1','2:3','3:2','3:4','4:3','7:9','9:7','9:16','16:9','21:9'].includes(body.ratio)?body.ratio:'9:16';
 const input={prompt,image_urls:[await signedMedia(frame.path,user,token),await signedMedia(model.photoPath,user,token)],resolution:'1k',aspect_ratio:ratio,prompt_extend:false,enable_thinking:false};
 if(action==='estimate-frame')return res.status(200).json(await estimatePrice(input,'alibaba/qwen-image-3/edit',key));
 return res.status(202).json(await enqueue(input,'alibaba/qwen-image-3/edit',body.attemptId,key,user));
}
if(['submit','estimate'].includes(action)&&req.method==='POST'){
 await verifyLease(body,user,token);
 if(!['direct','frame','multi'].includes(body.mode))throw error(422,'Escolha um fluxo válido.');
 const duration=Number(body.duration),resolution=body.resolution,ratio=body.ratio;
 if(!Number.isInteger(duration)||duration<2||duration>15||!['480p','720p','1080p'].includes(resolution)||!['16:9','4:3','1:1','3:4','9:16','adaptive'].includes(ratio))throw error(400,'Use de 2 a 15 segundos e parâmetros válidos neste teste.');
 const media=await ownedRecord(body.mediaId,'media',user,token);if(media.type!=='video/mp4'||!Number.isFinite(media.duration)||media.duration<1||media.duration>15)throw error(400,'Use um MP4 de 1 a 15 segundos.');
 let imageUrls=[],prompt;const base=promptText(body.basePrompt,'o prompt base');
 if(body.mode==='multi'){
  if(!Array.isArray(body.cast)||body.cast.length<2||body.cast.length>4)throw error(400,'Associe de 2 a 4 pessoas às modelos.');
  const targets=new Set(),mapping=[];
  for(const [i,person] of body.cast.entries()){
   const target=promptText(person.target,'a posição de cada pessoa',true);if(target.length>200||targets.has(target.toLowerCase()))throw error(400,'Identifique cada pessoa de forma distinta, com até 200 caracteres.');targets.add(target.toLowerCase());
   const model=await ownedRecord(person.modelId,'model',user,token);imageUrls.push(await signedMedia(model.photoPath,user,token));mapping.push(`Person ${i+1}: ${target}. Replacement identity is @img${i+1}: ${String(model.identity||'')}`);
  }
  if(/\{\{identity\}\}|\{\{target\}\}/.test(base))throw error(400,'Neste fluxo, use um prompt base sem variáveis de uma única pessoa. As identidades vêm das associações.');
  prompt=[base,promptText(body.multiPrompt,'o prompt de múltiplas pessoas',true),'CAST MAPPING — mandatory priority over conflicting single-person instructions. Apply each identity ONLY to its matched person. Never blend or exchange identities. Unlisted people remain unchanged.',...mapping].filter(Boolean).join('\n\n');
 }else{
  const model=await ownedRecord(body.modelId,'model',user,token),identity=String(model.identity||''),target=String(body.target||'the main person').slice(0,200);
  const flowPrompt=promptText(body.mode==='frame'?body.framePrompt:body.directPrompt,'o prompt do fluxo',true);
  prompt=[...new Set([base,flowPrompt].filter(Boolean))].join('\n\n').replaceAll('{{identity}}',identity).replaceAll('{{target}}',target);
  if(body.mode==='frame'){
   prompt+='\n\nFRAME REFERENCE PRIORITY: @img1 is an edited scene frame, not an identity sheet. Use its person identity and appearance as the visual reference; @vid1 defines motion, timing, clothing and scene. An edited frame IS supplied. This overrides any conflicting description of @img1 or absence of an edited frame above. Preserve the mapped identity throughout the video. Exact opening-frame reproduction is not required.';
   if(body.frameJob){const result=await requestStatus(body.frameJob,key,user);if(result.status!=='completed'||!outputImage(result))throw error(409,'Aguarde a conclusão da edição do primeiro quadro.');imageUrls=[outputImage(result)];}
   else {const frame=await ownedRecord(body.frameMediaId,'media',user,token);if(!['image/png','image/jpeg','image/webp'].includes(frame.type))throw error(400,'Envie o primeiro quadro editado.');imageUrls=[await signedMedia(frame.path,user,token)];}
  }else imageUrls=[await signedMedia(model.photoPath,user,token)];
 }
 if(prompt.length>20000)throw error(400,'A soma dos prompts e características ultrapassa 20.000 caracteres.');
 let audioUrl=null;if(typeof media.audioPath==='string'&&action!=='estimate'){audioUrl=await referenceAudio(media,user,token,key);prompt+='\n\nAUDIO: Audio 1 is the original recorded speech of the target person in @vid1. Use Audio 1 as the spoken voice and dialogue, word for word, with the same timing, rhythm, pauses and lip synchronization. Do not invent, change, translate or add speech, and do not generate different words.';}
 const input={prompt,image_urls:imageUrls,video_urls:[await signedMedia(media.path,user,token)],duration,resolution,aspect_ratio:ratio,generate_audio:!!body.generateAudio,enable_thinking:false};if(audioUrl)input.audio_urls=[audioUrl];
 if(action==='estimate')return res.status(200).json(await estimatePrice(input,MODEL,key));
 return res.status(202).json(await enqueue(input,MODEL,body.attemptId,key,user));
}
if(action==='archive'&&req.method==='POST'){
 const result=await requestStatus(body,key,user);if(result.status!=='completed'||typeof result.video?.url!=='string'||!result.video.url.startsWith('https://'))throw error(409,'O vídeo ainda não está pronto para baixar.');
 const path=user.id+'/generated/'+body.requestId+'.mp4',objectPath=path.split('/').map(encodeURIComponent).join('/');
 let existingUrl=null,audioReplaced=false;try{existingUrl=await signedMedia(path,user,token);}catch{}
 if(!existingUrl){
  const video=await fetch(result.video.url,{signal:AbortSignal.timeout(20000)});if(!video.ok)throw error(502,'Não foi possível obter o vídeo gerado.');
  if(Number(video.headers.get('content-length')||0)>50*1048576)throw error(413,'O vídeo ultrapassa 50 MB. Abra o resultado original para baixar.');
  let bytes=Buffer.from(await video.arrayBuffer());if(bytes.length>50*1048576)throw error(413,'Vídeo maior que 50 MB.');
  if(body.mediaId){try{const media=await ownedRecord(body.mediaId,'media',user,token);const src=await fetch(await signedMedia(media.path,user,token),{redirect:'error',signal:AbortSignal.timeout(15000)});if(src.ok){const mixed=await originalAudio(bytes,Buffer.from(await src.arrayBuffer()));if(mixed){bytes=mixed;audioReplaced=true;}}}catch(e){console.warn('Áudio original não aplicado:',e.message);}}
  const saved=await fetch(SUPABASE+'/storage/v1/object/frame-private/'+objectPath,{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:token,'Content-Type':'video/mp4','x-upsert':'false'},body:new Blob([bytes]).stream(),duplex:'half',signal:AbortSignal.timeout(30000)});
  if(!saved.ok&&saved.status!==409)throw error(502,'O vídeo foi gerado, mas não foi possível guardar a cópia privada. Use Abrir original.');
 }
 const videoUrl=existingUrl||await signedMedia(path,user,token),downloadUrl=new URL(videoUrl);downloadUrl.searchParams.set('download','frame-studio-'+body.requestId.slice(0,8)+'.mp4');
 return res.status(200).json({videoPath:path,videoUrl,downloadUrl:downloadUrl.href,audioReplaced});
}
if(action==='status'&&req.method==='POST'){
 const result=await requestStatus(body,key,user),videoUrl=typeof result.video?.url==='string'&&result.video.url.startsWith('https://')?result.video.url:null;
 return res.status(200).json({requestId:body.requestId,status:result.status,videoUrl,imageUrl:outputImage(result),expiresAt:result.expires_at||null,error:['failed','nsfw','canceled'].includes(result.status)?'A geração não foi concluída. Consulte Requests na Higgsfield.':null});
}throw error(405,'Operação não disponível.');}catch(e){const status=e.status||500;return res.status(status).json({error:status===500?'Falha de comunicação. Tente consultar o teste antes de reenviar.':e.message})}}
