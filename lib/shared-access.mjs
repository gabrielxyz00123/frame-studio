export function missingSharedTable(e){return ['42P01','PGRST205'].includes(e?.code);}
export function sharedPath(path){return typeof path==='string'&&/^[0-9a-f-]{36}\/shared\/[0-9a-f-]{36}$/i.test(path);}
export async function canReadShared(path,token,base,apikey){
 if(!sharedPath(path))return false;
 const url=base+'/rest/v1/frame_shared?path=eq.'+encodeURIComponent(path)+'&deleted=eq.false&select=id&limit=1';
 const r=await fetch(url,{headers:{apikey,Authorization:token},signal:AbortSignal.timeout(10000)});
 if(!r.ok)return false;
 const rows=await r.json();return Array.isArray(rows)&&rows.length===1;
}
