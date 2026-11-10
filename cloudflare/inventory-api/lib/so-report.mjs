import {findReportHeader_,reportCell_,parseReportNumber_,normalizeStoreName_,cleanText_} from './receipt-report.mjs';
import {soWorkbookRows} from './so-workbook.mjs';

export class SoValidationError extends Error {
  constructor(issues) { super(issues.map(x=>`Baris ${x.row}: ${x.message}`).join('; ')); this.issues=issues; }
}

// No database calls, balance reads, or stock mutations belong in this stage.
export function parseSoWorkbook(base64,fileName,directory) {
  return parseSoRows(soWorkbookRows(base64,fileName),directory);
}

export function parseSoCells(cells,directory) {
  const byRow=new Map();
  for(const [address,value] of Object.entries(cells)) {
    const match=/^[A-Z]+(\d+)$/.exec(address);if(!match)continue;
    const n=Number(match[1]);if(!byRow.has(n))byRow.set(n,{});byRow.get(n)[address]=value;
  }
  return parseSoRows([...byRow].sort((a,b)=>a[0]-b[0]).map(([row,cells])=>({row,cells})),directory);
}

function parseSoRows(input,directory) {
  let header;
  const names=new Map(),codes=new Map();
  for(const entry of directory) {
    if(!entry.active)continue;
    const code=String(entry.code).trim().toUpperCase();
    codes.set(code,code);names.set(normalizeStoreName_(entry.name),code);
  }
  const rows=[],issues=[],seen=new Set();
  for(const {row:sourceRow,cells} of input) {
    if(!header) {
      try{header=findReportHeader_(cells,['BRANCH','LOCATION','PRODUCT','PRODUCT CODE','CATEGORY','SUBCATEGORY','UNIT','OPNAME STOCK']);}catch{continue;}
      if(header.columns.BRANCH!=='A')throw new SoValidationError([{row:header.row,message:'BRANCH wajib di kolom A.'}]);
      continue;
    }
    const read=name=>reportCell_(cells,header,name,sourceRow);
    const code=String(read('PRODUCT CODE')||'').trim().toUpperCase();
    if(!code)continue;
    const branch=cleanText_(cells['A'+sourceRow],160);
    const outlet=codes.get(branch.toUpperCase())||names.get(normalizeStoreName_(branch));
    const actualQty=parseReportNumber_(read('OPNAME STOCK'));
    const name=cleanText_(read('PRODUCT'),180),unit=cleanText_(read('UNIT'),40).toUpperCase();
    const problem=message=>issues.push({row:sourceRow,code,outlet:outlet||branch,message});
    if(!outlet)problem('BRANCH tidak terdaftar sebagai outlet aktif.');
    if(!Number.isFinite(actualQty)||actualQty<0)problem('OPNAME STOCK harus angka nol atau positif.');
    if(!name||!unit)problem('PRODUCT dan UNIT wajib diisi.');
    const key=(outlet||branch)+'|'+code;
    if(seen.has(key))problem('PRODUCT CODE duplikat dalam outlet yang sama.');
    seen.add(key);
    rows.push({sourceRow,outlet,code,name,unit,actualQty,category:cleanText_(read('CATEGORY'),100),subcategory:cleanText_(read('SUBCATEGORY'),100)});
  }
  if(!header)throw new SoValidationError([{row:0,message:'Header Stock Opname tidak ditemukan.'}]);
  if(issues.length)throw new SoValidationError(issues);
  if(!rows.length)throw new SoValidationError([{row:header.row,message:'File tidak berisi item SO.'}]);
  return {schemaVersion:2,headerRow:header.row,outlets:[...new Set(rows.map(r=>r.outlet))],rows};
}

export function validateSoDate(value,today) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value||value>today)
    throw new SoValidationError([{row:0,message:'Tanggal SO tidak valid atau melewati hari ini.'}]);
  return value;
}
