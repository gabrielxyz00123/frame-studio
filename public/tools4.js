/* Fila de produção: escolha vários vídeos de uma vez, ajuste cada linha (modelo, pessoa, quadro) e gere tudo junto. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  function say(m){try{toast(m);}catch(e){}}
  var KEY='fs-queue2',RATE={'480p':.05,'720p':.10,'1080p':.20},IMG=['image/png','image/jpeg','image/webp'];
  var queue=[];
  try{(JSON.parse(localStorage.getItem(KEY)||'[]')||[]).forEach(function(x){if(x&&x.mediaId){x.state='ready';queue.push(x);}});}catch(e){queue=[];}
  /* guarda o arquivo de cada vídeo pronto no navegador (IndexedDB), para a fila restaurada continuar completa */
  var idbP=null,saved={};
  function idb(){
    if(!idbP)idbP=new Promise(function(res,rej){
      try{var r=indexedDB.open('fs-queue-files',1);r.onupgradeneeded=function(){r.result.createObjectStore('f');};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}
    });
    return idbP;
  }
  function idbDo(mode,fn){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction('f',mode),st=t.objectStore('f'),out=fn(st);t.oncomplete=function(){res(out&&out.result);};t.onerror=function(){rej(t.error);};});});}
  function syncFiles(){
    var keep={};
    queue.forEach(function(x){if(x.state==='ready'&&x.file){keep[x.id]=1;if(!saved[x.id]){saved[x.id]=1;idbDo('readwrite',function(st){return st.put(x.file,x.id);}).catch(function(){delete saved[x.id];});}}});
    Object.keys(saved).forEach(function(id){if(!keep[id]){delete saved[id];idbDo('readwrite',function(st){return st.delete(id);}).catch(function(){});}});
  }
  function restoreFiles(){
    queue.forEach(function(x){
      if(x.file)return;
      idbDo('readonly',function(st){return st.get(x.id);}).then(function(f){if(f&&!x.file){x.file=f;saved[x.id]=1;if(ui.list)renderQueue();}}).catch(function(){});
    });
  }
  function dropItems(list){
    list.forEach(function(x){x._removed=true;});
    queue=queue.filter(function(x){return list.indexOf(x)<0;});
    persist();renderQueue();
  }
  function changed(){try{window.dispatchEvent(new Event('fs-queue-change'));}catch(e){}}
  /* outra aba mexeu na fila: tira daqui o que ela removeu e traz o que ela adicionou */
  window.addEventListener('storage',function(e){
    if(e.key!==KEY)return;
    var list=[];try{list=JSON.parse(e.newValue||'[]')||[];}catch(x){return;}
    var ids={};list.forEach(function(x){if(x&&x.id)ids[x.id]=x;});
    var gone=queue.filter(function(x){return x.state==='ready'&&!ids[x.id];});
    gone.forEach(function(x){x._removed=true;});
    queue=queue.filter(function(x){return gone.indexOf(x)<0;});
    list.forEach(function(x){if(x&&x.mediaId&&!queue.some(function(y){return y.id===x.id;})){x.state='ready';queue.push(x);}});
    restoreFiles();renderQueue();changed();
  });
  function persist(){
    try{syncFiles();}catch(e){}
    try{localStorage.setItem(KEY,JSON.stringify(queue.filter(function(x){return x.state==='ready';}).map(function(x){var c={};Object.keys(x).forEach(function(k){if(k!=='file'&&k[0]!=='_')c[k]=x[k];});return c;})));}catch(e){}
  }

  var css=document.createElement('style');
  css.textContent='#fila .card{border:1px solid var(--line);border-radius:12px;padding:16px;margin:14px 0}#fila .card h2{margin:0 0 10px;font-size:16px}#fila .rowf{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0}#fila .rowf>*{flex:1 1 180px}#fila .rowf .fit{flex:0 0 auto}#fila .qitem{border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0}#fila .qhead{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}#fila .qhead b{word-break:break-all}#fila .qst{font-size:12px;color:var(--c3);margin:4px 0}#fila .qst.bad{color:#dc2626}#fila .qbar{height:14px;border-radius:8px;background:var(--line);overflow:hidden;margin:10px 0}#fila .qbar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--c95),var(--c4));transition:width .4s}#fila .stats{font-size:13px;color:var(--c3)}#fila .lab{font-size:12px;color:var(--c3);flex:0 0 100%;margin-bottom:-4px}#mark2-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;color:#fff;font-size:13px}#mark2-ov canvas{max-width:92vw;max-height:64vh;cursor:crosshair;border-radius:6px}#mark2-ov .row{display:flex;gap:10px}';
  document.head.append(css);

  /* ---------- marcar a pessoa no primeiro quadro ---------- */
  function place(x,y){
    var h=x<.38?'esquerda':(x>.62?'direita':'centro'),v=y<.38?'parte de cima':(y>.62?'parte de baixo':'meio');
    return 'a pessoa que está '+(h==='centro'?'no centro':'à '+h)+' do quadro, '+(v==='meio'?'no meio':'na '+v)+' (a cerca de '+Math.round(x*100)+'% da largura e '+Math.round(y*100)+'% da altura)';
  }
  /* ---------- envio em segundo plano ---------- */
  var active=0;
  function limit(){try{return trimSettings().enabled?2:3;}catch(e){return 2;}}
  function setSt(it,text,bad){it._text=text;it._bad=!!bad;if(it._st){it._st.textContent=text;it._st.className='qst'+(bad?' bad':'');}}
  function pump(){
    while(active<limit()){
      var it=queue.find(function(x){return x.state==='pending';});
      if(!it)break;
      it.state='uploading';active++;
      upload(it).catch(function(e){if(it._removed)return;it.state='error';setSt(it,e.message||'Falha no envio.',true);}).then(function(){active--;persist();refreshCost();pump();});
    }
  }
  function alive(it){if(it._removed)throw Error('Removido da fila.');}
  async function upload(it){
    alive(it);
    var file=it.file,trim=trimSettings(),duration=Number(q('#duration').value)||0,up=file,used;
    setSt(it,'Lendo o vídeo…');
    var meta=await videoMetadata(file);alive(it);
    if(!trim.enabled&&(file.type!=='video/mp4'||file.size>100*1048576||meta.duration<1||meta.duration>15)){
      if(!(meta.duration>=1))throw Error('O vídeo tem menos de 1 segundo ou não pôde ser lido.');
      trim={enabled:true,start:0,length:Math.min(15,Math.floor(meta.duration*10)/10)};it.autoCut=true;
    }
    if(trim.enabled){
      if(file.size>500*1048576)throw Error('Use um vídeo de até 500 MB para cortar.');
      if(!(meta.duration>trim.start+.5))throw Error('O início do corte passa do fim do vídeo, que tem '+meta.duration.toFixed(1)+' s.');
      used=Math.max(1,Math.round(Math.min(trim.length,meta.duration-trim.start)*10)/10);
      up=await window.trimVideo(file,trim.start,trim.length,function(p){setSt(it,'Cortando… '+Math.round(p*100)+'%');});alive(it);
    }else{
      if(file.type!=='video/mp4'||file.size>100*1048576||meta.duration<1||meta.duration>15)throw Error('Use MP4 de 1 a 15 segundos, até 100 MB, ou ative o corte em Estúdio em lote.');
      used=meta.duration;
    }
    setSt(it,'Enviando…');
    var media=await uploadMedia(up,file.name,{duration:used});alive(it);
    it.mediaId=media.id;it.duration=used;it.out=duration||Math.max(2,Math.min(15,Math.floor(used)));it.size=file.size;it.type=up.type||'video/mp4';
    if(meta.width){it.width=meta.width;it.height=meta.height;}
    setSt(it,'Extraindo o primeiro quadro…');
    it.frameAt=trim.enabled?trim.start+.001:.001;
    var frame=await extractFrame(file,it.frameAt);alive(it);
    it.originalFrameId=(await uploadMedia(frame.blob,'quadro-'+file.name+'.png')).id;it.frameRatio=frameRatio(frame);
    alive(it);it.state='ready';
    refreshInfo(it);
  }
  function infoText(it){
    if(it.state==='error')return it._text||'Erro.';
    if(it.state!=='ready')return it._text||'Aguardando envio…';
    if(it._framePending)return 'Enviando o quadro…';
    var cut=it.autoCut?' · cortado automaticamente nos primeiros 15 s':'';
    if(it.mode==='multi')return 'Pronto'+(it.frameMediaId?' · quadro enviado por você'+(it.frameName?': '+it.frameName:''):it.frameChoice==='manual'?' · falta enviar o quadro editado':it.useFrame?' · o quadro será editado automaticamente (cerca de US$ 0,04)':'')+'.'+cut;
    return it.mode!=='frame'?'Pronto.'+cut:(it.frameMediaId?'Pronto · quadro enviado por você'+(it.frameName?': '+it.frameName:''):'Pronto · o quadro será editado automaticamente (cerca de US$ 0,04)');
  }
  function refreshInfo(it){setSt(it,infoText(it),it.state==='error');}

  /* ---------- tela ---------- */
  var ui={};
  function modelOptions(sel,val){
    sel.replaceChildren();sel.add(new Option('Selecione a modelo',''));
    (typeof models!=='undefined'?models:[]).forEach(function(m){sel.add(new Option(m.name,m.id));});
    sel.value=val||'';
  }
  function modelName(id){var m=(typeof models!=='undefined'?models:[]).find(function(x){return x.id===id;});return m?m.name:'?';}
  function build(){
    if(q('#fila'))return;
    var main=q('main');if(!main)return;
    var sec=mk('section',null,'view');sec.id='fila';sec.hidden=true;
    var head=mk('div',null,'heading');
    head.append(mk('div','SEU PASSO A PASSO','eyebrow'),mk('h1','Fila de produção'),mk('p','Escolha todos os vídeos de uma vez. Depois ajuste cada linha: modelo, pessoa a trocar e quadro. Por fim, gere a fila inteira.'));
    sec.append(head);

    var add=mk('div',null,'card');add.append(mk('h2','1. Escolher os vídeos'));
    var rv=mk('div',null,'rowf');ui.video=document.createElement('input');ui.video.type='file';ui.video.accept='video/*';ui.video.multiple=true;
    ui.video.onchange=function(){addFiles([].slice.call(ui.video.files));ui.video.value='';};
    rv.append(ui.video);add.append(rv);
    add.append(mk('p','Os vídeos entram na fila na hora e são enviados em segundo plano, enquanto você ajusta as linhas. Resolução, formato, duração e corte seguem o que está em Estúdio em lote.','muted'));
    var all=mk('div',null,'rowf');ui.all=document.createElement('select');
    ui.applyAll=mk('button','Aplicar a quem está sem modelo','secondary fit');ui.applyAll.type='button';
    ui.applyAll.onclick=function(){
      if(!ui.all.value)return say('Escolha a modelo primeiro.');
      var n=0;queue.forEach(function(it){if(it.mode==='frame'&&!it.modelId){it.modelId=ui.all.value;n++;}});
      persist();renderQueue();say(n?('Modelo aplicada em '+n+' vídeo(s).'):'Ninguém estava sem modelo.');
    };
    all.append(mk('span','Mesma modelo para vários?','lab'),ui.all,ui.applyAll);add.append(all);
    sec.append(add);

    var qc=mk('div',null,'card');qc.append(mk('h2','2. Sua fila'));ui.list=mk('div');qc.append(ui.list);
    ui.cost=mk('p',null,'muted');qc.append(ui.cost);
    var ra=mk('div',null,'rowf');
    ui.gen=mk('button','Gerar fila','primary fit');ui.gen.type='button';ui.gen.onclick=generate;
    ui.clear=mk('button','Limpar fila','secondary fit');ui.clear.type='button';ui.clear.onclick=function(){if(!queue.length)return;dropItems(queue.slice());};
    ui.srv=mk('button','Gerar no servidor (pode fechar a aba)','secondary fit');ui.srv.type='button';ui.srv.hidden=true;ui.srv.onclick=function(){generate(true);};
    ra.append(ui.gen,ui.srv,ui.clear);qc.append(ra);ui.msg=mk('p',null,'muted');qc.append(ui.msg);ui.srvBox=mk('div',null,'qitem');ui.srvBox.hidden=true;qc.append(ui.srvBox);sec.append(qc);

    var pc=mk('div',null,'card');pc.append(mk('h2','3. Andamento'));
    ui.stats=mk('div',null,'stats');ui.stats.textContent='Nenhuma geração em andamento.';
    var bar=mk('div',null,'qbar');ui.fill=mk('i');bar.append(ui.fill);
    var rb=mk('div',null,'rowf');
    var pause=mk('button','Pausar novos envios','secondary fit');pause.type='button';pause.onclick=function(){if(typeof activeBatch!=='undefined'&&activeBatch){pauseRequested=true;say('Pausando. Vídeos já enviados continuam na Higgsfield.');}else say('Nada em andamento.');};
    var go=mk('button','Ver em Meus lotes','secondary fit');go.type='button';go.onclick=function(){view('batches');};
    var csv=mk('button','Baixar progresso (.csv)','secondary fit');csv.type='button';csv.onclick=function(){var b=q('#csv-btn');if(b)b.click();else say('Abra Meus lotes e use Exportar CSV.');};
    rb.append(pause,go,csv);pc.append(ui.stats,bar,rb);sec.append(pc);
    var sc=mk('div',null,'card');sc.append(mk('h2','4. Gasto'));ui.spend=mk('div');sc.append(ui.spend);sec.append(sc);
    var foot=q('main>footer');if(foot)main.insertBefore(sec,foot);else main.append(sec);

    var nav=q('nav');
    if(nav&&!q('nav [data-view="fila"]')){
      var b=document.createElement('button');b.dataset.view='fila';b.type='button';
      b.append(document.createTextNode('☰ '),mk('span','Fila de produção'));var i=mk('i','0');i.id='fila-badge';b.append(i);
      b.onclick=function(){view('fila');};
      var first=nav.querySelector('[data-view="studio"]');if(first)first.after(b);else nav.prepend(b);
    }
    modelOptions(ui.all,'');renderQueue();renderSpend();
  }

  function addFiles(list){
    if(typeof loaded!=='undefined'&&!loaded)return say('Aguarde a biblioteca carregar.');
    var n=0;
    list.forEach(function(f){
      if(!f.type.startsWith('video/'))return;
      queue.push({id:crypto.randomUUID(),file:f,name:f.name,state:'pending',mode:'frame',modelId:'',target:'the main person',cast:[{modelId:'',target:''}],auto:true});n++;
    });
    if(!n)return say('Escolha arquivos de vídeo.');
    if(queue.length>300){queue.length=300;say('A fila aceita até 300 vídeos.');}
    renderQueue();pump();
  }

  /* ---------- ver e aprovar o quadro editado ---------- */
  async function editQ(context,source){
    var job={attemptId:crypto.randomUUID(),status:'submitting'};
    Object.assign(job,await testAPI('edit-frame',{attemptId:job.attemptId,modelId:context.modelId,frameMediaId:source.originalFrameId,editPrompt:context.editPrompt,target:context.target,cast:context.cast,outfit:context.outfit,ratio:source.frameRatio}));
    Object.assign(job,await pollRequest(job,function(r){}));
    if(job.status!=='completed'||!job.imageUrl)throw Error('A edição do quadro não foi concluída.');
    return job;
  }
  function outfitOf(it){if(!it.outfitOn)return undefined;var t=(it.outfitText||'').trim();if(!it.outfitMediaId&&!t)return undefined;var o={text:t,prompt:window.fsOutfit?window.fsOutfit.prompt():undefined};if(it.outfitMediaId)o.mediaId=it.outfitMediaId;return o;}
  function sigOf(it){return JSON.stringify([it.mode,it.modelId,it.mode==='multi'?'':(it.target||''),it.mode==='multi'?(it.cast||[]).map(function(p){return [p.modelId,(p.target||'').trim()];}):null,it.outfitOn?[it.outfitMediaId||'',(it.outfitText||'').trim()]:null]);}
  function previewOk(it){return !!(it._pv&&it._pv.job&&it._pv.approved&&it._pv.sig===sigOf(it)&&(it.mode==='frame'?!it.frameMediaId:(it.mode==='multi'&&it.useFrame)));}
  async function makePreview(it){
    if(it.state!=='ready')return say('Aguarde o envio terminar.');
    if(!it.originalFrameId)return say('Este vídeo ainda não tem o primeiro quadro. Aguarde o envio.');
    var cast=null;
    if(it.mode==='multi'){
      cast=(it.cast||[]).map(function(p){return {modelId:p.modelId,target:(p.target||'').trim()};});
      if(!cast.length||cast.some(function(p){return !p.modelId||!p.target;}))return say('Escolha a modelo e descreva cada pessoa antes.');
    }else if(!it.modelId)return say('Escolha a modelo primeiro.');
    if(typeof testConnected!=='undefined'&&!testConnected)return say('Conecte a Higgsfield primeiro.');
    if(!await askConfirm('Editar o primeiro quadro desta linha por cerca de US$ 0,04? Nenhum vídeo será gerado agora.','Ver quadro'))return;
    var pv=it._pv={status:'busy',sig:sigOf(it),text:'Editando o quadro…'};renderQueue();
    try{
      var ctx={modelId:cast?cast[0].modelId:it.modelId,editPrompt:(q('#frame-edit-prompt').value||'').trim()||defaultImagePrompt,target:it.target||'the main person',cast:cast||undefined,outfit:outfitOf(it)};
      pv.job=await editQ(ctx,{originalFrameId:it.originalFrameId,frameRatio:it.frameRatio});
      pv.status='ready';
    }catch(e){pv.status='error';pv.text=(e&&e.message)||'Falha ao editar o quadro.';}
    renderQueue();
  }
  /* quadro original com o ponto vermelho (clique na pessoa a substituir) */
  var DOTS=['#ff2d2d','#2d8bff','#ffb12d','#a22dff'];
  var pcss=document.createElement('style');
  pcss.textContent='#fila .pvwrap{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0}#fila .pvcol{flex:1 1 220px;min-width:200px;display:flex;flex-direction:column;gap:8px}#fila .pvcol canvas,#fila .pvcol img{max-width:100%;max-height:340px;width:auto;height:auto;border-radius:8px;display:block;align-self:flex-start}#fila .pvcol canvas{cursor:crosshair}#fila .pvtag{align-self:flex-start;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line,#555)}#fila .pvnote{font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid var(--line,#555)}';
  document.head.append(pcss);
  (function(){var fx=document.createElement('script');fx.src='faces.js';document.body.append(fx);})();
  window.addEventListener('fs-faces-ready',function(){if(ui.list)renderQueue();});
  var MARKTXT=/^a pessoa que est. .*% da altura\)( \[rosto \d+ de \d+\])?$/;
  function rrect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function drawMarks(it){
    var cv=it._frCv;if(!cv||!it._frBase)return;
    var ctx=cv.getContext('2d');ctx.putImageData(it._frBase,0,0);
    var W=cv.width,H=cv.height,rad=Math.max(16,W*.04),m=it.marks||{},lw=Math.max(2,W*.006);
    (it._faces||[]).forEach(function(f){
      rrect(ctx,f.x*W,f.y*H,f.w*W,f.h*H,lw*3);ctx.lineWidth=lw*2;ctx.strokeStyle='rgba(0,0,0,.45)';ctx.stroke();
      ctx.lineWidth=lw;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();
    });
    Object.keys(m).forEach(function(k){
      var pt=m[k];if(!pt)return;
      if(it.mode!=='multi'&&Number(k)>0)return;
      var col=DOTS[Number(k)%DOTS.length],x=pt.x*W,y=pt.y*H;
      if(pt.b){
        var bx=pt.b[0]*W,by=pt.b[1]*H,bw=pt.b[2]*W,bh=pt.b[3]*H,pad=Math.max(4,bw*.12);
        rrect(ctx,bx-pad,by-pad,bw+pad*2,bh+pad*2,lw*4);ctx.lineWidth=lw*4;ctx.strokeStyle='#fff';ctx.stroke();ctx.lineWidth=lw*2.4;ctx.strokeStyle=col;ctx.stroke();
        x=bx+bw/2;y=Math.max(rad*.8,by-pad-rad*.75);rad=Math.max(12,W*.03);
      }
      ctx.beginPath();ctx.arc(x,y,rad,0,7);ctx.fillStyle=col;ctx.fill();
      ctx.lineWidth=Math.max(3,rad*.3);ctx.strokeStyle='#fff';ctx.stroke();
      if(it.mode==='multi'){ctx.fillStyle='#fff';ctx.font='bold '+Math.round(rad*1.1)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(Number(k)+1),x,y+1);}
      rad=Math.max(16,W*.04);
    });
  }
  function frameMsg(it){
    var F=window.fsFaces,n=it.marks?Object.keys(it.marks).length:0,t;
    if(!F||it._faces===undefined)t='Procurando rostos…';
    else if(it._faces===null)t='Detector de rostos indisponível agora: a marca fica no ponto clicado.';
    else if(!it._faces.length)t='Nenhum rosto encontrado neste quadro: a marca fica no ponto clicado.';
    else t=it._faces.length+' rosto(s) encontrado(s). Clique no rosto de quem será trocado.';
    return (n?'Marcado: a marca colorida mostra quem será trocado. ':'')+t;
  }
  function findFaces(it){
    var F=window.fsFaces;if(!F||it._facesBusy||it._faces!==undefined||!it._frBase)return;
    it._facesBusy=true;
    var c=document.createElement('canvas');c.width=it._frBase.width;c.height=it._frBase.height;c.getContext('2d').putImageData(it._frBase,0,0);
    F.detect(c).then(function(list){it._faces=list;it._facesBusy=false;drawMarks(it);if(it._frMsg)it._frMsg.textContent=frameMsg(it);});
  }
  function frameBox(it){
    var box=mk('div',null,'pvcol');
    box.append(mk('b','Vídeo original · clique no rosto de quem será trocado'));
    if(!it.file){box.append(mk('span','Para marcar, escolha este vídeo de novo (a fila restaurada não guarda o arquivo).','qst'));return box;}
    if(!it._frCv){
      if(!it._frBusy){
        it._frBusy=true;
        extractFrame(it.file,it.frameAt||.001).then(function(f){return createImageBitmap(f.blob);}).then(function(bm){
          var sc=Math.min(1,900/Math.max(bm.width,bm.height)),cv=document.createElement('canvas');
          cv.width=Math.round(bm.width*sc);cv.height=Math.round(bm.height*sc);
          cv.getContext('2d').drawImage(bm,0,0,cv.width,cv.height);
          it._frBase=cv.getContext('2d').getImageData(0,0,cv.width,cv.height);it._frCv=cv;
          cv.onclick=function(e){
            var r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
            var multi=it.mode==='multi',idx=multi?Math.max(0,Math.min(it._who||0,(it.cast||[]).length-1)):0;
            var F=window.fsFaces,hit=(F&&it._faces&&it._faces.length)?F.pick(it._faces,x,y):-1,mark,tx;
            if(hit>=0){var f=it._faces[hit];mark={x:f.cx,y:f.cy,b:[f.x,f.y,f.w,f.h]};tx=place(f.cx,f.cy)+' [rosto '+(hit+1)+' de '+it._faces.length+']';}
            else{mark={x:x,y:y};tx=place(x,y);}
            (it.marks=it.marks||{})[idx]=mark;
            if(multi){
              if(it.cast&&it.cast[idx])it.cast[idx].target=tx;
              for(var k=0;k<(it.cast||[]).length;k++){if(!it.marks[k]){it._who=k;break;}}
            }else it.target=tx;
            persist();renderQueue();
          };
          renderQueue();
        }).catch(function(){it._frBusy=false;it._frFail=true;renderQueue();});
      }
      box.append(mk('span',it._frFail?'Não foi possível mostrar o quadro deste vídeo.':'Carregando o primeiro quadro…','qst'));
      return box;
    }
    var bar=mk('div',null,'rowf');
    if(it.mode==='multi'&&it.cast&&it.cast.length>1){
      var who=document.createElement('select');
      it.cast.forEach(function(p,k){who.add(new Option('Marcar a pessoa '+(k+1),String(k)));});
      who.value=String(Math.min(it._who||0,it.cast.length-1));who.onchange=function(){it._who=Number(who.value);};
      bar.append(who);
    }
    if(it.marks&&Object.keys(it.marks).length){
      var clr=mk('button','Limpar marcas','secondary fit');clr.type='button';
      clr.onclick=function(){
        it.marks={};it._who=0;
        if(it.mode==='multi')(it.cast||[]).forEach(function(p){if(MARKTXT.test(p.target||''))p.target='';});
        else if(MARKTXT.test(it.target||''))it.target='the main person';
        persist();renderQueue();
      };
      bar.append(clr);
    }
    if(bar.childNodes.length)box.append(bar);
    findFaces(it);drawMarks(it);box.append(it._frCv);
    it._frMsg=mk('span',frameMsg(it),'qst');box.append(it._frMsg);
    return box;
  }
  function previewBox(it){
    var wrap=mk('div',null,'pvwrap'),left=frameBox(it),right=mk('div',null,'pvcol');
    var pv=it._pv&&it._pv.sig===sigOf(it)?it._pv:null,stale=!!(it._pv&&it._pv.status==='ready'&&it._pv.sig!==sigOf(it));
    right.append(mk('b','Frame editado · confira rosto, roupa e outras pessoas'));
    if(!pv||pv.status==='error'){
      right.append(mk('span',stale?'Frame pendente':'Sem frame ainda','pvtag'));
      if(stale)right.append(mk('div','As referências ou o alvo mudaram. Gere outro frame.','pvnote'));
      var b=mk('button',stale?'Gerar novo frame (cerca de US$ 0,04)':'Ver quadro editado (cerca de US$ 0,04)','secondary fit');b.type='button';b.onclick=function(){makePreview(it);};right.append(b);
      if(pv)right.append(mk('span',pv.text,'qst bad'));
    }else if(pv.status==='busy'){
      right.append(mk('span','Editando o quadro…','pvtag'),mk('span',pv.text,'qst'));
    }else{
      right.append(mk('span',pv.approved?'Frame aprovado':'Frame gerado','pvtag'));
      var img=document.createElement('img');img.src=pv.job.imageUrl;img.alt='Quadro editado';right.append(img);
      var lb=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.checked=!!pv.approved;cb.onchange=function(){pv.approved=cb.checked;renderQueue();};
      lb.append(cb,document.createTextNode(' Conferi a identidade, a roupa, o alvo e as outras pessoas neste frame'));right.append(lb);
      var re=mk('button','Gerar novo frame (cerca de US$ 0,04)','secondary fit');re.type='button';re.onclick=function(){it._pv=null;makePreview(it);};right.append(re);
    }
    if(left)wrap.append(left);wrap.append(right);
    return wrap;
  }

  function outfitBox(it){
    var box=mk('div',null,'rowf');
    var lb=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.checked=!!it.outfitOn;
    cb.onchange=function(){it.outfitOn=cb.checked;persist();renderQueue();};
    lb.append(cb,document.createTextNode('Trocar a roupa (opcional)'));lb.style.cssText='flex:0 0 100%;display:flex;align-items:center;justify-content:flex-start;gap:8px';cb.style.cssText='flex:0 0 auto;width:auto;margin:0';box.append(lb);
    if(!it.outfitOn)return box;
    var fi=document.createElement('input');fi.type='file';fi.accept=IMG.join(',');
    fi.onchange=async function(){
      var f=fi.files[0];if(!f)return;
      if(IMG.indexOf(f.type)<0||f.size>4*1048576){fi.value='';return say('A foto da roupa deve ser PNG, JPEG ou WebP de até 4 MB.');}
      it._outfitPending=true;it.outfitMediaId='';renderQueue();
      try{var m=await uploadMedia(f,f.name);it.outfitMediaId=m.id;it.outfitName=f.name;}
      catch(e){say(e.message||'Não foi possível enviar a foto da roupa.');}
      it._outfitPending=false;persist();renderQueue();
    };
    var tx=document.createElement('input');tx.maxLength=300;tx.placeholder='Descreva a roupa. Ex.: vestido vermelho de seda';tx.value=it.outfitText||'';
    tx.oninput=function(){it.outfitText=tx.value;persist();};
    box.append(mk('span','Foto da roupa (opcional se você descrever)','lab'),fi);
    if(it._outfitPending)box.append(mk('span','Enviando a foto da roupa…','qst'));
    else if(it.outfitMediaId){box.append(mk('span','Roupa enviada'+(it.outfitName?': '+it.outfitName:''),'qst'));var rm=mk('button','Tirar a foto','secondary fit');rm.type='button';rm.onclick=function(){it.outfitMediaId='';it.outfitName='';persist();renderQueue();};box.append(rm);}
    box.append(tx);
    return box;
  }

  function renderRow(it,i){
    var row=mk('div',null,'qitem');
    var head=mk('div',null,'qhead');head.append(mk('b',(i+1)+'. '+it.name));
    var hb=mk('div',null,'rowf');
    var dup=mk('button','Duplicar','secondary fit');dup.type='button';
    dup.onclick=function(){
      if(it.state!=='ready')return say('Aguarde o envio terminar para duplicar.');
      var c={};Object.keys(it).forEach(function(k){if(k!=='file'&&k[0]!=='_')c[k]=it[k];});c.id=crypto.randomUUID();c.cast=JSON.parse(JSON.stringify(it.cast||[{modelId:'',target:''}]));c.marks=JSON.parse(JSON.stringify(it.marks||{}));c.file=it.file;
      var at=queue.indexOf(it);queue.splice(at<0?queue.length:at+1,0,c);persist();renderQueue();
    };
    var rm=mk('button','Remover','secondary fit');rm.type='button';rm.onclick=function(){dropItems([it]);};
    hb.append(dup,rm);head.append(hb);row.append(head);
    it._st=mk('div',null,'qst');row.append(it._st);setSt(it,it.state==='ready'||it.state==='error'?infoText(it):(it._text||'Aguardando envio…'),it.state==='error');

    var t=document.createElement('select');t.add(new Option('Com primeiro frame','frame'));t.add(new Option('Troca direta','direct'));t.add(new Option('Várias pessoas','multi'));t.value=it.mode;
    t.onchange=function(){it.mode=t.value;if(it.mode==='multi'&&it.useFrame==null)it.useFrame=true;persist();renderQueue();};
    var r1=mk('div',null,'rowf');r1.append(t);row.append(r1);
    row.append(outfitBox(it));

    if(it.mode==='multi'){
      (it.cast=it.cast&&it.cast.length?it.cast:[{modelId:'',target:''}]).forEach(function(p,k){
        var r=mk('div',null,'rowf'),sel=document.createElement('select'),inp=document.createElement('input');
        modelOptions(sel,p.modelId);sel.onchange=function(){p.modelId=sel.value;persist();};
        inp.maxLength=200;inp.placeholder='Clique no rosto, no quadro abaixo, ou descreva. Ex.: a mulher à direita, top preto';inp.value=p.target;inp.oninput=function(){p.target=inp.value;if(it.marks&&it.marks[k]){delete it.marks[k];drawMarks(it);}persist();};
        r.append(sel,inp);
        if(it.cast.length>1){var x=mk('button','Remover pessoa','secondary fit');x.type='button';x.onclick=function(){it.cast.splice(k,1);var nm={};Object.keys(it.marks||{}).forEach(function(j){j=Number(j);if(j<k)nm[j]=it.marks[j];else if(j>k)nm[j-1]=it.marks[j];});it.marks=nm;it._who=0;persist();renderQueue();};r.append(x);}
        row.append(r);
      });
      if(it.cast.length<4){var ap=mk('button','+ Adicionar pessoa','secondary');ap.type='button';ap.onclick=function(){it.cast.push({modelId:'',target:''});persist();renderQueue();};row.append(ap);}
      /* Primeiro quadro do fluxo multi: editado pela IA, enviado por você (já com 1 ou mais pessoas trocadas) ou nenhum. */
      var choice=it.frameMediaId||it.frameChoice==='manual'?'manual':(it.useFrame?'auto':'none');
      var rq=mk('div',null,'rowf'),fs=document.createElement('select');
      fs.setAttribute('aria-label','Primeiro quadro');
      fs.add(new Option('Primeiro quadro: editar automaticamente (cerca de US$ 0,04)','auto'));
      fs.add(new Option('Primeiro quadro: enviar o meu, já editado','manual'));
      fs.add(new Option('Sem primeiro quadro','none'));
      fs.value=choice;
      fs.onchange=function(){
        it.frameChoice=fs.value;it.useFrame=fs.value==='auto';
        if(fs.value!=='manual'){delete it.frameMediaId;delete it.frameName;}
        it.auto=fs.value!=='manual';persist();renderQueue();
      };
      rq.append(fs);row.append(rq);
      if(choice==='manual'){
        var rm2=mk('div',null,'rowf'),mfi=document.createElement('input');mfi.type='file';mfi.accept=IMG.join(',');
        mfi.setAttribute('aria-label','Primeiro quadro editado');
        mfi.onchange=async function(){
          var f=mfi.files[0];if(!f)return;
          if(IMG.indexOf(f.type)<0||f.size>4*1048576){mfi.value='';return say('O quadro deve ser PNG, JPEG ou WebP de até 4 MB.');}
          try{it._framePending=true;setSt(it,'Enviando o quadro…');var m=await uploadMedia(f,f.name);it.frameMediaId=m.id;it.frameName=f.name;it.frameChoice='manual';it.useFrame=false;it.auto=false;}
          catch(e){say(e.message||'Não foi possível enviar o quadro.');}
          finally{it._framePending=false;persist();refreshInfo(it);refreshCost();}
        };
        rm2.append(mk('span',it.frameMediaId?'Trocar o quadro:':'Quadro editado:','lab'),mfi);row.append(rm2);
        row.append(mk('p','Envie o primeiro quadro com as pessoas já trocadas (1 ou 2). Liste acima só as pessoas que aparecem trocadas no quadro; as outras continuam como no vídeo.','muted'));
      }
      if(choice==='auto')row.append(previewBox(it));else{var fw=mk('div',null,'pvwrap');fw.append(frameBox(it));row.append(fw);}
    }else{
      var r2=mk('div',null,'rowf'),ms=document.createElement('select'),tg=document.createElement('input');
      modelOptions(ms,it.modelId);ms.onchange=function(){it.modelId=ms.value;persist();};
      tg.maxLength=200;tg.value=it.target||'';tg.placeholder='Clique no rosto, no quadro abaixo, ou descreva quem será trocado';tg.oninput=function(){it.target=tg.value;if(it.marks&&it.marks[0]){delete it.marks[0];drawMarks(it);}persist();};
      r2.append(ms,tg);row.append(r2);
      var r3=mk('div',null,'rowf');if(it.mode==='frame')r3.append(mk('span','Quadro seu (opcional)','lab'));
      var fi=document.createElement('input');fi.type='file';fi.accept=IMG.join(',');
      fi.onchange=async function(){
        var f=fi.files[0];if(!f)return;
        if(IMG.indexOf(f.type)<0||f.size>4*1048576){fi.value='';return say('O quadro deve ser PNG, JPEG ou WebP de até 4 MB.');}
        try{setSt(it,'Enviando o quadro…');var m=await uploadMedia(f,f.name);it.frameMediaId=m.id;it.frameName=f.name;it.auto=false;persist();refreshInfo(it);refreshCost();}
        catch(e){say(e.message||'Não foi possível enviar o quadro.');refreshInfo(it);}
      };
      if(it.mode==='frame'){r3.append(fi);
      if(it.frameMediaId){var rf=mk('button','Voltar para quadro automático','secondary fit');rf.type='button';rf.onclick=function(){delete it.frameMediaId;delete it.frameName;it.auto=true;persist();renderQueue();};r3.append(rf);}
      row.append(r3);
      if(!it.frameMediaId)row.append(previewBox(it));}
      if(it.mode!=='frame'||it.frameMediaId){var fw2=mk('div',null,'pvwrap');fw2.append(frameBox(it));row.append(fw2);}
    }
    return row;
  }

  function renderQueue(){
    changed();
    if(!ui.list)return;
    modelOptions(ui.all,ui.all.value);
    ui.list.replaceChildren();
    var bd=q('#fila-badge');if(bd)bd.textContent=String(queue.length);
    if(!queue.length)ui.list.append(mk('p','A fila está vazia.','muted'));
    queue.forEach(function(it,i){ui.list.append(renderRow(it,i));});
    refreshCost();
  }
  function isAuto(it){return (it.mode==='frame'&&!it.frameMediaId)||(it.mode==='multi'&&!!it.useFrame);}
  function cost(items){
    var rate=RATE[(q('#resolution')||{}).value]||.05,t=0;
    items.forEach(function(it){if(it.state!=='ready')return;t+=(Math.ceil(it.duration)+it.out)*rate+(isAuto(it)&&!previewOk(it)?.04:0);});
    return t;
  }
  function refreshCost(){
    if(!ui.cost)return;
    var ready=queue.filter(function(x){return x.state==='ready';}).length,pend=queue.filter(function(x){return x.state==='pending'||x.state==='uploading';}).length;
    ui.cost.textContent=queue.length?(ready+' pronto(s)'+(pend?' · '+pend+' enviando':'')+' · estimativa US$ '+cost(queue).toFixed(2).replace('.',',')+' (tabela pública, '+((q('#resolution')||{}).value||'480p')+').'):'';
    ui.gen.disabled=!queue.length;
  }

  /* ---------- gerar a fila ---------- */
  function problems(){
    var out=[];
    queue.forEach(function(it,i){
      var n='Linha '+(i+1)+' ('+it.name+'): ';
      if(it.state==='error')out.push(n+it._text);
      else if(it.state!=='ready')out.push(n+'ainda enviando.');
      else if(it._framePending)out.push(n+'ainda enviando o quadro.');
      else if(it._outfitPending)out.push(n+'ainda enviando a foto da roupa.');
      else if(it.outfitOn&&!it.outfitMediaId&&!(it.outfitText||'').trim())out.push(n+'troca de roupa ligada sem foto nem descrição.');
      else if(it.mode!=='multi'){if(!it.modelId)out.push(n+'falta a modelo.');}
      else{
        var c=it.cast||[];
        if(!c.length||c.some(function(p){return !p.modelId||!(p.target||'').trim();}))out.push(n+'falta modelo ou descrição de alguma pessoa.');
        else if(new Set(c.map(function(p){return p.target.trim().toLowerCase();})).size!==c.length)out.push(n+'descreva cada pessoa de forma diferente.');
        else if(it.frameChoice==='manual'&&!it.frameMediaId)out.push(n+'envie o primeiro quadro editado ou escolha outra opção de quadro.');
      }
    });
    return out;
  }
  var generating=false;
  async function generate(server){
    server=server===true;
    if(generating||!queue.length)return;
    if(typeof productionBusy!=='undefined'&&productionBusy)return say('Já há uma geração em andamento. Aguarde terminar ou pause.');
    var pr=problems();
    if(pr.length){ui.msg.textContent=pr.slice(0,6).join(' · ')+(pr.length>6?' · e mais '+(pr.length-6)+'.':'');return say('Ainda há linhas incompletas. Veja abaixo da fila.');}
    if(queue.some(function(x){return x.mode==='direct';})&&!(q('#prompt-direct').value||'').trim()){ui.msg.textContent='Há vídeos com troca direta: preencha o prompt de troca direta em Modificar prompts.';return say('Falta o prompt de troca direta.');}
    ui.msg.textContent='';
    generating=true;ui.gen.disabled=true;
    try{
      var items=queue.slice(),c=cost(items);
      if(!await askConfirm((server?'Enviar ':'Gerar ')+items.length+' vídeo(s) da fila'+(server?' para o servidor? Você pode fechar a aba; o servidor junta a voz original sozinho.':'?')+' Estimativa de US$ '+c.toFixed(2).replace('.',',')+' (tabela pública, sem desconto).'+(server?'':' A aba precisa ficar aberta.'),server?'Enviar ao servidor':'Gerar fila'))return;
      var need=server?[]:items.filter(function(x){return x.mode==='multi'&&x.useFrame&&!previewOk(x);});
      for(var ni=0;ni<need.length;ni++){
        var nx=need[ni];ui.msg.textContent='Editando o quadro '+(ni+1)+' de '+need.length+'…';
        var ncast=nx.cast.map(function(p){return {modelId:p.modelId,target:p.target.trim()};});
        var njob=await editQ({modelId:ncast[0].modelId,editPrompt:(q('#frame-edit-prompt').value||'').trim()||defaultImagePrompt,target:'',cast:ncast,outfit:outfitOf(nx)},{originalFrameId:nx.originalFrameId,frameRatio:nx.frameRatio});
        nx._pv={status:'ready',sig:sigOf(nx),job:njob,approved:true};
      }
      ui.msg.textContent='';
      items=items.filter(function(x){return queue.indexOf(x)>=0&&!x._removed;});
      if(!items.length){say('Todos os vídeos foram removidos da fila. Nada foi gerado.');return;}
      c=cost(items);
      var first=items[0],res=q('#resolution').value,duration=Number(q('#duration').value)||0;
      var autoAny=items.some(isAuto);
      var sources=items.map(function(x){
        var s={name:x.name,size:x.size,type:x.type,duration:x.duration,out:x.out,mediaId:x.mediaId,mode:x.mode,modelId:x.mode==='multi'?x.cast[0].modelId:x.modelId,target:x.mode==='multi'?'':(x.target||'the main person')};
        s.modelName=x.mode==='multi'?x.cast.map(function(p){return modelName(p.modelId);}).join(' + '):modelName(x.modelId);
        if(x.width){s.width=x.width;s.height=x.height;}
        if(x.mode==='multi')s.cast=x.cast.map(function(p){return {modelId:p.modelId,target:p.target.trim()};});
        if(x.mode==='frame'){if(x.frameMediaId)s.frameMediaId=x.frameMediaId;else if(x.originalFrameId){s.originalFrameId=x.originalFrameId;s.frameRatio=x.frameRatio;}}
        if(x.mode==='multi'&&x.frameMediaId&&!x.useFrame)s.frameMediaId=x.frameMediaId;
        if(x.mode==='multi'&&x.useFrame&&x.originalFrameId){s.useFrame=true;s.originalFrameId=x.originalFrameId;s.frameRatio=x.frameRatio;}
        if(previewOk(x)){s.frameJob=x._pv.job;s.originalFrameId=x.originalFrameId;s.frameRatio=x.frameRatio;}
        var of=outfitOf(x);if(of)s.outfit=of;
        return s;
      });
      var names=[];sources.forEach(function(s){s.modelName.split(' + ').forEach(function(n){if(names.indexOf(n)<0)names.push(n);});});
      var data={mode:first.mode,outputs:items.length,duration:duration,resolution:res,ratio:q('#ratio').value,target:sources[0].target||'',
        directPrompt:(q('#prompt-direct').value||'').trim(),framePrompt:(q('#prompt-frame').value||'').trim()||defaultFramePrompt,multiPrompt:(q('#prompt-multi').value||'').trim()||defaultMultiPrompt,basePrompt:(q('#prompt-base').value||'').trim(),editPrompt:(q('#frame-edit-prompt').value||'').trim()||defaultImagePrompt,
        frameMethod:autoAny?'auto':'manual',cast:sources[0].cast||[],engine:'Wan 3.0',generateAudio:true,trim:trimSettings(),modelId:sources[0].modelId,modelName:'Fila · '+names.join(', ').slice(0,60),
        files:sources.map(function(s){return {name:s.name,duration:s.duration,out:s.out};}),rate:RATE[res],estimatedCost:c,estimatedVideoCost:c,estimatedImageCost:0,
        status:'ready',productionStatus:server?'Na fila do servidor':'Pronto para gerar',sources:sources,serverMode:server,serverQueue:server,serverConc:Math.max(1,Math.min(10,parseInt(localStorage.getItem('fs-conc'),10)||3)),
        jobs:sources.map(function(s,i){var jb={attemptId:crypto.randomUUID(),sourceIndex:i,variation:1,status:'prepared'};if(s.mode==='multi'&&s.frameJob)jb.frameJob=s.frameJob;return jb;})};
      var b=await studioApi('POST',{kind:'batch',data:data});
      try{await saveProduction(b);}catch(e){}
      queue=queue.filter(function(x){return items.indexOf(x)<0;});persist();renderQueue();
      await load();
      var live=(typeof batches!=='undefined'?batches:[]).find(function(x){return x.id===b.id;})||b;
      view('batches');
      if(server){say('Enviado ao servidor. Pode fechar a aba; o andamento aparece em Meus lotes.');}
      else window.runProduction(live);
    }catch(e){say(e.message||'Não foi possível gerar a fila.');}
    finally{generating=false;refreshCost();}
  }


  /* ---------- fila no servidor ---------- */
  var srvOn=false;
  function probe(){
    fetch('/api/worker?probe=1',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){srvOn=!!(d&&d.configured);if(ui.srv)ui.srv.hidden=!srvOn;renderServer();}).catch(function(){});
  }
  function serverBatches(){return (typeof batches!=='undefined'?batches:[]).filter(function(b){return b.serverMode&&!b.deleted&&b.jobs;});}
  function setBatch(b,patch){
    Object.assign(b,patch);
    return saveProduction(b).then(function(){renderServer();}).catch(function(){say('Não foi possível salvar agora (o servidor está usando o lote). Tente de novo em alguns segundos.');});
  }
  async function mergeVoices(b){
    if(typeof productionBusy!=='undefined'&&productionBusy)return say('Já há uma geração em andamento neste navegador.');
    var jobs=b.jobs.filter(function(j){return j.status==='completed'&&j.videoPath&&!j.audioMerged;});
    if(!jobs.length)return say('Nenhum vídeo pronto precisa da voz original.');
    if(!await askConfirm('Juntar a voz original em '+jobs.length+' vídeo(s)? Cada um leva o tempo do próprio vídeo e a aba precisa ficar visível.','Juntar'))return;
    var token=crypto.randomUUID(),claim=await studioClient.rpc('frame_claim_production',{p_id:b.id,p_token:token});
    if(claim.error||!claim.data)return say('O servidor está usando este lote agora. Tente de novo em um minuto.');
    b.leaseToken=token;productionBusy=true;activeBatch=b;
    try{
      for(var k=0;k<jobs.length;k++){
        ui.msg.textContent='Juntando a voz '+(k+1)+' de '+jobs.length+'…';
        try{await window.muxOriginalAudio(jobs[k]);}catch(e){jobs[k].audioMergeError=e.message;}
        await saveProduction(b);
      }
      say('Voz original juntada.');
    }catch(e){say(e.message||'Falha ao juntar a voz.');}
    finally{
      ui.msg.textContent='';
      try{await studioClient.rpc('frame_release_production',{p_id:b.id,p_token:token});}catch(e){}
      delete b.leaseToken;productionBusy=false;activeBatch=null;renderServer();
    }
  }
  function renderServer(){
    if(!ui.srvBox)return;
    var list=serverBatches();
    ui.srvBox.replaceChildren();
    if(!list.length){ui.srvBox.hidden=true;return;}
    ui.srvBox.hidden=false;
    ui.srvBox.append(mk('b','Lotes no servidor'));
    list.slice(0,5).forEach(function(b){
      var row=mk('div',null,'rowf'),done=b.jobs.filter(function(j){return j.status==='completed';}).length;
      row.append(mk('span',(b.modelName||'Lote')+' · '+done+'/'+b.jobs.length+' prontos · '+(b.productionStatus||b.status),'qst'));
      if(b.status==='running'||b.status==='ready'){var p=mk('button','Pausar','secondary fit');p.type='button';p.onclick=function(){setBatch(b,{serverQueue:false,status:'paused',productionStatus:'Pausado por você'});};row.append(p);}
      else if(b.status==='paused'&&b.jobs.some(function(j){return ['completed','failed','nsfw','canceled'].indexOf(j.status)<0;})){var rs=mk('button','Retomar no servidor','secondary fit');rs.type='button';rs.onclick=function(){setBatch(b,{serverQueue:true,status:'ready',srvFails:0,productionStatus:'Na fila do servidor'});};row.append(rs);}
      if(b.jobs.some(function(j){return j.status==='completed'&&j.videoPath&&!j.audioMerged;})){var mv=mk('button','Juntar voz original','secondary fit');mv.type='button';mv.onclick=function(){mergeVoices(b);};row.append(mv);}
      ui.srvBox.append(row);
    });
  }
  function anyServerActive(){return serverBatches().some(function(b){return b.serverQueue&&(b.status==='ready'||b.status==='running');});}

  /* ---------- gasto ---------- */
  function jobCost(b,j){
    if(j.priceUsd!=null&&Number.isFinite(Number(j.priceUsd)))return {usd:Number(j.priceUsd),real:true};
    var s=(b.sources||[])[j.sourceIndex]||{};
    return {usd:(Math.ceil(Number(s.duration)||0)+(Number(s.out)||Number(b.duration)||0))*(RATE[b.resolution]||.05),real:false};
  }
  function spent(b){
    var r={n:0,real:0,usd:0};
    (b.jobs||[]).forEach(function(j){if(j.status==='completed'){var c=jobCost(b,j);r.n++;r.usd+=c.usd;if(c.real)r.real++;}});
    return r;
  }
  function renderSpend(){
    if(!ui.spend)return;
    var months={};
    (typeof batches!=='undefined'?batches:[]).forEach(function(b){
      if(b.deleted||!b.jobs)return;
      var d=new Date(b.created||'');if(isNaN(d))return;
      var key=String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(),m=months[key]||(months[key]={n:0,real:0,usd:0,t:d.getFullYear()*100+d.getMonth()});
      var s=spent(b);m.n+=s.n;m.real+=s.real;m.usd+=s.usd;
    });
    var keys=Object.keys(months).sort(function(a,b){return months[b].t-months[a].t;});
    ui.spend.replaceChildren();
    if(!keys.length){ui.spend.append(mk('p','Nenhuma geração ainda.','muted'));return;}
    keys.slice(0,6).forEach(function(k){
      var m=months[k],r=mk('div',null,'qitem');
      r.append(mk('b',k+' · '+m.n+' vídeo(s) · US$ '+m.usd.toFixed(2).replace('.',',')));
      r.append(mk('small',m.real===m.n?'Preço da conta Higgsfield.':(m.real?m.real+' com preço da conta, o resto pela tabela pública.':'Estimado pela tabela pública (sem desconto). Os próximos lotes já guardam o preço da conta.'),'qst'));
      ui.spend.append(r);
    });
  }

  /* ---------- andamento ---------- */
  function tick(){
    if(!ui.stats)return;
    var b=(typeof activeBatch!=='undefined')?activeBatch:null;
    if(!b||!b.jobs){return;}
    var t=b.jobs.length,done=0,fail=0,live=0;
    b.jobs.forEach(function(j){if(j.status==='completed')done++;else if(['failed','nsfw','canceled'].indexOf(j.status)>=0)fail++;else if(j.requestId)live++;});
    ui.stats.textContent=t+' no lote · '+(t-done-fail-live)+' aguardando · '+live+' em andamento · '+done+' concluído(s) · '+fail+' com falha';
    ui.fill.style.width=Math.round((done+fail)/Math.max(1,t)*100)+'%';
    var sp=spent(b);if(sp.n)ui.stats.textContent+=' · gasto até agora: US$ '+sp.usd.toFixed(2).replace('.',',')+(sp.real===sp.n?' (preço da conta)':' (estimado)');
  }

  /* ---------- barras de progresso dos lotes no servidor (Meus lotes) ---------- */
  var seenAt={};
  function srvState(j){
    var bad=['failed','nsfw','canceled'].indexOf(j.status)>=0;
    if(bad)return {f:1,bad:true,l:'Falhou'};
    if(j.status==='completed')return j.videoPath?{f:1,l:'Pronto'}:{f:.96,l:'Guardando'};
    var id=j.requestId||j.attemptId||'x';
    if(j.requestId&&j.status==='in_progress'){
      if(!seenAt[id])seenAt[id]=Date.now();
      var t=(Date.now()-seenAt[id])/1000;
      return {f:Math.min(.95,.25+.70*(1-Math.exp(-t/90))),l:'Gerando'};
    }
    if(j.requestId)return {f:.12,l:'Na fila da Higgsfield'};
    if(j.stage==='frame'||(j.frameJob&&j.frameJob.requestId))return {f:.06,l:'Editando o quadro'};
    return {f:0,l:'Aguardando o servidor'};
  }
  function paintServer(){
    if(typeof visibleBatches!=='function')return;
    var list=visibleBatches(),cards=[].slice.call(document.querySelectorAll('#batch-list .batch-card'));
    cards.forEach(function(card,i){
      var b=list[i];
      if(!b||!b.serverMode||!b.jobs||!b.jobs.length)return;
      var box=card.querySelector('.srvbars');
      if(!box){
        box=mk('div',null,'pbars srvbars');
        b.jobs.forEach(function(j,k){var r=mk('div',null,'pbar'),l=mk('span','Vídeo '+(k+1)),t=mk('div',null,'tr'),f=mk('i'),p=mk('b','0%');t.append(f);r.append(l,t,p);box.append(r);});
        var ra=card.querySelector('.row-actions');card.insertBefore(box,ra||null);
      }
      [].slice.call(box.children).forEach(function(r,k){
        var j=b.jobs[k];if(!j)return;
        var s=srvState(j),pct=Math.round(s.f*100);
        r.classList.toggle('err',!!s.bad);
        r.querySelector('i').style.width=pct+'%';
        r.querySelector('b').textContent=s.bad?'Falhou':pct+'%';
        r.querySelector('span').textContent='Vídeo '+(k+1)+' · '+s.l;
      });
    });
  }
  setInterval(paintServer,1000);

  var origView=window.view;
  if(typeof origView==='function'){
    window.view=function(id){origView(id);if(id==='fila'){var c=q('#crumb');if(c)c.textContent='Fila de produção';if(ui.list)renderQueue();}};
  }
  window.addEventListener('beforeunload',function(e){if(queue.some(function(x){return x.state==='pending'||x.state==='uploading';})){e.preventDefault();e.returnValue='';}});
  function addSpecs(specs){
    var n=0;
    specs.forEach(function(sp){
      if(!sp.file||queue.length>=300)return;
      var it={id:crypto.randomUUID(),file:sp.file,name:sp.file.name,state:'pending',mode:sp.mode,modelId:sp.modelId||'',target:sp.target||'the main person',cast:sp.cast&&sp.cast.length?JSON.parse(JSON.stringify(sp.cast)):[{modelId:'',target:''}],auto:true,useFrame:sp.mode==='multi'?(!sp.frameFile&&sp.useFrame!==false):false};
      if(sp.frameFile){
        it._framePending=true;it.auto=false;if(sp.mode==='multi')it.frameChoice='manual';
        uploadMedia(sp.frameFile,sp.frameFile.name).then(function(m){it.frameMediaId=m.id;it.frameName=sp.frameFile.name;it._framePending=false;persist();refreshInfo(it);refreshCost();})
          .catch(function(e){it._framePending=false;it.auto=true;say((e&&e.message)||(it.mode==='multi'?'Não foi possível enviar o quadro. Envie de novo na fila.':'Não foi possível enviar o quadro. Ele será editado automaticamente.'));refreshInfo(it);});
      }
      queue.push(it);n++;
    });
    renderQueue();pump();
    return n;
  }
  window.fsQueue={add:addSpecs,count:function(){return queue.length;},generate:function(){return generate();},open:function(){view('fila');}};
  window.dispatchEvent(new Event('fs-queue-ready'));
  function boot(){build();}
  setTimeout(restoreFiles,300);
  boot();
  setInterval(function(){boot();tick();},1000);
  setTimeout(probe,1500);
  setInterval(function(){if(document.visibilityState==='visible'&&anyServerActive()&&!(typeof productionBusy!=='undefined'&&productionBusy)){try{load().then(renderServer);}catch(e){}}},15000);
  setInterval(renderServer,5000);
  /* atualizacao instantanea: o Supabase avisa quando o servidor grava o lote (o intervalo de 15 s fica de reserva) */
  var rtTimer=null,rtOn=false;
  function rtRefresh(){
    clearTimeout(rtTimer);
    rtTimer=setTimeout(function(){
      if(document.visibilityState!=='visible'||(typeof productionBusy!=='undefined'&&productionBusy))return;
      try{load().then(renderServer);}catch(e){}
    },700);
  }
  function rtStart(){
    if(rtOn||typeof studioClient==='undefined'||!studioClient||!studioClient.channel)return;
    rtOn=true;
    try{
      studioClient.channel('fs-lotes').on('postgres_changes',{event:'*',schema:'public',table:'frame_library'},function(){if(anyServerActive())rtRefresh();}).subscribe();
    }catch(e){rtOn=false;}
  }
  setInterval(rtStart,4000);
  setInterval(renderSpend,5000);
})();
