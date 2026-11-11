/* Exportar CSV, link para compartilhar (7 dias) e recorte da foto da modelo. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  function say(m){try{toast(m);}catch(e){}}
  var RATE={'480p':.05,'720p':.10,'1080p':.20};
  var css=document.createElement('style');
  css.textContent='#crop-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;color:#fff;font-size:13px}#crop-ov canvas{max-width:92vw;touch-action:none;cursor:move;border-radius:6px}#crop-ov .row{display:flex;gap:10px;align-items:center}#crop-ov input[type=range]{width:200px}.lib-share{font-size:12px;padding:5px 8px}';
  document.head.append(css);

  /* ---------- CSV ---------- */
  function cell(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
  function exportCsv(){
    var rows=[['Lote','Data','Modelo','Modo','Resolução','Vídeo de origem','Saída','Estado','Motivo','Custo estimado (US$)','Vídeo pronto']];
    (typeof batches!=='undefined'?batches:[]).forEach(function(b){
      if(b.deleted||!b.jobs)return;
      var d=new Date(b.created||''),when=isNaN(d)?'':d.toLocaleString('pt-BR');
      b.jobs.forEach(function(j,i){
        var s=(b.sources||[])[j.sourceIndex]||{},cost=0;
        if(j.status==='completed')cost=(Math.ceil(Number(s.duration)||0)+(Number(s.out)||Number(b.duration)||0))*(RATE[b.resolution]||.05);
        var st=(typeof statusNames!=='undefined'&&statusNames[j.status])||j.status||'';
        rows.push([String(b.id).slice(0,8),when,b.modelName||'',b.mode||'',b.resolution||'',s.name||'',i+1,st,j.error||'',cost?cost.toFixed(2).replace('.',','):'',(j.videoPath||j.videoUrl)?'sim':'não']);
      });
    });
    if(rows.length<2)return say('Ainda não há lotes para exportar.');
    var text='﻿'+rows.map(function(r){return r.map(cell).join(';');}).join('\r\n');
    var a=mk('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    a.download='frame-studio-lotes-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.append(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);},60000);
    say('CSV exportado.');
  }
  function ensureCsvButton(){
    var bar=q('.fs-tools');if(!bar||q('#csv-btn'))return;
    var b=mk('button','Exportar CSV','secondary');b.type='button';b.id='csv-btn';b.onclick=exportCsv;bar.append(b);
  }

  /* ---------- link para compartilhar ---------- */
  async function shareLink(it,btn){
    btn.disabled=true;
    try{
      if(!it.j.videoPath)throw Error('Este vídeo não está no armazenamento próprio.');
      if(!await askConfirm('Criar um link que vale por até 7 dias? Qualquer pessoa com o link poderá ver e baixar este vídeo. Você pode revogar o link a qualquer momento em "Revogar links".','Criar link'))return;
      var s=await studioClient.auth.getSession();
      var r=await fetch('/api/storage?action=share',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.data.session.access_token},body:JSON.stringify({path:it.j.videoPath,secs:604800})});
      var j=await r.json().catch(function(){return {};});
      if(!r.ok||!j.url)throw Error(j.error||(j.missing?'Arquivo não encontrado.':'Não foi possível criar o link.'));
      try{await navigator.clipboard.writeText(j.url);say('Link copiado. Vale por 7 dias, ou até você revogar.');}
      catch(e){window.prompt('Copie o link (vale por 7 dias, ou até você revogar):',j.url);}
    }catch(e){say(e.message||'Não foi possível criar o link.');}
    finally{btn.disabled=false;}
  }
  async function revokeLinks(it,btn){
    btn.disabled=true;
    try{
      if(!it.j.videoPath)throw Error('Este vídeo não está no armazenamento próprio.');
      if(!await askConfirm('Revogar todos os links deste vídeo? Quem tiver o link não conseguirá mais abrir o vídeo.','Revogar'))return;
      var s=await studioClient.auth.getSession();
      var r=await fetch('/api/storage?action=unshare',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.data.session.access_token},body:JSON.stringify({path:it.j.videoPath})});
      var j=await r.json().catch(function(){return {};});
      if(!r.ok)throw Error(j.error||'Não foi possível revogar os links.');
      say(j.revoked?(j.revoked===1?'1 link revogado.':j.revoked+' links revogados.'):'Nenhum link ativo para este vídeo.');
    }catch(e){say(e.message||'Não foi possível revogar os links.');}
    finally{btn.disabled=false;}
  }
  function decorateShare(){
    var g=q('#lib-grid');if(!g)return;
    [].slice.call(g.querySelectorAll('.lib-card')).forEach(function(c){
      var it=c.__it;if(!it||c.querySelector('.lib-share'))return;
      var b=mk('button','Copiar link (7 dias)','secondary lib-share');b.type='button';
      b.onclick=function(){shareLink(it,b);};c.append(b);
      var rv=mk('button','Revogar links','secondary lib-unshare');rv.type='button';
      rv.onclick=function(){revokeLinks(it,rv);};c.append(rv);
    });
  }
  function watchGrid(){var g=q('#lib-grid');if(g&&!g.__sh){g.__sh=1;new MutationObserver(decorateShare).observe(g,{childList:true});decorateShare();}}

  /* ---------- recorte da foto da modelo ---------- */
  function openCrop(file,input){
    var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){
      var W=img.naturalWidth,H=img.naturalHeight,side=Math.min(W,H),disp=Math.min(1,360/Math.max(W,H));
      var cw=Math.round(W*disp),ch=Math.round(H*disp),size=side*.7,x=(W-size)/2,y=(H-size)/2;
      var ov=mk('div');ov.id='crop-ov';
      var cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
      var ctx=cv.getContext('2d');
      function draw(){
        ctx.drawImage(img,0,0,cw,ch);
        var rx=x*disp,ry=y*disp,rs=size*disp;
        ctx.fillStyle='rgba(0,0,0,.55)';
        ctx.fillRect(0,0,cw,ry);ctx.fillRect(0,ry+rs,cw,ch-ry-rs);ctx.fillRect(0,ry,rx,rs);ctx.fillRect(rx+rs,ry,cw-rx-rs,rs);
        ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(rx,ry,rs,rs);
      }
      function clamp(){x=Math.max(0,Math.min(W-size,x));y=Math.max(0,Math.min(H-size,y));}
      var drag=null;
      cv.onpointerdown=function(e){var r=cv.getBoundingClientRect();drag={px:(e.clientX-r.left)/r.width*W-x,py:(e.clientY-r.top)/r.height*H-y};try{cv.setPointerCapture(e.pointerId);}catch(err){}};
      cv.onpointermove=function(e){if(!drag)return;var r=cv.getBoundingClientRect();x=(e.clientX-r.left)/r.width*W-drag.px;y=(e.clientY-r.top)/r.height*H-drag.py;clamp();draw();};
      cv.onpointerup=function(){drag=null;};
      var sl=document.createElement('input');sl.type='range';sl.min=20;sl.max=100;sl.value=70;
      sl.oninput=function(){var cx=x+size/2,cy=y+size/2;size=side*sl.value/100;x=cx-size/2;y=cy-size/2;clamp();draw();};
      var row=mk('div',null,'row');row.append(mk('span','Tamanho'),sl);
      var ok=mk('button','Usar recorte','primary');ok.type='button';
      var no=mk('button','Cancelar','secondary');no.type='button';
      function shut(){URL.revokeObjectURL(url);ov.remove();}
      no.onclick=shut;
      ok.onclick=function(){
        var o=Math.min(1024,Math.round(size)),out=document.createElement('canvas');out.width=out.height=o;
        out.getContext('2d').drawImage(img,x,y,size,size,0,0,o,o);
        out.toBlob(function(blob){
          if(!blob){say('Não foi possível recortar.');return;}
          var f=new File([blob],(file.name||'foto').replace(/\.[^.]+$/,'')+'-rosto.jpg',{type:'image/jpeg'});
          var dt=new DataTransfer();dt.items.add(f);input.files=dt.files;
          input.dispatchEvent(new Event('change',{bubbles:true}));
          say('Recorte aplicado.');shut();
        },'image/jpeg',.92);
      };
      var btns=mk('div',null,'row');btns.append(ok,no);
      ov.append(mk('div','Arraste o quadrado sobre o rosto e ajuste o tamanho.'),cv,row,btns);
      (q('#model-dialog')||document.body).append(ov);
      draw();
    };
    img.onerror=function(){URL.revokeObjectURL(url);say('Não foi possível abrir a foto.');};
    img.src=url;
  }
  function initCrop(){
    var photo=q('#photo');if(!photo||q('#crop-btn'))return;
    var b=mk('button','Recortar o rosto','secondary');b.type='button';b.id='crop-btn';
    b.onclick=function(){var f=photo.files&&photo.files[0];if(!f)return say('Escolha a foto primeiro.');openCrop(f,photo);};
    photo.after(b);
  }

  function boot(){ensureCsvButton();watchGrid();initCrop();}
  boot();
  setInterval(boot,2000);
})();
