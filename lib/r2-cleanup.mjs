import {r2Config,presign,validKey} from '../api/_r2.js';
const unescape = text => text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
export function parseList(xml,owner){
 if(!/<ListBucketResult(?:\s|>)/.test(xml))throw Error('Resposta de armazenamento inválida.');
 const objects=[];
 for(const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
  const value=tag=>unescape(match[1].match(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>'))?.[1]||'');
  const path=decodeURIComponent(value('Key')),created=value('LastModified'),bytes=Number(value('Size'));
  if(validKey(owner,path)&&Number.isFinite(bytes)&&bytes>=0)objects.push({path,created,bytes,store:'r2'});
 }
 const more=/<IsTruncated>true<\/IsTruncated>/.test(xml);
 const token=unescape(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]||'');
 if(more&&!token)throw Error('A revisão do armazenamento ficou incompleta.');
 return {objects,token:more?token:null};
}
export async function listR2(owner,deadline=Date.now()+35000){
 const cfg=r2Config();if(!cfg)return [];
 let cursor=null,objects=[];
 do{
  if(Date.now()>deadline)throw Error('A revisão demorou mais que o esperado. Nenhum arquivo foi excluído.');
  const query={'list-type':'2','encoding-type':'url',prefix:owner+'/','max-keys':'1000'};
  if(cursor)query['continuation-token']=cursor;
  const response=await fetch(presign(cfg,'GET','',{expires:60,query}),{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Não foi possível revisar o armazenamento R2. Nenhum arquivo foi excluído.');
  const xml=await response.text();if(xml.length>10000000)throw Error('A revisão é grande demais.');
  const page=parseList(xml,owner);objects.push(...page.objects);cursor=page.token;
  if(objects.length>5000)throw Error('Revise esta biblioteca em partes antes de limpar.');
 }while(cursor);
 return objects;
}
export async function removeR2(owner,path){
 const cfg=r2Config();if(!cfg||!validKey(owner,path))throw Error('Arquivo inválido.');
 const response=await fetch(presign(cfg,'DELETE',path,{expires:60}),{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok&&response.status!==404)throw Error('Não foi possível remover um dos arquivos. Revise a lista novamente.');
}
