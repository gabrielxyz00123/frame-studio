/* Downloads com teto de bytes: interrompe a leitura assim que o limite é ultrapassado,
   em vez de carregar o corpo inteiro na memória antes de conferir o tamanho. */
const error=(status,message)=>Object.assign(new Error(message),{status});
export const MB=1048576;
export async function fetchLimited(url,{max,timeout=20000,label='arquivo',redirect='follow',headers}={}){
  if(!Number.isFinite(max)||max<=0)throw Error('fetchLimited requer max.');
  let target;try{target=new URL(url);}catch{throw error(400,'Endereço de '+label+' inválido.');}
  if(target.protocol!=='https:')throw error(400,'Endereço de '+label+' inválido.');
  const r=await fetch(target,{redirect,headers,signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw error(502,'Não foi possível obter o '+label+'.');
  const declared=Number(r.headers.get('content-length')||0);
  if(declared>max)throw error(413,'O '+label+' ultrapassa '+Math.round(max/MB)+' MB.');
  if(!r.body){const buf=Buffer.from(await r.arrayBuffer());if(buf.length>max)throw error(413,'O '+label+' ultrapassa '+Math.round(max/MB)+' MB.');return buf;}
  const reader=r.body.getReader(),chunks=[];let size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.length;
    if(size>max){try{await reader.cancel();}catch{}throw error(413,'O '+label+' ultrapassa '+Math.round(max/MB)+' MB.');}
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(c=>Buffer.from(c.buffer,c.byteOffset,c.length)),size);
}
