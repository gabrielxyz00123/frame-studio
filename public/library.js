(function(){
  'use strict';
  var BUCKET='frame-private';
  function q(s){return document.querySelector(s);}
  function mk(tag,text,cls){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}

  /* ---------- Tema claro / escuro ---------- */
  function paintTheme(){
    var t=document.documentElement.dataset.theme==='light'?'light':'dark';
    var b=q('#theme-toggle');if(b)b.textContent=t==='light'?'☾ Escuro':'☀ Claro';
  }
  document.addEventListener('DOMContentLoaded',function(){
    var b=q('#theme-toggle');
    if(b)b.onclick=function(){
      var t=document.documentElement.dataset.theme==='light'?'dark':'light';
      document.documentElement.dataset.theme=t;
      try{localStorage.setItem('fs-theme',t);}catch(e){}
      paintTheme();
    };
    paintTheme();
  });

  /* ---------- Biblioteca de vídeos gerados (isolada) ---------- */
  function items(){
    var out=[];
    (typeof batches!=='undefined'?batches:[]).forEach(function(b){
      if(b.deleted||!b.jobs)return;
      b.jobs.forEach(function(j,i){
        if(j.status!=='completed'||!(j.videoPath||j.videoUrl))return;
        out.push({b:b,j:j,i:i,t:Date.parse(b.created||b.createdAt||'')||0});
      });
    });
    out.sort(function(x,y){return y.t-x.t||y.i-x.i;});
    return out;
  }
  function modelName(b){
    var m=(typeof models!=='undefined'?models:[]).find(function(m){return m.id===b.modelId;});
    if(m)return m.name;
    if(b.cast&&b.cast.length)return 'Múltiplas pessoas';
    return 'Modelo removida';
  }
  async function signed(path,secs,name){
    try{var s=await studioClient.auth.getSession();var tk=s&&s.data&&s.data.session&&s.data.session.access_token;if(tk){var sr=await fetch('/api/storage?action=get',{method:'POST',headers:{Authorization:'Bearer '+tk,'Content-Type':'application/json'},body:JSON.stringify({path:path,secs:secs,download:name||undefined})});if(sr.ok){var sj=await sr.json();if(sj&&sj.url)return sj.url;}}}catch(e){}
    var o=name?{download:name}:undefined;
    var r=await studioClient.storage.from(BUCKET).createSignedUrl(path,secs,o);
    if(r.error)throw r.error;return r.data.signedUrl;
  }
  function say(m){try{if(typeof toast==='function')toast(m);}catch(e){}}
  var picked=new Set(),curList=[];
  window.__lib={signed:signed,dl:function(it){return downloadItem(it);},key:function(it){return key(it);},modelName:modelName,chosen:function(){return curList.filter(function(it){return picked.has(key(it));});},all:function(){return curList;}};
  function key(it){return it.b.id+':'+it.i;}
  async function downloadItem(it){
    var b=it.b,j=it.j;
    var name='frame-studio-'+modelName(b).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+(it.i+1)+'.mp4';
    var url=j.videoPath?await signed(j.videoPath,300,name):(j.downloadUrl||j.videoUrl);
    var a=mk('a');a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();
  }
  function sync(){
    var n=curList.filter(function(it){return picked.has(key(it));}).length;
    var d=q('#lib-dl-sel'),a=q('#lib-all');
    if(d){d.textContent='Baixar selecionados ('+n+')';d.disabled=!n;}
    if(a){a.checked=!!curList.length&&n===curList.length;}
  }
  function card(it){
    var b=it.b,j=it.j,c=mk('article',null,'lib-card');
    var box=mk('div',null,'lib-media');
    var v=mk('video');v.controls=true;v.preload='none';v.playsInline=true;box.append(v);
    var play=mk('button','▶ Reproduzir','lib-play primary');play.type='button';
    play.onclick=async function(){
      play.disabled=true;
      try{
        v.src=j.videoPath?await signed(j.videoPath,3600):j.videoUrl;
        play.hidden=true;v.play().catch(function(){});
      }catch(e){play.disabled=false;say(e.message||'Não foi possível abrir o vídeo.');}
    };
    box.append(play);
    var src=(b.sources&&b.sources[j.sourceIndex])?b.sources[j.sourceIndex].name:'Vídeo';
    var when=it.t?new Date(it.t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    var info=mk('div',null,'lib-info');
    info.append(mk('strong',modelName(b)),mk('span',src+' · saída '+(it.i+1)),mk('span',when,'muted'));
    var dl=mk('button','Baixar MP4','secondary');dl.type='button';
    dl.onclick=async function(){
      dl.disabled=true;
      try{await downloadItem(it);}catch(e){say(e.message||'Não foi possível baixar.');}
      finally{dl.disabled=false;}
    };
    var pick=mk('label',null,'lib-pick'),cb=mk('input');cb.type='checkbox';cb.checked=picked.has(key(it));
    cb.onchange=function(){if(cb.checked)picked.add(key(it));else picked.delete(key(it));sync();};
    pick.append(cb,document.createTextNode(' Selecionar'));
    c.append(box,pick,info,dl);
    c.__it=it;
    return c;
  }
  var lastSig='';
  function renderLibrary(){
    var grid=q('#lib-grid');if(!grid)return;
    var all=items();
    var badge=q('#videos-badge');if(badge)badge.textContent=all.length;
    var sel=q('#lib-model'),cur=sel.value;
    var used={};all.forEach(function(it){used[it.b.modelId||'']=modelName(it.b);});
    var sig=all.length+'|'+Object.keys(used).join(',')+'|'+cur;
    if(sig===lastSig)return;lastSig=sig;
    sel.replaceChildren(new Option('Todas as modelos',''));
    Object.keys(used).forEach(function(id){sel.add(new Option(used[id],id));});
    sel.value=used.hasOwnProperty(cur)?cur:'';
    var list=sel.value===''&&!cur?all:all.filter(function(it){return !sel.value||(it.b.modelId||'')===sel.value;});
    paint(list,all.length);
  }
  function paint(list,total){
    var grid=q('#lib-grid');
    grid.replaceChildren();
    curList=list;sync();
    q('#lib-count').textContent=list.length+(list.length===1?' vídeo':' vídeos')+(list.length!==total?' de '+total:'');
    if(!list.length){grid.append(mk('div','Nenhum vídeo pronto ainda. Os vídeos concluídos dos seus lotes aparecem aqui.','empty'));return;}
    list.forEach(function(it){grid.append(card(it));});
  }
  document.addEventListener('DOMContentLoaded',function(){
    var bar=q('.lib-bar');
    if(bar&&!q('#lib-all')){
      var l=mk('label',null,'check-label'),all=mk('input');all.type='checkbox';all.id='lib-all';
      l.append(all,document.createTextNode(' Selecionar tudo'));
      all.onchange=function(){curList.forEach(function(it){if(all.checked)picked.add(key(it));else picked.delete(key(it));});paint(curList,items().length);};
      var d=mk('button','Baixar selecionados (0)','secondary');d.type='button';d.id='lib-dl-sel';d.disabled=true;
      d.onclick=async function(){
        var chosen=curList.filter(function(it){return picked.has(key(it));});
        if(!chosen.length)return;
        d.disabled=true;
        try{
          for(var k=0;k<chosen.length;k++){
            d.textContent='Baixando '+(k+1)+' de '+chosen.length+'…';
            await downloadItem(chosen[k]);
            await new Promise(function(r){setTimeout(r,900);});
          }
          say('Downloads iniciados. Se o navegador perguntar, permita vários downloads.');
        }catch(e){say(e.message||'Não foi possível baixar.');}
        finally{sync();}
      };
      bar.append(l,d);
    }
    var sel=q('#lib-model');
    if(sel)sel.onchange=function(){
      var all=items();
      paint(all.filter(function(it){return !sel.value||(it.b.modelId||'')===sel.value;}),all.length);
    };
  });

  /* ---------- Menu: página nova + título ---------- */
  var origView=window.view;
  window.view=function(id){
    origView(id);
    if(id==='videos'){
      q('#crumb').textContent='Vídeos gerados';
      lastSig='';renderLibrary();
    }
  };
  window.addEventListener('studio-authenticated',function(){
    setTimeout(function(){if(location.hash==='#videos')window.view('videos');},600);
  });

  /* ---------- Última modelo usada já selecionada ---------- */
  var applied=false;
  function applyLastModel(){
    if(applied||typeof loaded==='undefined'||!loaded)return;
    applied=true;
    var sel=q('#model');if(!sel||sel.value)return;
    var cand=batches.filter(function(b){return !b.deleted&&b.modelId&&models.some(function(m){return m.id===b.modelId;});});
    var withJobs=cand.filter(function(b){return b.jobs&&b.jobs.length;});
    var pool=withJobs.length?withJobs:cand;
    pool.sort(function(x,y){return (Date.parse(y.created||'')||0)-(Date.parse(x.created||'')||0);});
    if(pool[0]){sel.value=pool[0].modelId;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  }

  /* ---------- Ganchos nas funções do app ---------- */
  var origRB=window.renderBatches;
  window.renderBatches=function(){
    var r=origRB.apply(this,arguments);
    try{renderLibrary();}catch(e){console.warn(e);}
    return r;
  };
  var origRender=window.render;
  window.render=function(){
    var r=origRender.apply(this,arguments);
    try{applyLastModel();renderLibrary();}catch(e){console.warn(e);}
    return r;
  };
  window.addEventListener('studio-signed-out',function(){applied=false;lastSig='';});

  /* ---------- Opções avançadas abrem se faltar prompt ---------- */
  function ensurePrompts(){
    var d=q('#advanced');if(!d||d.open)return;
    var ids=['#prompt-direct','#prompt-frame','#prompt-multi'];
    var needs=false;
    ids.forEach(function(id){var e=q(id);if(e&&!e.closest('[hidden]')&&!e.value.trim())needs=true;});
    if(needs)d.open=true;
  }
  document.addEventListener('click',function(e){
    if(e.target.closest&&e.target.closest('#generate-test,#estimate-account'))ensurePrompts();
  },true);
  document.addEventListener('submit',ensurePrompts,true);

  /* ---------- Manter PC acordado, avisar ao fechar, textos de pausa e aviso de armazenamento ---------- */
  var wake=null;
  function busy(){try{return typeof productionBusy!=='undefined'&&productionBusy;}catch(e){return false;}}
  async function grab(){if(wake||!navigator.wakeLock)return;try{wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',function(){wake=null;});}catch(e){}}
  setInterval(function(){if(busy())grab();else if(wake){try{wake.release();}catch(e){}wake=null;}},2000);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&busy())grab();});
  window.addEventListener('beforeunload',function(e){if(busy()){e.preventDefault();e.returnValue='';}});
  function fixPause(){
    var root=q('#batch-list');if(!root)return;
    root.querySelectorAll('p').forEach(function(p){
      if(p.textContent.trim()==='Pausado')p.textContent='Pausado. Causas possíveis: você pediu a pausa, a conexão com a Higgsfield caiu ou o lote foi aberto em outra aba. Confira Integração e toque em Retomar lote.';
    });
  }
  var pl=q('#batch-list');if(pl)new MutationObserver(fixPause).observe(pl,{childList:true,subtree:true});
  var oldWarn=console.warn;
  console.warn=function(){
    try{
      if(String(arguments[0]).indexOf('R2 indispon')===0){
        var n=Date.now();
        if(!window.__r2warn||n-window.__r2warn>60000){window.__r2warn=n;say('Aviso: o armazenamento principal falhou; este arquivo foi salvo no armazenamento reserva.');}
      }
    }catch(e){}
    return oldWarn.apply(console,arguments);
  };

  /* ---------- Lotes: reenviar falhas, duplicar, gastos e liberar espaço ---------- */
  var FAIL=['failed','nsfw','canceled'],RATE=window.FS_RATES;
  (function(){var st=document.createElement('style');st.textContent='#spend-box{margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:12px;color:var(--c3)}#spend-box b{color:var(--c4)}.lot-extra{flex-wrap:wrap;margin-top:10px}.lot-extra button{font-size:12px}';document.head.append(st);})();
  function usd(n){return 'US$ '+n.toFixed(2).replace('.',',');}
  function batchCost(b){
    var rate=RATE[b.resolution]||.05,t=0;
    (b.jobs||[]).forEach(function(j){
      if(j.status!=='completed')return;
      var s=(b.sources||[])[j.sourceIndex]||{};
      t+=(Math.ceil(Number(s.duration)||0)+(Number(s.out)||Number(b.duration)||0))*rate;
    });
    return t;
  }
  function paintSpend(){
    var host=q('#production-status');if(!host)return;
    var box=q('#spend-box');if(!box){box=mk('div',null);box.id='spend-box';host.before(box);}
    var now=new Date(),month=0,total=0,videos=0;
    (typeof batches!=='undefined'?batches:[]).forEach(function(b){
      var c=batchCost(b);if(!c)return;
      total+=c;(b.jobs||[]).forEach(function(j){if(j.status==='completed')videos++;});
      var d=new Date(b.created||b.createdAt||'');
      if(d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear())month+=c;
    });
    box.replaceChildren();
    box.append(document.createTextNode('Gasto estimado em gerações concluídas: este mês '),mk('b',usd(month)),document.createTextNode(' · total '),mk('b',usd(total)),document.createTextNode(' · '+videos+' vídeos. Pela tabela pública, sem desconto; a cobrança final é da Higgsfield.'));
  }
  async function removeFile(path){
    try{
      var s=await studioClient.auth.getSession();
      await fetch('/api/storage?action=delete',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.data.session.access_token},body:JSON.stringify({path:path})});
    }catch(e){}
    try{await studioClient.storage.from(BUCKET).remove([path]);}catch(e){}
  }
  function mediaIds(b){
    var ids=[];
    (b.sources||[]).forEach(function(s){[s.mediaId,s.frameMediaId,s.originalFrameId].forEach(function(id){if(id&&ids.indexOf(id)<0)ids.push(id);});});
    return ids;
  }
  function extras(b,card){
    if(b.deleted||!b.jobs||!b.jobs.length)return;
    var cost=batchCost(b);
    if(cost>0)card.append(mk('p','Gasto estimado deste lote: '+usd(cost),'muted'));
    var active=typeof activeBatch!=='undefined'&&activeBatch&&activeBatch.id===b.id;
    if(active)return;
    if(b.sourcesCleaned){card.append(mk('p','Arquivos de origem apagados para liberar espaço. Os vídeos gerados continuam guardados.','muted'));return;}
    var bar=mk('div',null,'row-actions lot-extra');
    var failed=b.jobs.filter(function(j){return FAIL.indexOf(j.status)>=0;});
    if(failed.length){
      var rb=mk('button','Reenviar só '+(failed.length===1?'a que falhou':'as '+failed.length+' que falharam'),'primary');rb.type='button';
      rb.onclick=async function(){
        rb.disabled=true;
        try{
          if(typeof testConnected!=='undefined'&&!testConnected)throw Error('Conecte a Higgsfield para reenviar.');
          if(!await askConfirm('Reenviar '+failed.length+' geração(ões) que falharam? A Higgsfield cobra de novo pelos novos pedidos. As concluídas não são reenviadas.','Reenviar'))return;
          var r=await studioClient.from('frame_library').select('*').eq('id',b.id).single();
          if(r.error||r.data.deleted)throw Error('Lote indisponível.');
          var data=r.data.data;
          data.jobs=data.jobs.map(function(j){return FAIL.indexOf(j.status)>=0?{attemptId:crypto.randomUUID(),sourceIndex:j.sourceIndex,variation:j.variation,status:'prepared'}:j;});
          data.status='paused';data.productionStatus='Pausado';
          await runProduction(Object.assign({},data,{id:b.id,kind:'batch',created:r.data.created_at,deleted:false}));
        }catch(e){say(e.message||'Não foi possível reenviar.');}
        finally{rb.disabled=false;}
      };
      bar.append(rb);
    }
    var du=mk('button','Duplicar lote','secondary');du.type='button';
    du.onclick=async function(){
      du.disabled=true;
      try{
        if(!await askConfirm('Criar uma cópia deste lote com os mesmos vídeos de origem e as mesmas configurações? Nada é enviado à Higgsfield até você tocar em Retomar lote.','Duplicar'))return;
        var r=await studioClient.from('frame_library').select('*').eq('id',b.id).single();
        if(r.error)throw Error('Lote indisponível.');
        var d=Object.assign({},r.data.data);
        delete d.leaseToken;delete d.leaseUntil;delete d.sourcesCleaned;
        d.jobs=(d.jobs||[]).map(function(j){return {attemptId:crypto.randomUUID(),sourceIndex:j.sourceIndex,variation:j.variation,status:'prepared'};});
        d.status='ready';d.productionStatus='Pronto para gerar (cópia)';
        await studioApi('POST',{kind:'batch',data:d});
        await load();
        say('Lote duplicado. Toque em Retomar lote na cópia para gerar.');
      }catch(e){say(e.message||'Não foi possível duplicar.');}
      finally{du.disabled=false;}
    };
    bar.append(du);
    var allDone=b.jobs.every(function(j){return ['completed','failed','nsfw','canceled'].indexOf(j.status)>=0;});
    if(allDone&&b.sources&&b.sources.length){
      var cl=mk('button','Apagar vídeos de origem (liberar espaço)','secondary');cl.type='button';
      cl.onclick=async function(){
        cl.disabled=true;
        try{
          if(!await askConfirm('Apagar os vídeos de origem, áudios e quadros deste lote do armazenamento? Os vídeos GERADOS continuam guardados. Depois disso não será possível retomar, reenviar nem duplicar este lote.','Apagar origem'))return;
          var mine=mediaIds(b),keep={};
          batches.forEach(function(o){if(o.id!==b.id&&!o.sourcesCleaned)mediaIds(o).forEach(function(id){keep[id]=1;});});
          var paths=[],skipped=0;
          for(var i=0;i<mine.length;i++){
            if(keep[mine[i]]){skipped++;continue;}
            var m=await studioClient.from('frame_library').select('*').eq('id',mine[i]).single();
            if(m.error||!m.data||m.data.kind!=='media')continue;
            var d=m.data.data||{};
            if(d.path)paths.push(d.path);
            if(d.audioPath)paths.push(d.audioPath);
          }
          for(var k=0;k<paths.length;k++)await removeFile(paths[k]);
          b.sourcesCleaned=true;
          await saveProduction(b);
          say(paths.length+' arquivo(s) apagado(s).'+(skipped?' '+skipped+' mantido(s), pois outro lote usa.':''));
          renderBatches();
        }catch(e){say(e.message||'Não foi possível apagar.');}
        finally{cl.disabled=false;}
      };
      bar.append(cl);
    }
    card.append(bar);
  }
  var origPB=window.renderProductionBatch;
  if(origPB)window.renderProductionBatch=function(b,card){
    origPB.apply(this,arguments);
    try{extras(b,card);}catch(e){console.warn(e);}
  };
  var origRB2=window.renderBatches;
  window.renderBatches=function(){
    var r=origRB2.apply(this,arguments);
    try{paintSpend();}catch(e){console.warn(e);}
    return r;
  };
})();

/* ---------- Aprovar, comparar, ZIP, busca, nomes, estimativa e celular ---------- */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  function say(m){try{toast(m);}catch(e){}}
  function ls(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}}
  function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  var FAILS=['failed','nsfw','canceled'],TERM=['completed','failed','nsfw','canceled'];
  var stars=ls('fs-stars',{}),names=ls('fs-names',{});
  var st=document.createElement('style');
  st.textContent='.lib-actions{display:flex;gap:6px;flex-wrap:wrap}.lib-actions button{font-size:12px;padding:5px 8px}.lib-star.on{color:#f5b301;border-color:#f5b301}.lib-card[data-hide="1"]{display:none}'
  +'#cmp{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}#cmp .cmp-row{display:flex;gap:16px;max-width:100%;justify-content:center}#cmp video{max-height:68vh;max-width:44vw;background:#000;border-radius:8px}#cmp figure{margin:0;text-align:center;color:#fff;font-size:13px}#cmp .cmp-btns{display:flex;gap:10px}'
  +'.fs-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px}.fs-tools input,.fs-tools select{width:auto;min-width:200px}.lot-name{font-size:15px;margin-right:8px}.lot-rename{font-size:11px;padding:3px 8px}'
  +'#eta-box{margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:13px;color:var(--c4);font-weight:600}'
  +'@media(max-width:700px){.lib-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#cmp .cmp-row{flex-direction:column;align-items:center}#cmp video{max-width:90vw;max-height:33vh}.batch-card .row-actions{flex-wrap:wrap}.fs-tools input,.fs-tools select{width:100%;min-width:0}.batch-card video{max-height:240px}}';
  document.head.append(st);

  /* --- aprovar e filtrar --- */
  function starCount(){return Object.keys(stars).length;}
  function approved(){var L=window.__lib;return L?L.all().filter(function(it){return stars[L.key(it)];}):[];}
  function updateTop(){
    var d=q('#lib-dl-star');if(d){var n=approved().length;d.textContent='Baixar aprovados ('+n+')';d.disabled=!n;}
  }
  function decorate(){
    var grid=q('#lib-grid'),L=window.__lib;if(!grid||!L)return;
    var only=q('#lib-onlystar')&&q('#lib-onlystar').checked;
    grid.querySelectorAll('.lib-card').forEach(function(c){
      var it=c.__it;if(!it)return;
      if(!c.querySelector('.lib-actions')){
        var a=mk('div',null,'lib-actions');
        var s=mk('button','☆ Aprovar','secondary lib-star');s.type='button';
        s.onclick=function(){var k=L.key(it);if(stars[k])delete stars[k];else stars[k]=1;lsSet('fs-stars',stars);decorate();};
        var cm=mk('button','Comparar com original','secondary');cm.type='button';
        cm.onclick=function(){compare(it,cm);};
        a.append(s,cm);c.append(a);c.__star=s;
      }
      var on=!!stars[L.key(it)];
      c.__star.textContent=on?'★ Aprovado':'☆ Aprovar';
      c.__star.classList.toggle('on',on);
      c.dataset.hide=(only&&!on)?'1':'';
    });
    updateTop();
  }
  /* --- comparar --- */
  async function compare(it,btn){
    var b=it.b,j=it.j,L=window.__lib;btn.disabled=true;
    try{
      var s=(b.sources||[])[j.sourceIndex]||{};
      if(b.sourcesCleaned)throw Error('Os arquivos de origem deste lote foram apagados.');
      if(!s.mediaId)throw Error('Este vídeo não tem o original guardado.');
      var m=await studioClient.from('frame_library').select('*').eq('id',s.mediaId).single();
      if(m.error||!m.data||!m.data.data||!m.data.data.path)throw Error('Original não encontrado.');
      var u1=await L.signed(m.data.data.path,3600);
      var u2=j.videoPath?await L.signed(j.videoPath,3600):j.videoUrl;
      var box=mk('div');box.id='cmp';
      var row=mk('div',null,'cmp-row');
      function fig(label,url){var f=mk('figure'),v=mk('video');v.src=url;v.controls=true;v.playsInline=true;v.preload='auto';f.append(v,mk('figcaption',label));row.append(f);return v;}
      var v1=fig('Original',u1),v2=fig('Gerado',u2);
      var bt=mk('div',null,'cmp-btns');
      var play=mk('button','▶ Tocar os dois','primary');play.type='button';
      play.onclick=function(){v1.currentTime=0;v2.currentTime=0;v1.play().catch(function(){});v2.play().catch(function(){});};
      var stop=mk('button','Pausar','secondary');stop.type='button';stop.onclick=function(){v1.pause();v2.pause();};
      var close=mk('button','Fechar','secondary');close.type='button';
      function shut(){document.removeEventListener('keydown',esc);box.remove();}
      function esc(e){if(e.key==='Escape')shut();}
      close.onclick=shut;document.addEventListener('keydown',esc);
      bt.append(play,stop,close);box.append(row,bt);document.body.append(box);
    }catch(e){say(e.message||'Não foi possível comparar.');}
    finally{btn.disabled=false;}
  }
  /* --- baixar aprovados e ZIP --- */
  async function seq(list,btn,label){
    btn.disabled=true;
    try{
      for(var k=0;k<list.length;k++){btn.textContent='Baixando '+(k+1)+' de '+list.length+'…';await window.__lib.dl(list[k]);await new Promise(function(r){setTimeout(r,900);});}
      say('Downloads iniciados. Se o navegador perguntar, permita vários downloads.');
    }catch(e){say(e.message||'Não foi possível baixar.');}
    finally{btn.textContent=label;updateTop();}
  }
  function loadZip(){return new Promise(function(res,rej){
    if(window.JSZip)return res(window.JSZip);
    var s=document.createElement('script');s.src='vendor/jszip-3.10.1.min.js';
    s.onload=function(){res(window.JSZip);};s.onerror=function(){rej(Error('Não foi possível carregar o gerador de ZIP.'));};document.head.append(s);});}
  async function makeZip(btn){
    var L=window.__lib,list=L.chosen();
    if(!list.length)return say('Marque pelo menos um vídeo em Selecionar.');
    btn.disabled=true;var label='Baixar ZIP dos selecionados';
    try{
      if(list.length>40&&!await askConfirm('ZIP com '+list.length+' vídeos usa muita memória e pode travar o navegador. Recomendado até 40 por vez. Continuar?','Continuar'))return;
      var Z=await loadZip(),zip=new Z();
      for(var k=0;k<list.length;k++){
        btn.textContent='Preparando '+(k+1)+' de '+list.length+'…';
        var it=list[k],url=it.j.videoPath?await L.signed(it.j.videoPath,600):(it.j.downloadUrl||it.j.videoUrl);
        var r=await fetch(url);if(!r.ok)throw Error('Falha ao baixar o vídeo '+(k+1)+'. Use o download individual.');
        var name=L.modelName(it.b).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+String(it.b.id).slice(0,4)+'-'+(it.i+1)+'.mp4';
        zip.file(name,await r.blob(),{compression:'STORE'});
      }
      btn.textContent='Montando o ZIP…';
      var out=await zip.generateAsync({type:'blob',compression:'STORE'});
      var a=mk('a');a.href=URL.createObjectURL(out);a.download='frame-studio-videos.zip';document.body.append(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(a.href);},60000);
    }catch(e){say(e.message||'Não foi possível montar o ZIP.');}
    finally{btn.disabled=false;btn.textContent=label;}
  }
  function initBar(){
    var bar=q('.lib-bar');if(!bar||q('#lib-onlystar'))return;
    var l=mk('label',null,'check-label'),c=mk('input');c.type='checkbox';c.id='lib-onlystar';
    c.onchange=decorate;l.append(c,document.createTextNode(' Só aprovados'));
    var d=mk('button','Baixar aprovados (0)','secondary');d.type='button';d.id='lib-dl-star';d.disabled=true;
    d.onclick=function(){seq(approved(),d,'Baixar aprovados (0)');};
    var z=mk('button','Baixar ZIP dos selecionados','secondary');z.type='button';z.id='lib-zip';
    z.onclick=function(){makeZip(z);};
    bar.append(l,d,z);
    var g=q('#lib-grid');if(g)new MutationObserver(decorate).observe(g,{childList:true});
  }
  /* --- lotes: nome, busca e filtro --- */
  function lotState(b){
    var js=b.jobs||[];if(!js.length)return 'draft';
    if(js.some(function(j){return FAILS.indexOf(j.status)>=0;}))return 'failed';
    if(js.every(function(j){return TERM.indexOf(j.status)>=0;}))return 'done';
    return 'running';
  }
  function lotText(b){return ((names[b.id]||'')+' '+(b.modelName||'')+' '+(b.productionStatus||'')+' '+new Date(b.created).toLocaleString('pt-BR')).toLowerCase();}
  function decorateLots(){
    var list=typeof visibleBatches==='function'?visibleBatches():[];
    var cards=[].slice.call(document.querySelectorAll('#batch-list .batch-card'));
    if(cards.length!==list.length)return;
    var term=((q('#lot-search')||{}).value||'').trim().toLowerCase(),state=(q('#lot-state')||{}).value||'';
    cards.forEach(function(c,i){
      var b=list[i];
      var h=c.querySelector('.batch-heading');
      if(h&&!h.querySelector('.lot-rename')){
        if(names[b.id])h.prepend(mk('strong',names[b.id],'lot-name'));
        var r=mk('button',names[b.id]?'Renomear':'Dar nome','secondary lot-rename');r.type='button';
        r.onclick=async function(){
          var n=await askText('Nome do lote (deixe vazio para remover)',names[b.id]||'','Salvar',{maxLength:60});
          if(n===null)return;n=n.trim().slice(0,60);
          if(n)names[b.id]=n;else delete names[b.id];
          lsSet('fs-names',names);renderBatches();
        };
        h.append(r);
      }
      var ok=(!term||lotText(b).indexOf(term)>=0)&&(!state||lotState(b)===state);
      c.style.display=ok?'':'none';
    });
  }
  function initLots(){
    var list=q('#batch-list');if(!list||q('#lot-search'))return;
    var t=mk('div',null,'fs-tools');
    var i=mk('input');i.type='search';i.id='lot-search';i.placeholder='Buscar lote (nome, modelo, data)';
    var s=document.createElement('select');s.id='lot-state';
    [['','Todos os lotes'],['failed','Com falhas'],['done','Concluídos'],['running','Em andamento ou pendentes'],['draft','Rascunhos']].forEach(function(o){s.add(new Option(o[1],o[0]));});
    i.oninput=s.onchange=decorateLots;
    t.append(i,s);list.before(t);
  }
  var prevRB=window.renderBatches;
  window.renderBatches=function(){
    var r=prevRB.apply(this,arguments);
    try{initLots();decorateLots();}catch(e){console.warn(e);}
    return r;
  };
  /* --- estimativa de tempo --- */
  var eta={id:null,t0:0,d0:0};
  function terminalCount(b){return (b.jobs||[]).filter(function(j){return TERM.indexOf(j.status)>=0;}).length;}
  setInterval(function(){
    var box=q('#eta-box'),b=null,on=false;
    try{b=typeof activeBatch!=='undefined'?activeBatch:null;on=typeof productionBusy!=='undefined'&&productionBusy;}catch(e){}
    if(!b||!on||!b.jobs||!b.jobs.length){if(box)box.remove();eta.id=null;return;}
    var done=terminalCount(b),total=b.jobs.length;
    if(eta.id!==b.id)eta={id:b.id,t0:Date.now(),d0:done};
    if(!box){var host=q('#production-status');if(!host)return;box=mk('div');box.id='eta-box';host.before(box);}
    var gained=done-eta.d0,left=total-done;
    if(gained>0){
      var min=Math.max(1,Math.round((Date.now()-eta.t0)/gained*left/60000));
      box.textContent='Estimativa: faltam cerca de '+(min>=60?Math.floor(min/60)+' h '+(min%60)+' min':min+' min')+' ('+done+' de '+total+' prontos).';
    }else box.textContent='Calculando o tempo restante… ('+done+' de '+total+' prontos)';
  },3000);
  function boot(){initBar();initLots();decorate();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0);});
  window.addEventListener('studio-authenticated',function(){setTimeout(boot,800);});
})();
