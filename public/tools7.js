/* Trocar a roupa por uma roupa específica (opcional): foto e/ou descrição + prompt próprio. */
(function(){
  'use strict';
  function q(s){return document.querySelector(s);}
  function mk(t,x,c){var e=document.createElement(t);if(x!=null)e.textContent=x;if(c)e.className=c;return e;}
  var KEY='fs-outfit-prompt',IMG=['image/png','image/jpeg','image/webp'];
  var DEFAULT='OUTFIT CHANGE (overrides any instruction to keep, preserve or copy the original clothing): the replaced person wears the specific outfit below instead of the original clothing. {{outfit}} Reproduce the garments faithfully: cut, color, fabric, pattern and fit, adapted naturally to the body and pose. Do not change identity, pose, background or lighting because of the outfit. People who are not replaced keep their own clothes.';
  function getPrompt(){var v='';try{v=(localStorage.getItem(KEY)||'').trim();}catch(e){}return v||DEFAULT;}
  function setPrompt(v){try{if(v.trim()&&v.trim()!==DEFAULT)localStorage.setItem(KEY,v.trim());else localStorage.removeItem(KEY);}catch(e){}}

  var ST={on:null,file:null,text:null,thumb:null,box:null,cache:{file:null,id:null},url:null};

  /* ---- Estúdio em lote ---- */
  function buildStudio(){
    if(ST.box&&document.body.contains(ST.box))return;
    var anchor=q('#cast-section');if(!anchor)return;
    var box=mk('section',null);box.id='outfit-card';box.style.cssText='margin:18px 0;padding:16px;border:1px solid var(--line,#444);border-radius:12px';
    var lb=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.id='outfit-on';
    lb.append(cb,document.createTextNode('Trocar a roupa por uma roupa específica (opcional)'));lb.style.cssText='display:flex;align-items:center;justify-content:flex-start;gap:8px';cb.style.cssText='flex:0 0 auto;width:auto;margin:0';
    var body=mk('div');body.hidden=true;body.style.marginTop='10px';
    var file=document.createElement('input');file.type='file';file.id='outfit-file';file.accept=IMG.join(',');
    var thumb=document.createElement('img');thumb.alt='Roupa escolhida';thumb.style.cssText='display:none;max-height:140px;max-width:100%;border-radius:8px;margin-top:8px';
    var text=document.createElement('textarea');text.id='outfit-text';text.rows=2;text.maxLength=300;text.placeholder='Descreva a roupa. Ex.: vestido vermelho de seda, decote em V';text.style.cssText='width:100%;margin-top:8px';
    var note=mk('p','Envie uma foto da roupa, descreva em texto, ou os dois (mais preciso). Vale para todos os vídeos deste lote. Se você enviar o próprio quadro editado, a roupa vai só no prompt do vídeo. O texto do comando fica em Modificar prompts.','muted');
    note.style.margin='8px 0 0';
    body.append(mk('div','Foto da roupa (PNG, JPEG ou WebP, até 4 MB)'),file,thumb,text,note);
    box.append(lb,body);anchor.before(box);
    cb.onchange=function(){body.hidden=!cb.checked;};
    file.onchange=function(){
      var f=file.files[0];if(thumb.src&&thumb.dataset.u){URL.revokeObjectURL(thumb.dataset.u);}
      if(!f){thumb.style.display='none';thumb.removeAttribute('src');return;}
      if(IMG.indexOf(f.type)<0||f.size>4*1048576){file.value='';thumb.style.display='none';try{toast('A foto da roupa deve ser PNG, JPEG ou WebP de até 4 MB.');}catch(e){}return;}
      var u=URL.createObjectURL(f);thumb.dataset.u=u;thumb.src=u;thumb.style.display='block';
    };
    ST.on=cb;ST.file=file;ST.text=text;ST.box=box;
  }

  /* ---- Modificar prompts ---- */
  function buildPrompt(){
    if(q('#edit-outfit'))return;
    var ref=q('label[for="edit-base"]');if(!ref)return;
    var lab=document.createElement('label');lab.htmlFor='edit-outfit';lab.textContent='Prompt da roupa (usado só quando você liga a troca de roupa)';
    var ta=document.createElement('textarea');ta.id='edit-outfit';ta.rows=7;ta.maxLength=4000;ta.value=getPrompt();
    var hint=mk('p','Use {{outfit}} onde o modelo deve receber a foto e/ou a descrição da roupa. Salvo automaticamente neste navegador e na sua conta. Para voltar ao padrão, apague o texto.','muted');
    var save=function(){setPrompt(ta.value);};
    ta.addEventListener('input',save);
    ta.addEventListener('blur',function(){if(!ta.value.trim())ta.value=DEFAULT;});
    ref.before(lab,ta,hint);
  }

  function signature(){return ST.on&&ST.on.checked?JSON.stringify([ST.file&&ST.file.files[0]?ST.file.files[0].name+ST.file.files[0].size:'',ST.text?ST.text.value.trim():'',getPrompt()]):'';}
  window.fsOutfit={
    on:function(){return !!(ST.on&&ST.on.checked);},
    prompt:getPrompt,
    signature:signature,
    check:function(){
      if(!this.on())return;
      var f=ST.file.files[0],t=ST.text.value.trim();
      if(!f&&!t)throw Error('Troca de roupa ligada: envie a foto da roupa ou descreva a roupa (ou desligue a opção).');
    },
    upload:async function(){
      var f=ST.file.files[0],t=ST.text.value.trim(),o={text:t,prompt:getPrompt()};
      if(f){
        if(ST.cache.file!==f||!ST.cache.id){var m=await uploadMedia(f,f.name);ST.cache={file:f,id:m.id};}
        o.mediaId=ST.cache.id;o.name=f.name;
      }
      return o;
    }
  };
  setInterval(function(){buildStudio();buildPrompt();},1500);
})();
