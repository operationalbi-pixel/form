export async function balanceSnapshots(request, env, deps) {
  const body = await deps.readJsonWithLimit(request, 131072);
  const {outlet, location, date, codes} = body;
  if (typeof outlet !== 'string' || !outlet || typeof location !== 'string' || !location ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Array.isArray(codes) || !codes.length ||
      codes.length > 80 || codes.some(code => typeof code !== 'string' || !code || code.length > 80)) {
    return Response.json({ok:false,error:{message:'Parameter snapshot tidak valid.'}}, {status:400});
  }
  async function revision() {
    const revisions = [];
    for (const entry of [{key:'operations',database:env.OPERATIONS_DB}, ...deps.historyDatabaseEntries(env)]) {
      const row = await entry.database.prepare('SELECT revision FROM stock_snapshot_revisions WHERE outlet_code=? AND location_code=?').bind(outlet,location).first();
      revisions.push([entry.key, row?.revision || 0]);
    }
    return JSON.stringify(revisions);
  }
  const before = await revision();
  if (body.action === 'save') {
    if (body.revision !== before) return Response.json({ok:true,saved:false});
    if (codes.some(code => typeof body.balances?.[code] !== 'number' || !Number.isFinite(body.balances[code]))) {
      return Response.json({ok:false,error:{message:'Saldo snapshot tidak valid.'}}, {status:400});
    }
    await env.OPERATIONS_DB.batch(codes.map(code => env.OPERATIONS_DB.prepare(
      'INSERT INTO stock_balance_snapshots VALUES(?,?,?,?,?,?) ON CONFLICT(outlet_code,location_code,event_date,item_code) DO UPDATE SET quantity=excluded.quantity,source_revision=excluded.source_revision'
    ).bind(outlet,location,date,code,body.balances[code],before)));
    return Response.json({ok:true,saved:await revision() === before});
  }
  const rows = await env.OPERATIONS_DB.prepare(
    'SELECT item_code,quantity FROM stock_balance_snapshots WHERE outlet_code=? AND location_code=? AND event_date=? AND source_revision=? AND item_code IN ('+codes.map(()=>'?').join(',')+')'
  ).bind(outlet,location,date,before,...codes).all();
  const after = await revision(), balances = Object.create(null);
  if (before === after) for (const row of rows.results) balances[row.item_code] = row.quantity;
  return Response.json({ok:true,revision:after,balances});
}
