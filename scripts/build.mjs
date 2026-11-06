import {writeFile} from 'node:fs/promises';
const url=process.env.SUPABASE_URL?.trim();
const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
if(!url||!publishableKey)throw Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY antes de rodar o build.');
const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('SUPABASE_URL deve usar HTTPS.');
await writeFile(new URL('../public/config.js',import.meta.url),'window.FRAME_CONFIG='+JSON.stringify({url:url.replace(/\/$/,''),publishableKey})+';\n');
console.log('Configuração pública gerada. Nenhum segredo do servidor foi incluído.');
