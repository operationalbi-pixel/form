import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backend = await readFile('docs/Code.gs', 'utf8');
const functionStart = backend.indexOf('function staffPerformanceIndicatorRows_(');
const functionEnd = backend.indexOf('\nfunction syncStaffPerformanceStaffFromMpp_(', functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'Google Sheets indicator reader must exist');

const sheetValues = [
  ['ID_Indikator', 'Outlet', 'Kategori', 'Nama_Indikator', 'Bobot', 'Target', 'Batas_A', 'Batas_B', 'Batas_C', 'Batas_D', 'Status'],
  ['IND-GLOBAL', '', 'Service', 'Greeting', '{"Server":60}', '100', '90', '80', '70', '60', 'Active'],
  ['IND-BICP', 'bicp', 'Service', 'Upselling', '{"waiter":40}', '10', '9', '8', '7', '6', 'Active'],
  ['IND-OTHER', 'BIKH', 'Service', 'Other outlet', '{"Waiter":100}', '10', '9', '8', '7', '6', 'Active']
];
let openedSpreadsheetId = '';
const context = {
  CONFIG: {
    STAFF_PERFORMANCE_CONFIG_SPREADSHEET_ID: '19A_QtC62JP6uQcCkQu0yUKTV60kuy2MfXIXKz7aVDSU',
    STAFF_PERFORMANCE_INDICATOR_SHEET: 'Config_Indicators'
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  SpreadsheetApp: {
    openById(id) {
      openedSpreadsheetId = id;
      return {
        getSheetByName(name) {
          assert.equal(name, 'Config_Indicators');
          return {
            getLastRow: () => sheetValues.length,
            getDataRange: () => ({ getDisplayValues: () => sheetValues.map(row => row.slice()) })
          };
        }
      };
    }
  }
};
vm.createContext(context);
new vm.Script(backend.slice(functionStart, functionEnd)).runInContext(context);
const rows = context.staffPerformanceIndicatorRows_('BICP');
assert.equal(openedSpreadsheetId, context.CONFIG.STAFF_PERFORMANCE_CONFIG_SPREADSHEET_ID);
assert.deepEqual(Array.from(rows, row => row.ID_Indikator), ['IND-GLOBAL', 'IND-BICP']);
assert.equal(rows[1].Outlet, 'BICP');
assert.equal(rows[1].Bobot, '{"waiter":40}');

const saveStart = backend.indexOf('function saveStaffPerformanceIndicator(');
const saveEnd = backend.indexOf('\nfunction syncStaffPerformanceStaffFromMpp_(', saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, 'BIHQ indicator writer must exist');
const stored = sheetValues.map(row => row.slice());
const saveContext = {
  CONFIG: context.CONFIG,
  PropertiesService: context.PropertiesService,
  safe_: fn => fn(),
  staffPerformanceContext_: () => ({ isBihq: true }),
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => '12345678-1234-1234-1234-123456789abc' },
  SpreadsheetApp: {
    flush() {},
    openById() {
      return { getSheetByName: () => ({
        getLastRow: () => stored.length,
        getLastColumn: () => stored[0].length,
        getRange(row, column, rows = 1, columns = 1) {
          return {
            getDisplayValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => stored[row - 1 + r]?.[column - 1 + c] || '')),
            setValue(value) {
              while (stored.length < row) stored.push(Array(stored[0].length).fill(''));
              stored[row - 1][column - 1] = value;
            }
          };
        }
      }) };
    }
  }
};
vm.createContext(saveContext);
new vm.Script(backend.slice(saveStart, saveEnd)).runInContext(saveContext);
const saved = saveContext.saveStaffPerformanceIndicator('token', {
  id: 'IND-BICP', outlet: 'BICP', category: 'Service', name: 'Upselling premium', status: 'Active',
  target: '10', thresholdA: '9', thresholdB: '8', thresholdC: '7', thresholdD: '6', weights: { Waiter: 45 }
});
assert.equal(saved.success, true);
assert.equal(stored[2][3], 'Upselling premium');
assert.equal(stored[2][4], '{"Waiter":45}');
saveContext.staffPerformanceContext_ = () => ({ isBihq: false });
assert.throws(() => saveContext.saveStaffPerformanceIndicator('token', { category: 'X', name: 'Y' }), /Hanya pengguna BIHQ/);

const html = await readFile('docs/staff-performance.html', 'utf8');
const weightStart = html.indexOf('function indicatorWeightForPosition(');
const weightEnd = html.indexOf('\n    function showToast(', weightStart);
assert.ok(weightStart >= 0 && weightEnd > weightStart, 'Position weight helper must exist');
const uiContext = {};
vm.createContext(uiContext);
new vm.Script(html.slice(weightStart, weightEnd)).runInContext(uiContext);
assert.equal(uiContext.indicatorWeightForPosition({ Bobot: '{"waiter":40}' }, ' Waiter '), 40);
assert.equal(uiContext.indicatorWeightForPosition({ Bobot: '25' }, 'Server'), 25);
assert.equal(uiContext.indicatorWeightForPosition({ Bobot: '{"Server":60}' }, 'Waiter'), 0);

console.log('OK: Staff Performance reads and BIHQ securely edits Config_Indicators, with safe position weights.');
