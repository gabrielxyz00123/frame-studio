/* Ferramentas: baixados, ordenar, ocultar, configurações salvas, repetidos, relatório, aviso ao terminar. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  function say(m){try{toast(m);}catch(e){}}
  function ls(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}}
  function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  var dl=ls('fs-dl',{}),hid=ls('fs-hidden',{}),presets=ls('fs-presets',{}),showHidden=false;
  var TERM=['completed','failed','nsfw','canceled'],BAD=['failed','nsfw','canceled'],RATE={'480p':.05,'720p':.10,'1080p':.20};

  var css=document.createElement('style');
  css.textContent='.lib-card[data-gone="1"]{display:none}.lib-dlbadge{font-size:11px;color:var(--c4)}.lib-bar select#lib-sort{min-width:150px}'
  +'#preset-box{margin:12px 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;color:var(--c3);display:flex;flex-wrap:wrap;gap:8px;align-items:center}#preset-box select{width:auto;min-width:170px}#preset-box button{font-size:12px;padding:5px 10px}#preset-box label{margin:0;display:flex;align-items:center;gap:6px}'
  +'.dup-note{margin:8px 0;padding:8px 10px;border:1px solid #f5b301;border-radius:8px;font-size:12px;color:#f5b301}'
  +'.report-box{margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:12px}.report-box summary{cursor:pointer;font-weight:600}.report-box table{width:100%;border-collapse:collapse;margin-top:8px}.report-box th,.report-box td{text-align:left;padding:5px 6px;border-bottom:1px solid var(--line)}.report-box ul{margin:8px 0 0;padding-left:18px}';
  document.head.append(css);

  /* ---------- biblioteca: baixados, só novos, lixeira, ordenar ---------- */
  function L(){return window.__lib;}
  function K(it){return L().key(it);}
  function markItems(list){list.forEach(function(it){dl[K(it)]=1;});lsSet('fs-dl',dl);decorateLib();}
  function setPick(card,on){var cb=card.querySelector('.lib-pick input');if(cb&&cb.checked!==on){cb.checked=on;cb.dispatchEvent(new Event('change'));}}
  function onlyNew(){var c=q('#lib-onlynew');return !!(c&&c.checked);}
  function decorateLib(){
    var g=q('#lib-grid');if(!g||!L())return;
    var n=onlyNew();
    [].slice.call(g.querySelectorAll('.lib-card')).forEach(function(c){
      var it=c.__it;if(!it)return;
      var k=K(it),b=c.querySelector('.lib-dlbadge');
      if(dl[k]){if(!b){b=mk('span','✓ Baixado','lib-dlbadge');var info=c.querySelector('.lib-info');if(info)info.append(b);}}else if(b)b.remove();
      var tb=c.querySelector('.lib-trash');
      if(hid[k]){
        if(!tb){
          tb=mk('span',null,'lib-dlbadge lib-trash');tb.append(document.createTextNode('🗑 Na lixeira '));
          var rb=mk('button','Restaurar','secondary');rb.type='button';
          rb.onclick=function(ev){ev.stopPropagation();delete hid[K(c.__it)];lsSet('fs-hidden',hid);decorateLib();say('Vídeo restaurado.');};
          tb.append(rb);var inf=c.querySelector('.lib-info');if(inf)inf.append(tb);
        }
      }else if(tb)tb.remove();
      var gone=(hid[k]&&!showHidden)||(n&&dl[k]);
      c.dataset.gone=gone?'1':'';
    });
    var cnt=q('#lib-trash-count');if(cnt)cnt.textContent=' Ver lixeira ('+Object.keys(hid).length+')';
    sortGrid();
  }
  var sorting=false;
  function sortGrid(){
    if(sorting)return;
    var g=q('#lib-grid'),mode=(q('#lib-sort')||{}).value||'new';if(!g)return;
    var cards=[].slice.call(g.querySelectorAll('.lib-card')).filter(function(c){return c.__it;});
    var sorted=cards.slice().sort(function(a,b){
      var x=a.__it,y=b.__it;
      if(mode==='old')return x.t-y.t||x.i-y.i;
      if(mode==='batch')return y.t-x.t||x.i-y.i;
      return y.t-x.t||y.i-x.i;
    });
    var same=sorted.every(function(c,i){return c===cards[i];});
    if(same)return;
    sorting=true;sorted.forEach(function(c){g.appendChild(c);});sorting=false;
  }
  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target.closest('button'):null;if(!t||!L())return;
    if(t.id==='lib-dl-sel'||t.id==='lib-zip'){markItems(L().chosen());return;}
    if(t.id==='lib-dl-star'){var st=ls('fs-stars',{});markItems(L().all().filter(function(it){return st[K(it)];}));return;}
    var c=t.closest('.lib-card');if(c&&c.__it&&/^Baixar MP4/.test(t.textContent))markItems([c.__it]);
  },true);
  function initLibBar(){
    var bar=q('.lib-bar');if(!bar||q('#lib-sort'))return;
    var s=document.createElement('select');s.id='lib-sort';
    [['new','Mais novos primeiro'],['old','Mais antigos primeiro'],['batch','Por lote']].forEach(function(o){s.add(new Option(o[1],o[0]));});
    s.onchange=function(){sortGrid();};
    var l1=mk('label',null,'check-label'),c1=mk('input');c1.type='checkbox';c1.id='lib-onlynew';c1.onchange=decorateLib;
    l1.append(c1,document.createTextNode(' Só não baixados'));
    var b1=mk('button','Selecionar não baixados','secondary');b1.type='button';
    b1.onclick=function(){
      [].slice.call(q('#lib-grid').querySelectorAll('.lib-card')).forEach(function(c){
        if(!c.__it||c.dataset.gone==='1')return;setPick(c,!dl[K(c.__it)]);
      });
      say('Não baixados selecionados. Use Baixar selecionados ou o ZIP.');
    };
    var b2=mk('button','Mover para a lixeira','secondary');b2.type='button';
    b2.onclick=function(){
      var list=L().chosen();if(!list.length)return say('Marque pelo menos um vídeo em Selecionar.');
      list.forEach(function(it){hid[K(it)]=1;});lsSet('fs-hidden',hid);
      [].slice.call(q('#lib-grid').querySelectorAll('.lib-card')).forEach(function(c){if(c.__it&&hid[K(c.__it)])setPick(c,false);});
      decorateLib();say(list.length+' vídeo(s) na lixeira. Os arquivos continuam guardados e dá para restaurar.');
    };
    var b3=mk('button','Restaurar selecionados','secondary');b3.type='button';
    b3.onclick=function(){
      var list=L().chosen().filter(function(it){return hid[K(it)];});
      if(!list.length)return say('Ligue Ver lixeira, marque os vídeos em Selecionar e use Restaurar.');
      list.forEach(function(it){delete hid[K(it)];});lsSet('fs-hidden',hid);
      decorateLib();say(list.length+' vídeo(s) restaurado(s).');
    };
    var l2=mk('label',null,'check-label'),c2=mk('input'),t2=mk('span',' Ver lixeira (0)');c2.type='checkbox';t2.id='lib-trash-count';
    l2.append(c2,t2);
    c2.onchange=function(){
      showHidden=c2.checked;decorateLib();
    };
    bar.append(s,l1,b1,b2,b3,l2);
    var g=q('#lib-grid');if(g)new MutationObserver(function(){if(!sorting)decorateLib();}).observe(g,{childList:true});
  }

  /* ---------- configurações salvas e tentar de novo ---------- */
  var FIELDS=['#model','#target-person','#outputs','#duration','#ratio','#resolution','#trim-start','#trim-length'];
  function fire(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  function fillPresets(sel){
    var cur=sel.value;sel.replaceChildren(new Option('Configurações salvas',''));
    Object.keys(presets).sort().forEach(function(n){sel.add(new Option(n,n));});
    sel.value=presets[cur]?cur:'';
  }
  function initPresets(){
    if(q('#preset-box'))return;
    var anchor=q('#conc-box')||q('#test-heading');if(!anchor)return;
    var box=mk('div',null,'');box.id='preset-box';
    var sel=document.createElement('select');sel.id='preset-sel';fillPresets(sel);
    var ap=mk('button','Aplicar','secondary');ap.type='button';
    ap.onclick=function(){
      var p=presets[sel.value];if(!p)return say('Escolha uma configuração salva.');
      FIELDS.forEach(function(f){var el=q(f);if(!el||p[f]==null)return;if(el.tagName==='SELECT'&&![].some.call(el.options,function(o){return o.value===p[f];}))return;el.value=p[f];fire(el);});
      var t=q('#trim-on');if(t&&p.trim!=null&&t.checked!==p.trim){t.checked=p.trim;fire(t);}
      var c=q('#conc');if(c&&p.conc){c.value=p.conc;fire(c);}
      say('Configuração aplicada.');
    };
    var sv=mk('button','Salvar a atual','secondary');sv.type='button';
    sv.onclick=function(){
      var n=window.prompt('Nome da configuração (ex.: Dança 480p):','');if(!n)return;n=n.trim().slice(0,40);if(!n)return;
      var p={};FIELDS.forEach(function(f){var el=q(f);if(el)p[f]=el.value;});
      var t=q('#trim-on');if(t)p.trim=t.checked;var c=q('#conc');if(c)p.conc=c.value;
      presets[n]=p;lsSet('fs-presets',presets);fillPresets(sel);sel.value=n;say('Configuração salva.');
    };
    var rm=mk('button','Apagar','secondary');rm.type='button';
    rm.onclick=function(){if(!presets[sel.value])return;delete presets[sel.value];lsSet('fs-presets',presets);fillPresets(sel);};
    var lab=mk('label'),ck=mk('input');ck.type='checkbox';ck.checked=localStorage.getItem('fs-autoretry')!=='0';
    ck.onchange=function(){try{localStorage.setItem('fs-autoretry',ck.checked?'1':'0');}catch(e){}};
    lab.append(ck,document.createTextNode('Tentar de novo uma vez se falhar'));
    box.append(sel,ap,sv,rm,lab);anchor.before(box);
  }

  /* ---------- vídeos repetidos ---------- */
  function checkDup(){
    var host=q('#file-list');if(!host)return;
    var list=typeof files!=='undefined'?files:[],used={};
    (typeof batches!=='undefined'?batches:[]).forEach(function(b){if(b.deleted)return;(b.sources||[]).forEach(function(s){if(s&&s.name)used[s.name]=1;});});
    var seen={},again=[],dups=[];
    list.forEach(function(f){
      var file=f&&f.file,n=(file&&file.name)||(f&&f.name);if(!n)return;
      if(used[n]&&again.indexOf(n)<0)again.push(n);
      var k=n+'|'+(file&&file.size);if(seen[k]&&dups.indexOf(n)<0)dups.push(n);seen[k]=1;
    });
    var note=q('#dup-note');
    if(!again.length&&!dups.length){if(note)note.remove();return;}
    if(!note){note=mk('p',null,'dup-note');note.id='dup-note';host.before(note);}
    var parts=[];
    if(dups.length)parts.push('repetido na lista: '+dups.slice(0,3).join(', ')+(dups.length>3?' e mais '+(dups.length-3):''));
    if(again.length)parts.push('já usado em outro lote: '+again.slice(0,3).join(', ')+(again.length>3?' e mais '+(again.length-3):''));
    note.textContent='Atenção, '+parts.join(' · ')+'. Remova se não quiser gastar de novo com o mesmo vídeo.';
  }
  function watchFiles(){var l=q('#file-list');if(l&&!l.__w){l.__w=1;new MutationObserver(checkDup).observe(l,{childList:true});}}

  /* ---------- relatório do mês ---------- */
  function usd(n){return 'US$ '+n.toFixed(2).replace('.',',');}
  function report(){
    var host=q('.fs-tools')||q('#batch-list');if(!host)return;
    var box=q('#report-box');
    if(!box){box=document.createElement('details');box.id='report-box';box.className='report-box';host.before(box);}
    var months={},errs={};
    (typeof batches!=='undefined'?batches:[]).forEach(function(b){
      if(b.deleted||!b.jobs)return;
      var d=new Date(b.created||'');if(isNaN(d))return;
      var key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      var m=months[key]||(months[key]={ok:0,bad:0,nsfw:0,cost:0});
      b.jobs.forEach(function(j){
        if(j.status==='completed'){
          m.ok++;var s=(b.sources||[])[j.sourceIndex]||{};
          m.cost+=(Math.ceil(Number(s.duration)||0)+(Number(s.out)||Number(b.duration)||0))*(RATE[b.resolution]||.05);
        }else if(BAD.indexOf(j.status)>=0){
          if(j.status==='nsfw')m.nsfw++;else m.bad++;
          var e=String(j.error||j.status).replace(/\s+/g,' ').slice(0,70);errs[e]=(errs[e]||0)+1;
        }
      });
    });
    var keys=Object.keys(months).sort().reverse();
    var sum=box.querySelector('summary')||mk('summary','Relatório por mês');
    box.replaceChildren(sum);
    if(!keys.length){box.append(mk('p','Nenhuma geração ainda.'));return;}
    var t=document.createElement('table'),h=document.createElement('tr');
    ['Mês','Prontos','Falhas','Recusados','Gasto estimado'].forEach(function(x){h.append(mk('th',x));});t.append(h);
    keys.forEach(function(k){
      var m=months[k],r=document.createElement('tr'),p=k.split('-');
      [p[1]+'/'+p[0],String(m.ok),String(m.bad),String(m.nsfw),usd(m.cost)].forEach(function(x){r.append(mk('td',x));});t.append(r);
    });
    box.append(t);
    var top=Object.keys(errs).sort(function(a,b){return errs[b]-errs[a];}).slice(0,4);
    if(top.length){var ul=document.createElement('ul');top.forEach(function(e){ul.append(mk('li',errs[e]+'× '+e));});box.append(mk('p','Motivos mais comuns das falhas:'),ul);}
  }
  var prevRB=window.renderBatches;
  window.renderBatches=function(){
    var r=prevRB.apply(this,arguments);
    try{report();checkDup();decorateLib();}catch(e){console.warn(e);}
    return r;
  };

  /* ---------- aviso ao terminar ---------- */
  function beep(){try{var C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.value=.15;o.start();setTimeout(function(){try{o.stop();c.close();}catch(e){}},400);}catch(e){}}
  function notifyDone(b){
    var tot=b.jobs.length,ok=b.jobs.filter(function(j){return j.status==='completed';}).length,bad=b.jobs.filter(function(j){return BAD.indexOf(j.status)>=0;}).length,left=tot-ok-bad;
    var msg=ok+' pronto(s)'+(bad?', '+bad+' com falha':'')+(left?', '+left+' pendente(s)':'')+'.';
    beep();say('O lote terminou: '+msg);
    try{if('Notification' in window&&Notification.permission==='granted')new Notification('Frame Studio: o lote terminou',{body:msg});}catch(e){}
  }
  var wasBusy=false,lastB=null;
  setInterval(function(){
    var on=false,b=null;
    try{on=typeof productionBusy!=='undefined'&&productionBusy;b=typeof activeBatch!=='undefined'?activeBatch:null;}catch(e){}
    if(on&&b)lastB=b;
    if(wasBusy&&!on&&lastB){var x=lastB;lastB=null;notifyDone(x);}
    wasBusy=on;
  },1500);
  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target.closest('button'):null;if(!t)return;
    if(t.id==='generate-test'||/Retomar|Reenviar/.test(t.textContent)){
      try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch(err){}
    }
  },true);

  function boot(){initLibBar();initPresets();watchFiles();checkDup();decorateLib();report();}
  boot();
  window.addEventListener('studio-authenticated',function(){setTimeout(boot,800);});
  setTimeout(boot,1500);
})();
