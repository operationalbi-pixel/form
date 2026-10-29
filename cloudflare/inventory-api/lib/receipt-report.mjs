// ESB report rules ported from Code.gs; parser parity is covered by fixtures.
import {unzipSync} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
const Utilities={formatDate:date=>date.toISOString().slice(0,10)};
const formatQty_=n=>String(n);
const array=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const textNode=v=>v===undefined?'':typeof v!=='object'?v:v['#text']!==undefined?String(v['#text']):v.t!==undefined?textNode(v.t):array(v.r).map(r=>textNode(r.t)).join('');
function extractReportCells_(base64,fileName){
 if(!/\.xlsx$/i.test(fileName||'')||typeof base64!=='string'||base64.length>7*1024*1024)throw Error('Pilih file .xlsx maksimal 5 MB.');
 let bytes;try{bytes=Uint8Array.from(atob(base64),v=>v.charCodeAt(0));}catch{throw Error('File Excel tidak dapat dibaca.');}
 if(!bytes.length||bytes.length>5*1024*1024||bytes[0]!==80||bytes[1]!==75)throw Error('File .xlsx tidak valid.');
 let total=0,count=0;
 const files=unzipSync(bytes,{filter:file=>{total+=file.originalSize;count++;if(total>30*1024*1024||count>3000)throw Error('Isi workbook terlalu besar.');return /\.xml$/.test(file.name)&&/^(xl\/)/.test(file.name);}});
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false,processEntities:true});
 const xml=name=>{if(!files[name])return {};const text=new TextDecoder().decode(files[name]);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Deklarasi XML tidak diizinkan.');return parser.parse(text);};
 const workbook=xml('xl/workbook.xml');if(workbook.workbook?.workbookPr?.['@_date1904']==='1')throw Error('Kalender Excel 1904 belum didukung.');
 const strings=array(xml('xl/sharedStrings.xml').sst?.si).map(si=>textNode(si));
 const name=Object.keys(files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]))[0];
 if(!name)throw Error('Worksheet Excel tidak ditemukan.');const cells={};let cellCount=0;
 for(const row of array(xml(name).worksheet?.sheetData?.row)){if(Number(row['@_r'])>100000)throw Error('Terlalu banyak baris Excel.');for(const c of array(row.c)){if(++cellCount>500000)throw Error('Terlalu banyak sel Excel.');const type=c['@_t'];let value=type==='s'?strings[Number(c.v)]:type==='inlineStr'?textNode(c.is):c.v;if(value!==undefined)cells[c['@_r']]=value;}}
 return cells;
}
function parseGoodsReceiptReport_(base64, fileName, allowMultipleOutlets) {
  const cells = extractReportCells_(base64, fileName, 'Goods Receipt');
  const header = findReportHeader_(cells, [
    'GOODS RECEIPT NUMBER', 'GOODS RECEIPT DATE', 'DESTINATION',
    'PRODUCT NAME', 'PRODUCT CODE', 'UNIT', 'QTY'
  ]);
  const rows = [], invalidQty = [], outlets = {}, receipts = {}, suppliers = {}, dates = {};
  let lastDestination = '', lastSupplier = '';
  reportDataRows_(cells, header, 'PRODUCT CODE').forEach(function (rowNumber) {
    const code = String(reportCell_(cells, header, 'PRODUCT CODE', rowNumber) || '').trim().toUpperCase();
    if (!code) return;
    const status = normalizeHeader_(cells['U' + rowNumber] || reportCell_(cells, header, 'STATUS', rowNumber));
    const fixedOrigin = cleanText_(cells['E' + rowNumber], 180);
    const resolvedOrigin = fixedOrigin || cleanText_(reportCell_(cells, header, 'ORIGIN', rowNumber), 180) || lastSupplier;
    if (status !== 'AUTHORIZED' || shouldSkipBakerzinGoodsReceiptOrigin_(resolvedOrigin)) return;
    const qty = parseReportNumber_(reportCell_(cells, header, 'QTY', rowNumber));
    if (!isFinite(qty) || qty < 0) {
      invalidQty.push(code + ' · baris ' + rowNumber);
      return;
    }
    if (qty <= 0.0000001) return;
    const destination = cleanText_(reportCell_(cells, header, 'DESTINATION', rowNumber), 160) || lastDestination;
    if (!destination) throw new Error('Destination tidak ditemukan pada baris ' + rowNumber + '.');
    lastDestination = destination;
    const supplier = resolvedOrigin;
    if (supplier) lastSupplier = supplier;
    const transactionDate = parseReportDate_(reportCell_(cells, header, 'GOODS RECEIPT DATE', rowNumber), 'TRANSACTION', rowNumber, 'Goods Receipt');
    const grNumber = cleanText_(reportCell_(cells, header, 'GOODS RECEIPT NUMBER', rowNumber), 100);
    const expiryLots = parseReportExpiryLots_(reportCell_(cells, header, 'EXPIRED DATE', rowNumber), qty, rowNumber, code);
    rows.push({
      sourceRow: rowNumber, transactionDate: transactionDate, grNumber: grNumber,
      // No PO pada Goods Receipt berada di kolom C. Header dipakai sebagai
      // fallback agar format report lama tetap dapat diproses.
      poNumber: cleanText_(cells['C' + rowNumber], 100) ||
        cleanText_(reportCell_(cells, header, 'REFERENCE NUMBER', rowNumber), 100),
      supplier: supplier, outletName: destination,
      category: cleanText_(reportCell_(cells, header, 'SUB CATEGORY', rowNumber), 100) ||
        cleanText_(reportCell_(cells, header, 'CATEGORY', rowNumber), 100),
      name: cleanText_(reportCell_(cells, header, 'PRODUCT NAME', rowNumber), 180),
      code: code, unit: cleanText_(reportCell_(cells, header, 'UNIT', rowNumber), 40).toUpperCase(),
      qty: qty, lots: expiryLots
    });
    outlets[normalizeStoreName_(destination)] = destination;
    dates[transactionDate] = true;
    if (grNumber) receipts[grNumber] = true;
    if (supplier) suppliers[supplier] = true;
  });
  if (invalidQty.length) throw new Error('QTY Goods Receipt tidak valid pada ' + invalidQty.slice(0, 8).join(', ') + '.');
  const outletKeys = Object.keys(outlets);
  if (!allowMultipleOutlets && outletKeys.length !== 1) throw new Error('Goods Receipt harus berisi tepat satu Destination. Ditemukan: ' +
    outletKeys.map(function (key) { return outlets[key]; }).join(', ') + '.');
  if (!rows.length) throw new Error('Tidak ada baris Goods Receipt yang dapat di-upload. Hanya Status Authorized yang diproses; Origin Bakerzin selain Bakerzin HQ dilewati.');
  return {
    outletName: outlets[outletKeys[0]], outletNames: outletKeys.map(function (key) { return outlets[key]; }), rows: rows, transactionDates: Object.keys(dates),
    receiptCount: Object.keys(receipts).length, supplierCount: Object.keys(suppliers).length,
    headerRow: header.row
  };
}

function shouldSkipBakerzinGoodsReceiptOrigin_(origin) {
  const raw = cleanText_(origin, 180);
  return /^BAKERZIN\b/i.test(raw) && !isBakerzinHqName_(raw);
}

function isBakerzinHqName_(value) {
  const raw = cleanText_(value, 180);
  if (!raw) return false;
  const normalized = raw.toUpperCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized === 'BIHQ' || /^BAKERZIN\s+(HQ|HEAD\s*OFFICE)\b/.test(normalized);
}

function findReportHeader_(cells, requiredHeaders) {
  const rows = {};
  Object.keys(cells).forEach(function (address) {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (!match) return;
    const header = normalizeHeader_(cells[address]);
    if (!header) return;
    if (!rows[match[2]]) rows[match[2]] = {};
    rows[match[2]][header] = match[1];
  });
  const rowNumbers = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
  for (let i = 0; i < rowNumbers.length; i++) {
    const columns = rows[rowNumbers[i]];
    if (requiredHeaders.every(function (header) { return Boolean(columns[header]); })) {
      return { row: rowNumbers[i], columns: columns };
    }
  }
  throw new Error('Header tabel tidak ditemukan otomatis. Pastikan file memuat kolom: ' + requiredHeaders.join(', ') + '.');
}

function reportCell_(cells, header, name, rowNumber) {
  const column = header.columns[name];
  return column ? (cells[column + rowNumber] === undefined ? '' : cells[column + rowNumber]) : '';
}

function reportDataRows_(cells, header, codeHeader) {
  const column = header.columns[codeHeader], rows = {};
  if (!column) return [];
  const pattern = new RegExp('^' + column + '(\\d+)$');
  Object.keys(cells).forEach(function (address) {
    const match = pattern.exec(address);
    if (match && Number(match[1]) > header.row && String(cells[address] || '').trim()) rows[match[1]] = true;
  });
  return Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
}

function parseReportNumber_(value) {
  if (typeof value === 'number') return value;
  let text = String(value === null || value === undefined ? '' : value).trim().replace(/[\s\u00A0]/g, '');
  if (!text) return NaN;

  // Excel kadang menyimpan angka kecil sebagai scientific notation. Jangan hapus titik
  // pada 1.5E-2 karena itu akan berubah menjadi 15E-2 (10x lebih besar).
  if (/^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/.test(text)) {
    return Number(text.replace(',', '.'));
  }

  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Separator paling kanan dianggap decimal separator; separator lain thousands.
    if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (comma >= 0) {
    // Report ESB Indonesia lazim memakai koma sebagai decimal separator.
    text = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    // Jika ada banyak titik, titik terakhir adalah decimal bila group terakhir bukan 3 digit;
    // selain itu perlakukan sebagai thousands separator.
    const parts = text.split('.'), tail = parts[parts.length - 1];
    text = tail.length === 3 ? parts.join('') : parts.slice(0, -1).join('') + '.' + tail;
  }
  return Number(text);
}

function parseReportDate_(value, mode, rowNumber, label) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 100000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
    }
  }
  if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(text)) {
    const isoMatch = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(text);
    return validIsoDate_(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), label, rowNumber);
  }
  const match = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/.exec(text);
  if (!match) throw new Error('Format tanggal ' + label + ' pada baris ' + rowNumber + ' tidak dikenali: "' + text + '".');
  const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]);
  // ESB Expired Date is explicitly MM-DD-YYYY. Transaction dates are DD-MM-YYYY.
  const month = mode === 'EXPIRY' ? first : second;
  const day = mode === 'EXPIRY' ? second : first;
  return validIsoDate_(year, month, day, label, rowNumber);
}

function validIsoDate_(year, month, day, label, rowNumber) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('Tanggal ' + label + ' pada baris ' + rowNumber + ' tidak valid.');
  }
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function parseReportExpiryLots_(value, qty, rowNumber, code) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return [{ expiryDate: '', qty: qty }];
  const lots = [], pattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})(?:\s*\(([^)]+)\))?/g;
  let match;
  while ((match = pattern.exec(text))) {
    const lotQty = match[2] ? parseReportNumber_(match[2]) : qty;
    if (!isFinite(lotQty) || lotQty <= 0) throw new Error(code + ' · baris ' + rowNumber + ': QTY Expired Date tidak valid.');
    lots.push({ expiryDate: parseReportDate_(match[1], 'EXPIRY', rowNumber, 'Expired Date'), qty: lotQty });
  }
  if (!lots.length) throw new Error(code + ' · baris ' + rowNumber +
    ': format Expired Date tidak dikenali. Gunakan MM-DD-YYYY, contoh 09-25-2026 (1,0000).');
  const total = lots.reduce(function (sum, lot) { return sum + lot.qty; }, 0);
  const tolerance = Math.max(0.0001, qty * 0.000001);
  if (total > qty + tolerance) throw new Error(code + ' · baris ' + rowNumber +
    ': total QTY lot expired ' + formatQty_(total) + ' melebihi QTY report ' + formatQty_(qty) + '.');
  if (qty - total > tolerance) lots.push({ expiryDate: '', qty: qty - total });
  return lots;
}

function normalizeStoreName_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }

function normalizeHeader_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase(); }

function normalizeUnit_(value) { return String(value || '').trim().replace(/\s+/g, '').toUpperCase(); }

function cleanText_(value, max) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
export {parseGoodsReceiptReport_ as parseReceipt};
