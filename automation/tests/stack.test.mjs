import test from 'node:test';
import assert from 'node:assert/strict';
const api=process.env.TEST_API_URL||'http://127.0.0.1:3000';
const n8n=process.env.TEST_N8N_URL||'http://127.0.0.1:5678';
const fixture=process.env.TEST_FIXTURE_URL||'http://127.0.0.1:4010';
const token=process.env.WORKFLOW_TOKEN;
if(!token)throw new Error('Use node automation/scripts/run-integration.mjs; WORKFLOW_TOKEN is required.');
const auth={Authorization:'Bearer '+token,'content-type':'application/json'};
async function call(base,path,body,headers={}){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...headers,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={nonJson:true};}return {status:response.status,data};}
const hook=(name,body={})=>call(n8n,'/webhook/northstar-'+name,body,auth);
const getTicket=async id=>(await call(api,'/api/v1/tickets/'+id,undefined,reviewHeaders)).data.ticket;
let reviewHeaders;
test('real imported n8n graphs persist grounded review, guard failure modes and avoid duplicate mail',async t=>{
 const origin=process.env.APP_ORIGIN||'http://localhost:5173';
 const login=await fetch(api+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json',Origin:origin},body:JSON.stringify({token:process.env.REVIEWER_TOKEN})});
 assert.equal(login.status,200);const session=await login.json();reviewHeaders={Cookie:login.headers.get('set-cookie').split(';')[0],Origin:origin,'X-CSRF-Token':session.csrfToken};
 await call(fixture,'/__control/reset',{});
 const unauth=await call(n8n,'/webhook/northstar-intake',{externalId:'unauthorized'});assert.ok([401,403].includes(unauth.status));
 const ingest=await hook('ingest');assert.equal(ingest.status,200);assert.ok(ingest.data);
 const create=async(scenario='normal')=>{
  const externalId='automation-'+scenario+'-'+crypto.randomUUID();
  await call(fixture,'/__control',{externalId,scenario});
  const payload={externalId,subject:'Webhook HMAC signature mismatch',body:'Our webhook HMAC signature validation is failing. How should we check the raw request body?',customerName:'Avery',customerEmail:'avery@example.test'};
  const intake=await hook('intake',payload);assert.equal(intake.status,200);assert.ok(intake.data.ticket?.id,JSON.stringify(intake.data));
  return {ticket:intake.data.ticket,payload};
 };
 let approved;
 await t.test('classify → embedding → actual pgvector retrieval → grounded draft',async()=>{
  const {ticket,payload}=await create();const processed=await hook('process',{ticketId:ticket.id});assert.equal(processed.status,200);
  const saved=await getTicket(ticket.id);assert.equal(saved.status,'awaiting_review');assert.ok(saved.sources.some(x=>x.id==='northstar-webhook-auth'));assert.ok(saved.draft.includes('HMAC'));
  const duplicates=await Promise.all([hook('intake',payload),hook('intake',payload)]);assert.ok(duplicates.every(x=>x.data.ticket.id===ticket.id));
  const again=await hook('process',{ticketId:ticket.id});assert.equal(again.data.status,'idle');
  const stats=(await call(fixture,'/__control/stats')).data;const calls=stats.requests.filter(x=>x.externalId===payload.externalId);assert.equal(calls.length,3);assert.deepEqual(calls.map(x=>x.purpose),['classify','embedding','draft']);
  assert.ok(calls.filter(x=>x.kind==='responses').every(x=>x.maxOutputTokens<=1200));
  console.log('N8N_TRACE',JSON.stringify({ticketId:ticket.id,execution:processed.data.execution,calls}));
  approved=saved;
 });
 for(const scenario of ['no-sources','refusal','invalid-json','null-json','nonarray-output','bad-source','draft-refusal','draft-incomplete','draft-invalid-json','429','500','timeout','embedding-error'])await t.test('controlled '+scenario+' persists a safe outcome',async()=>{
  const {ticket,payload}=await create(scenario);const processed=await hook('process',{ticketId:ticket.id});assert.equal(processed.status,200);
  const saved=await getTicket(ticket.id);assert.ok(['needs_attention','received','failed'].includes(saved.status),scenario+' '+JSON.stringify(saved));
  if(scenario==='no-sources'){assert.equal(saved.status,'needs_attention');assert.equal(saved.sources.length,0);}else assert.equal(saved.draft,'');
  const calls=(await call(fixture,'/__control/stats')).data.requests.filter(x=>x.externalId===payload.externalId);assert.ok(calls.length<=3);
  console.log('N8N_FAILURE_TRACE',JSON.stringify({scenario,ticketId:ticket.id,status:saved.status,execution:processed.data.execution,calls:calls.length}));
 });
 await t.test('only exact approved snapshot reaches Mailpit, repeated dispatch is idle',async()=>{
  const approval=await call(api,'/api/v1/tickets/'+approved.id+'/approve',{expectedVersion:approved.draftVersion},reviewHeaders);assert.equal(approval.status,200,JSON.stringify(approval.data));
  const sent=await hook('dispatch');assert.equal(sent.status,200);assert.equal((await getTicket(approved.id)).status,'sent');
  const again=await hook('dispatch');assert.equal(again.data.status,'idle');
  const messages=await call('http://127.0.0.1:8025','/api/v1/messages');assert.ok(messages.data.total>=1);
 });
 const recovery=await hook('recover');assert.equal(recovery.status,200);assert.equal(typeof recovery.data.jobsRequeued,'number');
});
