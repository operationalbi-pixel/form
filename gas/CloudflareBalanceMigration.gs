/** One-time, idempotent copy of BigQuery stock_balances to Cloudflare D1. */
function migrateCloudflareStockBalances() {
  var properties = PropertiesService.getScriptProperties();
  var url = String(properties.getProperty('CLOUDFLARE_INVENTORY_URL') ||
    'https://bakerzin-inventory-api.operational-bi.workers.dev').replace(/\/+$/, '');
  var apiKey = String(properties.getProperty('CLOUDFLARE_INVENTORY_API_KEY') || '').trim();
  if (!apiKey) throw new Error('CLOUDFLARE_INVENTORY_API_KEY belum tersedia.');

  var units = {};
  readStockMaster_(true).forEach(function (item) {
    units[String(item.code || '').toUpperCase()] = item.unit || '';
  });
  var sql = 'SELECT outlet, location, item_code, item_name, current_qty, ' +
    "FORMAT_TIMESTAMP('%FT%T%Ez', updated_at) updated_at " +
    'FROM `' + CONFIG.BQ_PROJECT_ID + '.' + CONFIG.BQ_DATASET_ID + '.stock_balances` ' +
    'ORDER BY outlet, location, item_code';
  var request = { query: sql, useLegacySql: false, location: CONFIG.BQ_LOCATION, maxResults: 750 };
  var result = BigQuery.Jobs.query(request, CONFIG.BQ_PROJECT_ID);
  var jobId = result.jobReference.jobId, total = 0, batches = 0;
  while (!result.jobComplete) {
    Utilities.sleep(500);
    result = BigQuery.Jobs.getQueryResults(CONFIG.BQ_PROJECT_ID, jobId, {
      location: CONFIG.BQ_LOCATION, maxResults: 750
    });
  }
  while (true) {
    var rows = (result.rows || []).map(function (row) {
      var code = String(row.f[2].v || '').toUpperCase();
      return {
        outletCode: row.f[0].v, locationCode: row.f[1].v, itemCode: code,
        itemName: row.f[3].v || '', currentQty: Number(row.f[4].v || 0),
        unit: units[code] || '', updatedAt: row.f[5].v || ''
      };
    });
    if (rows.length) {
      var response = UrlFetchApp.fetch(url + '/v1/migrate/stock-balances', {
        method: 'post', contentType: 'application/json',
        headers: { 'x-api-key': apiKey },
        payload: JSON.stringify({ batchId: 'BAL-' + Utilities.getUuid(), rows: rows }),
        muteHttpExceptions: true
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        throw new Error('Batch saldo gagal (' + response.getResponseCode() + '): ' +
          response.getContentText().slice(0, 500));
      }
      total += rows.length;
      batches++;
    }
    if (!result.pageToken) break;
    result = BigQuery.Jobs.getQueryResults(CONFIG.BQ_PROJECT_ID, jobId, {
      location: CONFIG.BQ_LOCATION, maxResults: 750, pageToken: result.pageToken
    });
  }
  console.log(JSON.stringify({ event: 'CLOUDFLARE_BALANCE_MIGRATION', rows: total, batches: batches }));
  return { rows: total, batches: batches };
}
