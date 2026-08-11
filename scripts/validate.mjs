import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

const pairs = [
  ['docs/Code.gs', 'gas/Code.gs']
];

const failures = [];
const contents = new Map();

async function text(path) {
  if (!contents.has(path)) contents.set(path, await readFile(path, 'utf8'));
  return contents.get(path);
}

for (const [source, copy] of pairs) {
  if (await text(source) !== await text(copy)) failures.push(`${copy} tidak sinkron dengan ${source}`);
}

for (const path of ['docs/config.js', 'docs/api-client.js', 'docs/Code.gs']) {
  try {
    new vm.Script(await text(path), { filename: path });
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

for (const path of ['docs/index.html', 'docs/stock-card.html', 'docs/showcaselog.html']) {
  const html = await text(path);
  if (!html.includes('ui-modern.css')) failures.push(`${path} belum memuat ui-modern.css`);
  if (!html.includes('name="viewport"')) failures.push(`${path} tidak memiliki viewport responsif`);
  const staticHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  const ids = [...staticHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) failures.push(`${path} memiliki ID duplikat: ${duplicateIds.join(', ')}`);
  let inlineIndex = 0;
  const functionNames = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineIndex += 1;
    for (const functionMatch of match[1].matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) functionNames.push(functionMatch[1]);
    try {
      new vm.Script(match[1], { filename: `${path}#inline-${inlineIndex}` });
    } catch (error) {
      failures.push(`${path} inline script ${inlineIndex}: ${error.message}`);
    }
  }
  const duplicateFunctions = [...new Set(functionNames.filter((name, index) => functionNames.indexOf(name) !== index))];
  if (duplicateFunctions.length) failures.push(`${path} memiliki fungsi duplikat: ${duplicateFunctions.join(', ')}`);
}

const css = await text('docs/ui-modern.css');
if (!/@media\s*\(max-width:\s*760px\)/.test(css)) failures.push('Breakpoint tablet/mobile belum tersedia');
if (!/prefers-reduced-motion/.test(css)) failures.push('Dukungan reduced motion belum tersedia');
if (!/:focus-visible/.test(css)) failures.push('Focus keyboard belum tersedia');

const backend = await text('docs/Code.gs');
if (!backend.includes('mobileNotifications: getMobileNotifications')) failures.push('Endpoint mobileNotifications belum terdaftar');
if (!backend.includes('function getMobileNotifications(token)')) failures.push('Feed notifikasi Android belum tersedia');
if (!backend.includes('mobilePayload')) failures.push('Gateway JSON Android belum tersedia');
const frontendStockCard = await text('docs/stock-card.html');
if (!backend.includes('recalculateFifoFefo: recalculateStockFifoFefo')) failures.push('Endpoint rekalkulasi FIFO/FEFO belum terdaftar');
if (!backend.includes("const startDate = stockDateOffset_(today, -days);\n      // Baseline must be one day before the selected period")) failures.push('Baseline rekalkulasi belum ditempatkan sebelum tanggal awal periode');
if (!frontendStockCard.includes('Recalculate FIFO &amp; FEFO')) failures.push('Tombol rekalkulasi FIFO/FEFO belum tersedia');
if (!frontendStockCard.includes("openExpiryAlertModal('FIFO')") && !frontendStockCard.includes("openExpiryAlertModal(\\'FIFO\\')")) failures.push('Daftar detail item FIFO/FEFO belum tersedia');
try {
  const backendContext = vm.createContext({ console });
  new vm.Script(backend, { filename: 'docs/Code.gs#fifo-fefo-test' }).runInContext(backendContext);
  const outbound = { recordId: 'OUT-1', logicalId: 'OUT-1', date: '2026-08-05', createdAt: '2026-08-05T10:00:00Z', direction: 'OUT', qty: 3, movementType: 'Pemakaian' };
  const testHistory = [
    { recordId: 'IN-1', logicalId: 'IN-1', date: '2026-07-31', createdAt: '2026-07-31T10:00:00Z', direction: 'IN', qty: 10, movementType: 'Goods Receipt', expiryDate: '', sourceArrivalDate: '2026-07-31' },
    { recordId: 'BASE-1', logicalId: 'BASE-1', date: '2026-08-04', createdAt: '2026-08-11T10:00:00Z', direction: 'LOT', qty: 10, movementType: 'Lot Balance Override', info: JSON.stringify({ lots: [{ qty: 10, arrivalDate: '2026-07-31', stockInDate: '2026-07-31', expiryDate: '2026-08-20' }] }) },
    outbound
  ];
  backendContext.calculateFifoSnapshots_(testHistory);
  if (!outbound.fifoUsageLots?.length || outbound.fifoUsageLots[0].expiryDate !== '2026-08-20') failures.push('Rekalkulasi belum mengalokasikan OUT ke expiry FEFO hasil baseline');
  const fefoOutbound = { recordId: 'OUT-FEFO', logicalId: 'OUT-FEFO', date: '2026-08-05', createdAt: '2026-08-05T10:00:00Z', direction: 'OUT', qty: 6, movementType: 'Pemakaian' };
  const fefoSnapshots = backendContext.calculateFifoSnapshots_([
    { recordId: 'BASE-FEFO', logicalId: 'BASE-FEFO', date: '2026-08-04', createdAt: '2026-08-11T10:00:00Z', direction: 'LOT', qty: 10, movementType: 'Lot Balance Override', info: JSON.stringify({ lots: [
      { qty: 5, arrivalDate: '2026-07-30', stockInDate: '2026-07-30', expiryDate: '2026-09-01' },
      { qty: 5, arrivalDate: '2026-08-01', stockInDate: '2026-08-01', expiryDate: '2026-08-20' }
    ] }) },
    fefoOutbound
  ]);
  const fefoUsage = fefoOutbound.fifoUsageLots || [];
  if (fefoUsage.length !== 2 || fefoUsage[0].expiryDate !== '2026-08-20' || fefoUsage[0].qty !== 5 || fefoUsage[1].expiryDate !== '2026-09-01' || fefoUsage[1].qty !== 1) failures.push('Urutan rekalkulasi belum FEFO terlebih dahulu');
  const fefoRemaining = fefoSnapshots['2026-08-05'] || [];
  if (Math.abs(fefoRemaining.reduce((sum, lot) => sum + Number(lot.qty || 0), 0) - 4) > 0.0000001) failures.push('Rekalkulasi FIFO/FEFO mengubah total saldo lot');
  const screenshotOutbound = { recordId: 'OUT-SCREENSHOT', logicalId: 'OUT-SCREENSHOT', date: '2026-08-04', createdAt: '2026-08-04T12:00:00Z', direction: 'OUT', qty: 1.49, movementType: 'WIP Material Usage' };
  const screenshotSnapshots = backendContext.calculateFifoSnapshots_([
    { recordId: 'BASE-SCREENSHOT', logicalId: 'BASE-SCREENSHOT', date: '2026-08-03', createdAt: '2026-08-11T10:00:00Z', direction: 'LOT', qty: 8.47, movementType: 'Lot Balance Override', info: JSON.stringify({ recalculation: { days: 7, baselineDate: '2026-08-03' }, lots: [
      { qty: 8.47, arrivalDate: '2026-07-31', stockInDate: '2026-07-31', expiryDate: '' }
    ] }) },
    { recordId: 'IN-SCREENSHOT', logicalId: 'IN-SCREENSHOT', date: '2026-08-04', createdAt: '2026-08-04T10:00:00Z', direction: 'IN', qty: 100, movementType: 'Goods Receipt', expiryDate: '2027-07-29', sourceArrivalDate: '2026-08-04' },
    screenshotOutbound,
    { recordId: 'OLD-BUGGY-RECALC', logicalId: 'OLD-BUGGY-RECALC', date: '2026-08-04', createdAt: '2026-08-10T10:00:00Z', direction: 'LOT', qty: 106.98, movementType: 'Lot Balance Override', info: JSON.stringify({ recalculation: { days: 7, baselineDate: '2026-08-04' }, lots: [
      { qty: 8.47, arrivalDate: '2026-07-31', stockInDate: '2026-07-31', expiryDate: '' },
      { qty: 98.51, arrivalDate: '2026-08-04', stockInDate: '2026-08-04', expiryDate: '2027-07-29' }
    ] }) }
  ]);
  const screenshotUsage = screenshotOutbound.fifoUsageLots || [];
  const screenshotRemaining = screenshotSnapshots['2026-08-04'] || [];
  const oldRemaining = screenshotRemaining.find(lot => lot.sourceDate === '2026-07-31');
  const newRemaining = screenshotRemaining.find(lot => lot.sourceDate === '2026-08-04');
  if (screenshotUsage.length !== 1 || screenshotUsage[0].sourceDate !== '2026-07-31' || Math.abs(Number(screenshotUsage[0].qty) - 1.49) > 0.0000001) failures.push('Lot lama tanpa expiry belum dipakai secara FIFO sebelum kedatangan baru');
  if (!oldRemaining || Math.abs(Number(oldRemaining.qty) - 6.98) > 0.0000001 || !newRemaining || Math.abs(Number(newRemaining.qty) - 100) > 0.0000001) failures.push('Balance lot setelah rekalkulasi belum menyisakan 6,98 lot lama dan 100 lot baru');
  const dayEightOut = { recordId: 'OUT-DAY-8', logicalId: 'OUT-DAY-8', date: '2026-08-08', createdAt: '2026-08-08T12:00:00Z', direction: 'OUT', qty: 1.8, movementType: 'WIP Material Usage' };
  const dayNineOut = { recordId: 'OUT-DAY-9', logicalId: 'OUT-DAY-9', date: '2026-08-09', createdAt: '2026-08-09T12:00:00Z', direction: 'OUT', qty: 2.09, movementType: 'WIP Material Usage' };
  const reappearanceSnapshots = backendContext.calculateFifoSnapshots_([
    { recordId: 'ACTIVE-RECALC', logicalId: 'ACTIVE-RECALC', date: '2026-08-03', createdAt: '2026-08-11T10:00:00Z', direction: 'LOT', qty: 1.76, movementType: 'Lot Balance Override', info: JSON.stringify({ recalculation: { days: 7 }, lots: [
      { qty: 1.76, arrivalDate: '2026-07-31', stockInDate: '2026-07-31', expiryDate: '' }
    ] }) },
    { recordId: 'IN-100', logicalId: 'IN-100', date: '2026-08-04', createdAt: '2026-08-04T10:00:00Z', direction: 'IN', qty: 100, movementType: 'Goods Receipt', expiryDate: '2027-07-29', sourceArrivalDate: '2026-08-04' },
    dayEightOut,
    { recordId: 'STALE-EXPIRY-OVERRIDE', logicalId: 'STALE-EXPIRY-OVERRIDE', date: '2026-08-09', createdAt: '2026-08-09T10:00:00Z', direction: 'LOT', qty: 99.96, movementType: 'Lot Balance Override', info: JSON.stringify({ note: 'Lengkapi Expired Date melalui notifikasi', lots: [
      { qty: 8.47, arrivalDate: '2026-07-31', stockInDate: '2026-07-31', expiryDate: '2027-06-11' },
      { qty: 91.49, arrivalDate: '2026-08-04', stockInDate: '2026-08-04', expiryDate: '2027-07-29' }
    ] }) },
    dayNineOut
  ]);
  const dayEightLots = reappearanceSnapshots['2026-08-08'] || [];
  const dayNineLots = reappearanceSnapshots['2026-08-09'] || [];
  if (dayEightLots.some(lot => lot.sourceDate === '2026-07-31') || Math.abs(dayEightLots.reduce((sum, lot) => sum + Number(lot.qty || 0), 0) - 99.96) > 0.0000001) failures.push('Lot lama belum habis pada snapshot tanggal 08/08');
  if (dayNineLots.some(lot => lot.sourceDate === '2026-07-31') || Math.abs(dayNineLots.reduce((sum, lot) => sum + Number(lot.qty || 0), 0) - 97.87) > 0.0000001) failures.push('Lot yang sudah habis muncul kembali pada tanggal 09/08');
  const enriched = backendContext.applyKnownExpiryToBaselineLots_([
    { qty: 10, expiryDate: '', sourceDate: '2026-07-31', showcaseDate: '2026-07-31' }
  ], [
    { qty: 4, expiryDate: '2026-08-20', sourceDate: '2026-07-31', showcaseDate: '2026-07-31' }
  ]);
  const enrichedDated = enriched.find(lot => lot.expiryDate === '2026-08-20');
  const enrichedUndated = enriched.find(lot => !lot.expiryDate);
  if (enriched.length !== 2 || !enrichedDated || enrichedDated.qty !== 4 || !enrichedUndated || enrichedUndated.qty !== 6) failures.push('Baseline lot belum membagi QTY dated dan undated dengan benar');
  const expiryCompletion = { date: '2026-08-11', createdAt: '2026-08-11T10:00:00Z', direction: 'LOT', movementType: 'Lot Balance Override', info: JSON.stringify({ note: 'Lengkapi Expired Date melalui notifikasi', lots: [{ qty: 4, expiryDate: '2026-08-20' }] }) };
  if (!backendContext.stockFifoFefoIssue_([expiryCompletion], { code: 'ITEM1', name: 'Item Test', unit: 'PCS' })) failures.push('Item dengan expired terlambat belum ditandai perlu rekalkulasi');
  const recalcMarker = { date: '2026-08-04', createdAt: '2026-08-11T11:00:00Z', direction: 'LOT', movementType: 'Lot Balance Override', info: JSON.stringify({ recalculation: { days: 7 }, lots: [{ qty: 4, expiryDate: '2026-08-20' }] }) };
  if (backendContext.stockFifoFefoIssue_([expiryCompletion, recalcMarker], { code: 'ITEM1', name: 'Item Test', unit: 'PCS' })) failures.push('Notifikasi FIFO/FEFO belum hilang setelah rekalkulasi terbaru');
} catch (error) {
  failures.push(`Pengujian rekalkulasi FIFO/FEFO gagal: ${error.message}`);
}
const transferAuditRequirements = [
  [backend.includes("'Transfer To ' + toLocation + ' · Dari ' + fromLocation"), 'Transfer Out antar-storage belum menyimpan lokasi tujuan dan asal'],
  [backend.includes("'Transfer From ' + fromLocation + ' · Ke ' + toLocation"), 'Transfer In antar-storage belum menyimpan lokasi asal dan tujuan'],
  [backend.includes("'Transfer To Showcase · Dari Store") || backend.includes("'Transfer To Showcase untuk Produk "), 'Transfer Out Store ke Showcase belum memiliki keterangan tujuan'],
  [backend.includes("'Transfer From Store · Ke Showcase"), 'Transfer In Showcase belum memiliki keterangan asal'],
  [backend.includes('isTransferMovementType_(movementType) && !info'), 'Backend belum menolak transaksi transfer otomatis tanpa keterangan'],
  [backend.includes('ensureTransferMovementInfo_(direction, movementType, payload.info)'), 'Backend belum mewajibkan keterangan untuk transfer manual'],
  [frontendStockCard.includes('ASAL / TUJUAN TRANSFER'), 'Form Stock Card belum meminta asal atau tujuan transfer manual']
];
for (const [ok, message] of transferAuditRequirements) {
  if (!ok) failures.push(message);
}

{
  const path = 'docs/absensibreak.html';
  const html = await text(path);
  if (!html.includes('name="viewport"')) failures.push(`${path} tidak memiliki viewport responsif`);
  if (!html.includes("localStorage.getItem('bakerzin_session')")) failures.push(`${path} belum memakai sesi Dashboard utama`);
  if (!html.includes("localStorage.getItem('bakerzin_app_cache')")) failures.push(`${path} belum membaca identitas pengguna Dashboard`);
  if (!html.includes('AKfycbw_KKIyLwdvGWxGtP79-Rj9bc1crEH6Or4QkPnTYknfhUCxC8cXwHNa-SZ3y_B37ybpFw')) failures.push(`${path} tidak memakai endpoint Absensi Break yang disepakati`);
  const staticHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  const ids = [...staticHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) failures.push(`${path} memiliki ID duplikat: ${duplicateIds.join(', ')}`);
  let inlineIndex = 0;
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineIndex += 1;
    try {
      new vm.Script(match[1], { filename: `${path}#inline-${inlineIndex}` });
    } catch (error) {
      failures.push(`${path} inline script ${inlineIndex}: ${error.message}`);
    }
  }
}

{
  const wrapperPath = 'docs/berita-acara.html';
  const wrapper = await text(wrapperPath);
  if (!wrapper.includes("BAKERZIN_API.call('beritaAcaraHandoff'")) failures.push(`${wrapperPath} belum meminta kode SSO satu kali dari BI-Space`);
  if (!wrapper.includes('AKfycbxBCTJ4BbHWrcVqXNZmtQEjfV_AFnPy_G7J8tkz88hXGPrpX_l01BNOozI0COQenXDyxg')) failures.push(`${wrapperPath} tidak menuju deployment Berita Acara yang disepakati`);
  if (!wrapper.includes('env(safe-area-inset-top')) failures.push(`${wrapperPath} belum aman untuk notch aplikasi mobile`);

  const baBackendPath = 'berita-acara-gas/Code.gs';
  const baBackend = await text(baBackendPath);
  try { new vm.Script(baBackend, { filename: baBackendPath }); }
  catch (error) { failures.push(`${baBackendPath}: ${error.message}`); }
  if (!baBackend.includes("BQ_PROJECT_ID = 'berita-acara-digital'")) failures.push('Backend Berita Acara tidak lagi memakai project BigQuery lama');
  if (!baBackend.includes("BQ_DATASET_ID = 'berita_acara_app'")) failures.push('Backend Berita Acara tidak lagi memakai dataset lama');
  if (!baBackend.includes("BQ_TABLE_ID   = 'submissions'")) failures.push('Backend Berita Acara tidak lagi memakai tabel submissions');
  if (!baBackend.includes("action: 'consumeBeritaAcaraHandoff'")) failures.push('Backend Berita Acara belum memvalidasi handoff melalui EMP_LIST BI-Space');
  if (!baBackend.includes('function requireBaSession_(')) failures.push('Operasi Berita Acara belum dilindungi sesi server-side');
  if (!baBackend.includes("creatorPosition === 'AREA MANAGER'")) failures.push('Dokumen buatan AREA MANAGER belum auto approve');
  if (!baBackend.includes("creatorPosition === 'FNB'")) failures.push('Dokumen buatan FNB belum melewati tahap approval FNB otomatis');
  if (/SpreadsheetApp\.openById|USER_SHEET_NAME|USER_SS_ID/.test(baBackend)) failures.push('Backend Berita Acara masih memakai database login lama');

  const baIndexPath = 'berita-acara-gas/Index.html';
  const baIndex = await text(baIndexPath);
  if (!baIndex.includes('initialBiSpaceUser')) failures.push('Berita Acara belum memuat identitas dari sesi BI-Space');
  if (!baIndex.includes('function switchBaMode(')) failures.push('Mode Approval dan User Berita Acara belum dapat ditukar');
  if (/id=["'](?:nik|outlet|loginBtn)["']/.test(baIndex)) failures.push('Halaman login lama masih tampil pada Berita Acara');
  const approvalDashboard = await text('berita-acara-gas/ApprovalDashboard.html');
  const outletDashboard = await text('berita-acara-gas/OutletDashboard.html');
  if (!approvalDashboard.includes('SWITCH TO USER MODE')) failures.push('Approval Dashboard belum memiliki tombol Switch to User Mode');
  if (!outletDashboard.includes('SWITCH TO APPROVAL MODE')) failures.push('User Mode approver belum memiliki tombol kembali ke Approval Mode');

  const baHtmlFiles = (await readdir('berita-acara-gas')).filter(name => /\.html$/i.test(name));
  if (baHtmlFiles.length !== 21) failures.push(`Folder Berita Acara seharusnya berisi 21 HTML, ditemukan ${baHtmlFiles.length}`);
  for (const fileName of baHtmlFiles) {
    const path = `berita-acara-gas/${fileName}`;
    const html = await text(path);
    let inlineIndex = 0;
    for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      inlineIndex += 1;
      const script = match[1].replace(/<\?[\s\S]*?\?>/g, 'null');
      try { new vm.Script(script, { filename: `${path}#inline-${inlineIndex}` }); }
      catch (error) { failures.push(`${path} inline script ${inlineIndex}: ${error.message}`); }
    }
  }
  try { JSON.parse(await text('berita-acara-gas/appsscript.json')); }
  catch (error) { failures.push(`berita-acara-gas/appsscript.json: ${error.message}`); }
}
if (/['"]Transfer (?:In|Out)(?: Antar Outlet)?['"]\s*,\s*['"]['"]/.test(backend)) {
  failures.push('Masih ada transaksi Transfer In/Out otomatis yang dibuat dengan keterangan kosong');
}
const actionBlock = backend.match(/function apiActions_\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const allowedActions = new Set([...actionBlock.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(match => match[1]));
const clientActions = new Set();
for (const path of ['docs/index.html', 'docs/stock-card.html', 'docs/showcaselog.html']) {
  for (const match of (await text(path)).matchAll(/(?:server|call)\(\s*['"]([^'"]+)['"]/g)) clientActions.add(match[1]);
}
for (const action of clientActions) {
  if (!allowedActions.has(action)) failures.push(`Aksi frontend '${action}' belum tersedia di apiActions_`);
}

const pushRequirements = [
  [backend.includes("PUSH_TOKEN_SHEET: 'APP_PUSH_TOKENS'"), 'Sheet token push Android belum dikonfigurasi'],
  [allowedActions.has('registerPushToken'), 'Endpoint pendaftaran token FCM belum tersedia'],
  [backend.includes('function registerMobilePushToken('), 'Pendaftaran perangkat Android belum tersedia'],
  [backend.includes('function sendRealtimeMobilePush_('), 'Pengiriman FCM realtime belum tersedia'],
  [backend.includes('notifyPendingStockTransfers_(pendingRows);'), 'Transfer pending belum memicu push realtime'],
  [backend.includes("id: 'NEWS:' + newsId"), 'Berita baru belum memicu push realtime']
];
for (const [ok, message] of pushRequirements) {
  if (!ok) failures.push(message);
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`OK: backend GAS sinkron, sintaks valid, kontrak API cocok, dan UI responsif terdeteksi.`);
