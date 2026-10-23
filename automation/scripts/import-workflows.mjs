/** Run inside the isolated n8n container; imports only these five workflow IDs. */
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const ids=['northstarIntake','northstarProcess','northstarIngest','northstarDispatch','northstarRecover'];
const token=process.env.WORKFLOW_TOKEN;
if(!token||token.length<24)throw new Error('WORKFLOW_TOKEN must contain 24+ characters.');
const host=process.env.NORTHSTAR_SMTP_HOST||'mailpit';
if(!['mailpit','provider-fixture'].includes(host))throw new Error('Bootstrap imports only the local Mailpit sink. Configure a separate SMTP credential explicitly in the n8n editor for optional live delivery.');
const directory=await mkdtemp(join(tmpdir(),'northstar-credentials-'));
try {
 const path=join(directory,'credentials.json');
 await writeFile(path,JSON.stringify([
  {id:'northstar-webhook',name:'Northstar workflow token',type:'httpHeaderAuth',data:{name:'Authorization',value:'Bearer '+token}},
  {id:'northstar-mailpit',name:'Northstar configured SMTP sink',type:'smtp',data:{host,port:Number(process.env.NORTHSTAR_SMTP_PORT||1025),secure:false,disableStartTls:true,user:'',password:''}},
 ]),{mode:0o600});
 const run=args=>execFileSync('n8n',args,{stdio:'inherit'});
 run(['import:credentials','--input='+path]);
 run(['import:workflow','--separate','--input=/opt/automation/workflows']);
 for(const id of ids)run(['publish:workflow','--id='+id]);
 console.log('Imported five Northstar workflows. Restart n8n to register published webhooks.');
}finally{await rm(directory,{recursive:true,force:true});}
