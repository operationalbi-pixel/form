const clean=(value,limit=120)=>String(value??'').trim().replace(/[<>]/g,'').slice(0,limit);
const json=(body,status,headers)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
class Failure extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new Failure(status,message);};

async function claims(request,env){
  try{
    const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''),parts=token.split('.');
    if(parts.length!==2||token.length>24000)throw Error();
    const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.API_KEY),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('HMAC',key,bytes(parts[1]),new TextEncoder().encode('stock-direct-v1.'+parts[0])))throw Error();
    const value=JSON.parse(new TextDecoder().decode(bytes(parts[0]))),now=Math.floor(Date.now()/1000);
    if(value.aud!=='stock-direct-v1'||!clean(value.owner,100)||!clean(value.outlet,40)||!clean(value.location,80)||value.exp<=now||value.iat>now+30||value.exp-value.iat>300)throw Error();
    return {owner:clean(value.owner,100),outlet:clean(value.outlet,40).toUpperCase(),location:clean(value.location,80)};
  }catch{fail(401,'Sesi saldo stok perlu diperbarui.');}
}

export async function handleStockDirect(request,env,deps){
  const origin=request.headers.get('origin')||'',allowed=String(env.SHOWCASE_ALLOWED_ORIGINS||'https://operationalbi-pixel.github.io').split(',').map(value=>value.trim());
  if(!allowed.includes(origin))return json({ok:false,error:'Asal aplikasi tidak diizinkan.'},403,{});
  const cors={'access-control-allow-origin':origin,vary:'Origin','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','access-control-max-age':'300'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    if(request.method!=='POST')fail(405,'Metode tidak diizinkan.');
    const body=await request.json();
    const scope=await claims(request,env);
    if(body?.action==='snapshot'){
      const [master,balances,visibility]=await Promise.all([
        env.MASTER_DB.prepare('SELECT item_code,category,item_name,default_unit FROM stock_items WHERE active=1 ORDER BY item_code').all(),
        env.OPERATIONS_DB.prepare('SELECT item_code,item_name,current_qty FROM stock_balances WHERE outlet_code=? AND location_code=? ORDER BY item_code').bind(scope.outlet,scope.location).all(),
        env.MASTER_DB.prepare('SELECT item_code,hidden FROM stock_item_visibility WHERE outlet_code=? AND location_code=?').bind(scope.outlet,scope.location).all()
      ]);
      const qtyByCode={},qtyByName={},hidden={};
      for(const row of balances.results||[]){const qty=Number(row.current_qty||0),code=clean(row.item_code,80).toUpperCase(),name=clean(row.item_name,180).toLowerCase();if(code)qtyByCode[code]=qty;if(name)qtyByName[name]=(qtyByName[name]||0)+qty;}
      for(const row of visibility.results||[])hidden[clean(row.item_code,80).toUpperCase()]=Boolean(row.hidden);
      const items=(master.results||[]).map(row=>{const code=clean(row.item_code,80).toUpperCase(),name=clean(row.item_name,180);return{code,category:clean(row.category,120),name,unit:clean(row.default_unit,40),qty:Object.prototype.hasOwnProperty.call(qtyByCode,code)?qtyByCode[code]:(qtyByName[name.toLowerCase()]||0),hidden:Boolean(hidden[code]),showcase:false,productName:'',productUnit:'',productQty:0};});
      return json({ok:true,data:{outlet:scope.outlet,location:scope.location,items}},200,cors);
    }
    if(body?.action==='progress'){
      const month=clean(body?.payload?.month,7);if(!/^\d{4}-\d{2}$/.test(month))fail(422,'Bulan tidak valid.');
      const reply=await deps.listUploadProgress(new URL('https://internal/v1/upload-progress?'+new URLSearchParams({month,outlet:scope.outlet})),env,'stock-direct');
      if(!reply.ok)throw Error('Progress upload belum dapat dimuat.');
      const progress=await reply.json();return json({ok:true,data:{outlet:scope.outlet,month,data:progress.data||[]}},200,cors);
    }
    if(body?.action==='history'){
      const payload=body.payload||{},code=clean(payload.itemCode,80).toUpperCase(),name=clean(payload.itemName,180),month=clean(payload.month,7),cursor=clean(payload.cursor,10);
      if(!code)fail(422,'Kode item tidak valid.');if(!/^\d{4}-\d{2}$/.test(month))fail(422,'Bulan tidak valid.');if(cursor&&!/^\d{4}-\d{2}-\d{2}$/.test(cursor))fail(422,'Cursor riwayat tidak valid.');
      const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),readHistory=async filter=>{const resultRows=[];let next='';do{const params=new URLSearchParams({outlet:scope.outlet,location:scope.location,from:'0000-01-01',to:end,resolve_scope:'1',limit:'200',...filter});if(next)params.set('cursor',next);const reply=await deps.listMovements(new URL('https://internal/v1/movements?'+params),env,'stock-direct');if(!reply.ok)throw Error('Riwayat stok belum dapat dimuat.');const result=await reply.json();resultRows.push(...(result.data||[]));next=result.nextCursor||'';if(resultRows.length>50000)fail(422,'Riwayat item terlalu besar.');}while(next);return resultRows;};
      const rows=await readHistory({item_code:code});if(!rows.length&&name)rows.push(...await readHistory({item_name:name}));
      const all=rows.map(row=>({recordId:row.record_id,logicalId:row.logical_id||row.record_id,version:Number(row.version||1),date:String(row.event_date||'').slice(0,10),direction:row.direction,qty:Number(row.quantity||0),movementType:row.movement_type||'',info:row.info||'',createdBy:row.created_by||'',createdAt:row.created_at||'',sourceFile:row.source_file||'',sourceRow:row.source_row||0,transferId:row.transfer_id||'',supplier:row.supplier||'',productionDate:row.production_date||'',expiryDate:row.expiry_date||'',sourceArrivalDate:row.arrival_date||'',systemGenerated:false})).sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt).localeCompare(String(b.createdAt))||String(a.recordId).localeCompare(String(b.recordId)));
      const quantityUntil=until=>all.reduce((total,row)=>row.date<until?(row.direction==='IN'?total+row.qty:row.direction==='OUT'?total-row.qty:total):total,0),dates=[...new Set(all.filter(row=>row.date>=start&&(!cursor||row.date<cursor)).map(row=>row.date))].sort().reverse(),pageDays=Math.min(31,Math.max(1,Number(payload.pageDays)||12)),selected=dates.slice(0,pageDays),selectedSet=new Set(selected),visible=all.filter(row=>selectedSet.has(row.date)),balancesByDate={};for(const date of selected)balancesByDate[date]=quantityUntil(new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10));
      const balance=await env.OPERATIONS_DB.prepare('SELECT current_qty FROM stock_balances WHERE outlet_code=? AND location_code=? AND item_code=?').bind(scope.outlet,scope.location,code).first(),master=await env.MASTER_DB.prepare('SELECT item_code,item_name,category,default_unit FROM stock_items WHERE item_code=?').bind(code).first(),item={code,name:clean(master?.item_name||payload.itemName||code,180),category:clean(master?.category,120),unit:clean(master?.default_unit,40)};
      return json({ok:true,data:{item,outlet:scope.outlet,location:scope.location,currentQty:Number(balance?.current_qty||0),month,periodClosingQty:quantityUntil(new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10)),history:visible,fifoLotsByDate:{},balancesByDate,hasPrevious:all.some(row=>row.date<start),hasNext:month<new Date().toISOString().slice(0,7),nextCursor:dates.length>selected.length?selected.at(-1):'',hasMore:dates.length>selected.length,fifoFefoStatus:{mode:'FIFO',needsRecalculation:false,recommendedStartDate:''}}},200,cors);
    }
    fail(404,'Aksi tidak ditemukan.');
  }catch(error){
    console.error(JSON.stringify({event:'stock_direct_request_failed',message:String(error.message)}));
    return json({ok:false,error:error instanceof Failure?error.message:'Saldo stok belum dapat dimuat. '+clean(error.message,220)},error.status||422,cors);
  }
}
