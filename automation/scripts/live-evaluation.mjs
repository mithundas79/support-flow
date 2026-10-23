/** Opt-in synthetic drafting evaluation. Never approves or dispatches email. */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
if(existsSync('.env')&&typeof process.loadEnvFile==='function')process.loadEnvFile('.env');
if(process.env.RUN_LIVE_OPENAI!=='1'||process.env.AI_PROVIDER_MODE!=='openai'||process.env.OPENAI_BASE_URL!=='https://api.openai.com/v1'||!process.env.OPENAI_API_KEY||!process.env.WORKFLOW_TOKEN)throw new Error('Live evaluation is opt-in: set RUN_LIVE_OPENAI=1, AI_PROVIDER_MODE=openai, OPENAI_BASE_URL=https://api.openai.com/v1, an API key and WORKFLOW_TOKEN in ignored .env; recreate n8n with the same provider settings.');
const limit=Number(process.argv.find(x=>x.startsWith('--limit='))?.split('=')[1]||3);
if(!Number.isInteger(limit)||limit<1||limit>30)throw new Error('--limit must be 1..30 (default3). Provider token/call limits do not enforce a currency budget.');
const url=process.env.N8N_URL||'http://localhost:5678';
const hook=async(name,body={})=>{const r=await fetch(url+'/webhook/northstar-'+name,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+process.env.WORKFLOW_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});if(!r.ok)throw new Error('Workflow '+name+' failed HTTP '+r.status);return r.json();};
await hook('ingest');
const tickets=JSON.parse(await readFile(new URL('../../fixtures/tickets/labeled.json',import.meta.url)));
const results=[];
for(const example of tickets.slice(0,limit)){
 const {expectedCategory,expectedPriority,expectedDisposition,...input}=example;
 input.externalId='live-eval-'+crypto.randomUUID();
 const created=await hook('intake',input);
 const processed=await hook('process',{ticketId:created.ticket.id});
 if(processed.execution?.providerMode!=='openai'||processed.execution?.openaiEndpoint!==true)throw new Error('n8n is not running the requested OpenAI configuration. Recreate it before claiming a live evaluation.');
 const ticket=processed.ticket;
 results.push({ticketId:created.ticket.id,execution:processed.execution,expected:{category:expectedCategory,priority:expectedPriority,disposition:expectedDisposition},observed:ticket?{category:ticket.category,priority:ticket.priority,status:ticket.status,sourceIds:ticket.sources.map(x=>x.id),usage:processed.usage}:processed});
}
console.log(JSON.stringify({mode:'opt-in-live-openai',completedAt:new Date().toISOString(),approvedOrSent:false,results},null,2));
