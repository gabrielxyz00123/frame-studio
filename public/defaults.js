const defaultFramePrompt='Use @vid1 for motion, timing, clothing, camera and scene. @img1 is the edited scene frame showing the replacement identity. IDENTITY: {{identity}}. Replace only {{target}}. Keep that identity consistent through turns and occlusions. Preserve all other people, wardrobe, objects, background, lighting and dialogue timing. Natural skin, no tattoos. Remove visible text naturally. Output one continuous photorealistic video.';
const defaultMultiPrompt='Use @vid1 for motion, timing, expressions, clothing, camera and scene. Replace ONLY the people specified in CAST MAPPING with their assigned image identities. Keep each face, hair and skin consistent through motion and occlusions. Never blend or exchange identities. Preserve the source wardrobe for each person, all unlisted people, objects, background and dialogue timing. Remove visible text naturally. No new tattoos. Output one continuous photorealistic video.';
const defaultImagePrompt='Image 1 is the source scene frame. Image 2 is the multi-angle identity sheet of ONE replacement person. Replace ONLY {{target}} in Image 1 with the identity from Image 2. IDENTITY: {{identity}}. Preserve pose, expression, framing, clothing from Image 1, background, lighting, objects and every non-target person. Image 2 supplies only face, hair and skin; do not copy its outfit or sheet layout. Natural skin texture, no tattoos. Remove text and reconstruct surfaces naturally. Output one photorealistic scene frame, not a collage.';
window.addEventListener('load',function(){['more.js','shared.js'].forEach(function(f){var s=document.createElement('script');s.src=f;document.body.append(s);});});
/* Editar nome e prompt (características) de uma modelo já cadastrada. */
(function(){
 let dlg=null;
 function build(){
  const st=document.createElement('style');
  st.textContent='#fs-edit-model{border:1px solid #2a2f38;border-radius:14px;background:#14171c;color:#eceff4;padding:0;width:min(560px,94vw)}#fs-edit-model::backdrop{background:rgba(0,0,0,.6)}#fs-edit-model form{display:flex;flex-direction:column;gap:8px;padding:18px}#fs-edit-model h2{margin:0 0 4px;font-size:18px}#fs-edit-model label{font-size:13px;color:#aab2c0}#fs-edit-model input,#fs-edit-model textarea{width:100%;box-sizing:border-box;background:#0d0f13;color:#eceff4;border:1px solid #2a2f38;border-radius:8px;padding:10px;font:inherit}#fs-edit-model textarea{resize:vertical}#fs-edit-model .fa-row{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}';
  document.head.append(st);
  dlg=document.createElement('dialog');dlg.id='fs-edit-model';
  const f=document.createElement('form');
  const h=document.createElement('h2');h.textContent='Editar modelo';
  const l1=document.createElement('label');l1.textContent='Nome da modelo';l1.htmlFor='fs-em-name';
  const n=document.createElement('input');n.id='fs-em-name';n.maxLength=70;n.required=true;
  const l2=document.createElement('label');l2.textContent='Prompt da modelo · características';l2.htmlFor='fs-em-identity';
  const t=document.createElement('textarea');t.id='fs-em-identity';t.rows=8;t.maxLength=10000;t.required=true;
  const p=document.createElement('p');p.style.cssText='margin:0;font-size:12px;color:#8a93a3';p.textContent='A foto não muda. Lotes já criados continuam com o nome antigo.';
  const row=document.createElement('div');row.className='fa-row';
  const c=document.createElement('button');c.type='button';c.textContent='Cancelar';c.className='secondary';c.onclick=()=>dlg.close();
  const s=document.createElement('button');s.type='submit';s.textContent='Salvar alterações';s.className='primary';s.id='fs-em-save';
  row.append(c,s);f.append(h,l1,n,l2,t,p,row);dlg.append(f);document.body.append(dlg);
  f.onsubmit=async e=>{
   e.preventDefault();
   const m=dlg._model,name=n.value.trim(),identity=t.value.trim();
   if(!name||!identity)return toast('Preencha nome e prompt.');
   s.disabled=true;
   try{
    const cur=await studioClient.from('frame_library').select('data').eq('id',m.id).single();
    if(cur.error||!cur.data)throw Error('Modelo não encontrada.');
    const data={...cur.data.data,name,identity};
    const up=await studioClient.from('frame_library').update({data}).eq('id',m.id).select('id');
    if(up.error||!up.data||!up.data.length)throw Error('Não foi possível salvar a alteração.');
    await load();dlg.close();toast('Modelo atualizada.');
   }catch(err){toast(err.message||'Falha ao salvar.');}
   finally{s.disabled=false;}
  };
 }
 function openEdit(m){
  if(!dlg)build();
  dlg._model=m;
  document.getElementById('fs-em-name').value=m.name||'';
  document.getElementById('fs-em-identity').value=m.identity||'';
  dlg.showModal();
 }
 function decorate(){
  const cards=document.querySelectorAll('#models-grid .model-card');
  cards.forEach((c,i)=>{
   const m=models[i];
   if(!m||c.querySelector('.fs-edit-model'))return;
   const b=document.createElement('button');
   b.type='button';b.className='secondary fs-edit-model';b.textContent='Editar';b.style.marginLeft='8px';
   b.onclick=()=>openEdit(m);
   (c.lastElementChild||c).append(b);
  });
 }
 window.addEventListener('studio-models-update',decorate);
})();
