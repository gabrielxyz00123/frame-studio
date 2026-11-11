import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url);
function run(args,env=process.env){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env});if(r.status!==0)process.exit(r.status||1);}
for(const dir of ['api','public','scripts','lib'])for(const file of readdirSync(new URL(dir+'/',root)))if(/\.(mjs|js)$/.test(file))run(['--check',dir+'/'+file]);
const env={...process.env,SUPABASE_URL:'https://supabase.example.test',SUPABASE_PUBLISHABLE_KEY:'fixture-public-key'};
for(const file of readdirSync(new URL('tests/',root)))if(file.endsWith('.mjs'))run(['tests/'+file],env);
