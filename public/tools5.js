/* Configurações por conta: modelos de configuração, aprovados, nomes, baixados, lixeira e preferências seguem você em qualquer navegador. */
(function(){
  'use strict';
  var KEYS=['fs-presets','fs-stars','fs-names','fs-hidden','fs-dl','fs-conc','fs-autoretry','fs-theme','fs-outfit-prompt'];
  var OBJ={'fs-presets':1,'fs-stars':1,'fs-names':1,'fs-hidden':1,'fs-dl':1};
  var BASE='fs-sync-base';
  function say(m){try{toast(m);}catch(e){}}
  function get(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function set(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
  function snap(){var o={};KEYS.forEach(function(k){var v=get(k);if(v!=null)o[k]=v;});return o;}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function merge(remote,local){
    var out={};
    KEYS.forEach(function(k){
      var r=remote[k],l=local[k];
      if(r==null){if(l!=null)out[k]=l;return;}
      if(l==null){out[k]=r;return;}
      if(OBJ[k]){try{out[k]=JSON.stringify(Object.assign({},JSON.parse(r),JSON.parse(l)));}catch(e){out[k]=l;}}
      else out[k]=l;
    });
    return out;
  }
  var recId=null,lastSnap=null,busy=false,ready=false,warned=false;

  async function find(){
    var r=await studioClient.from('frame_library').select('id,data').eq('kind','generation').eq('data->>jobType','prefs').order('created_at',{ascending:true}).limit(1);
    if(r.error)throw r.error;
    return (r.data&&r.data[0])||null;
  }
  async function push(values){
    var data={jobType:'prefs',ts:Date.now(),values:values};
    if(recId){
      var u=await studioClient.from('frame_library').update({data:data}).eq('id',recId).select('id');
      if(u.error||!u.data||!u.data.length)throw Error('Falha ao salvar as configurações.');
    }else{
      var c=await studioApi('POST',{kind:'generation',data:data});
      recId=c.id;
    }
    lastSnap=values;
    set(BASE,JSON.stringify(values));
  }
  function busyNow(){try{return typeof productionBusy!=='undefined'&&productionBusy;}catch(e){return false;}}
  function apply(values){
    KEYS.forEach(function(k){set(k,values[k]);});
    set(BASE,JSON.stringify(values));
    if(busyNow()){say('Suas configurações da conta foram atualizadas. Recarregue a página quando terminar a geração.');return;}
    try{location.reload();}catch(e){}
  }
  async function start(){
    if(ready||busy)return;
    busy=true;
    try{
      var s=await studioClient.auth.getSession();
      if(!s.data||!s.data.session)return;
      var rec=await find(),local=snap();
      if(rec){
        recId=rec.id;
        var remote=(rec.data&&rec.data.values)||{};
        var base=null;try{base=JSON.parse(get(BASE)||'null');}catch(e){}
        /* se este navegador não mudou nada desde a última sincronização, vale a conta; senão junta os dois */
        var next=(base&&same(base,local))?remote:merge(remote,local);
        lastSnap=remote;
        if(!same(next,remote))await push(next);else set(BASE,JSON.stringify(remote));
        ready=true;
        if(!same(next,local))apply(next);
      }else{
        await push(local);
        ready=true;
      }
    }catch(e){
      if(!warned){warned=true;console.warn('Sincronização das configurações indisponível:',e&&e.message);}
    }finally{busy=false;}
  }
  async function tick(){
    if(!ready){start();return;}
    if(busy)return;
    var cur=snap();
    if(same(cur,lastSnap))return;
    busy=true;
    try{await push(cur);}catch(e){if(!warned){warned=true;console.warn('Falha ao sincronizar:',e&&e.message);}}
    finally{busy=false;}
  }
  async function checkRemote(){
    if(!ready||busy)return;
    busy=true;
    try{
      var rec=await find();if(!rec)return;
      var remote=(rec.data&&rec.data.values)||{},cur=snap();
      if(same(cur,lastSnap)&&!same(remote,lastSnap)){lastSnap=remote;apply(remote);}
    }catch(e){}finally{busy=false;}
  }
  window.addEventListener('studio-authenticated',function(){setTimeout(start,1200);});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkRemote();});
  setTimeout(start,2500);
  setInterval(tick,5000);
})();
