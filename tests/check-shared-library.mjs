import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {canReadShared} from '../lib/shared-access.mjs';
import storage from '../api/storage.js';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',video='33333333-3333-4333-8333-333333333333';
const path=other+'/shared/'+video;
let allowed=true,lookups=0,uploads=0;
const original=globalThis.fetch;
globalThis.fetch=async(url,opts={})=>{
 const u=String(url);
 if(u.endsWith('/auth/v1/user'))return Response.json({id:owner});
 if(u.includes('/rest/v1/frame_shared')){lookups++;assert.equal(opts.headers.Authorization,'Bearer fixture');assert.ok(u.includes('deleted=eq.false'));return Response.json(allowed?[{id:video}]:[]);}
 if(opts.method==='HEAD')return new Response('',{status:200});
 throw Error('Unexpected request '+u);
};
process.env.R2_ACCOUNT_ID='fixture';process.env.R2_ACCESS_KEY_ID='fixture';process.env.R2_SECRET_ACCESS_KEY='fixture';process.env.R2_BUCKET='fixture';
async function call(action,p){const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await storage({method:'POST',headers:{host:'studio.test',origin:'https://studio.test',authorization:'Bearer fixture'},query:{action},body:{path:p}},res);return res;}
try{
 assert.equal(await canReadShared(path,'Bearer fixture','https://db.test','fixture'),true);
 allowed=false;assert.equal(await canReadShared(path,'Bearer fixture','https://db.test','fixture'),false);
 const n=lookups;assert.equal(await canReadShared(other+'/private-photo','Bearer fixture','https://db.test','fixture'),false);assert.equal(lookups,n);
 allowed=true;assert.equal((await call('get',path)).code,200);assert.ok((await call('get',path)).data.url);
 assert.equal((await call('put',path)).code,400);assert.equal((await call('delete',path)).code,400);assert.equal((await call('get',other+'/private-photo')).code,400);
 allowed=false;assert.equal((await call('get',path)).code,400,'deleted/inaccessible sharing records cannot authorize a URL');
 console.log('PASS: authenticated read ACL, denial of cross-owner writes/deletes and private paths, and inaccessible/deleted reference blocking.');
}finally{globalThis.fetch=original;}
