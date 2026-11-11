/* Seleção por clique: encontra os rostos do primeiro quadro e prende o clique ao rosto certo.
   Usa a biblioteca aberta face-api (licença MIT), carregada só quando o quadro aparece. Nada sai do navegador. */
(function(){
  'use strict';
  var VER='1.7.15',LOCAL=window.FS_FACE_BASE||'vendor/face-api-'+VER /* cópia local (hashes conferidos com o jsDelivr): o CSP só permite scripts do próprio site */,BASE=LOCAL||('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@'+VER);
  var SRI='sha384-M5nePoB6/w/a9JhtegEibSLGiJy/+QMZZMfvcxjWVCQW/HPwrQ7i21V/Px/8AyVA';
  var state='idle',ready=null;
  function limit(p,ms){return Promise.race([p,new Promise(function(_,rej){setTimeout(function(){rej(Error('tempo esgotado'));},ms);})]);}
  function load(){
    if(ready)return ready;
    state='loading';
    ready=limit(new Promise(function(res,rej){
      var s=document.createElement('script');s.src=BASE+'/dist/face-api.js';
      if(!LOCAL){s.integrity=SRI;s.crossOrigin='anonymous';}
      s.onload=function(){res();};s.onerror=function(){rej(Error('rede'));};
      document.head.append(s);
    }).then(function(){return window.faceapi.nets.ssdMobilenetv1.loadFromUri(BASE+'/model');}),90000)
      .then(function(){state='ready';return true;})
      .catch(function(){state='failed';return false;});
    return ready;
  }
  function overlap(a,b){
    var x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)),i=x*y;
    return i/(a.w*a.h+b.w*b.h-i||1);
  }
  /* devolve os rostos da esquerda para a direita, em fração do quadro (0 a 1); null se o detector não estiver disponível */
  function detect(source){
    return load().then(function(ok){
      if(!ok)return null;
      return limit(window.faceapi.detectAllFaces(source,new window.faceapi.SsdMobilenetv1Options({minConfidence:.6,maxResults:12})),60000).then(function(list){
        var W=source.width,H=source.height,out=[];
        list.map(function(d){var b=d.box,x=Math.max(0,b.x/W),y=Math.max(0,b.y/H);return {x:x,y:y,w:Math.min(1-x,b.width/W),h:Math.min(1-y,b.height/H),s:d.score};})
          .filter(function(f){return f.w>.02&&f.h>.02;})
          .sort(function(a,b){return b.s-a.s;})
          .forEach(function(f){if(!out.some(function(o){return overlap(o,f)>.3;}))out.push(f);});
        out.forEach(function(f){f.cx=f.x+f.w/2;f.cy=f.y+f.h/2;});
        return out.sort(function(a,b){return a.cx-b.cx;});
      });
    }).catch(function(){return null;});
  }
  /* qual rosto o clique escolheu: em cima do rosto, ou no corpo logo abaixo dele; -1 se o clique não pertence a nenhum rosto */
  function pick(faces,x,y){
    var best=-1,cost=1e9;
    (faces||[]).forEach(function(f,i){
      var inFace=x>=f.x-f.w*.25&&x<=f.x+f.w*1.25&&y>=f.y-f.h*.35&&y<=f.y+f.h*1.25;
      var inBody=Math.abs(x-f.cx)<=f.w*1.6&&y>f.y;
      if(!inFace&&!inBody)return;
      var c=(inFace?0:1)+Math.abs(x-f.cx)+.35*Math.abs(y-f.cy);
      if(c<cost){cost=c;best=i;}
    });
    return best;
  }
  window.fsFaces={load:load,detect:detect,pick:pick,state:function(){return state;}};
  window.dispatchEvent(new Event('fs-faces-ready'));
})();
