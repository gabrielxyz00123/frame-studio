window.savedPromptDefaults = { direct: '', frame: '', base: '', multi: '', image: '' };
window.promptDrafts = new Set();
let promptOwner = null, promptLoadId = 0;
const promptFields = { direct: 'direct_prompt', frame: 'frame_prompt', base: 'base_prompt', multi: 'multi_prompt', image: 'image_prompt' };
const draftFields = { direct: 'prompt-direct', frame: 'prompt-frame', base: 'prompt-base', multi: 'prompt-multi', image: 'frame-edit-prompt' };
const fallbackPrompt = key => ({ frame: defaultFramePrompt, multi: defaultMultiPrompt, image: defaultImagePrompt }[key] || '');
for (const [key, id] of Object.entries(draftFields)) {
  document.getElementById(id).addEventListener('input', () => window.promptDrafts.add(key));
  document.getElementById('edit-' + key).addEventListener('input', () => window.promptDrafts.add('settings:' + key));
}
function showPromptDefaults() {
  for (const key of Object.keys(promptFields)) {
    if (!window.promptDrafts.has('settings:' + key)) document.getElementById('edit-' + key).value = window.savedPromptDefaults[key] || fallbackPrompt(key);
  }
}
async function loadPromptDefaults() {
  const requestId = ++promptLoadId;
  try {
    const { data: { user } } = await studioClient.auth.getUser();
    if (!user || promptOwner === user.id || requestId !== promptLoadId) return;
    const result = await studioClient.from('frame_prompt_settings').select(Object.values(promptFields).join(',')).eq('owner_id', user.id).maybeSingle();
    if (result.error) throw result.error;
    const { data: { user: current } } = await studioClient.auth.getUser();
    if (requestId !== promptLoadId || current?.id !== user.id) return;
    for (const [key, column] of Object.entries(promptFields)) window.savedPromptDefaults[key] = result.data?.[column] || '';
    promptOwner = user.id;
    showPromptDefaults();
    for (const [key, id] of Object.entries(draftFields)) {
      if (!window.promptDrafts.has(key)) document.getElementById(id).value = window.savedPromptDefaults[key] || fallbackPrompt(key);
    }
    window.dispatchEvent(new Event('studio-test-update'));
    document.getElementById('prompt-save-status').textContent = 'Prompts carregados. Suas edições em andamento foram preservadas.';
  } catch {
    if (requestId === promptLoadId) document.getElementById('prompt-save-status').textContent = 'Não foi possível carregar os prompts. Confira a conexão.';
  }
}
document.getElementById('prompt-settings-form').onsubmit = async event => {
  event.preventDefault();
  const button = document.getElementById('save-prompts'), status = document.getElementById('prompt-save-status');
  button.disabled = true;
  try {
    const { data: { user } } = await studioClient.auth.getUser();
    if (!user) throw Error('Entre na sua conta.');
    const values = {}, data = { owner_id: user.id, updated_at: new Date().toISOString() };
    for (const [key, column] of Object.entries(promptFields)) {
      const value = document.getElementById('edit-' + key).value.trim();
      if (value.length > 20000) throw Error('Use até 20.000 caracteres por prompt.');
      values[key] = value; data[column] = value;
    }
    const result = await studioClient.from('frame_prompt_settings').upsert(data, { onConflict: 'owner_id' });
    if (result.error) throw result.error;
    const { data: { user: current } } = await studioClient.auth.getUser();
    if (current?.id !== user.id) return;
    window.savedPromptDefaults = values; promptOwner = user.id;
    status.textContent = 'Prompts salvos. Use no lote atual para aplicar as alterações.';
  } catch (error) { status.textContent = error.message || 'Não foi possível salvar.'; }
  finally { button.disabled = false; }
};
document.getElementById('apply-saved-prompts').onclick = () => {
  applyPrompt(); document.getElementById('prompt-save-status').textContent = 'Prompts salvos aplicados ao lote atual.';
};
window.addEventListener('studio-authenticated', loadPromptDefaults);
window.addEventListener('studio-signed-out', () => {
  promptLoadId++; promptOwner = null; window.promptDrafts.clear();
  for (const key of Object.keys(promptFields)) { window.savedPromptDefaults[key] = ''; document.getElementById('edit-' + key).value = ''; }
  document.getElementById('prompt-save-status').textContent = '';
});
studioClient.auth.getSession().then(({ data }) => { if (data.session) loadPromptDefaults(); });

const promptLinks=[['edit-direct','prompt-direct'],['edit-frame','prompt-frame'],['edit-base','prompt-base'],['edit-multi','prompt-multi'],['edit-image','frame-edit-prompt']];
promptLinks.forEach(([a,b])=>{const x=document.getElementById(a),y=document.getElementById(b);if(!x||!y)return;x.addEventListener('input',()=>{y.value=x.value;window.promptDrafts.add(a.replace('edit-',''));window.dispatchEvent(new Event('studio-test-update'));});y.addEventListener('input',()=>{x.value=y.value;});});
const advSave=document.getElementById('save-prompt-advanced');if(advSave)advSave.onclick=async()=>{const s=document.getElementById('adv-save-status');s.textContent='Salvando…';document.getElementById('prompt-settings-form').requestSubmit();setTimeout(()=>{s.textContent=document.getElementById('prompt-save-status').textContent;},1200);};
(function(){function tick(){const cur=window.genProgress&&window.genProgress.current();if(cur===null||cur===undefined){document.querySelectorAll('#batch-list .job-bars').forEach(n=>n.remove());return}const card=[...document.querySelectorAll('#batch-list .batch-card')].find(c=>[...c.querySelectorAll('button')].some(b=>/Paus/.test(b.textContent)));if(!card)return;const m=card.textContent.match(/de (\d+) conclu/);if(!m)return;const total=+m[1];let box=card.querySelector('.job-bars');if(!box){box=document.createElement('div');box.className='job-bars';for(let i=0;i<total;i++){const r=document.createElement('div');r.className='job-bar';r.innerHTML='<span>Vídeo '+(i+1)+'</span><b></b><div><i></i></div>';box.append(r)}const pause=[...card.children].find(c=>[...c.querySelectorAll('button')].some(b=>/Paus/.test(b.textContent)));card.insertBefore(box,pause||null)}const units=cur/100*total;[...box.children].forEach((r,i)=>{const p=Math.round(Math.max(0,Math.min(1,units-i))*100);r.querySelector('b').textContent=p+'%';r.querySelector('i').style.width=p+'%'})}setInterval(tick,500)})();
(function(){const f=window.fetch;function show(){if(document.getElementById('credit-alert'))return;const b=document.createElement('div');b.id='credit-alert';b.setAttribute('role','alert');b.innerHTML='<strong>⚠ Saldo da Higgsfield esgotado.</strong><span>Os vídeos não podem ser gerados. Adicione créditos na Higgsfield e retome o lote em Meus lotes.</span><button type="button" aria-label="Fechar">×</button>';b.querySelector('button').onclick=()=>b.remove();document.body.append(b)}window.fetch=async function(){const r=await f.apply(this,arguments);try{if(r.status===402)show()}catch{}return r}})();