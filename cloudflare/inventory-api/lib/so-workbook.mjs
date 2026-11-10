import {unzipSync} from 'fflate';

function decode(value) {
  return String(value||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{
    if(entity[0]==='#') {
      const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
      if(!Number.isInteger(n)||n<0||n>0x10ffff)throw Error('Karakter XML tidak valid.');
      return String.fromCodePoint(n);
    }
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.toLowerCase()];
  });
}
const attribute=(tag,key)=>decode(new RegExp('(?:^|\\s)'+key+'=["\']([^"\']*)["\']').exec(tag)?.[1]||'');
function texts(xml) {
  let value='';
  for(const match of xml.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g,'').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))value+=decode(match[1]);
  return value;
}

// Iterates worksheet rows without constructing an XML DOM or a 250,000-cell
// object. The real multi-outlet SO is large enough for a DOM to exceed a Worker
// memory budget even though the compressed XLSX is only about one megabyte.
export function* soWorkbookRows(base64,fileName) {
  if(!/\.xlsx$/i.test(fileName||'')||typeof base64!=='string'||base64.length>7*1024*1024)throw Error('Pilih file .xlsx maksimal 5 MB.');
  let bytes;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{throw Error('File Excel tidak dapat dibaca.');}
  if(!bytes.length||bytes.length>5*1024*1024||bytes[0]!==80||bytes[1]!==75)throw Error('File .xlsx tidak valid.');
  let size=0,count=0;
  const files=unzipSync(bytes,{filter:file=>{
    size+=file.originalSize;if(size>30*1024*1024||++count>3000)throw Error('Isi workbook terlalu besar.');
    return /^xl\//.test(file.name)&&/\.(xml|rels)$/.test(file.name);
  }});
  const xml=name=>{
    const data=files[name];if(!data)return '';
    const value=new TextDecoder().decode(data);delete files[name];
    if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('Deklarasi XML tidak diizinkan.');
    return value;
  };
  const workbook=xml('xl/workbook.xml');
  if(/\bdate1904=["'](?:1|true)["']/.test(workbook))throw Error('Kalender Excel 1904 belum didukung.');
  let sheet=Object.keys(files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]))[0];
  const firstSheet=/<sheet\b([^>]*)\/?\s*>/.exec(workbook),relationship=firstSheet&&attribute(firstSheet[1],'r:id');
  if(relationship) {
    const rels=xml('xl/_rels/workbook.xml.rels');
    for(const r of rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g))if(attribute(r[1],'Id')===relationship) {
      const target=attribute(r[1],'Target');
      if(attribute(r[1],'TargetMode')==='External'||target.includes('..'))throw Error('Referensi worksheet tidak valid.');
      sheet=target.startsWith('/')?target.slice(1):'xl/'+target;
    }
  }
  if(!sheet||!files[sheet])throw Error('Worksheet Excel tidak ditemukan.');
  const strings=[];
  for(const si of xml('xl/sharedStrings.xml').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g))strings.push(texts(si[1]));
  const content=xml(sheet);let cellCount=0,previousRow=0;
  for(const row of content.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber=Number(attribute(row[1],'r'));
    if(!Number.isInteger(rowNumber)||rowNumber<=previousRow||rowNumber>100000)throw Error('Urutan atau jumlah baris Excel tidak valid.');
    previousRow=rowNumber;const cells={};
    for(const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if(++cellCount>500000)throw Error('Terlalu banyak sel Excel.');
      const address=attribute(cell[1],'r'),type=attribute(cell[1],'t'),inner=cell[2]||'';
      if(!new RegExp('^[A-Z]+\\d+$').test(address)||Number(address.match(/\d+$/)[0])!==rowNumber||Object.hasOwn(cells,address))throw Error('Alamat sel Excel tidak valid.');
      const raw=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if(type==='s') {
        if(!/^\d+$/.test(raw||'')||Number(raw)>=strings.length)throw Error('Referensi teks Excel tidak valid.');
        cells[address]=strings[Number(raw)];
      }else if(type==='inlineStr')cells[address]=texts(inner);
      else if(type==='e')throw Error('Sel Excel mengandung error pada '+address+'.');
      else if(raw!==undefined)cells[address]=decode(raw);
    }
    yield {row:rowNumber,cells};
  }
}
