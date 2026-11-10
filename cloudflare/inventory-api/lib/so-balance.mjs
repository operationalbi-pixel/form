import {parseReportNumber_} from './receipt-report.mjs';

export function createdMillis(value) {
  const numeric=Number(value);
  if(Number.isFinite(numeric)&&numeric>0)return numeric>100000000000?numeric:numeric*1000;
  const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0;
}
export function normalizeSoLedger(row) {
  const r={...row,logical_id:row.logical_id||row.record_id,version:Number(row.version||1),created_ms:createdMillis(row.created_at),quantity:Number(row.quantity??row.qty??0),opname_qty:null,opname_date:''};
  const info=String(row.info||'');
  if(row.record_type==='OPNAME_DETAIL') {
    try {
      const audit=JSON.parse(info),value=audit.actualQty===undefined||audit.actualQty===null||audit.actualQty===''?audit.stockOpnameBalance:audit.actualQty;
      if((typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value)))r.opname_qty=Number(value);
      r.opname_date=String(audit.eventDate||audit.effectiveDate||audit.stockOpnameDate||row.event_date||'').slice(0,10);
    }catch{}
  }
  if(row.movement_type==='Stock Opname') {
    const qty=/(?:→\s*Balance|Balance)\s+(-?[\d.,]+)/i.exec(info)||/Stock awal\s+\d{4}-\d{2}-\d{2}\s+(-?[\d.,]+)/i.exec(info);
    if(qty){const n=parseReportNumber_(qty[1]);if(Number.isFinite(n))r.opname_qty=n;}
    const date=/(?:Hasil Stock Opname tanggal|Upload Stock Opname)\s+(\d{4}-\d{2}-\d{2})/i.exec(info)||/Koreksi tanggal SO\s+\d{4}-\d{2}-\d{2}\s+→\s+(\d{4}-\d{2}-\d{2})/i.exec(info);
    r.opname_date=date?date[1]:String(row.event_date||'').slice(0,10);
  }
  return r;
}
function newer(a,b) {
  return !b||a.version>b.version||a.version===b.version&&(String(a.created_at)>String(b.created_at)||String(a.created_at)===String(b.created_at)&&a.record_id>b.record_id);
}

// Resolve versions globally BEFORE filtering scope: a correction may move an
// item to another outlet, date or location in a different history partition.
export function soBalances(raw,{outlet,location,eventDate,codes}) {
  const active=new Map();
  for(const rawRow of raw){const r=normalizeSoLedger(rawRow);if(newer(r,active.get(r.logical_id)))active.set(r.logical_id,r);}
  const wanted=new Set(codes),groups=new Map(),result=Object.fromEntries(codes.map(c=>[c,0]));
  for(const r of active.values()) {
    if(r.outlet_code!==outlet||r.location_code!==location||!wanted.has(r.item_code))continue;
    if(!groups.has(r.item_code))groups.set(r.item_code,[]);groups.get(r.item_code).push(r);
  }
  for(const [code,rows] of groups) {
    const audits=new Map();
    for(const r of rows)if(r.record_type==='OPNAME_DETAIL') {
      const key=(r.source_hash||'')+'|'+(r.source_row||0),previous=audits.get(key);
      if(!previous||r.created_ms>=previous.created_ms)audits.set(key,r);
    }
    const movements=rows.filter(r=>r.record_type==='MOVEMENT').map(r=>{
      if(r.movement_type!=='Stock Opname')return r;
      const audit=audits.get((r.source_hash||'')+'|'+(r.source_row||0));
      const qty=audit?.opname_qty??r.opname_qty,date=audit?.opname_date||r.opname_date;
      return {...r,opname_qty:qty,opname_date:date,event_date:date||r.event_date};
    }).filter(r=>r.event_date<=eventDate);
    let checkpoint;
    for(const r of movements)if(r.movement_type==='Stock Opname'&&r.opname_qty!==null) {
      if(!checkpoint||r.opname_date>checkpoint.opname_date||r.opname_date===checkpoint.opname_date&&r.created_ms>=checkpoint.created_ms)checkpoint=r;
    }
    result[code]=movements.reduce((sum,r)=>{
      if(checkpoint&&(r.event_date<=checkpoint.opname_date||r.movement_type==='Stock Opname'))return sum;
      return sum+(r.direction==='IN'?r.quantity:r.direction==='OUT'?-r.quantity:0);
    },checkpoint?.opname_qty??0);
  }
  return result;
}
