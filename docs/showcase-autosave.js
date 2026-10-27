/* Autosave a completed row, never individual keystrokes. Stock is confirmed only by COMPLETE. */
(function(global){
  'use strict';
  var fields=['inQty','soldQty','wasteQty'],totals=['inTotal','soldTotal','wasteTotal'];
  var flags=['hasInInput','hasSoldInput','hasWasteInput'],totalFlags=['hasInTotal','hasSoldTotal','hasWasteTotal'];
  var rows={},enabled=false,grants={},grantLoads={},recoveringLegacy=false;
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function owner(){return String(STATE.user&&STATE.user.nik||'');}
  function key(outlet,date,code){return 'bakerzin_showcase_autosave_v1_'+encodeURIComponent(owner())+'_'+encodeURIComponent(outlet)+'_'+date+'_'+encodeURIComponent(code);}
  function current(row){return row.owner===owner()&&row.outlet===STATE.outlet&&row.date===byId('eventDate').value;}
  function empty(){return {values:{inQty:0,soldQty:0,wasteQty:0},touched:{},totals:{}};}
  function rowFor(item){
    var date=byId('eventDate').value,k=key(STATE.outlet,date,item.code);
    if(rows[k])return rows[k];
    var row;try{row=JSON.parse(localStorage.getItem(k)||'null');}catch(error){}
    if(!row||row.owner!==owner()||row.outlet!==STATE.outlet||row.date!==date||row.code!==item.code)row={key:k,owner:owner(),outlet:STATE.outlet,date:date,code:item.code,id:global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():'edit-'+Date.now()+'-'+Math.random().toString(36).slice(2),revision:0,confirmed:empty(),desired:empty(),outbox:null};
    row.busy=false;row.retryTimer=null;rows[k]=row;store(row);return row;
  }
  function store(row){
    try{var saved=Object.assign({},row);delete saved.busy;delete saved.retryTimer;localStorage.setItem(row.key,JSON.stringify(saved));return true;}
    catch(error){row.error='Draft tidak dapat dicadangkan di perangkat. Jangan tutup halaman.';notice(row.error,true);return false;}
  }
  function notice(message,error){var node=byId('showcaseAutosaveStatus');if(node){node.textContent=message;node.classList.toggle('error',!!error);}}
  function dirty(row){return JSON.stringify(row.desired)!==JSON.stringify(row.confirmed);}
  function itemFor(row){return current(row)?STATE.items.find(function(item){return item.code===row.code;}):null;}
  function entryFor(row){
    var entry={itemCode:row.code};fields.forEach(function(field,i){entry[field]=Number(row.desired.values[field]||0);entry[flags[i]]=!!row.desired.touched[field];if(Object.prototype.hasOwnProperty.call(row.desired.totals,totals[i])){entry[totals[i]]=Number(row.desired.totals[totals[i]]);entry[totalFlags[i]]=true;}});return entry;
  }
  function preview(item,row){
    var base=row.base||{balance:item.balance,totalIn:item.totalIn,totalSold:item.totalSold,totalWaste:item.totalWaste,confirmed:row.confirmed};
    var result=Number(base.balance||0);fields.forEach(function(field,i){var delta=Number(row.desired.values[field]||0)-Number(base.confirmed.values[field]||0);if(Object.prototype.hasOwnProperty.call(row.desired.totals,totals[i]))delta=Number(row.desired.totals[totals[i]])-Number(base[['totalIn','totalSold','totalWaste'][i]]||0);result+=(i===0?1:-1)*delta;});return result;
  }
  function validate(row){
    var values=fields.map(function(field){return row.desired.values[field];}).concat(Object.values(row.desired.totals));
    if(values.some(function(value){return !isFinite(Number(value))||Number(value)<0;}))return 'Jumlah harus berupa angka 0 atau lebih.';
    var item=itemFor(row);if(item&&preview(item,row)<-0.0000001)return 'Sold dan Waste melebihi Balance. Periksa kembali angka pada baris ini.';
    return '';
  }
  function statusText(row){
    if(row.error)return row.error;
    if(row.outbox){if(row.outbox.status==='FAILED')return 'Belum tersimpan. Klik Coba lagi.';if(row.outbox.status==='ACTION_REQUIRED')return 'Periksa input lalu kirim kembali.';if(row.outbox.status==='UNCERTAIN')return 'Belum terkonfirmasi. Akan dicoba ulang.';return 'Menyimpan…';}
    if(dirty(row))return 'Belum terkirim';
    if(row.revision)return 'Tersimpan ✓';return '';
  }
  function paint(row){
    if(!current(row))return;
    var node=document.querySelector('[data-showcase-row-status="'+String(STATE.items.findIndex(function(item){return item.code===row.code;}))+'"]');
    if(node){node.innerHTML=statusContents(row,STATE.items.findIndex(function(item){return item.code===row.code;}));node.classList.toggle('error',!!row.error);}
    summary();
  }
  function summary(){
    var legacy=byId('showcaseSaveStatus');if(legacy)legacy.classList.toggle('hidden',enabled&&!SHOWCASE_SAVES.pending&&!SHOWCASE_SAVES.reviewId);
    if(!enabled){notice('Autosave belum siap. Tunggu data terbaru dari server.',false);return;}
    var scoped=Object.values(rows).filter(current),error=scoped.find(function(row){return row.error;}),active=scoped.some(function(row){return !!row.outbox;}),unsent=scoped.some(dirty);
    if(error)notice('Ada baris belum tersimpan: '+error.error,true);
    else if(active)notice('Menyimpan perubahan ke server…',false);
    else if(unsent)notice('Draft dicadangkan. Keluar dari baris, tekan Enter, atau klik Simpan untuk mengirim.',false);
    else notice('Autosave aktif. Perubahan yang selesai dikirim sudah tersimpan.',false);
  }
  function schedule(row){
    clearTimeout(row.retryTimer);var delay=Math.min(60000,2000*Math.pow(2,Math.min(row.attempts||0,5)));
    row.retryTimer=setTimeout(function(){row.retryTimer=null;send(row);},delay);
  }
  function grantFor(row,force){
    var k=row.owner+'|'+row.outlet+'|'+row.code,cached=grants[k];
    if(!force&&cached&&cached.expiresAt>Date.now()+10000)return Promise.resolve(cached);
    if(grantLoads[k])return grantLoads[k];
    var token=STATE.token;
    grantLoads[k]=BAKERZIN_API.call('showcaseRealtimeGrant',[token,row.outlet,row.code]).then(function(response){if(!response||!response.ok)throw new Error(response&&response.error||'Sesi penyimpanan belum dapat diperbarui.');if(row.owner!==owner()||token!==STATE.token)throw new Error('Akun berubah.');grants[k]=response.data;return response.data;}).finally(function(){delete grantLoads[k];});return grantLoads[k];
  }
  function directCall(row,payload,renewed){
    return grantFor(row,!!renewed).then(function(grant){
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},20000);
      return fetch(grant.url,{method:'POST',headers:{'Authorization':'Bearer '+grant.token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit'}).then(function(response){
        if(response.status===401&&!renewed)return directCall(row,payload,true);
        return response.json().then(function(result){if(!response.ok||!result.ok)return {ok:false,error:result.error&&result.error.message||'Penyimpanan belum terkonfirmasi.',retryable:!!(result.error&&result.error.retryable),code:result.error&&result.error.code,confirmed:result.confirmed};return result;});
      }).finally(function(){clearTimeout(timer);});
    });
  }
  function applyDirectItem(row,data){
    row.needsRefresh=false;delete row.base;store(row);
    if(!current(row)||!data.item)return;
    var index=STATE.items.findIndex(function(item){return item.code===row.code;}),item=STATE.items[index];if(!item)return;
    var value=data.item;Object.assign(item,{balance:value.balance,previousBalance:value.previous_balance,totalIn:value.total_in,totalSold:value.total_sold,totalWaste:value.total_waste});
    // Update only confirmed cells; a response must not replace a row the user is still typing in.
    document.querySelectorAll('[data-index="'+index+'"]').forEach(function(input){if(input===document.activeElement)return;var field=input.dataset.field,i=fields.indexOf(field),draft=STATE.drafts[index]||{};if(draft[field]!==undefined)return;if(i>=0)input.value=row.desired.touched[field]?row.desired.values[field]:'';else if((i=totals.indexOf(field))>=0&&!Object.prototype.hasOwnProperty.call(row.desired.totals,field)){input.value=item[['totalIn','totalSold','totalWaste'][i]];input.classList.remove('is-edited');}});
    STATE.stockHistoryCache={};updateDraftBalance(index);
    var day=STATE.progress&&(STATE.progress.days||[]).find(function(day){return day.date===row.date;});if(day){var entry=data.entry||{};['stockIn','sold','waste'].forEach(function(field,i){if(entry[flags[i]]||entry[totalFlags[i]])day[field]=true;});day.complete=!!(day.stockIn&&day.sold&&day.waste);if(day.complete)(STATE.tasks||[]).forEach(function(task){if(String(task.target||'').toLowerCase()==='showcaselog')STATE.completions[task.id+'|'+row.date]=true;});renderProgress();}
    if(row.commitWhenReady){row.commitWhenReady=false;commit(row);}
  }
  function send(row){
    if(row.busy||!row.outbox||row.owner!==owner()||!enabled)return;
    if(row.outbox.jobId&&row.outbox.status!=='UNCERTAIN')return;
    clearTimeout(row.retryTimer);row.retryTimer=null;
    if(row.outbox.status==='ACTION_REQUIRED'||row.outbox.status==='FAILED')return;
    if(global.navigator&&global.navigator.onLine===false){row.outbox.status='UNCERTAIN';store(row);paint(row);schedule(row);return;}
    row.busy=true;var outbox=row.outbox,token=STATE.token;
    directCall(row,outbox.payload).then(function(response){
      if(response&&response.code==='REVISION_CONFLICT'&&response.confirmed&&response.confirmed.result){var confirmed=response.confirmed.result.rowEdit;row.revision=confirmed.revision;row.confirmed={values:clone(confirmed.values),touched:clone(confirmed.touched||{}),totals:{}};fields.forEach(function(field){if(!row.desired.touched[field]){row.desired.values[field]=row.confirmed.values[field]||0;if(row.confirmed.touched[field])row.desired.touched[field]=true;}});row.outbox=null;row.commitWhenReady=false;row.conflict=true;row.error=response.error;store(row);applyDirectItem(row,response.confirmed);paint(row);return;}
      if(!response||!response.ok){var message=response&&response.error||'Server belum mengonfirmasi penyimpanan.';if(response&&response.ok===false&&!response.retryable&&!/Cloudflare|HTTP|timeout|timed out|Service invoked|lock|kunci|penguncian|tidak merespons/i.test(message)){outbox.status='ACTION_REQUIRED';row.error=message;store(row);paint(row);return;}throw new Error(message);}
      if(!response.data||response.data.status!=='COMPLETE')throw new Error('Server belum mengonfirmasi transaksi lengkap.');
      outbox.jobId=response.data.jobId;outbox.status=response.data.status;row.attempts=0;row.error='';store(row);
      if(token===STATE.token){acknowledgeShowcaseDrafts(outbox.payload);acceptStatuses([response.data]);applyDirectItem(row,Object.assign({},response.data,{entry:outbox.payload.entries[0]}));}
      paint(row);
    }).catch(function(error){outbox.status='UNCERTAIN';row.error='Koneksi belum mengonfirmasi simpan. Input tetap tersedia.';row.attempts=(row.attempts||0)+1;store(row);paint(row);schedule(row);}).finally(function(){row.busy=false;if(row.outbox&&row.outbox!==outbox&&row.outbox.status==='QUEUED')send(row);var next=Object.values(rows).find(function(other){return other!==row&&other.owner===owner()&&other.outbox&&other.outbox.status==='QUEUED'&&!other.outbox.jobId;});if(next)send(next);});
  }
  function commit(row,manual){
    if(row.conflict&&!manual){paint(row);return;}
    if(manual)row.conflict=false;
    if(!enabled||STATE.loading||SHOWCASE_SAVES.pending||SHOWCASE_SAVES.reviewId){summary();return;}
    var issue=validate(row);if(issue){row.error=issue;store(row);paint(row);return;}
    if(row.outbox){
      if(row.outbox.status==='ACTION_REQUIRED'){
        row.outbox.payload.entries=[entryFor(row)];row.outbox.snapshot=clone(row.desired);row.outbox.status='QUEUED';delete row.outbox.jobId;row.error='';
        if(store(row))send(row);return;
      }
      if(row.outbox.status==='FAILED'){retry(row);return;}
      if(row.outbox.status==='UNCERTAIN')send(row);
      return;
    }
    if(!dirty(row)||row.needsRefresh)return;
    var item=itemFor(row);if(!item)return;
    var revision=row.revision+1;
    row.base={balance:item.balance,totalIn:item.totalIn,totalSold:item.totalSold,totalWaste:item.totalWaste,confirmed:clone(row.confirmed)};
    row.outbox={status:'QUEUED',snapshot:clone(row.desired),payload:{outlet:row.outlet,eventDate:row.date,requestId:'row-'+row.id+'-'+revision,rowEdit:{id:row.id,revision:revision},entries:[entryFor(row)]}};
    row.error='';if(store(row)){paint(row);send(row);}
  }
  function observe(index,field,value){
    if(SHOWCASE_SAVES.pending||SHOWCASE_SAVES.reviewId)return;
    var item=STATE.items[Number(index)];if(!item)return;
    var row=rowFor(item),i=fields.indexOf(field);
    if(i>=0){row.desired.values[field]=value===''?0:value;row.desired.touched[field]=true;delete row.desired.totals[totals[i]];if(STATE.drafts[index])delete STATE.drafts[index][totals[i]];}
    else {i=totals.indexOf(field);if(i<0)return;if(value===''){delete row.desired.totals[field];}else{row.desired.totals[field]=value;row.desired.values[fields[i]]=0;row.desired.touched[fields[i]]=true;if(STATE.drafts[index])delete STATE.drafts[index][fields[i]];}}
    row.error='';row.conflict=false;store(row);persistShowcaseDrafts();paint(row);updateDraftBalance(index);
  }
  function hydrate(date,fromCache){
    enabled=!!STATE.autosaveReady&&STATE.autosaveVersion===2&&!!STATE.realtime;
    if(enabled&&STATE.realtime.grants)Object.keys(STATE.realtime.grants).forEach(function(code){grants[owner()+'|'+STATE.outlet+'|'+code]=Object.assign({url:STATE.realtime.url},STATE.realtime.grants[code]);});
    if(SHOWCASE_SAVES.pending||SHOWCASE_SAVES.reviewId){summary();return;}
    if(!owner()||!STATE.outlet){summary();return;}
    STATE.items.forEach(function(item,index){
      var row=rowFor(item);
      // Older display-only Input values are not a new autosave contribution.
      if(!SHOWCASE_SAVES.pending&&!SHOWCASE_SAVES.reviewId){var visible=SHOWCASE_SAVES.visible[item.code]||(SHOWCASE_SAVES.visible[item.code]={});fields.forEach(function(field){delete visible[field];if(row.desired.touched[field])visible[field]={value:row.desired.values[field],status:row.outbox?'QUEUED':dirty(row)?'DRAFT':'COMPLETE'};});}
      if(row.needsRefresh&&!fromCache){row.needsRefresh=false;delete row.base;store(row);}
      var draft=STATE.drafts[index];if(draft&&!row.outbox){Object.keys(draft).forEach(function(field){if(fields.indexOf(field)>=0||totals.indexOf(field)>=0)observe(index,field,draft[field]);});}
      if(row.outbox&&['QUEUED','UNCERTAIN'].indexOf(row.outbox.status)>=0&&!row.outbox.jobId)send(row);
      if(row.commitWhenReady&&!fromCache){if(STATE.loading)setTimeout(function(){if(current(row)&&!STATE.loading){row.commitWhenReady=false;commit(row);}},0);else{row.commitWhenReady=false;commit(row);}}
    });summary();
  }
  function acceptStatuses(jobs){
    Object.values(rows).forEach(function(row){
      if(row.owner!==owner()||!row.outbox)return;
      var sent=row.outbox,job=jobs.find(function(candidate){return candidate.requestId===sent.payload.requestId||sent.jobId&&candidate.jobId===sent.jobId;});if(!job)return;
      sent.jobId=job.jobId;sent.status=job.status;
      if(job.status==='COMPLETE'){
        var confirmed=clone(sent.snapshot);confirmed.totals={};
        fields.forEach(function(field,i){if(sent.payload.entries[0][totalFlags[i]])confirmed.values[field]=0;else confirmed.values[field]=Number(confirmed.values[field]||0);});
        row.confirmed=confirmed;row.revision=sent.payload.rowEdit.revision;
        totals.forEach(function(field){if(row.desired.totals[field]===sent.snapshot.totals[field])delete row.desired.totals[field];});
        fields.forEach(function(field){if(Number(row.desired.values[field]||0)===Number(confirmed.values[field]||0))row.desired.values[field]=confirmed.values[field];});
        row.outbox=null;row.error='';row.needsRefresh=true;row.commitWhenReady=dirty(row);
      }else if(job.status==='ACTION_REQUIRED'||job.status==='FAILED'){row.error=job.error||job.stage||'Input belum tersimpan.';}
      store(row);paint(row);
    });
  }
  function retry(row){
    if(!row.outbox)return commit(row);
    if(row.outbox.status!=='FAILED')return send(row);
    if(row.busy)return;row.busy=true;
    BAKERZIN_API.call('retryGoodsUpload',[STATE.token,row.outbox.jobId]).then(function(result){if(!result||!result.ok)throw new Error(result&&result.error||'Belum dapat dicoba ulang.');row.outbox.status=result.data.status;row.error='';store(row);startShowcaseWorkers([result.data]);refreshShowcaseSaves();paint(row);}).catch(function(error){row.error=error.message;store(row);paint(row);}).finally(function(){row.busy=false;});
  }
  function importLegacy(data){
    var previousScope={outlet:STATE.outlet,date:byId('eventDate').value,drafts:STATE.drafts};
    var payload=data.payload,job=data.job;if(!payload||!job)return Promise.reject(new Error('Input lama belum tersedia.'));
    STATE.outlet=job.outlet;byId('eventDate').value=payload.eventDate;
    return Promise.all((payload.entries||[]).map(function(entry){
      return global.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(job.requestId)+'|'+entry.itemCode)).then(function(hash){
        var id='legacy-'+Array.from(new Uint8Array(hash),function(value){return value.toString(16).padStart(2,'0');}).join('').slice(0,40),row=rowFor({code:entry.itemCode});
        if(row.id===id&&row.revision>0)return;
        if(row.id!==id&&(row.outbox||dirty(row)))throw new Error('Selesaikan input baru pada item ini sebelum membuka permintaan lama.');
        row.id=id;row.revision=0;row.confirmed=empty();row.desired=empty();row.outbox=null;delete row.base;row.needsRefresh=false;
        fields.forEach(function(field,i){row.desired.values[field]=entry[field]||0;row.desired.touched[field]=!!entry[flags[i]];if(entry[totalFlags[i]]){row.desired.totals[totals[i]]=entry[totals[i]];row.desired.values[field]=0;row.desired.touched[field]=true;}});
        row.error='';row.commitWhenReady=true;if(!store(row))throw new Error('Input pemulihan belum dapat dicadangkan.');
      });
    })).then(function(){if(SHOWCASE_SAVES.pending)acknowledgeShowcaseDrafts(SHOWCASE_SAVES.pending);clearShowcasePending();SHOWCASE_SAVES.reviewId=null;STATE.drafts={};persistShowcaseDrafts();load();}).catch(function(error){STATE.outlet=previousScope.outlet;byId('eventDate').value=previousScope.date;STATE.drafts=previousScope.drafts;throw error;});
  }
  function recoverLegacy(source){
    if(recoveringLegacy)return;recoveringLegacy=true;notice('Memastikan status permintaan lama sebelum memulihkan input…',false);
    BAKERZIN_API.call('showcaseResolveLegacy',[STATE.token,source]).then(function(result){
      if(!result||!result.ok)throw new Error(result&&result.error||'Status input lama belum dapat dipastikan.');
      var data=result.data;if(data.migrated)return importLegacy(data);
      if(data.job&&data.job.status==='COMPLETE'){if(SHOWCASE_SAVES.pending)acknowledgeShowcaseDrafts(SHOWCASE_SAVES.pending);clearShowcasePending();load();return;}
      if(data.job)startShowcaseWorkers([data.job]);notice('Permintaan lama sudah diterima server dan harus diselesaikan dahulu. Input baru tetap dicadangkan.',true);refreshShowcaseSaves();
    }).catch(function(error){notice(error.message,true);}).finally(function(){recoveringLegacy=false;});
  }
  function flush(){
    if(SHOWCASE_SAVES.pending){recoverLegacy(SHOWCASE_SAVES.pending);return;}
    if(!enabled){summary();return;}
    STATE.items.forEach(function(item){commit(rowFor(item),true);});
  }
  function statusContents(row,index){
    var button=row.outbox&&['FAILED','ACTION_REQUIRED','UNCERTAIN'].indexOf(row.outbox.status)>=0?'<button class="row-save-retry" data-showcase-retry="'+index+'" type="button">Coba lagi</button>':'';
    return escapeHtml(statusText(row))+button;
  }
  function rowStatus(index){
    var item=STATE.items[Number(index)];if(!item||!owner())return '';
    var row=rowFor(item);
    return '<span class="row-save-status '+(row.error?'error':'')+'" data-showcase-row-status="'+index+'" role="status">'+statusContents(row,index)+'</span>';
  }
  function review(jobId){
    var job=SHOWCASE_SAVES.jobs.find(function(candidate){return candidate.jobId===jobId;});if(!job)return false;if(SHOWCASE_SAVES.pending&&SHOWCASE_SAVES.pending.requestId!==job.requestId){notice('Selesaikan permintaan sebelumnya sebelum membuka koreksi lain.',true);return true;}if(!job.rowEdit){if(job.status==='ACTION_REQUIRED'||job.status==='MIGRATED_TO_DIRECT'){recoverLegacy({jobId:jobId});return true;}return false;}
    if(SHOWCASE_SAVES.pending||SHOWCASE_SAVES.reviewId){notice('Selesaikan permintaan sebelumnya sebelum membuka koreksi lain.',true);return true;}
    BAKERZIN_API.call('goodsUploadRequest',[STATE.token,jobId]).then(function(result){
      if(!result||!result.ok)throw new Error(result&&result.error||'Input belum dapat dibuka.');
      var data=result.data,payload=data.payload;STATE.outlet=job.outlet;byId('eventDate').value=payload.eventDate;STATE.drafts={};
      var item={code:job.rowEdit.itemCode},row=rowFor(item),entry=payload.entries[0];
      row.id=payload.rowEdit.id;row.revision=payload.rowEdit.revision-1;row.confirmed=empty();row.confirmed.values=data.rowState&&data.rowState.values||row.confirmed.values;
      row.desired=empty();fields.forEach(function(field,i){row.desired.values[field]=entry[field]||0;row.desired.touched[field]=!!entry[flags[i]];if(entry[totalFlags[i]])row.desired.totals[totals[i]]=entry[totals[i]];});
      row.outbox={status:'ACTION_REQUIRED',jobId:jobId,payload:payload,snapshot:clone(row.desired)};row.outbox.payload.requestId=job.requestId;row.error=job.error;store(row);load();
    }).catch(function(error){notice(error.message,true);});return true;
  }
  global.SHOWCASE_AUTOSAVE={observe:observe,hydrate:hydrate,flush:flush,status:acceptStatuses,review:review,rowStatus:rowStatus,
    balance:function(index,item){return preview(item,rowFor(item));},pollDelay:function(){return SHOWCASE_SAVES.pending||(SHOWCASE_SAVES.jobs||[]).some(function(job){return ['QUEUED','PREPARING','PROCESSING'].indexOf(job.status)>=0;})?15000:0;}};
  var body=byId('itemRows');
  body.addEventListener('input',function(event){var input=event.target;if(input.matches('.qty-input,.total-edit'))observe(input.dataset.index,input.dataset.field,input.value);});
  body.addEventListener('focusout',function(event){var input=event.target;if(!input.matches('.qty-input,.total-edit'))return;var tr=input.closest('tr');if(event.relatedTarget&&tr.contains(event.relatedTarget))return;var item=STATE.items[Number(input.dataset.index)];if(item)commit(rowFor(item));});
  body.addEventListener('keydown',function(event){if(event.key==='Enter'&&event.target.matches('.qty-input,.total-edit')){event.preventDefault();var item=STATE.items[Number(event.target.dataset.index)];if(item)commit(rowFor(item));}});
  body.addEventListener('click',function(event){var button=event.target.closest('[data-showcase-retry]');if(!button)return;var item=STATE.items[Number(button.dataset.showcaseRetry)];if(item){var row=rowFor(item);if(row.outbox&&row.outbox.status==='ACTION_REQUIRED')commit(row);else retry(row);}});
  global.addEventListener('online',function(){Object.values(rows).forEach(function(row){if(row.outbox&&row.outbox.status==='UNCERTAIN')send(row);});});
  hydrate(byId('eventDate').value,!STATE.autosaveReady);renderItems();
}(window));
