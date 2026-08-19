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

const apiClient = await text('docs/api-client.js');
if (!apiClient.includes('messageTargets = [global]') || !apiClient.includes('messageTargets.push(global.top)')) {
  failures.push('API client belum menerima respons GAS ketika halaman dibuka di dalam iframe chat');
}

const chatHtml = await text('docs/chat.html');
const chatBackend = await text('docs/Code.gs');
if (chatHtml.includes('taskPicker') || chatHtml.includes('pickerLabel') || chatHtml.includes('renderTaskPicker')) {
  failures.push('Form Create Task masih meminta daftar outlet atau person secara manual');
}
if (!chatHtml.includes("picType:type") || chatHtml.includes('outlets:type') || chatHtml.includes('niks:type')) {
  failures.push('Create Task belum mengirim PIC Outlet/Person dengan cakupan otomatis');
}
if (!chatBackend.includes("const outlets = roomOutlet ? [roomOutlet]") || !chatBackend.includes("const recipients = roomOutlet ? people.filter")) {
  failures.push('Backend Create Task belum membuat assignment otomatis berdasarkan grup dan tipe PIC');
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

const lostFoundHtml = await text('docs/lost-and-found.html');
if (!lostFoundHtml.includes('name="viewport"') || !lostFoundHtml.includes('viewport-fit=cover')) failures.push('Lost And Found belum memiliki viewport WebView yang aman');
if (!lostFoundHtml.includes('src="config.js"') || !lostFoundHtml.includes('src="api-client.js"')) failures.push('Lost And Found belum terhubung ke API BI-Space');
if (!lostFoundHtml.includes('localStorage.getItem("bakerzin_session")')) failures.push('Lost And Found belum memakai sesi login BI-Space');
if (!lostFoundHtml.includes('window.location.href = "index.html"')) failures.push('Lost And Found belum memiliki navigasi kembali ke BI-Space');
const lostFoundStaticHtml = lostFoundHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
const lostFoundIds = [...lostFoundStaticHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const lostFoundDuplicateIds = [...new Set(lostFoundIds.filter((id, index) => lostFoundIds.indexOf(id) !== index))];
if (lostFoundDuplicateIds.length) failures.push(`docs/lost-and-found.html memiliki ID duplikat: ${lostFoundDuplicateIds.join(', ')}`);
let lostFoundInlineIndex = 0;
for (const match of lostFoundHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  lostFoundInlineIndex += 1;
  try { new vm.Script(match[1], { filename: `docs/lost-and-found.html#inline-${lostFoundInlineIndex}` }); }
  catch (error) { failures.push(`docs/lost-and-found.html inline script ${lostFoundInlineIndex}: ${error.message}`); }
}

const salesAnalysisHtml = await text('docs/sales-analysis.html');
if (!salesAnalysisHtml.includes('name="viewport"') || !salesAnalysisHtml.includes('viewport-fit=cover')) failures.push('Analisa Sales belum memiliki viewport WebView yang aman');
if (!salesAnalysisHtml.includes('src="config.js"') || !salesAnalysisHtml.includes('src="api-client.js"')) failures.push('Analisa Sales belum terhubung ke API BI-Space');
if (!salesAnalysisHtml.includes("localStorage.getItem('bakerzin_session')")) failures.push('Analisa Sales belum memakai sesi login BI-Space');
if (!salesAnalysisHtml.includes("location.href='index.html'")) failures.push('Analisa Sales belum memiliki navigasi kembali ke BI-Space');
if (salesAnalysisHtml.includes('<?')) failures.push('Analisa Sales masih memiliki template server-side yang tidak didukung GitHub Pages');
const salesAnalysisStaticHtml = salesAnalysisHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
const salesAnalysisIds = [...salesAnalysisStaticHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const salesAnalysisDuplicateIds = [...new Set(salesAnalysisIds.filter((id, index) => salesAnalysisIds.indexOf(id) !== index))];
if (salesAnalysisDuplicateIds.length) failures.push(`docs/sales-analysis.html memiliki ID duplikat: ${salesAnalysisDuplicateIds.join(', ')}`);
let salesAnalysisInlineIndex = 0;
for (const match of salesAnalysisHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  salesAnalysisInlineIndex += 1;
  try { new vm.Script(match[1], { filename: `docs/sales-analysis.html#inline-${salesAnalysisInlineIndex}` }); }
  catch (error) { failures.push(`docs/sales-analysis.html inline script ${salesAnalysisInlineIndex}: ${error.message}`); }
}

const mppHtml = await text('docs/mpp-schedule.html');
if (!mppHtml.includes('name="viewport"')) failures.push('MPP · Schedule · Uang Tip belum memiliki viewport responsif');
if (!mppHtml.includes('src="config.js"') || !mppHtml.includes('src="api-client.js"')) failures.push('MPP · Schedule · Uang Tip belum terhubung ke API BI-Space');
if (!mppHtml.includes("localStorage.getItem('bakerzin_session')")) failures.push('MPP · Schedule · Uang Tip belum memakai sesi BI-Space');
if (mppHtml.includes('id="login-view"') || mppHtml.includes('id="inp-nik"')) failures.push('Login lama masih terdapat di MPP · Schedule · Uang Tip');
if (mppHtml.includes('<?!= include(')) failures.push('MPP · Schedule · Uang Tip masih memiliki include khusus GAS');
if (!mppHtml.includes('@media (max-width: 900px)')) failures.push('MPP · Schedule · Uang Tip belum memiliki layout mobile');
const mppStaticHtml = mppHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
const mppIds = [...mppStaticHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const mppDuplicateIds = [...new Set(mppIds.filter((id, index) => mppIds.indexOf(id) !== index))];
if (mppDuplicateIds.length) failures.push(`docs/mpp-schedule.html memiliki ID duplikat: ${mppDuplicateIds.join(', ')}`);
let mppInlineIndex = 0;
for (const match of mppHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  mppInlineIndex += 1;
  try { new vm.Script(match[1], { filename: `docs/mpp-schedule.html#inline-${mppInlineIndex}` }); }
  catch (error) { failures.push(`docs/mpp-schedule.html inline script ${mppInlineIndex}: ${error.message}`); }
}

const css = await text('docs/ui-modern.css');
if (!/@media\s*\(max-width:\s*760px\)/.test(css)) failures.push('Breakpoint tablet/mobile belum tersedia');
if (!/prefers-reduced-motion/.test(css)) failures.push('Dukungan reduced motion belum tersedia');
if (!/:focus-visible/.test(css)) failures.push('Focus keyboard belum tersedia');

const backend = await text('docs/Code.gs');
if (!backend.includes('mobileNotifications: getMobileNotifications')) failures.push('Endpoint mobileNotifications belum terdaftar');
if (!backend.includes('function getMobileNotifications(token)')) failures.push('Feed notifikasi Android belum tersedia');
if (!backend.includes('mobilePayload')) failures.push('Gateway JSON Android belum tersedia');
if (!backend.includes('mppBootstrap: getMppBootstrap')) failures.push('Endpoint bootstrap MPP belum terdaftar');
if (!backend.includes('function mppSessionEmployee_(token)')) failures.push('Endpoint MPP belum memvalidasi sesi BI-Space');
if (!backend.includes("const MPP_SHEET_BUDGET = 'MPP_BUDGET'")) failures.push('MPP tidak lagi memakai sheet database lama');
const frontendStockCard = await text('docs/stock-card.html');
if (!backend.includes('recalculateFifoFefo: recalculateStockFifoFefo')) failures.push('Endpoint rekalkulasi FIFO/FEFO belum terdaftar');
if (!backend.includes('const startDate = requestedStartDate || stockDefaultRecalcStartDate_(today, days);') ||
    !backend.includes('const baselineDate = stockDateOffset_(startDate, -1);')) failures.push('Baseline rekalkulasi belum ditempatkan sebelum tanggal awal periode');
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
  if (!baBackend.includes('function notifyBiSpaceBaEvent_(')) failures.push('Backend Berita Acara belum mengirim aktivitas ke push BI-Space');
  if (!baBackend.includes("kind: 'NEW'") || !baBackend.includes("kind: 'UPDATED'") || !baBackend.includes("kind: 'APPROVED'") || !baBackend.includes("kind: 'REJECTED'")) failures.push('Notifikasi Berita Acara belum mencakup baru, revisi, approval, dan penolakan');
  if (/SpreadsheetApp\.openById|USER_SHEET_NAME|USER_SS_ID/.test(baBackend)) failures.push('Backend Berita Acara masih memakai database login lama');

  const baMobileIndex = await text('berita-acara-gas/Index.html');
  const baResponsive = await text('berita-acara-gas/MobileResponsiveStyles.html');
  if (!baMobileIndex.includes('viewport-fit=cover')) failures.push('Shell Berita Acara belum aman untuk notch WebView');
  if (!baMobileIndex.includes("include('MobileResponsiveStyles')")) failures.push('Shell Berita Acara belum memuat lapisan mobile bersama');
  if (!baMobileIndex.includes('refreshBeritaAcaraResponsiveLayout(container)')) failures.push('Form dinamis Berita Acara belum disegarkan setelah dimuat');
  if (!baResponsive.includes('.ba-responsive-table')) failures.push('Tabel Berita Acara belum memiliki tampilan kartu mobile');
  if (!baResponsive.includes("table.setAttribute") && !baResponsive.includes("cell.setAttribute('data-mobile-label'")) failures.push('Label kolom tabel mobile Berita Acara belum dibuat otomatis');
  if (!baResponsive.includes('ba-mobile-sidebar-open')) failures.push('Sidebar mobile Berita Acara belum dapat dibuka');
  if (!baResponsive.includes('safe-area-inset-top')) failures.push('Lapisan mobile Berita Acara belum memperhitungkan safe area');
  let baResponsiveScriptIndex = 0;
  for (const match of baResponsive.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    baResponsiveScriptIndex += 1;
    try { new vm.Script(match[1], { filename: `berita-acara-gas/MobileResponsiveStyles.html#inline-${baResponsiveScriptIndex}` }); }
    catch (error) { failures.push(`MobileResponsiveStyles inline script ${baResponsiveScriptIndex}: ${error.message}`); }
  }

  const baIndexPath = 'berita-acara-gas/Index.html';
  const baIndex = await text(baIndexPath);
  if (!baIndex.includes('initialBiSpaceUser')) failures.push('Berita Acara belum memuat identitas dari sesi BI-Space');
  if (!baIndex.includes('function switchBaMode(')) failures.push('Mode Approval dan User Berita Acara belum dapat ditukar');
  if (/id=["'](?:nik|outlet|loginBtn)["']/.test(baIndex)) failures.push('Halaman login lama masih tampil pada Berita Acara');
  const approvalDashboard = await text('berita-acara-gas/ApprovalDashboard.html');
  const outletDashboard = await text('berita-acara-gas/OutletDashboard.html');
  if (!approvalDashboard.includes('SWITCH TO USER MODE')) failures.push('Approval Dashboard belum memiliki tombol Switch to User Mode');
  if (!approvalDashboard.includes('ba-mode-label-mobile">USER MODE')) failures.push('Switch to User Mode belum jelas pada layar mobile');
  if (!outletDashboard.includes('ba-mode-label-mobile">APPROVAL')) failures.push('Switch to Approval Mode belum jelas pada layar mobile');
  if (!approvalDashboard.includes('ba-approval-table-wrap')) failures.push('Approval Dashboard belum memiliki pembungkus tabel khusus mobile');
  if (!approvalDashboard.includes('ba-approve-button')) failures.push('Tombol Approve belum dilindungi dari pemenggalan teks');
  if (!baResponsive.includes('.ba-approval-toolbar')) failures.push('Filter Approval belum memiliki tata letak mobile khusus');
  if (!baResponsive.includes('white-space: nowrap !important')) failures.push('Teks aksi Approval masih dapat melipat');
  if (!baResponsive.includes('#appContainer .ba-mode-switch')) failures.push('Tombol pergantian mode belum memiliki layout mobile khusus');
  if (!baResponsive.includes('input[type="file"]::file-selector-button')) failures.push('Input foto/file belum dioptimalkan untuk mobile');
  if (!baResponsive.includes('#appContainer #modalActions')) failures.push('Tombol modal belum dapat membungkus pada mobile');
  if (!baResponsive.includes('max-width: 900px')) failures.push('Breakpoint responsif belum mencakup HP landscape dan tablet kecil');
  if (!baResponsive.includes('height: auto !important;') || !baResponsive.includes('overflow: visible !important;')) failures.push('Kartu mobile Berita Acara masih dapat tertutup area tabel yang terlalu tinggi');
  if (!approvalDashboard.includes('Memuat dokumen Berita Acara')) failures.push('Approval Dashboard belum memiliki status awal saat data dimuat');
  if (!approvalDashboard.includes('Data membutuhkan waktu lebih lama')) failures.push('Approval Dashboard belum memiliki timeout yang terlihat');
  if (!outletDashboard.includes('Memuat riwayat dokumen')) failures.push('Outlet Dashboard belum memiliki status awal saat data dimuat');
  if (!outletDashboard.includes('.withFailureHandler(function(error)')) failures.push('Outlet Dashboard belum menampilkan kegagalan pemuatan data');
  if (!baBackend.includes("throw new Error('Data Berita Acara gagal dimuat: '")) failures.push('Backend Berita Acara masih menyembunyikan error pemuatan sebagai daftar kosong');
  const approvalFixture = await text('scripts/fixtures/approval-responsive.html');
  if (!approvalFixture.includes('Approval Dashboard Responsive Fixture')) failures.push('Fixture visual Approval Dashboard belum tersedia');
  const formFixture = await text('scripts/fixtures/form-responsive.html');
  if (!formFixture.includes('Berita Acara Form Responsive Fixture')) failures.push('Fixture visual seluruh form Berita Acara belum tersedia');
  const outletFixture = await text('scripts/fixtures/outlet-responsive.html');
  if (!outletFixture.includes('Outlet Dashboard Responsive Fixture')) failures.push('Fixture visual Outlet Dashboard belum tersedia');
  if (!outletDashboard.includes('SWITCH TO APPROVAL MODE')) failures.push('User Mode approver belum memiliki tombol kembali ke Approval Mode');

  const baHtmlFiles = (await readdir('berita-acara-gas')).filter(name => /\.html$/i.test(name));
  if (baHtmlFiles.length !== 22) failures.push(`Folder Berita Acara seharusnya berisi 22 HTML termasuk lapisan responsif bersama, ditemukan ${baHtmlFiles.length}`);
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

  const gasDeployWorkflow = await text('.github/workflows/deploy-berita-acara-gas.yml');
  if (!gasDeployWorkflow.includes('branches: [main]')) failures.push('Deployment GAS belum dibatasi ke branch main');
  if (!gasDeployWorkflow.includes('needs: validate')) failures.push('Deployment GAS belum menunggu validasi');
  if (!gasDeployWorkflow.includes('CLASPRC_JSON')) failures.push('Workflow GAS belum memakai credential clasp dari GitHub Secrets');
  if (!gasDeployWorkflow.includes('create-deployment --deploymentId')) failures.push('Workflow GAS belum memperbarui deployment lama');
  if (!gasDeployWorkflow.includes('clasp@3.1.3 push --force')) failures.push('Workflow GAS belum menyinkronkan seluruh source dari main');
  const gasIgnore = await text('berita-acara-gas/.claspignore');
  if (!gasIgnore.includes('!**/*.html') || !gasIgnore.includes('!**/*.gs')) failures.push('Daftar file clasp belum mencakup HTML dan Code.gs');
  const gasSetupScript = await text('setup-gas-auto-deploy.ps1');
  if (!gasSetupScript.includes('function Test-NpxCandidate')) failures.push('Setup GAS belum memvalidasi instalasi Node.js/npx');
  if (!gasSetupScript.includes('c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a')) failures.push('Unduhan Node.js portable belum dilindungi verifikasi SHA-256');
}
if (/['"]Transfer (?:In|Out)(?: Antar Outlet)?['"]\s*,\s*['"]['"]/.test(backend)) {
  failures.push('Masih ada transaksi Transfer In/Out otomatis yang dibuat dengan keterangan kosong');
}
const actionBlock = backend.match(/function apiActions_\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const allowedActions = new Set([...actionBlock.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(match => match[1]));
if (!allowedActions.has('chatMentions') || !backend.includes('function getChatMentionSuggestions(')) failures.push('Endpoint saran mention chat belum tersedia');
if (!chatHtml.includes("api('chatMentions'") || !chatHtml.includes('id="mentionMenu"')) failures.push('UI chat belum mendukung mention anggota dengan @');
if (!chatHtml.includes('id="dashboardBack"') || !chatHtml.includes('function backToDashboard(')) failures.push('Tombol kembali ke Dashboard belum tersedia di Pesan & Tugas');
if (!chatHtml.includes('.top{position:sticky;top:0;')) failures.push('Header nama grup chat belum dibuat sticky');
if (backend.includes("title: 'Outlet ' + outlet") || backend.includes("'Outlet ' + chatRoomOutlet_(roomId)")) failures.push('Nama grup outlet masih memakai awalan Outlet');
if (!chatHtml.includes('bi_chat_messages_v2:') || !chatHtml.includes("delivery:'pending'")) failures.push('Cache dan status kirim instan chat belum tersedia');
if (!chatHtml.includes('aria-label="Info dibaca"') || !chatHtml.includes("tasks.slice(0,3)")) failures.push('Ikon info baca atau batas tiga task belum tersedia');
if (!chatHtml.includes('function loadOlderMessages(') || !chatHtml.includes("api('chatMessages',[token,roomId,before])")) failures.push('Riwayat chat lama belum dapat dimuat saat scroll ke atas');
if (!chatHtml.includes('function wireMediaThumbnails(') || !chatHtml.includes('id="mediaModal"')) failures.push('Preview gambar dan PDF di dalam chat belum tersedia');
if (!chatHtml.includes('function syncVisualViewport(') || !chatHtml.includes('top:var(--chat-visual-top,0px)')) failures.push('Header grup chat belum dikunci saat keyboard mobile terbuka');
if (!backend.includes("dueAt: row[4] ? dateIso_(row[4]) : ''") || !backend.includes("employee.outlet === 'BIHQ' && type === 'OUTLET'")) failures.push('Deadline kosong atau visibilitas task outlet BIHQ belum benar');
if (!chatHtml.includes("timeZone:'Asia/Jakarta'") || !chatHtml.includes('id="completeModal"') || !chatHtml.includes('Menyimpan...')) failures.push('Zona waktu, modal penyelesaian, atau status simpan task belum tersedia');
if (!chatHtml.includes('grid-template-columns:repeat(auto-fit')) failures.push('Kartu task belum dibuat simetris dan memenuhi lebar');
if (!chatHtml.includes('delivery-dot pending') || !chatHtml.includes('delivery-dot sent')) failures.push('Status kirim belum memakai dot kuning dan hijau');
for (const action of ['lostFoundBootstrap', 'lostFoundOutlets', 'lostFoundItems', 'lostFoundItemDetail', 'lostFoundSave', 'lostFoundUpdate', 'lostFoundProcess']) {
  if (!allowedActions.has(action)) failures.push(`Endpoint Lost And Found '${action}' belum tersedia`);
  if (!lostFoundHtml.includes(`"${action}"`)) failures.push(`UI Lost And Found belum memanggil '${action}'`);
}
for (const action of ['salesAnalysisBootstrap', 'salesAnalysisDashboard', 'salesAnalysisTargets', 'salesAnalysisSaveTargets', 'salesAnalysisSaveDaily', 'salesAnalysisSaveWeekly', 'salesAnalysisSaveMonthly', 'salesAnalysisSaveGlobal', 'salesAnalysisAddGlobal', 'salesAnalysisDeleteGlobal']) {
  if (!allowedActions.has(action)) failures.push(`Endpoint Analisa Sales '${action}' belum tersedia`);
  if (!salesAnalysisHtml.includes(`'${action}'`)) failures.push(`UI Analisa Sales belum memanggil '${action}'`);
}
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
  [allowedActions.has('notifyBeritaAcaraEvent'), 'Endpoint notifikasi realtime Berita Acara belum tersedia'],
  [backend.includes("type: 'BERITA_ACARA'"), 'Kategori push Berita Acara belum tersedia'],
  [backend.includes("CacheService.getScriptCache().put('ba-notify:'"), 'Callback notifikasi Berita Acara belum dilindungi token SSO singkat'],
  [backend.includes("MOBILE_EVENT_SHEET: 'APP_MOBILE_EVENTS'"), 'Riwayat pemulihan notifikasi Berita Acara belum tersedia'],
  [backend.includes('readPersistedMobileNotifications_(employee.nik)'), 'Polling pemulihan belum membaca notifikasi Berita Acara yang terlewat'],
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
