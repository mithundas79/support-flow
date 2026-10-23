import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
if(existsSync('.env')&&typeof process.loadEnvFile==='function')process.loadEnvFile('.env');
const [name,path]=process.argv.slice(2);
if(!['ingest','intake','process','dispatch','recover'].includes(name))throw new Error('Usage: node automation/scripts/invoke-workflow.mjs <ingest|intake|process|dispatch|recover> [request.json]');
if(!process.env.WORKFLOW_TOKEN)throw new Error('Set WORKFLOW_TOKEN in your ignored .env.');
const body=path?JSON.parse(await readFile(path,'utf8')):{};
const base=process.env.N8N_URL||'http://localhost:5678';
const deadline=Date.now()+30000;
let ready=false;
while(Date.now()<deadline){
 try{if((await fetch(base+'/healthz/readiness',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,500));
}
if(!ready)throw new Error('n8n did not become ready within 30 seconds after restart.');
const response=await fetch(base+'/webhook/northstar-'+name,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+process.env.WORKFLOW_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
const text=await response.text();
if(!response.ok)throw new Error('Workflow HTTP '+response.status+'; check the restricted n8n execution history.');
console.log(text);
