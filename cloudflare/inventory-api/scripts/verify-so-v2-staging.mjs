import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';

const endpoint='https://bakerzin-inventory-api-v2-verify-20261110.operational-bi.workers.dev/v1/stock-direct';
const apiKey=process.env.V2_VERIFY_API_KEY;
assert.ok(apiKey,'V2_VERIFY_API_KEY belum tersedia.');

const headers=['BRANCH','LOCATION','PRODUCT','PRODUCT CODE','CATEGORY','SUBCATEGORY','UNIT','OPNAME STOCK'];
const data=[headers,['V2T','Store','V2 Test Item','V2ITEM','Verification','','PCS','3']];
const rows=data.map((row,index)=>`<row r="${index+1}">${row.map((value,column)=>`<c r="${String.fromCharCode(65+column)}${index+1}" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`).join('');
const workbook=Buffer.from(zipSync({'xl/worksheets/sheet1.xml':strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`)})).toString('base64');

function token(){
  const now=Math.floor(Date.now()/1000),claims={aud:'stock-direct-v1',iat:now,exp:now+300,owner:'V2-VERIFY',outlet:'BIHQ',location:'Store'};
  const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature=createHmac('sha256',apiKey).update('stock-direct-v1.'+encoded).digest('base64url');
  return encoded+'.'+signature;
}
async function call(action,payload={}){
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token(),Origin:'https://operationalbi-pixel.github.io','Content-Type':'application/json'},body:JSON.stringify({action,payload})});
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.ok,true,JSON.stringify(body));
  return body.data;
}

const payload={fileName:'SO-V2-VERIFY.xlsx',base64:workbook,eventDate:'2026-10-31',location:'Store'};
const verified=await call('so-verify',payload);
assert.equal(verified.sourceItemCount,1,JSON.stringify(verified));
const accepted=await call('so-accept',payload);
assert.match(accepted.jobId,/^so2-[a-f0-9]{64}$/);

const deadline=Date.now()+8*60*1000;
let job;
while(Date.now()<deadline){
  const status=await call('so-status');
  job=status.jobs.find(entry=>entry.jobId===accepted.jobId);
  if(job?.rawStatus==='COMPLETE')break;
  if(job?.rawStatus==='ACTION_REQUIRED'||job?.rawStatus==='CANCELLED')throw Error('V2 staging berhenti: '+JSON.stringify(job));
  await new Promise(resolve=>setTimeout(resolve,10000));
}
assert.equal(job?.rawStatus,'COMPLETE','V2 staging belum selesai sebelum batas waktu: '+JSON.stringify(job));
assert.equal(job.committed,1,JSON.stringify(job));
console.log(JSON.stringify({result:'SO_V2_STAGING_COMPLETE',jobId:job.jobId,committed:job.committed,total:job.total}));
