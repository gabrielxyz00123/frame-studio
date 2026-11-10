/* Marcar a pessoa a trocar clicando no primeiro quadro do vídeo. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  function say(m){try{toast(m);}catch(e){}}
  var css=document.createElement('style');
  css.textContent='#mark-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;color:#fff;font-size:13px}#mark-ov canvas{max-width:92vw;max-height:64vh;cursor:crosshair;border-radius:6px}#mark-ov .row{display:flex;gap:10px}';
  document.head.append(css);

  function place(x,y){
    var h=x<.38?'esquerda':(x>.62?'direita':'centro'),v=y<.38?'parte de cima':(y>.62?'parte de baixo':'meio');
    return 'a pessoa que está '+(h==='centro'?'no centro':'à '+h)+' do quadro, na '+v+' (a cerca de '+Math.round(x*100)+'% da largura e '+Math.round(y*100)+'% da altura)';
  }
  function open(file){
    var url=URL.createObjectURL(file),v=document.createElement('video');
    v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;
    v.onloadeddata=function(){try{v.currentTime=0.1;}catch(e){}};
    v.onseeked=function(){
      v.onseeked=null;
      var W=v.videoWidth,H=v.videoHeight,s=Math.min(1,900/Math.max(W,H));
      var cv=document.createElement('canvas');cv.width=Math.round(W*s);cv.height=Math.round(H*s);
      var ctx=cv.getContext('2d');ctx.drawImage(v,0,0,cv.width,cv.height);
      var base=ctx.getImageData(0,0,cv.width,cv.height),pt=null;
      var ov=mk('div');ov.id='mark-ov';
      var info=mk('div','Clique na pessoa que será substituída.');
      cv.onclick=function(e){
        var r=cv.getBoundingClientRect();pt={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
        ctx.putImageData(base,0,0);ctx.strokeStyle='#d7ff3a';ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(pt.x*cv.width,pt.y*cv.height,Math.max(14,cv.width*.03),0,7);ctx.stroke();
        info.textContent=place(pt.x,pt.y);
      };
      var ok=mk('button','Usar esta marca','primary');ok.type='button';
      var no=mk('button','Cancelar','secondary');no.type='button';
      function shut(){URL.revokeObjectURL(url);ov.remove();}
      no.onclick=shut;
      ok.onclick=function(){
        if(!pt)return say('Clique primeiro na pessoa.');
        var t=q('#target-person');
        if(t){t.value=place(pt.x,pt.y);t.dispatchEvent(new Event('input',{bubbles:true}));}
        say('Marca aplicada. Se quiser, acrescente cabelo e roupa no campo.');shut();
      };
      var row=mk('div',null,'row');row.append(ok,no);
      ov.append(info,cv,row);document.body.append(ov);
    };
    v.onerror=function(){URL.revokeObjectURL(url);say('Não foi possível abrir o vídeo.');};
  }
  function init(){
    var t=q('#target-person');if(!t||q('#mark-btn'))return;
    var b=mk('button','Marcar clicando no vídeo','secondary');b.type='button';b.id='mark-btn';b.style.marginTop='8px';
    b.onclick=function(){
      var f=(typeof files!=='undefined'&&files[0]&&files[0].file)||null;
      if(!f)return say('Adicione um vídeo de origem primeiro.');
      open(f);
    };
    t.after(b);
  }

  /* Painel fixo com o primeiro quadro: clique na pessoa e o ponto vermelho marca quem sera trocada. */
  var PCSS=document.createElement('style');
  PCSS.textContent='#mark-panel{margin:18px 0;padding:16px;border:1px solid var(--line,#444);border-radius:12px}#mark-panel h3{margin:0 0 4px;font-size:14px}#mark-panel .mp-box{position:relative;display:inline-block;max-width:100%}#mark-panel canvas{display:block;max-width:100%;max-height:420px;border-radius:8px;cursor:crosshair}#mark-panel .mp-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0 0}#mark-panel .mp-msg{font-size:13px;margin:8px 0 0}';
  document.head.append(PCSS);
  var MP={key:'',cv:null,ctx:null,base:null,marks:{},msg:null,who:null,box:null,building:false};
  var COLORS=['#ff2d2d','#2d8bff','#ffb12d','#a22dff'];
  function isMulti(){var c=q('#cast-section');return !!(c&&!c.hidden);}
  function rows(){return (typeof castRows!=='undefined'&&castRows)||[];}
  function curFile(){return (typeof files!=='undefined'&&files[0]&&files[0].file)||null;}
  function curKey(){var f=files&&files[0];if(!f)return '';var t=0;try{t=typeof trimStart==='function'?trimStart():0;}catch(e){}return (f.id||f.file.name)+'|'+t;}
  function redraw(){
    if(!MP.ctx||!MP.base)return;
    MP.ctx.putImageData(MP.base,0,0);
    var cv=MP.cv,rad=Math.max(16,cv.width*.04);
    Object.keys(MP.marks).forEach(function(k){
      var m=MP.marks[k];if(!m)return;
      var x=m.x*cv.width,y=m.y*cv.height,col=COLORS[Number(k)%COLORS.length];
      MP.ctx.beginPath();MP.ctx.arc(x,y,rad,0,7);MP.ctx.fillStyle=col;MP.ctx.fill();
      MP.ctx.lineWidth=Math.max(3,rad*.3);MP.ctx.strokeStyle='#fff';MP.ctx.stroke();
      if(isMulti()){MP.ctx.fillStyle='#fff';MP.ctx.font='bold '+Math.round(rad*1.1)+'px sans-serif';MP.ctx.textAlign='center';MP.ctx.textBaseline='middle';MP.ctx.fillText(String(Number(k)+1),x,y+1);}
    });
  }
  function ensurePanel(){
    if(MP.box&&document.body.contains(MP.box))return true;
    var anchor=q('#cast-section');if(!anchor)return false;
    var box=mk('section',null);box.id='mark-panel';
    box.append(mk('h3','Primeiro quadro do vídeo · clique na pessoa a substituir'));
    MP.msg=mk('p','Adicione um vídeo de origem abaixo para ver o primeiro quadro.','mp-msg muted');
    var row=mk('div',null,'mp-row');
    MP.who=document.createElement('select');MP.who.setAttribute('aria-label','Qual pessoa marcar');MP.who.hidden=true;
    var clr=mk('button','Limpar marcas','secondary');clr.type='button';
    clr.onclick=function(){MP.marks={};redraw();MP.msg.textContent='Marcas removidas. Clique de novo na pessoa que será substituída.';};
    row.append(MP.who,clr);
    MP.cvHost=mk('div',null,'mp-box');
    box.append(MP.cvHost,row,MP.msg);
    anchor.after(box);MP.box=box;MP.key='';return true;
  }
  function build(file){
    if(MP.building)return;MP.building=true;
    var url=URL.createObjectURL(file),v=document.createElement('video');
    v.muted=true;v.playsInline=true;v.preload='auto';v.src=url;
    var done=function(){MP.building=false;URL.revokeObjectURL(url);};
    v.onloadeddata=function(){var t=0.1;try{t+=typeof trimStart==='function'?Number(trimStart())||0:0;}catch(e){}try{v.currentTime=Math.min(t,Math.max(0,(v.duration||1)-0.05));}catch(e){}};
    v.onseeked=function(){
      v.onseeked=null;
      var W=v.videoWidth,H=v.videoHeight,sc=Math.min(1,900/Math.max(W,H));
      var cv=document.createElement('canvas');cv.width=Math.round(W*sc);cv.height=Math.round(H*sc);
      var ctx=cv.getContext('2d');ctx.drawImage(v,0,0,cv.width,cv.height);
      MP.base=ctx.getImageData(0,0,cv.width,cv.height);MP.cv=cv;MP.ctx=ctx;MP.marks={};
      cv.onclick=function(e){
        var r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
        var idx=isMulti()?(Number(MP.who.value)||0):0,txt=place(x,y);
        MP.marks[idx]={x:x,y:y};redraw();
        if(isMulti()){
          var rs=rows();if(!rs[idx])return;rs[idx].target=txt;
          try{renderCast();}catch(er){}try{updateTest();}catch(er){}
        }else{
          var t=q('#target-person');if(t){t.value=txt;t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));}
        }
        MP.msg.textContent=(isMulti()?'Pessoa '+(idx+1)+' marcada: ':'Marcado: ')+txt+'. Pode acrescentar cabelo e roupa no campo acima. Na geração, essa é a pessoa que será trocada.';
      };
      MP.cvHost.replaceChildren(cv);
      MP.msg.textContent='Clique na pessoa que será substituída. O ponto vermelho mostra a marca.';
      done();
    };
    v.onerror=function(){MP.msg.textContent='Não foi possível abrir o vídeo para mostrar o quadro.';done();};
  }
  function syncWho(){
    if(!MP.who)return;
    var n=isMulti()?rows().length:0;
    MP.who.hidden=n<2;
    if(MP.who.options.length!==n){var cur=MP.who.value;MP.who.replaceChildren();for(var i=0;i<n;i++)MP.who.add(new Option('Marcar a pessoa '+(i+1),String(i)));MP.who.value=cur&&Number(cur)<n?cur:'0';}
    Object.keys(MP.marks).forEach(function(k){if(isMulti()&&Number(k)>=n){delete MP.marks[k];}});
  }
  function tickPanel(){
    if(!ensurePanel())return;
    syncWho();
    MP.box.hidden=!isMulti();
    if(!isMulti())return;
    var f=curFile(),k=f?curKey():'';
    if(!f){if(MP.key){MP.key='';MP.cv=null;MP.base=null;MP.marks={};MP.cvHost.replaceChildren();MP.msg.textContent='Adicione um vídeo de origem abaixo para ver o primeiro quadro.';}return;}
    if(k!==MP.key&&!MP.building){MP.key=k;build(f);}
    else if(MP.base)redraw();
  }
  setInterval(tickPanel,1200);
  init();setInterval(init,2000);
  ['tools5.js','tools6.js','tools7.js'].forEach(function(f){var sx=document.createElement('script');sx.src=f;document.body.append(sx);});
})();