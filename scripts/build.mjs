import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
// This is the recovered deployment, whose APIs use this same public Supabase project.
// Never overwrite its config with unrelated environment variables during deployment.
const source=await readFile(new URL('../public/config.js',import.meta.url),'utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox,{timeout:1000});
const config=sandbox.window.FRAME_CONFIG;
if(!config||new URL(config.url).protocol!=='https:'||!config.publishableKey)throw Error('Configuração pública do projeto inválida.');
for(const name of ['higgsfield','storage','worker']){
 const code=await readFile(new URL('../api/'+name+'.js',import.meta.url),'utf8');
 if(!code.includes(config.url))throw Error('A configuração do cliente e do servidor precisa apontar para o mesmo projeto.');
}
console.log('Configuração pública validada; projeto existente preservado.');
