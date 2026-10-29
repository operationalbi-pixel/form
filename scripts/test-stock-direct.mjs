import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {handleStockDirect} from '../cloudflare/inventory-api/lib/stock-direct.mjs';

const key='test-key',now=Math.floor(Date.now()/1000);
async function signed(claims){const text=Buffer.from(JSON.stringify(claims)).toString('base64url'),cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=Buffer.from(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode('stock-direct-v1.'+text))).toString('base64url');return text+'.'+signature;}
const env={
  API_KEY:key,
  SHOWCASE_ALLOWED_ORIGINS:'https://operationalbi-pixel.github.io',
  OPERATIONS_DB:{prepare(sql){
    assert.match(sql,/stock_balances/);
    return {bind(outlet,location){
      assert.equal(outlet,'BISS');assert.equal(location,'Store');
      return {all:async()=>({results:[{item_code:'P1',item_name:'Cake',current_qty:4,unit:'BOX'}]})};
    }};
  }},
  MASTER_DB:{prepare(sql){return {bind(){return this},all:async()=>({results:sql.includes('stock_items')?[{item_code:'P1',category:'Food',item_name:'Cake',default_unit:'BOX'}]:[]})};}}
};
const auth='Bearer '+await signed({aud:'stock-direct-v1',iat:now,exp:now+120,owner:'N1',outlet:'BISS',location:'Store'});
const deps={listUploadProgress:async()=>new Response(JSON.stringify({data:[{event_date:'2026-10-29',outlet_code:'BISS',upload_type:'goodsReceipt',actual_rows:3}]}))};
let response=await handleStockDirect(new Request('https://test/v1/stock-direct',{method:'POST',headers:{origin:'https://operationalbi-pixel.github.io',authorization:auth,'content-type':'application/json'},body:JSON.stringify({action:'snapshot'})}),env,deps);
assert.equal(response.status,200);assert.deepEqual((await response.json()).data.items,[{code:'P1',category:'Food',name:'Cake',unit:'BOX',qty:4,hidden:false,showcase:false,productName:'',productUnit:'',productQty:0}]);
response=await handleStockDirect(new Request('https://test/v1/stock-direct',{method:'POST',headers:{origin:'https://operationalbi-pixel.github.io',authorization:auth,'content-type':'application/json'},body:JSON.stringify({action:'progress',payload:{month:'2026-10'}})}),env,deps);assert.equal((await response.json()).data.data[0].actual_rows,3);
const historyEnv={...env,
  OPERATIONS_DB:{prepare(sql){return{bind:()=>({first:async()=>sql.includes('stock_balances')?{current_qty:4}:null,all:async()=>({results:[]})})};}},
  MASTER_DB:{prepare(){return{bind:()=>({first:async()=>({item_code:'P1',item_name:'Cake',category:'Food',default_unit:'BOX'}),all:async()=>({results:[]})})};}}
};
const historyCalls=[],historyRow={record_id:'r1',logical_id:'r1',version:1,event_date:'2026-10-29',direction:'IN',quantity:4,movement_type:'Opening Stock',created_at:'2026-10-29T01:00:00Z',item_code:'P1'};
const historyDeps={...deps,listMovements:async url=>{historyCalls.push(url.searchParams);return new Response(JSON.stringify({ok:true,data:url.searchParams.has('item_code')?[]:[historyRow],nextCursor:null}));}};
response=await handleStockDirect(new Request('https://test/v1/stock-direct',{method:'POST',headers:{origin:'https://operationalbi-pixel.github.io',authorization:auth,'content-type':'application/json'},body:JSON.stringify({action:'history',payload:{itemCode:'P1',itemName:'Cake',month:'2026-10'}})}),historyEnv,historyDeps);const historyResponse=await response.json();assert.equal(response.status,200);assert.equal(historyResponse.data.history[0].movementType,'Opening Stock');assert.equal(historyResponse.data.currentQty,4);assert.equal(historyCalls[1].get('item_name'),'Cake');
response=await handleStockDirect(new Request('https://test/v1/stock-direct',{method:'POST',headers:{origin:'https://evil.test',authorization:auth,'content-type':'application/json'},body:JSON.stringify({action:'snapshot'})}),env,deps);assert.equal(response.status,403);
response=await handleStockDirect(new Request('https://test/v1/stock-direct',{method:'POST',headers:{origin:'https://operationalbi-pixel.github.io',authorization:'Bearer invalid','content-type':'application/json'},body:JSON.stringify({action:'snapshot'})}),env,deps);assert.equal(response.status,401);

const calls=[],browser={APP:{location:'Store'},todayLocal:()=> '2026-10-29'};browser.window=browser;browser.BAKERZIN_API={call:async(action,args)=>{calls.push(action);if(action==='localStockContext')return{ok:true,data:{outlet:'BISS',location:'Store',items:[],inventoryUnavailable:false}};if(action==='localStockSupplementary')return{ok:true,data:{outlet:'BISS',pendingTransfers:[],completions:{}}};if(action==='stockDirectGrant')return{ok:true,data:{url:'https://direct',token:'short',expiresAt:Date.now()+300000}};throw Error('unexpected Apps Script call '+action);}};browser.fetch=async(url,options)=>{assert.equal(url,'https://direct');var body=JSON.parse(options.body);return{status:200,json:async()=>body.action==='snapshot'?({ok:true,data:{items:[{code:'P1',name:'Cake',qty:7}]}}):body.action==='history'?({ok:true,data:{item:{code:'P1'},history:[],month:'2026-10',currentQty:7}}):({ok:true,data:{data:[{event_date:'2026-10-29',upload_type:'goodsReceipt',actual_rows:3}]}})}};
vm.createContext(browser);vm.runInContext(await fs.readFile('docs/stock-receipt-direct.js','utf8'),browser);
const direct=await browser.BAKERZIN_API.call('bootstrap',['T','BISS']);assert.equal(direct.ok,true);assert.equal(direct.data.inventoryUnavailable,false);assert.deepEqual(direct.data.items.map(item=>item.qty),[7]);const supplementary=await browser.BAKERZIN_API.call('supplementary',['T','BISS','']);assert.equal(supplementary.data.uploadProgress.days[28].goodsReceipt,true);assert.deepEqual(calls,['localStockContext','stockDirectGrant','localStockSupplementary']);
const browserHistory=await browser.BAKERZIN_API.call('history',['T',{outlet:'BISS',location:'Store',itemCode:'P1',month:'2026-10'}]);assert.equal(browserHistory.ok,true);assert.equal(browserHistory.data.currentQty,7);assert.deepEqual(calls,['localStockContext','stockDirectGrant','localStockSupplementary']);
const gas={console};vm.createContext(gas);vm.runInContext(await fs.readFile('gas/Code.gs','utf8'),gas);Object.assign(gas,{requireSession_:()=>({nik:'N1'}),findEmployee_:()=>({nik:'N1',outlet:'BISS'}),assertEmployeeActive_(){},readStockLocations_:()=>['Store'],readStockMaster_:()=>[{code:'P1',category:'Food',name:'Cake',unit:'BOX'}],readStockHiddenMap_:()=>({}),readTasksForEmployee_:()=>[],readPagesForEmployee_:()=>[],userView_:()=>({nik:'N1'}),normalizeLocation_:value=>value,cloudflareInventoryConfig_:()=>({url:'https://direct',apiKey:'test'}),ScriptApp:{getService:()=>({getUrl:()=> 'https://app'})},Utilities:{Charset:{UTF_8:'UTF-8'},base64EncodeWebSafe:value=>Buffer.from(String(value)).toString('base64url'),computeHmacSha256Signature:()=>[1,2,3]}});
const grant=gas.getStockDirectGrant('T','BISS','Store');assert.equal(grant.ok,true);assert.equal(grant.data.url,'https://direct/v1/stock-direct');const local=gas.getLocalStockContext('T','BISS','Store');assert.equal(local.ok,true);assert.equal(local.data.inventoryUnavailable,false);assert.deepEqual(JSON.parse(JSON.stringify(local.data.items)),[]);assert.equal(gas.getLocalStockSupplementary('T','BISS','').ok,true);
console.log('Direct stock balances use a scoped Cloudflare grant without Apps Script UrlFetch.');
