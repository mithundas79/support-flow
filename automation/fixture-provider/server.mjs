/** Controlled OpenAI-shaped fixture. Never a substitute for a live quality evaluation. */
import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const topics = [
  ['webhook','signature','hmac','signing','delivery'], ['sso','saml','identity','idp'],
  ['billing','invoice','refund','charge','subscription','payment'], ['retry','retries','backoff'],
  ['api key','api token','rotate','rotation'], ['role','member','permission','workspace'],
  ['password','reset','login','sign in'], ['slack','channel','connect'],
  ['export','csv','download','data export'], ['rate limit','429','quota','throttle'],
];
export function embedding(text, dimensions = 1536) {
  const lower = text.toLowerCase();
  const vector = Array(dimensions).fill(0);
  topics.forEach((words, index) => { vector[index] = words.reduce((n,w) => n + (lower.includes(w) ? 1 : 0), 0); });
  if (!vector.some(Boolean)) vector[dimensions-1] = 1;
  const magnitude = Math.sqrt(vector.reduce((s,n) => s+n*n,0));
  return vector.map(n => n / magnitude);
}
export function classification(ticket) {
  const text = `${ticket.subject} ${ticket.body}`.toLowerCase();
  let category = 'other';
  if (/billing|invoice|refund|charge|subscription|payment/.test(text)) category='billing';
  else if (/sso|saml|password|login|sign in|locked out/.test(text)) category='access';
  else if (/webhook|signature|hmac|slack|api key|api token|rate limit|429/.test(text)) category='integration';
  else if (/role|permission|workspace|export|csv|timezone|setting/.test(text)) category='configuration';
  const priority = /outage|all users|production down|security breach/.test(text) ? 'urgent' : /blocked|cannot|can't|failing/.test(text) ? 'high' : /question|how do|how can/.test(text) ? 'low' : 'normal';
  const needsHuman = category==='billing' || /delete (my |our )?account|transfer ownership|change (my |our )?email|disable (mfa|2fa)|bypass/.test(text);
  return {category,priority,summary:ticket.subject.slice(0,300),needsHuman,reason:needsHuman?'An authorized specialist must review account or billing actions.':''};
}
export function startFixture({port=4010,smtpPort=1025,mailpitHost=process.env.MAILPIT_HOST||'mailpit',mailpitPort=1025}={}) {
  const scenarios = new Map();
  let requests=[];
  let smtpMode='normal';
  let smtpCount=0;
  let smtpAmbiguous=0;
  const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    let text=''; for await(const chunk of req) {text+=chunk;if(text.length>1_000_000){json(res,413,{error:{message:'Fixture input too large'}});return;}}
    let data={}; try {data=text?JSON.parse(text):{};} catch {json(res,400,{error:{message:'Invalid JSON'}});return;}
    if(req.url==='/health'){json(res,200,{status:'ok',mode:'controlled-fixture'});return;}
    if(req.url==='/__control/reset' && req.method==='POST'){scenarios.clear();requests=[];smtpMode='normal';smtpCount=0;smtpAmbiguous=0;json(res,200,{reset:true});return;}
    if(req.url==='/__control' && req.method==='POST'){
      if(data.scenario==='smtp-ambiguous-once')smtpMode=data.scenario;
      else scenarios.set(data.externalId,data.scenario);
      json(res,200,{configured:true});return;
    }
    if(req.url==='/__control/stats'){json(res,200,{mode:'controlled-fixture',requests,counts:{responses:requests.filter(x=>x.kind==='responses').length,embeddings:requests.filter(x=>x.kind==='embeddings').length,smtp:smtpCount,smtpAmbiguous}});return;}
    const externalId=String(data.metadata?.externalId||req.headers['x-fixture-external-id']||'knowledge-ingest');
    const scenario=scenarios.get(externalId)||'normal';
    if(req.url==='/v1/embeddings'){
      const status=scenario==='embedding-error'?500:200;
      requests.push({kind:'embeddings',purpose:'embedding',externalId,model:data.model,status});
      if(status!==200){json(res,status,{error:{message:'Controlled embedding failure',type:'server_error'}});return;}
      const inputs=Array.isArray(data.input)?data.input:[data.input];
      json(res,200,{object:'list',model:data.model,data:inputs.map((v,index)=>({object:'embedding',index,embedding:embedding(scenario==='no-sources'?'unmatched-fixture-topic':String(v),data.dimensions||1536)})),usage:{prompt_tokens:inputs.length*20,total_tokens:inputs.length*20}});return;
    }
    if(req.url!=='/v1/responses'){json(res,404,{error:{message:'Unknown fixture endpoint'}});return;}
    const purpose=data.metadata?.purpose||data.text?.format?.name;
    const effect=scenario.startsWith('draft-')?(purpose==='draft'?scenario.slice(6):'normal'):scenario;
    let status=effect==='429'?429:effect==='500'?500:200;
    requests.push({kind:'responses',purpose,externalId,model:data.model,maxOutputTokens:data.max_output_tokens,status});
    if(effect==='timeout'){await new Promise(r=>setTimeout(r,3500));}
    if(status!==200){json(res,status,{error:{message:`Controlled provider ${status}`,type:status===429?'rate_limit_error':'server_error'}});return;}
    let input={};try{input=JSON.parse(data.input?.find(x=>x.role==='user')?.content||'{}');}catch{}
    const ticket=input.ticket||input;
    let output;
    if(effect==='refusal')output=[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'Controlled fixture refusal'}]}];
    else {
      let answer;
      if(purpose==='classify')answer=classification(ticket);
      else {
        const source=input.sources?.[0];
        answer={draft:source?`Hello ${ticket.customerName},\n\n${source.excerpt}\n\nPlease let us know whether these steps resolve the issue.\n\nNorthstar Support`:'Could you share the affected feature and the exact error message?',sourceIds:source?[source.id]:[],disposition:source?'review':'clarification'};
        if(effect==='bad-source')answer.sourceIds=['not-retrieved'];
      }
      output=[{id:'msg_'+randomUUID(),type:'message',role:'assistant',content:[{type:'output_text',text:effect==='invalid-json'?'{not-json':JSON.stringify(answer),annotations:[]}]}];
    }
    if(effect==='null-json')output=[{type:'message',role:'assistant',content:[{type:'output_text',text:'null'}]}];
    if(effect==='nonarray-output')output={invalid:true};
    json(res,200,{id:'resp_'+randomUUID(),object:'response',status:effect==='incomplete'?'incomplete':'completed',model:data.model,output,usage:{input_tokens:100,output_tokens:100,total_tokens:200}});
  });
  // SMTP proxy is restricted to one fixed test sink. In the ambiguous mode Mailpit
  // accepts DATA but the client never sees its 250 acknowledgement.
  const smtp=net.createServer(client=>{
    const upstream=net.connect(mailpitPort,mailpitHost);
    let dataAccepted=false,tail='',ambiguous=false;
    client.on('data',chunk=>{tail=(tail+chunk.toString()).slice(-8);if(tail.includes('\r\n.\r\n'))dataAccepted=true;upstream.write(chunk);});
    upstream.on('data',chunk=>{
      if(dataAccepted&&/^250\b/.test(chunk.toString())){
        smtpCount++;
        if(smtpMode==='smtp-ambiguous-once'){smtpMode='normal';smtpAmbiguous++;ambiguous=true;client.destroy();upstream.destroy();return;}
        dataAccepted=false;
      }
      client.write(chunk);
    });
    client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
    client.on('close',()=>upstream.destroy());upstream.on('close',()=>{if(!ambiguous)client.end();});
  });
  server.listen(port,'0.0.0.0');smtp.listen(smtpPort,'0.0.0.0');
  return {server,smtp,close:()=>Promise.all([new Promise(r=>server.close(r)),new Promise(r=>smtp.close(r))])};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)startFixture();
