/** Isolated fixture stack. Requires a running Docker Linux engine. No real provider key. */
import { spawnSync, spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const project='support-flow-test-'+process.pid;
const env={...process.env,POSTGRES_PASSWORD:'fixture-database-password',REVIEWER_TOKEN:'fixture-reviewer-token-only-00000001',WORKFLOW_TOKEN:'fixture-workflow-token-only-00000002',N8N_ENCRYPTION_KEY:'fixture-n8n-encryption-key-00000003',APP_ORIGIN:'http://localhost:5173',OPENAI_BASE_URL:'http://provider-fixture:4010/v1',OPENAI_API_KEY:'controlled-fixture-no-real-key',OPENAI_TEXT_MODEL:'fixture-structured-model',OPENAI_EMBEDDING_MODEL:'fixture-embedding-1536',PROVIDER_TIMEOUT_MS:'1500',SLACK_ENABLED:'false',SLACK_WEBHOOK_URL:'',NORTHSTAR_SMTP_HOST:'provider-fixture',ACCEPTANCE_ALLOW_RESTART:'1',ACCEPTANCE_COMPOSE_PROJECT:project,COMPOSE_PROJECT_NAME:project,ACCEPTANCE_COMPOSE_FILES:'docker-compose.yml'};
env.AI_PROVIDER_MODE='fixture';env.DELIVERY_MODE='mailpit';env.AUTO_POLL_ENABLED='false';env.DATABASE_URL='postgresql://support_flow:fixture-database-password@127.0.0.1:5432/support_flow';
const run=(file,args,check=true)=>{console.log('>',file,args.join(' '));const r=spawnSync(file,args,{cwd:root,env,stdio:'inherit',windowsHide:true,shell:process.platform==='win32'&&file==='npm.cmd'});if(check&&(r.status!==0||r.error))throw new Error(file+' failed with '+r.status+(r.error?' '+r.error.message:''));return r;};
const compose=args=>run('docker',['compose','-p',project,...args]);
let started=false,vite;
try{
 run('docker',['version','--format','{{.Server.Version}}']);
 started=true;compose(['up','-d','--build','--wait','--wait-timeout','240']);
 run(process.platform==='win32'?'npm.cmd':'npm',['run','test:integration','--workspace','@support-flow/api']);
 compose(['exec','-T','n8n','node','/opt/automation/scripts/import-workflows.mjs']);
 compose(['restart','n8n']);
 for(let attempt=0;attempt<90;attempt++){
  try{const r=await fetch('http://127.0.0.1:5678/healthz/readiness');if(r.ok)break;}catch{}
  if(attempt===89)throw new Error('n8n did not become ready after import');
  await new Promise(r=>setTimeout(r,1000));
 }
 run(process.execPath,['--test','--test-concurrency=1','automation/tests/stack.test.mjs']);
 let independent=[];try{independent=(await readdir(new URL('../../tests/acceptance/',import.meta.url))).filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/acceptance/'+x);}catch{}
 if(independent.length)run(process.execPath,['--test','--test-concurrency=1',...independent]);
 env.PLAYWRIGHT_LIVE_URL='http://localhost:5173/support-flow/';env.PLAYWRIGHT_EXTERNAL_SERVER='1';env.VITE_API_MODE='live';env.PLAYWRIGHT_JSON_OUTPUT_NAME=join(root,'test-results','live-report.json');
 vite=spawn(process.execPath,[join(root,'node_modules','vite','bin','vite.js'),'--host','localhost','--port','5173','--strictPort'],{cwd:join(root,'apps','web'),env,stdio:'inherit',windowsHide:true});
 let viteError;vite.on('error',error=>{viteError=error;});
 for(let attempt=0;attempt<40;attempt++){
  if(viteError||vite.exitCode!==null)throw new Error('Live Vite server exited before verification: '+(viteError?.message||vite.exitCode));
  try{if((await fetch(env.PLAYWRIGHT_LIVE_URL)).ok)break;}catch{}
  if(attempt===39)throw new Error('Live Vite server did not become ready');
  await new Promise(r=>setTimeout(r,500));
 }
 run(process.execPath,[join(root,'node_modules','@playwright','test','cli.js'),'test','tests/e2e/independent-live.spec.ts','--reporter=list,json']);
 const report=JSON.parse(await readFile(env.PLAYWRIGHT_JSON_OUTPUT_NAME,'utf8'));
 if(report.stats.skipped!==0||report.stats.unexpected!==0||report.stats.expected<2)throw new Error('Live browser verification requires desktop + mobile, zero skipped and zero failures.');
}catch(error){
 if(started){run('docker',['compose','-p',project,'logs','--tail','120'],false);}
 console.error(error.message);process.exitCode=1;
}finally{
 if(vite&&!vite.killed)vite.kill('SIGTERM');
 // These volumes belong only to this PID-named disposable test project.
 if(started)run('docker',['compose','-p',project,'down','--volumes','--remove-orphans'],false);
}
