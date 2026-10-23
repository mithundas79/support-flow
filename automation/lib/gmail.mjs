/** Normalize n8n parsed Gmail output or Gmail API multipart/plain payloads. */
export function normalizeGmail(message, mailboxKey) {
 if(!message||typeof message!=='object'||!/^[-a-zA-Z0-9_]{1,80}$/.test(mailboxKey||''))throw new Error('Configure a stable GMAIL_MAILBOX_KEY for this dedicated mailbox.');
 if(typeof message.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(message.id))throw new Error('Gmail immutable message id is required.');
 if(Number(message.sizeEstimate||0)>250000)throw new Error('Message exceeds the 250 KB intake limit; review it manually.');
 const headers=Array.isArray(message.payload?.headers)?message.payload.headers:[];
 const header=name=>headers.find(x=>typeof x.name==='string'&&x.name.toLowerCase()===name)?.value;
 let address,name;
 if(Array.isArray(message.from?.value)){
  if(message.from.value.length!==1)throw new Error('Exactly one sender is required.');
  address=message.from.value[0].address;name=message.from.value[0].name;
 }else{
  const from=typeof message.From==='string'?message.From:typeof message.from==='string'?message.from:header('from');
  if(typeof from!=='string'||/[\r\n]/.test(from))throw new Error('A valid sender is required.');
  const addresses=from.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)||[];
  if(addresses.length!==1)throw new Error('Exactly one sender is required.');
  address=addresses[0];name=from.includes('<')?from.slice(0,from.indexOf('<')).trim().replace(/^"|"$/g,''):'';
 }
 if(typeof address!=='string'||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address)||address.length>320||/[\r\n]/.test(String(name||'')))throw new Error('Invalid sender address.');
 function plain(part){
  if(!part||typeof part!=='object')return '';
  if(typeof part.filename==='string'&&part.filename)return '';
  if(part.mimeType==='text/plain'&&typeof part.body?.data==='string')return Buffer.from(part.body.data,'base64url').toString('utf8');
  if(Array.isArray(part.parts))return part.parts.map(plain).filter(Boolean).join('\n');
  return '';
 }
 const body=typeof message.text==='string'?message.text:plain(message.payload);
 if(!body?.trim())throw new Error('No plain-text body is available; request a description manually. Attachments and remote HTML are not fetched.');
 if(body.trim().length>50000)throw new Error('Plain-text body exceeds 50,000 characters; preserve it for manual review.');
 const subject=String(message.subject||message.Subject||header('subject')||'(no subject)').replace(/[\r\n]+/g,' ').trim()||'(no subject)';
 if(subject.length>300)throw new Error('Subject exceeds 300 characters; preserve it for manual review.');
 return {externalId:'gmail:'+mailboxKey+':'+message.id,subject,body:body.trim(),customerName:(String(name||'').trim()||address.split('@')[0]).slice(0,200),customerEmail:address.toLowerCase()};
}
