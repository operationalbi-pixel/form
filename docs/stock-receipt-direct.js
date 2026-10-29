/* Goods Receipt goes directly to Cloudflare. Apps Script only issues scoped grants. */
(function(global){
 'use strict';
 var base=global.BAKERZIN_API,grants={},pending={},jobScopes={};
 function grant(token,context){
  var key=token+'|'+context.outlet+'|'+context.location,g=grants[key];if(g&&g.expiresAt>Date.now()+15000)return Promise.resolve(g);
  if(!pending[key])pending[key]=base.call('receiptDirectGrant',[token,context.outlet,context.location]).then(function(r){if(!r||!r.ok)throw Error(r&&r.error||'Izin upload belum tersedia.');grants[key]=r.data;return r.data;}).finally(function(){delete pending[key]});return pending[key];
 }
 function context(payload){var app=global.APP||{},saved=app.goodsReceipt&&app.goodsReceipt.backgroundContext||app;return {outlet:payload&&payload.outlet||saved.outlet||app.user&&app.user.outlet||'',location:payload&&payload.location||saved.location||'Store'};}
 function direct(token,action,payload,scope,refresh){return grant(token,scope||context(payload)).then(function(g){return fetch(g.url,{method:'POST',headers:{Authorization:'Bearer '+g.token,'Content-Type':'application/json'},body:JSON.stringify({action:action,payload:payload||{}})}).then(function(r){if(r.status===401&&!refresh){Object.keys(grants).forEach(function(k){if(k.indexOf(token+'|')===0)delete grants[k]});return direct(token,action,payload,scope,true);}return r.json();});});}
 function call(action,args){args=args||[];var app=global.APP||{};
  if(action==='verifyGoodsReceipt')return direct(args[0],'verify',args[1]);
  if(action==='queueGoodsUpload'&&args[1]&&args[1].type==='GOODS_RECEIPT')return direct(args[0],'accept',args[1]).then(function(r){if(r&&r.ok)jobScopes[r.data.jobId]={outlet:r.data.outlet,location:r.data.location};return r;});
  if(action==='saveConversions'&&app.goodsReceipt&&app.goodsReceipt.savingConversions)return base.call('saveConversions',args).then(function(r){return r&&r.ok?direct(args[0],'conversions',args[1]):r;});
  if(action==='retryStockUpload'&&args[2]==='RECEIPT_CF')return direct(args[0],'retry',{jobId:args[1]},jobScopes[args[1]]||context());
  if(action==='goodsUploadStatus')return direct(args[0],'status',{},context()).then(function(native){if(!native||!native.ok)return native;native.data.jobs.forEach(function(j){jobScopes[j.jobId]={outlet:j.outlet,location:j.location};});return base.call('localStockUploadStatus',[args[0]]).then(function(local){return{ok:true,data:{jobs:native.data.jobs.concat(local&&local.ok?local.data.jobs:[])}}}).catch(function(){return native})});
  return base.call(action,args);
 }
 global.BAKERZIN_API=Object.freeze({call:call});
})(window);
