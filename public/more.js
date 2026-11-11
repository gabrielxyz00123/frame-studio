/* Geração em paralelo: vários vídeos ao mesmo tempo, com gravação em fila. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  var KEY='fs-conc',BASE={prepare:.03,frame:.05,submit:.08,queued:.10,in_progress:.25,completed:.96,archive:.96};
  function getConc(){var n=0;try{n=parseInt(localStorage.getItem(KEY),10);}catch(e){}return n>=1&&n<=40?n:2;}
  var css=document.createElement('style');
  css.textContent='#conc-box{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;color:var(--c3)}#conc-box select{width:auto;margin-left:8px}#conc-box small{display:block;margin-top:6px}'
  +'.pbars{max-width:720px;margin:18px auto}.pbar{display:grid;grid-template-columns:150px 1fr 56px;gap:14px;align-items:center;margin:10px 0;font-size:14px}.pbar span{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pbar .tr{height:22px;border-radius:12px;border:1px solid var(--c4);background:var(--line);overflow:hidden}.pbar i{display:block;height:100%;background:linear-gradient(90deg,var(--c95),var(--c4));transition:width .4s}.pbar b{text-align:right;font-weight:700;color:var(--c4)}.pbar.err .tr{border-color:#dc2626}.pbar.err i{background:#dc2626}.pbar.err b{color:#dc2626}'
  +'@media(max-width:700px){.pbar{grid-template-columns:96px 1fr 48px;gap:8px;font-size:12px}}';
  document.head.append(css);

  function initConc(){
    if(q('#conc-box'))return;
    var anchor=q('#test-heading');if(!anchor)return;
    var box=mk('div');box.id='conc-box';
    box.append(document.createTextNode('Vídeos ao mesmo tempo'));
    var s=document.createElement('select');s.id='conc';
    [1,2,3,5,10,20,40].forEach(function(n){s.add(new Option(String(n),String(n)));});
    s.value=String(getConc());
    s.onchange=function(){try{localStorage.setItem(KEY,s.value);}catch(e){}};
    box.append(s,mk('small','Mais vídeos ao mesmo tempo termina antes, mas gasta o saldo mais rápido e pode atingir o limite de pedidos da Higgsfield. Se atingir, o site espera e tenta de novo. Vale para o próximo lote ou ao retomar.'));
    anchor.before(box);
  }

  var st={},running=false,barTimer=null,activeTau=90;
  /* Aprende o tempo real de geração deste usuário e ajusta a curva da barra.
     A Higgsfield não informa porcentagem; guardamos o tempo medido de cada vídeo
     concluído (por resolução + duração) e usamos a mediana para estimar melhor. */
  function tauKey(b,src0){return (b.resolution||'')+'|'+(Number(b.duration)||Number(src0&&src0.out)||5);}
  function loadSamples(key){try{var o=JSON.parse(localStorage.getItem('fs-gentimes')||'{}');var a=o[key];return Array.isArray(a)?a.filter(function(x){return typeof x==='number'&&x>0;}):[];}catch(e){return [];}}
  function saveSample(key,secs){try{var o=JSON.parse(localStorage.getItem('fs-gentimes')||'{}');var a=Array.isArray(o[key])?o[key]:[];a.push(Math.round(secs));if(a.length>10)a=a.slice(-10);o[key]=a;localStorage.setItem('fs-gentimes',JSON.stringify(o));}catch(e){}}
  function median(a){if(!a.length)return 0;var s=a.slice().sort(function(x,y){return x-y;});var m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
  function fallbackTau(b,src0){return 45+6*((Number(b.duration)||Number(src0&&src0.out)||5)+(Number(src0&&src0.duration)||3));}
  function estimateTau(b,src0){var a=loadSamples(tauKey(b,src0));if(a.length>=2){return Math.max(20,Math.min(600,median(a)/2.6));}return fallbackTau(b,src0);}
  function frac(i,j){
    if(j.status==='completed'||['failed','nsfw','canceled'].indexOf(j.status)>=0)return 1;
    var s=st[i];if(!s)return 0;
    var t=(Date.now()-s.t)/1000;
    if(s.stage==='queued')return .10+.15*(1-Math.exp(-t/20));
    if(s.stage==='in_progress')return .25+.70*(1-Math.exp(-t/activeTau));
    return BASE[s.stage]||0;
  }
  var LABEL={prepare:'Preparando',frame:'Editando quadro',submit:'Enviando',queued:'Na fila',in_progress:'Gerando',archive:'Guardando',completed:'Guardando'};
  function paintBars(){
    if(!running||typeof activeBatch==='undefined'||!activeBatch)return;
    var b=activeBatch;
    var cards=[].slice.call(document.querySelectorAll('#batch-list .batch-card'));
    var card=cards.find(function(c){return [].slice.call(c.querySelectorAll('button')).some(function(x){return /Paus/.test(x.textContent);});});
    if(!card)return;
    var box=card.querySelector('.pbars');
    if(!box){
      box=mk('div',null,'pbars');
      b.jobs.forEach(function(j,i){
        var r=mk('div',null,'pbar'),l=mk('span','Vídeo '+(i+1)),t=mk('div',null,'tr'),f=mk('i'),p=mk('b','0%');
        t.append(f);r.append(l,t,p);box.append(r);
      });
      var pause=[].slice.call(card.children).find(function(c){return [].slice.call(c.querySelectorAll('button')).some(function(x){return /Paus/.test(x.textContent);});});
      card.insertBefore(box,pause||null);
    }
    [].slice.call(box.children).forEach(function(r,i){
      var j=b.jobs[i];if(!j)return;
      var f=Math.round(Math.max(0,Math.min(1,frac(i,j)))*100),bad=['failed','nsfw','canceled'].indexOf(j.status)>=0;
      r.classList.toggle('err',bad);
      r.querySelector('i').style.width=f+'%';
      r.querySelector('b').textContent=bad?'Falhou':f+'%';
      var s=st[i],lab=bad?'Falhou':(j.status==='completed'?'Pronto':(s&&LABEL[s.stage])||'Aguardando');
      r.querySelector('span').textContent='Vídeo '+(i+1)+' · '+lab;
    });
  }

  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  var original=window.runProduction;
  window.runProduction=function(b){
    if(productionBusy)return;
    if(Number(b.duration)>15)throw Error('Este lote antigo ultrapassa 15 segundos. Prepare um novo lote com duração de até 15 segundos.');
    if(!navigator.locks)throw Error('Use Chrome, Brave ou Edge atualizado para gerar lotes.');
    return navigator.locks.request('frame-studio-batch-'+b.id,{ifAvailable:true},async function(lock){
      if(!lock)throw Error('Este lote está sendo processado em outra aba deste navegador.');
      var leaseToken=crypto.randomUUID();
      var claim=await studioClient.rpc('frame_claim_production',{p_id:b.id,p_token:leaseToken});
      if(claim.error||!claim.data)throw Error('Este lote está em geração em outra sessão. Aguarde a pausa ou conclusão.');
      b.leaseToken=leaseToken;
      var leaseTimer=setInterval(async function(){
        var r=await studioClient.rpc('frame_claim_production',{p_id:b.id,p_token:leaseToken});
        if(r.error||!r.data)pauseRequested=true;
      },30000);
      productionBusy=true;activeBatch=b;pauseRequested=false;updateTest();
      try{genProgress.hide();}catch(e){}
      st={};running=true;
      var src0=(b.sources&&b.sources[0])||{};
      activeTau=estimateTau(b,src0);
      clearInterval(barTimer);barTimer=setInterval(paintBars,500);
      var conc=b.sources.some(function(s){return (s.mode||b.mode)==='frame'&&!s.frameMediaId;})?1:getConc();
      var chain=Promise.resolve(),firstErr=null,consec=0,stopFails=false,priceCache={};
      function save(){var p=chain.catch(function(){}).then(function(){return saveProduction(b);});chain=p;return p;}
      function stage(i,s){st[i]={stage:s,t:(st[i]&&st[i].stage===s)?st[i].t:Date.now()};}
      function summary(){
        var done=b.jobs.filter(function(j){return terminalStatuses.indexOf(j.status)>=0;}).length;
        var live=Object.keys(st).filter(function(k){var j=b.jobs[k];return j&&terminalStatuses.indexOf(j.status)<0;}).length;
        var el=q('#production-status');if(el)el.textContent=done+' de '+b.jobs.length+' prontos · '+live+' em andamento';
      }
      async function runJob(i,j){
        if(['uncertain','submitting'].indexOf(j.status)>=0&&!j.requestId)throw Error('Um pedido ficou sem confirmação de recebimento. Confira Requests na Higgsfield antes de reenviar.');
        var source=b.sources[j.sourceIndex],outfit=source.outfit||b.outfit;
        var smode=source.mode||b.mode,smodel=source.modelId||b.modelId,scast=source.cast||b.cast,starget=(source.target!=null&&source.mode)?source.target:b.target;
        stage(i,'prepare');summary();
        if(smode==='frame'&&!source.frameMediaId&&(source.originalFrameId||source.frameJob)&&(source.mode||b.frameMethod==='auto')){stage(i,'frame');j.frameJob=await editSource({id:b.id,leaseToken:b.leaseToken,modelId:smodel,editPrompt:b.editPrompt,target:starget,outfit:outfit},source,save);}
        if(!j.requestId){
          var pk=Math.ceil(Number(source.duration)||0)+'|'+(source.out||b.duration)+'|'+b.resolution+'|'+smode+'|'+(outfit?'o':'');
          if(!(pk in priceCache))priceCache[pk]=testAPI('estimate',{productionId:b.id,leaseToken:b.leaseToken,mode:smode,modelId:smodel,mediaId:source.mediaId,frameMediaId:source.frameMediaId,frameJob:j.frameJob,duration:source.out||b.duration,resolution:b.resolution,ratio:b.ratio,cast:scast,target:starget,directPrompt:b.directPrompt,framePrompt:b.framePrompt,multiPrompt:b.multiPrompt,basePrompt:b.basePrompt,outfit:outfit,generateAudio:b.generateAudio}).then(function(e){var u=Number(e&&e.usd);return Number.isFinite(u)&&u>=0?u:null;}).catch(function(){return null;});
          var pv=await priceCache[pk];if(pv!=null)j.priceUsd=pv;
          stage(i,'submit');j.status='submitting';await save();
          for(var tries=0;;tries++){
            try{
              Object.assign(j,await testAPI('submit',{productionId:b.id,leaseToken:b.leaseToken,mode:smode,attemptId:j.attemptId,modelId:smodel,mediaId:source.mediaId,frameMediaId:source.frameMediaId,frameJob:j.frameJob,duration:source.out||b.duration,resolution:b.resolution,ratio:b.ratio,cast:scast,target:starget,directPrompt:b.directPrompt,framePrompt:b.framePrompt,multiPrompt:b.multiPrompt,basePrompt:b.basePrompt,outfit:outfit,generateAudio:b.generateAudio}));
              await save();break;
            }catch(e){
              if(e.status===429&&tries<4&&!pauseRequested){j.status='submitting';await sleep(20000);continue;}
              j.status=e.status&&e.status<500?'failed':'uncertain';j.error=e.message;await save();throw e;
            }
          }
        }
        stage(i,'queued');
        Object.assign(j,await pollRequest(j,function(r){
          if(terminalStatuses.indexOf(r.status)<0)stage(i,r.status);
          summary();
        }));
        if(j.status==='failed'&&!j.retried&&localStorage.getItem('fs-autoretry')!=='0'){
          j.retried=true;j.lastError=j.error||'';
          delete j.requestId;delete j.error;delete j.videoUrl;delete j.downloadUrl;
          j.attemptId=crypto.randomUUID();j.status='prepared';
          await save();return runJob(i,j);
        }
        if(j.status==='completed'){var sObs=st[i];if(sObs&&sObs.stage==='in_progress'){var secs=(Date.now()-sObs.t)/1000;if(secs>=3&&secs<=1800){saveSample(tauKey(b,src0),secs);activeTau=estimateTau(b,src0);}}stage(i,'archive');await archiveJob(j);consec=0;}
        else{consec++;if(consec>=3)stopFails=true;}
        await save();summary();
      }
      var next=0;
      async function worker(k){
        if(k)await sleep(k*1500);
        for(;;){
          if(pauseRequested||!testConnected||firstErr||stopFails)return;
          var i=next++;if(i>=b.jobs.length)return;
          var j=b.jobs[i];
          if(terminalStatuses.indexOf(j.status)>=0)continue;
          try{await runJob(i,j);}catch(e){if(!firstErr)firstErr=e;}
        }
      }
      try{
        b.status='running';b.productionStatus='Em geração';await save();
        var ws=[];for(var k=0;k<conc;k++)ws.push(worker(k));
        await Promise.all(ws);
        await chain.catch(function(){});
        if(firstErr)throw firstErr;
        if(stopFails)throw Error('Três gerações seguidas falharam. Lote pausado para revisão. Veja o motivo em cada saída.');
        b.status=b.jobs.every(function(j){return terminalStatuses.indexOf(j.status)>=0;})?'completed':'paused';
        b.productionStatus=b.status==='completed'?'Processamento encerrado':'Pausado';
        await save();
        var el=q('#test-state');if(el)el.textContent=b.productionStatus;
        genProgress.end(b.status==='completed',b.productionStatus);
      }catch(e){
        b.status='paused';b.productionStatus='Pausado: '+e.message;
        genProgress.end(false,b.productionStatus);
        await save().catch(function(){});
        toast(e.message);
      }finally{
        running=false;clearInterval(barTimer);clearInterval(leaseTimer);
        await studioClient.rpc('frame_release_production',{p_id:b.id,p_token:leaseToken});
        delete b.leaseToken;productionBusy=false;activeBatch=null;updateTest();renderBatches();
      }
    });
  };
  window.__runProductionOriginal=original;

  function boot(){initConc();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  ['tools.js','tools2.js','tools3.js','tools4.js'].forEach(function(f){var tl=document.createElement('script');tl.src=f;document.body.append(tl);});
})();
