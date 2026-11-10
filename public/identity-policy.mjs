// Shared by the browser, authenticated API and background worker.
export const REVIEW_VERSION=2;
function invalid(message){throw Object.assign(new Error(message),{status:409});}
export function validateCast(cast){
 if(!Array.isArray(cast)||!cast.length||cast.length>4)invalid('Associe de 1 a 4 pessoas. Pessoas não listadas devem permanecer originais.');
 const models=new Set(),targets=new Set();
 for(const p of cast){const t=String(p.target||'').trim().toLowerCase();
  if(!p.modelId||!t||t.length>200)invalid('Escolha uma modelo e identifique a posição de cada pessoa.');
  if(models.has(p.modelId))invalid('A mesma modelo está associada a duas pessoas. Use identidades distintas; para preservar alguém, não o inclua nas substituições.');
  if(targets.has(t))invalid('Identifique cada pessoa em uma posição distinta.');
  models.add(p.modelId);targets.add(t);
 }
}
export function validatePhotos(models){const paths=models.map(m=>m.photoPath);if(new Set(paths).size!==paths.length)invalid('Duas pessoas usam a mesma foto de identidade. Corrija as referências antes de gerar.');}
export function reviewKey(b,s){
 const mode=s.mode||b.mode;
 const outfit=s.outfit||b.outfit;
 return JSON.stringify([REVIEW_VERSION,mode,s.mediaId||'',s.originalFrameId||'',s.frameMediaId||'',s.frameJob?.requestId||'',s.modelId||b.modelId||'',s.target??b.target??'',mode==='multi'?castKey(s.cast||b.cast):[],b.editPrompt||'',outfit?[outfit.mediaId||'',outfit.text||'',outfit.prompt||'']:null]);
}
export function castKey(cast){return (cast||[]).map(p=>[p.modelId,String(p.target||'').trim()]);}
export function assertReviewed(b,s){
 const mode=s.mode||b.mode;if(mode!=='frame'&&mode!=='multi')return;
 if(mode==='multi')validateCast(s.cast||b.cast);
 if(!s.frameMediaId&&!(s.frameJob?.requestId&&s.frameJob.status==='completed'))invalid('Revise e aprove o quadro editado de cada vídeo na Fila antes de gerar. Nenhum vídeo novo foi enviado.');
 if(s.identityReview?.version!==REVIEW_VERSION||s.identityReview.key!==reviewKey(b,s))invalid('Revisão de identidade ausente ou desatualizada. Confira o quadro, a modelo e cada pessoa na Fila antes de enviar.');
}
export function frameIdentityRule(target){return `MANDATORY TARGET ISOLATION: Replace ONLY ${target||'the explicitly selected person'}. All other people keep their original identities. Image 2 supplies the replacement identity only. A back-facing or occluded target is still the target: transfer visible hair, skin and identity features without turning the head or inventing a visible face. Do not keep the original identity merely because the face is hidden. Preserve the original pose and wardrobe. Never copy the replacement to another person.`;}
export function videoIdentityRule(target){return `MANDATORY IDENTITY ASSIGNMENT: @img1 is the reviewed edited scene, NOT the sole identity reference. @img2 is the replacement identity photo. Replace ONLY ${target||'the selected person'} with @img2 throughout @vid1. When the target starts back-facing or occluded, keep that pose and use @img2 for the face when it becomes visible. Never recover the original target identity from @vid1. Preserve every other person's original face, hair and skin; never duplicate this identity onto them. @vid1 supplies motion, timing, pose, camera and scene, not the replacement identity.`;}
export function multiIdentityRule(){return 'MANDATORY ONE-TO-ONE CAST MAPPING: Each replacement image belongs ONLY to its explicitly matched source person. No identity may be copied to another person. Every unlisted person keeps the ORIGINAL identity from @vid1 / the source scene. The edited scene is a layout reference; the individual identity images determine each assigned face, including after back views, turns and occlusion. Preserve the number of people and never clone, blend or exchange faces. These identity assignments override conflicting generic or single-person prompts.';}
