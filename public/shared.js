/* Vídeos compartilhados: biblioteca pública. Todos adicionam e cada um usa com a própria modelo. */
(function(){
 'use strict';
 var BUCKET='frame-private',MAX=500*1048576;
 function q(s){return document.querySelector(s);}
 function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
 function say(m){try{toast(m);}catch(e){}}
 var rows=[],me=null,busy=false,picked=new Set(),ready=false;
 var SQL_MSG='A biblioteca compartilhada ainda não foi ativada no banco. Rode o SQL de ativação no Supabase.';
 function setup(){
  var nav=q('nav button[data-view="videos"]'),after=q('#videos');
  if(!nav||!after||q('#shared'))return;
  var b=mk('button');b.type='button';b.dataset.view='shared';b.append(document.createTextNode('👥 '),mk('span','Vídeos compartilhados'));
  nav.after(b);b.onclick=function(){window.view('shared');};
  var s=document.createElement('section');s.id='shared';s.className='view';s.hidden=true;
  var h=mk('div',null,'heading');
  h.append(mk('div','BIBLIOTECA PÚBLICA','eyebrow'),mk('h1','Vídeos compartilhados.'),mk('p','Vídeos que qualquer pessoa do estúdio adicionou. Selecione e use no seu estúdio com a sua modelo.'));
  var bar=mk('div',null,'lib-bar');
  var file=mk('input');file.type='file';file.accept='video/*';file.multiple=true;file.id='sh-file';file.hidden=true;
  var add=mk('button','Adicionar vídeos','primary');add.type='button';add.id='sh-add';
  var use=mk('button','Usar selecionados no estúdio','secondary');use.type='button';use.id='sh-use';use.disabled=true;
  var st=mk('span',null,'muted');st.id='sh-status';
  bar.append(file,add,use,st);
  var grid=mk('div',null,'lib-grid');grid.id='sh-grid';
  s.append(h,bar,grid);after.after(s);
  add.onclick=function(){if(!busy)file.click();};
  file.onchange=function(){var l=[].slice.call(file.files);file.value='';if(l.length)uploadMany(l);};
  use.onclick=useSelected;
 }
 function status(t){var e=q('#sh-status');if(e)e.textContent=t||'';}
 function syncUse(){var u=q('#sh-use');if(u){u.disabled=busy||!picked.size;u.textContent=picked.size?'Usar '+picked.size+' no estúdio':'Usar selecionados no estúdio';}}
 async function user(){
  if(me)return me;
  var r=await studioClient.auth.getUser();
  if(r.error||!r.data||!r.data.user)throw Error('Entre novamente.');
  me=r.data.user;return me;
 }
 function metaOf(f){
  return new Promise(function(res){
   var v=document.createElement('video'),u=URL.createObjectURL(f),t=setTimeout(done,15000);
   function done(){clearTimeout(t);URL.revokeObjectURL(u);v.removeAttribute('src');var d=Number.isFinite(v.duration)?v.duration:null;res(d);}
   v.preload='metadata';v.onloadedmetadata=done;v.onerror=function(){clearTimeout(t);URL.revokeObjectURL(u);res(null);};v.src=u;
  });
 }
 async function uploadOne(f,u){
  var id=crypto.randomUUID(),path=u.id+'/shared/'+id;
  var dur=await metaOf(f);
  var up=await studioClient.storage.from(BUCKET).upload(path,f,{contentType:f.type,upsert:false});
  if(up.error)throw up.error;
  var ins=await studioClient.from('frame_shared').insert({id:id,owner_id:u.id,owner_email:u.email,name:f.name.slice(0,120),path:path,size:f.size,type:f.type,duration:dur});
  if(ins.error){try{await studioClient.storage.from(BUCKET).remove([path]);}catch(e){}throw ins.error;}
 }
 async function uploadMany(list){
  if(busy)return;
  busy=true;syncUse();
  var ok=0,fail=[];
  try{
   var u=await user();
   for(var i=0;i<list.length;i++){
    var f=list[i];
    if(!f.type.startsWith('video/')){fail.push(f.name+': não é vídeo');continue;}
    if(f.size>MAX){fail.push(f.name+': passa de 500 MB');continue;}
    status('Enviando '+(i+1)+' de '+list.length+': '+f.name+'…');
    try{await uploadOne(f,u);ok++;}catch(e){fail.push(f.name+': '+explain(e));if(/ainda não foi ativada|SQL/.test(explain(e)))break;}
   }
  }catch(e){fail.push(explain(e));}
  status('');
  say(ok+' vídeo(s) adicionado(s)'+(fail.length?'. Falhou: '+fail.join(' | '):'.'));
  busy=false;await refresh();syncUse();
 }
 function explain(e){
  var m=(e&&e.message)||'Falha ao enviar.';
  if(/frame_shared|relation|schema cache/i.test(m))return SQL_MSG;
  if(/row-level security|policy/i.test(m))return 'Sem permissão. Rode o SQL de ativação da biblioteca compartilhada.';
  if(/exceeded|too large|size/i.test(m))return 'O arquivo passou do limite de tamanho do armazenamento.';
  return m;
 }
 async function refresh(){
  var grid=q('#sh-grid');if(!grid)return;
  status('Carregando…');
  try{
   await user();
   var r=await studioClient.from('frame_shared').select('*').eq('deleted',false).order('created_at',{ascending:false}).limit(300);
   if(r.error)throw r.error;
   rows=r.data||[];status('');
  }catch(e){rows=[];status(explain(e));}
  paint();
 }
 function who(r){return r.owner_id===(me&&me.id)?'você':String(r.owner_email||'colega').split('@')[0];}
 function paint(){
  var grid=q('#sh-grid');if(!grid)return;
  grid.replaceChildren();
  picked.forEach(function(id){if(!rows.some(function(r){return r.id===id;}))picked.delete(id);});
  if(!rows.length)grid.append(mk('div','Nenhum vídeo compartilhado ainda. Use "Adicionar vídeo" para começar.','empty'));
  rows.forEach(function(r){
   var c=mk('div',null,'lib-card'),box=mk('div',null,'lib-media');
   var v=mk('video');v.controls=true;v.preload='none';v.playsInline=true;
   var play=mk('button','▶ Ver','secondary lib-play');play.type='button';
   play.onclick=async function(){
    play.disabled=true;
    try{var s=await studioClient.storage.from(BUCKET).createSignedUrl(r.path,3600);if(s.error)throw s.error;v.src=s.data.signedUrl;play.hidden=true;v.play().catch(function(){});}
    catch(e){play.disabled=false;say(explain(e));}
   };
   box.append(v,play);
   var info=mk('div',null,'lib-info');
   var when=r.created_at?new Date(r.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
   info.append(mk('strong',r.name||'Vídeo'),mk('span','Enviado por '+who(r)),mk('span',(r.duration?Math.round(r.duration*10)/10+' s · ':'')+((r.size||0)/1048576).toFixed(1)+' MB · '+when,'muted'));
   var pick=mk('label',null,'lib-pick'),cb=mk('input');cb.type='checkbox';cb.checked=picked.has(r.id);
   cb.onchange=function(){if(cb.checked)picked.add(r.id);else picked.delete(r.id);syncUse();};
   pick.append(cb,document.createTextNode(' Selecionar'));
   c.append(box,pick,info);
   if(me&&r.owner_id===me.id){
    var del=mk('button','Remover da biblioteca','secondary');del.type='button';
    del.onclick=function(){remove(r,del);};
    c.append(del);
   }
   grid.append(c);
  });
  syncUse();
 }
 async function remove(r,btn){
  if(typeof askConfirm==='function'&&!await askConfirm('Remover "'+(r.name||'vídeo')+'" da biblioteca compartilhada? Os colegas deixam de ver este vídeo.','Remover'))return;
  btn.disabled=true;
  try{
   var u=await studioClient.from('frame_shared').update({deleted:true}).eq('id',r.id).select('id');
   if(u.error||!u.data||!u.data.length)throw u.error||Error('Não foi possível remover.');
   try{await studioClient.storage.from(BUCKET).remove([r.path]);}catch(e){}
   say('Vídeo removido.');await refresh();
  }catch(e){btn.disabled=false;say(explain(e));}
 }
 async function useSelected(){
  if(busy||!picked.size)return;
  var list=rows.filter(function(r){return picked.has(r.id);});
  busy=true;syncUse();
  try{
   var out=[];
   for(var i=0;i<list.length;i++){
    var r=list[i];status('Baixando '+(i+1)+' de '+list.length+'…');
    var d=await studioClient.storage.from(BUCKET).download(r.path);
    if(d.error)throw d.error;
    var name=/\.(mp4|mov|webm)$/i.test(r.name||'')?r.name:(r.name||'video')+'.mp4';
    out.push(new File([d.data],name,{type:r.type||'video/mp4',lastModified:Date.parse(r.created_at)||1}));
   }
   if(typeof addFiles!=='function')throw Error('Estúdio indisponível. Recarregue a página.');
   addFiles(out);picked.clear();status('');paint();window.view('studio');
   say(out.length+' vídeo(s) adicionado(s) ao estúdio. Escolha a sua modelo e gere.');
  }catch(e){status('');say(explain(e));}
  finally{busy=false;syncUse();}
 }
 function init(){
  if(ready)return;ready=true;setup();
  var orig=window.view;
  window.view=function(id){orig(id);if(id==='shared'){var c=q('#crumb');if(c)c.textContent='Vídeos compartilhados';refresh();}};
  window.addEventListener('studio-signed-out',function(){me=null;rows=[];picked.clear();paint();});
  window.addEventListener('studio-authenticated',function(){me=null;setTimeout(function(){if(location.hash==='#shared')window.view('shared');},700);});
 }
 if(document.readyState==='complete')init();else window.addEventListener('load',init);
})();