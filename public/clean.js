/* Limpeza de metadados de MP4/MOV feita no proprio arquivo: mesmo tamanho, mesmos deslocamentos, nada e recodificado.
   Remove udta/meta/uuid, datas, nomes de manipuladores, nome do compressor e textos de SEI (x264/x265). Gerado a partir do mesmo codigo no servidor e no navegador. */
(function(){
'use strict';
var FSC_PATTERNS=['x264 - core','x265 (build','x265 - ','libx264','libx265','Lavf5','Lavf6','Lavc5','Lavc6','FFmpeg','HandBrake','MP4Box','GPAC ISO','Bento4','L-SMASH','Core Media','MediaInfo','Google Inc','Apple Inc','com.apple','iTunes','ns.adobe.com','xmpmeta','c2pa.','libaom','SVT-AV1'];
var FSC_DATA=['x264 - core','x265 (build','Lavc5','Lavc6','Lavf5','Lavf6','FFmpeg'];
var FSC_TOP={ftyp:1,styp:1,moov:1,mdat:1,moof:1,mfra:1,sidx:1,ssix:1,prft:1};
var FSC_PAD={free:1,skip:1,wide:1};
var FSC_MOOV={mvhd:1,trak:1,mvex:1,iods:1,pssh:1,ctab:1};
var FSC_KILL={udta:1,meta:1,uuid:1};
var FSC_KILLTOP={udta:1,meta:1,uuid:1,'XMP_':1,'xml ':1,bxml:1,pnot:1,PICT:1,emsg:1};
var FSC_FILL=0x20;
function fscSum(a,b){for(var k in b){if(typeof b[k]==='number')a[k]=(a[k]||0)+b[k];}}
function fscPass(b){
  var st={ok:false,changed:0,removed:[],times:0,names:0,compressors:0,padding:0,sei:0,seiSkipped:0,fragmented:false,issues:[],notes:[],mdat:[]};
  var dv=new DataView(b.buffer,b.byteOffset,b.byteLength),len=b.length,infos=[];
  function put(s,e,v){var n=0;for(var i=s;i<e;i++){if(b[i]!==v){b[i]=v;n++;}}st.changed+=n;return n;}
  function cc(o){return String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]);}
  function allZero(s,e){for(var i=s;i<e;i++){if(b[i]!==0)return false;}return true;}
  function rd(off,end){
    if(off+8>end)return null;
    var size=dv.getUint32(off,false),type=cc(off+4),hdr=8;
    if(size===1){if(off+16>end)return null;var hi=dv.getUint32(off+8,false),lo=dv.getUint32(off+12,false);if(hi>2097151)return null;size=hi*4294967296+lo;hdr=16;}
    else if(size===0){size=end-off;}
    if(size<hdr||off+size>end)return null;
    return {off:off,size:size,type:type,hdr:hdr,body:off+hdr,end:off+size};
  }
  function kids(box,start){
    var out=[],p=start==null?box.body:start,n=0;
    while(p<box.end){
      var k=rd(p,box.end);
      if(!k){if(!allZero(p,box.end))st.issues.push('estrutura inesperada em '+box.type);break;}
      out.push(k);p=k.end;if(++n>50000){st.issues.push('caixas demais em '+box.type);break;}
    }
    return out;
  }
  function kill(k,where){
    var n=put(k.off+4,k.off+5,0x66)+put(k.off+5,k.off+6,0x72)+put(k.off+6,k.off+7,0x65)+put(k.off+7,k.off+8,0x65)+put(k.body,k.end,0);
    if(n>0&&st.removed.length<60)st.removed.push(k.type+(where?'@'+where:'')+':'+k.size);
  }
  function pad(k){st.padding+=put(k.body,k.end,0);}
  function times(k){
    var v=b[k.body],n=v===1?16:(v===0?8:-1);
    if(n<0||k.body+4+n>k.end){st.issues.push('cabeçalho '+k.type+' inesperado');return;}
    if(put(k.body+4,k.body+4+n,0)>0)st.times++;
    if(k.type==='mdhd'){var lo=k.body+(v===1?32:20);if(lo+2<=k.end){var c=put(lo,lo+1,0x55)+put(lo+1,lo+2,0xC4);if(c>0)st.times++;}}
  }
  function hdlr(k){
    if(k.body+24>k.end)return '';
    var t=cc(k.body+8);
    if(put(k.body+12,k.end,0)>0)st.names++;
    return t;
  }
  function stsd(k,h,info){
    if(k.body+8>k.end)return;
    kids(k,k.body+8).forEach(function(e,i){
      if(h==='soun'&&e.body+16<=e.end){if(put(e.body+12,e.body+16,0)>0)st.names++;return;}
      if(h!=='vide'||e.body+78>e.end)return;
      if(put(e.body+12,e.body+16,0)>0)st.names++;
      if(put(e.body+42,e.body+74,0)>0)st.compressors++;
      if(i===0)info.entry=e.type;
      kids(e,e.body+78).forEach(function(c){
        if(FSC_KILL[c.type])kill(c,'stsd');
        else if(i===0){if(c.type==='avcC')info.avcC=c;else if(c.type==='hvcC')info.hvcC=c;}
      });
    });
  }
  function stbl(k,h,info){
    kids(k).forEach(function(c){
      if(FSC_KILL[c.type])kill(c,'stbl');
      else if(c.type==='stsd')stsd(c,h,info);
      else if(c.type==='stsz'||c.type==='stsc'||c.type==='stco'||c.type==='co64')info[c.type]=c;
    });
  }
  function minf(k,h,info){
    kids(k).forEach(function(c){
      if(FSC_KILL[c.type])kill(c,'minf');
      else if(c.type==='hdlr')hdlr(c);
      else if(c.type==='stbl')stbl(c,h,info);
    });
  }
  function mdia(k,info){
    var ks=kids(k),h='';
    ks.forEach(function(c){if(c.type==='hdlr')h=hdlr(c)||h;else if(c.type==='mdhd')times(c);});
    info.handler=h;
    ks.forEach(function(c){
      if(FSC_KILL[c.type]||c.type==='elng')kill(c,'mdia');
      else if(c.type==='minf')minf(c,h,info);
    });
  }
  function trak(k){
    var info={handler:'',id:-1};
    kids(k).forEach(function(c){
      if(FSC_KILL[c.type])kill(c,'trak');
      else if(c.type==='tkhd'){
        var v=b[c.body],io=c.body+(v===1?20:12);
        if((v===0||v===1)&&io+4<=c.end)info.id=dv.getUint32(io,false);
        times(c);
      }
      else if(c.type==='mdia')mdia(c,info);
    });
    if(info.handler==='vide')infos.push(info);
    else if(info.handler&&info.handler!=='soun'){
      var msg='faixa extra mantida ('+info.handler.replace(/[^\x20-\x7e]/g,'?')+')';
      if(st.issues.indexOf(msg)<0)st.issues.push(msg);
    }
  }
  function unk(c,where){
    var msg='caixa desconhecida mantida ('+c.type.replace(/[^\x20-\x7e]/g,'?')+(where?' em '+where:'')+')';
    if(st.issues.indexOf(msg)<0&&st.issues.length<20)st.issues.push(msg);
  }
  function moov(k){
    kids(k).forEach(function(c){
      if(c.type==='cmov'){st.issues.push('moov comprimido não suportado');}
      else if(c.type==='mvhd')times(c);
      else if(c.type==='trak')trak(c);
      else if(FSC_PAD[c.type])pad(c);
      else if(FSC_KILL[c.type])kill(c,'moov');
      else if(!FSC_MOOV[c.type])unk(c,'moov');
    });
  }
  function moof(k){
    kids(k).forEach(function(c){
      if(FSC_KILL[c.type])kill(c,'moof');
      else if(c.type==='traf')kids(c).forEach(function(d){if(FSC_KILL[d.type])kill(d,'traf');});
    });
  }
  function seiNal(ns,ne,hdr){
    if(ne-ns<hdr+2||b[ne-1]!==0x80){st.seiSkipped++;return null;}
    for(var i=ns;i+2<ne;i++){if(b[i]===0&&b[i+1]===0&&b[i+2]===3){st.seiSkipped++;return null;}}
    var out=[],p=ns+hdr,lim=ne-1;
    while(p<lim){
      var t=0,s=0;
      while(p<lim&&b[p]===255){t+=255;p++;}
      if(p>=lim){st.seiSkipped++;return null;}
      t+=b[p++];
      while(p<lim&&b[p]===255){s+=255;p++;}
      if(p>=lim){st.seiSkipped++;return null;}
      s+=b[p++];
      if(p+s>lim){st.seiSkipped++;return null;}
      if(t===5)out.push([p,p+s]);
      p+=s;
    }
    return p===lim?out:(st.seiSkipped++,null);
  }
  function isSei(kind,h){return kind==='h264'?(h&31)===6:(((h>>1)&63)===39||((h>>1)&63)===40);}
  function patchSei(ns,ne,kind){
    var r=seiNal(ns,ne,kind==='h264'?1:2);
    if(r){for(var m=0;m<r.length;m++){if(put(r[m][0],r[m][1],FSC_FILL)>0)st.sei++;}}
  }
  function codec(info){
    if(info.avcC&&info.avcC.body+5<=info.avcC.end)return {kind:'h264',nl:(b[info.avcC.body+4]&3)+1};
    if(info.hvcC&&info.hvcC.body+23<=info.hvcC.end)return {kind:'hevc',nl:(b[info.hvcC.body+21]&3)+1};
    return null;
  }
  function sample(cd,off,size){
    var nl=cd.nl;
    if(off<0||off+size>len||size<nl){st.seiSkipped++;return;}
    var p=off,end=off+size,found=[];
    while(p<end){
      if(p+nl>end)return void st.seiSkipped++;
      var l=0;for(var q=0;q<nl;q++)l=l*256+b[p+q];
      p+=nl;
      if(l<1||p+l>end)return void st.seiSkipped++;
      if(isSei(cd.kind,b[p]))found.push([p,p+l]);
      p+=l;
    }
    if(p!==end)return void st.seiSkipped++;
    for(var u=0;u<found.length;u++)patchSei(found[u][0],found[u][1],cd.kind);
  }
  function scrubCfg(info,cd){
    var h=info.hvcC;
    if(cd.kind!=='hevc'||!h||h.body+23>h.end)return;
    var p=h.body+23,na=b[h.body+22];
    for(var a=0;a<na;a++){
      if(p+3>h.end)return void st.seiSkipped++;
      var cnt=(b[p+1]<<8)|b[p+2];p+=3;
      for(var m=0;m<cnt;m++){
        if(p+2>h.end)return void st.seiSkipped++;
        var l=(b[p]<<8)|b[p+1];p+=2;
        if(p+l>h.end||l<2)return void st.seiSkipped++;
        if(isSei('hevc',b[p]))patchSei(p,p+l,'hevc');
        p+=l;
      }
    }
  }
  function scrubTables(info,cd){
    var z=info.stsz,c=info.stsc,o=info.stco||info.co64,co64=!info.stco;
    if(!z||!c||!o||z.body+12>z.end||c.body+8>c.end||o.body+8>o.end){st.notes.push('tabela de amostras ausente: SEI não verificado');return;}
    var fixed=dv.getUint32(z.body+4,false),count=dv.getUint32(z.body+8,false),nc=dv.getUint32(c.body+4,false),nco=dv.getUint32(o.body+4,false),esz=co64?8:4;
    if(count===0)return;
    if((fixed===0&&z.body+12+count*4>z.end)||nc<1||c.body+8+nc*12>c.end||o.body+8+nco*esz>o.end){st.notes.push('tabela de amostras inválida: SEI não verificado');return;}
    var e=0,si=0;
    for(var ch=1;ch<=nco&&si<count;ch++){
      while(e+1<nc&&dv.getUint32(c.body+8+(e+1)*12,false)<=ch)e++;
      var per=dv.getUint32(c.body+8+e*12+4,false);
      var off=co64?dv.getUint32(o.body+8+(ch-1)*8,false)*4294967296+dv.getUint32(o.body+12+(ch-1)*8,false):dv.getUint32(o.body+8+(ch-1)*4,false);
      for(var k=0;k<per&&si<count;k++){
        var sz=fixed||dv.getUint32(z.body+12+si*4,false);
        sample(cd,off,sz);off+=sz;si++;
      }
    }
    if(si!==count)st.notes.push('tabela de amostras incompleta: SEI parcial');
  }
  function scrubFrag(m,byId){
    var prevEnd=m.off;
    kids(m).forEach(function(t){
      if(t.type!=='traf')return;
      var ks=kids(t),h=null;
      ks.forEach(function(c){if(c.type==='tfhd')h=c;});
      if(!h||h.body+8>h.end)return void st.seiSkipped++;
      var fl=(b[h.body+1]<<16)|(b[h.body+2]<<8)|b[h.body+3],id=dv.getUint32(h.body+4,false),p=h.body+8,base,dsz=0;
      if(fl&1){if(p+8>h.end)return void st.seiSkipped++;base=dv.getUint32(p,false)*4294967296+dv.getUint32(p+4,false);p+=8;}
      else base=(fl&0x20000)?m.off:prevEnd;
      if(fl&2)p+=4;
      if(fl&8)p+=4;
      if(fl&16){if(p+4>h.end)return void st.seiSkipped++;dsz=dv.getUint32(p,false);}
      var cd=byId[id],ptr=base;
      ks.forEach(function(c){
        if(c.type!=='trun'||c.body+8>c.end)return;
        var f=(b[c.body+1]<<16)|(b[c.body+2]<<8)|b[c.body+3],cnt=dv.getUint32(c.body+4,false),q=c.body+8;
        if(f&1){if(q+4>c.end)return void st.seiSkipped++;ptr=base+dv.getInt32(q,false);q+=4;}
        if(f&4)q+=4;
        var per=((f&0x100)?4:0)+((f&0x200)?4:0)+((f&0x400)?4:0)+((f&0x800)?4:0);
        if(cnt>500000||q+cnt*per>c.end)return void st.seiSkipped++;
        for(var i=0;i<cnt;i++){
          var sz=dsz;
          if(f&0x200)sz=dv.getUint32(q+((f&0x100)?4:0),false);
          q+=per;
          if(cd)sample(cd,ptr,sz);
          ptr+=sz;
        }
      });
      prevEnd=ptr;
    });
  }
  var top=[],p=0,n=0;
  while(p<len){
    var k=rd(p,len);
    if(!k){if(!allZero(p,len))st.issues.push('dados fora de lugar no fim do arquivo');break;}
    top.push(k);p=k.end;if(++n>100000){st.issues.push('caixas demais');return st;}
  }
  var hasMoov=top.some(function(k){return k.type==='moov';}),hasMoof=top.some(function(k){return k.type==='moof';});
  if(!hasMoov&&!hasMoof){st.issues.push('não parece um MP4');return st;}
  st.fragmented=hasMoof;
  var moofs=[];
  top.forEach(function(k){
    if(FSC_PAD[k.type])pad(k);
    else if(k.type==='moov')moov(k);
    else if(k.type==='moof'){moof(k);moofs.push(k);}
    else if(FSC_KILLTOP[k.type])kill(k,'raiz');
    else if(!FSC_TOP[k.type])unk(k,'');
  });
  var byId={};
  infos.forEach(function(info){
    var cd=codec(info);
    if(!cd)return;
    scrubCfg(info,cd);
    if(info.id>=0)byId[info.id]=cd;
    if(!st.fragmented)scrubTables(info,cd);
  });
  if(st.fragmented)moofs.forEach(function(m){scrubFrag(m,byId);});
  st.mdat=top.filter(function(k){return k.type==='mdat';}).map(function(k){return [k.body,k.end];});
  st.ok=true;
  return st;
}
function fscAt(b,i,s){if(i+s.length>b.length)return false;for(var m=0;m<s.length;m++){if(b[i+m]!==s.charCodeAt(m))return false;}return true;}
function fscDig(b,p,min,max){var n=0;while(n<max&&b[p+n]>=48&&b[p+n]<=57)n++;return n>=min?n:0;}
function fscSig(b){
  var n=0,len=b.length,i=0,k;
  while((i=b.indexOf(76,i))>=0){
    if(b[i+1]===97&&b[i+2]===118&&(b[i+3]===99||b[i+3]===102)){
      var p=i+4,x=fscDig(b,p,1,3);
      if(x&&b[p+x]===46){
        p+=x+1;x=fscDig(b,p,1,4);
        if(x&&b[p+x]===46){
          p+=x+1;x=fscDig(b,p,1,4);
          if(x){p+=x;for(k=i;k<p;k++){if(b[k]!==32){b[k]=32;n++;}}}
        }
      }
    }
    i++;
  }
  i=0;
  while((i=b.indexOf(120,i))>=0){
    if(fscAt(b,i,'x264 - core ')||fscAt(b,i,'x265 (build ')){
      var e=i;
      while(e<len&&e-i<4096&&b[e]>=32&&b[e]<127)e++;
      for(k=i;k<e;k++){if(b[k]!==32){b[k]=32;n++;}}
      i=e;
    }else i++;
  }
  return n;
}
function fscScan(b,start,end,pats){
  var found=[],first={},v=b.subarray(start,end);
  pats.forEach(function(p){var c=p.charCodeAt(0);(first[c]=first[c]||[]).push(p);});
  Object.keys(first).forEach(function(c){
    var pend=first[c].slice(),pos=0;
    while(pend.length&&(pos=v.indexOf(+c,pos))>=0){
      for(var q=pend.length-1;q>=0;q--){
        if(fscAt(v,pos,pend[q])){found.push(pend[q]);pend.splice(q,1);}
      }
      pos++;
    }
  });
  return found;
}
function fscFind(b,mdat){
  var found=[],gaps=[],cur=0;
  function add(l){l.forEach(function(p){if(found.indexOf(p)<0)found.push(p);});}
  (mdat||[]).slice().sort(function(x,y){return x[0]-y[0];}).forEach(function(r){if(r[0]>cur)gaps.push([cur,r[0]]);if(r[1]>cur)cur=r[1];});
  if(cur<b.length)gaps.push([cur,b.length]);
  gaps.forEach(function(g){add(fscScan(b,g[0],g[1],FSC_PATTERNS));});
  (mdat||[]).forEach(function(r){add(fscScan(b,r[0],r[1],FSC_DATA));});
  return found;
}
function fscNote(r){
  if(!r)return 'limpeza indisponível';
  var m=(r.issues||[]).slice(0,2).concat((r.leftovers||[]).length?['restou assinatura: '+r.leftovers.slice(0,3).join(', ')]:[]);
  return m.join('; ');
}
function cleanMp4(input){
  var rep={ok:false,clean:false,size:0,passes:0,changed:0,removed:[],times:0,names:0,compressors:0,padding:0,sei:0,sig:0,seiSkipped:0,fragmented:false,issues:[],notes:[],leftovers:[]};
  var src;
  try{src=input instanceof Uint8Array?input:new Uint8Array(input);}catch(e){rep.issues.push('entrada inválida');return {ok:false,clean:false,data:null,report:rep};}
  rep.size=src.length;
  try{
    var b=new Uint8Array(src.length);b.set(src);
    var last=null;
    for(var pass=1;pass<=3;pass++){
      last=fscPass(b);rep.passes=pass;
      if(!last.ok)break;
      if(pass===1){fscSum(rep,last);rep.removed=last.removed;rep.fragmented=last.fragmented;}
      else{rep.changed+=last.changed;}
      if(last.changed===0)break;
    }
    if(!last||!last.ok){rep.issues=last?last.issues:['falha ao ler o arquivo'];rep.notes=[];return {ok:false,clean:false,data:src,report:rep};}
    rep.sig=fscSig(b);rep.changed+=rep.sig;
    var chk=fscPass(b);rep.passes++;
    rep.issues=chk.issues.slice();rep.notes=chk.notes.slice();
    if(chk.changed!==0)rep.issues.push('a limpeza não estabilizou');
    rep.leftovers=fscFind(b,chk.mdat);
    rep.ok=true;
    rep.clean=rep.issues.length===0&&rep.leftovers.length===0;
    return {ok:true,clean:rep.clean,data:b,report:rep};
  }catch(e){
    rep.issues.push('falha inesperada: '+(e&&e.message));
    return {ok:false,clean:false,data:src,report:rep};
  }
}

window.fsCleanMp4=cleanMp4;window.fsCleanNote=fscNote;
})();
