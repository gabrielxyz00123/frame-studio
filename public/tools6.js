/* Estúdio: monte a fila aos poucos (um vídeo de cada vez, cada um com a sua configuração) e gere tudo no fim. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  function say(m){try{toast(m);}catch(e){}}
  var info=null;

  function count(){return (window.fsQueue&&window.fsQueue.count())||0;}
  function refresh(){
    if(!info)return;
    var n=count();
    info.textContent=n?('Fila: '+n+' vídeo(s).'):'Fila vazia. Adicione um vídeo, ajuste e use Adicionar à fila.';
    var g=q('#queue-go');if(g){g.disabled=!n;g.textContent=n?('Gerar a fila ('+n+')'):'Gerar a fila';}
    var o=q('#queue-open');if(o)o.disabled=!n;
  }

  function add(){
    if(!window.fsQueue)return say('A fila ainda está carregando. Tente de novo em instantes.');
    if(typeof loaded!=='undefined'&&!loaded)return say('Aguarde a biblioteca carregar.');
    if(!files.length)return say('Adicione pelo menos um vídeo de origem.');
    var m=mode,spec={mode:m},frameFile=null;
    if(m==='multi'){
      var cast=castRows.map(function(r){return {modelId:r.modelId,target:(r.target||'').trim()};});
      if(!cast.length||cast.some(function(r){return !r.modelId||!r.target;}))return say('Escolha a modelo e descreva cada pessoa antes de adicionar.');
      if(new Set(cast.map(function(r){return r.target.toLowerCase();})).size!==cast.length)return say('Descreva cada pessoa de forma diferente.');
      spec.cast=cast;spec.modelId=cast[0].modelId;
    }else{
      var mid=q('#model').value;
      if(!mid)return say('Escolha a modelo antes de adicionar.');
      spec.modelId=mid;spec.target=(q('#target-person').value||'').trim()||'the main person';
      if(m==='frame'&&q('#frame-method').value==='manual'){
        frameFile=q('#edited-frame').files[0];
        if(!frameFile)return say('Envie o quadro editado (PNG, JPEG ou WebP, até 4 MB) ou volte para quadro automático.');
        if(['image/png','image/jpeg','image/webp'].indexOf(frameFile.type)<0||frameFile.size>4*1048576)return say('O quadro editado deve ser PNG, JPEG ou WebP de até 4 MB.');
        if(files.length>1)return say('Com quadro enviado por você, adicione um vídeo de cada vez.');
      }
    }
    var specs=files.map(function(f){var s=Object.assign({},spec,{file:f.file});if(frameFile)s.frameFile=frameFile;return s;});
    var n=window.fsQueue.add(specs);
    files=[];try{selectedFiles.clear();}catch(e){}
    renderFiles();
    if(frameFile){var ef=q('#edited-frame');if(ef)ef.value='';}
    say(n+' vídeo(s) adicionado(s) à fila. Escolha o próximo vídeo.');
    refresh();
  }

  function init(){
    if(q('#queue-add'))return;
    var anchor=q('#estimate-account');if(!anchor)return;
    var box=mk('div');box.id='queue-box';box.style.cssText='margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px';
    box.append(mk('p','Vários vídeos com configurações diferentes? Adicione um de cada vez à fila e gere tudo no fim.','muted'));
    var row=mk('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    var a=mk('button','Adicionar à fila','secondary');a.type='button';a.id='queue-add';a.onclick=add;
    var o=mk('button','Abrir a fila','secondary');o.type='button';o.id='queue-open';o.onclick=function(){if(window.fsQueue)window.fsQueue.open();};
    var g=mk('button','Gerar a fila','primary');g.type='button';g.id='queue-go';g.onclick=function(){if(window.fsQueue)window.fsQueue.generate();};
    row.append(a,o,g);
    info=mk('p',null,'muted');info.id='queue-info';
    box.append(row,info);
    anchor.before(box);
    refresh();
  }
  init();setInterval(function(){init();refresh();},1500);
  window.addEventListener('fs-queue-ready',refresh);
})();