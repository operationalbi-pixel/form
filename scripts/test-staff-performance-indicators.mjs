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

console.log('OK: Staff Performance reads Config_Indicators and matches position weights safely.');
