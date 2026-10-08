/** Sales requests live in D1, independently of Drive capacity and Sheet locks. */
function salesSaveJobView_(job) {
  return {jobId:job.jobId,requestId:job.requestId,type:job.type,outlet:job.outlet,status:job.status,
    progress:job.status==='COMPLETE'?100:10,error:job.error||'',createdAt:job.createdAt,result:job.result||null};
}
function salesSaveJobs_(active, owner) {
  return cloudflareReadAllPages_('/v1/application-records', {table:'background_upload_jobs',engine:'SALES',unresolved:active?1:'',owner_nik:owner||''},1000,100);
}
function ensureSalesSaveWorker_() {
  const key='sales-save-watchdog-v1', cache=CacheService.getScriptCache();
  if(cache.get(key)==='ready')return;
  if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='processSalesSaveJobs';}))
    ScriptApp.newTrigger('processSalesSaveJobs').timeBased().everyMinutes(1).create();
  cache.put(key,'ready',300);
}
function queueSalesSave(token, input) {
  return safe_(function(){
    input=input||{};
    if(['DAILY','WEEKLY','MONTHLY'].indexOf(input.type)<0)throw new Error('Jenis penyimpanan Sales tidak valid.');
    const main=requireSession_(token),employee=salesAnalysisEmployee_(main.nik);assertEmployeeActive_(employee);
    const role=employee.outlet==='BIHQ'?'admin':'store';
    if(role==='admin'&&input.type!=='DAILY')throw new Error('Akun HQ tidak boleh input analisa outlet.');
    const payload=JSON.parse(JSON.stringify(input.payload||{}));
    const outlet=role==='admin'?salesAnalysisCanonicalOutletCode_(payload.outlet_code):salesAnalysisCanonicalOutletCode_(employee.outlet);
    if(!outlet||outlet==='ALL'||outlet==='BIHQ')throw new Error('Pilih outlet yang valid sebelum menyimpan Sales.');
    if(role==='admin'&&!salesAnalysisOutletDirectory_().some(function(row){return row.code===outlet&&row.role!=='admin';}))throw new Error('Outlet tidak valid.');
    payload.outlet_code=outlet;
    if(input.type==='DAILY'){
      payload.date=normalizeDate_(payload.date,true);
      if(payload.preserveSales!==true&&payload.sales!==undefined&&(!Number.isFinite(Number(payload.sales))||Number(payload.sales)<0))throw new Error('Nominal Sales tidak valid.');
    }else{
      payload.year=Number(payload.year);payload.month=Number(payload.month);
      if(!Number.isInteger(payload.year)||payload.year<2000||payload.year>2100||!Number.isInteger(payload.month)||payload.month<1||payload.month>12)throw new Error('Periode analisa tidak valid.');
      if(input.type==='WEEKLY'&&(!Number.isInteger(Number(payload.week))||Number(payload.week)<1||Number(payload.week)>6))throw new Error('Minggu analisa tidak valid.');
    }
    if(String(payload.analisa||'').length>40000)throw new Error('Analisa terlalu panjang.');
    const requestId=String(input.requestId||'');if(!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))throw new Error('Identitas penyimpanan tidak valid.');
    const spreadsheetId=SALES_ANALYSIS.spreadsheetId();
    const job={jobId:digest_('sales-save|'+employee.nik+'|'+requestId),requestId:requestId,ownerNik:employee.nik,
      engine:'SALES',type:input.type,outlet:outlet,role:role,spreadsheetId:spreadsheetId,payload:payload,
      sourceHash:digest_(JSON.stringify({type:input.type,payload:payload}))};
    ensureSalesSaveWorker_();
    const result=cloudflareInventoryRequest_('POST','/v1/sales-save-jobs',{job:job});
    return {ok:true,accepted:true,job:salesSaveJobView_(result.job)};
  });
}
function getSalesSaveJobs(token, requests) {
  return safe_(function(){const session=requireSession_(token),employee=salesAnalysisEmployee_(session.nik);assertEmployeeActive_(employee);
    const query={table:'background_upload_jobs',engine:'SALES',owner_nik:employee.nik,limit:100,recent:1};
    if(Array.isArray(requests)&&requests.length){
      if(requests.length>15)throw new Error('Maksimal 15 identitas per permintaan.');
      query.record_ids=requests.map(function(id){if(!/^[a-zA-Z0-9-]{16,100}$/.test(String(id)))throw new Error('Identitas tidak valid.');return digest_('sales-save|'+employee.nik+'|'+id);}).join(',');
    }
    const response=cloudflareInventoryRequest_('GET','/v1/application-records?'+cloudflareQueryString_(query));
    return {jobs:(response.data||[]).map(salesSaveJobView_)};});
}
function retrySalesSave(token, id) {
  return safe_(function(){const session=requireSession_(token),employee=salesAnalysisEmployee_(session.nik);assertEmployeeActive_(employee);
    const job=readGoodsUploadJob_(id);if(!job||job.engine!=='SALES'||job.ownerNik!==employee.nik)throw new Error('Penyimpanan tidak ditemukan.');
    if(job.status==='ACTION_REQUIRED'){job.status='QUEUED';job.error='';job.nextAttemptAt=0;writeGoodsUploadJob_(job);}
    ensureSalesSaveWorker_();return salesSaveJobView_(job);});
}
function processSalesSaveJobs() {
  // Same worker gate as inventory; the Sheet lock is acquired only inside the actual write.
  const gate=LockService.getUserLock();if(!gate.tryLock(1000))return;
  try{
    const jobs=salesSaveJobs_(true).sort(function(a,b){return (String(a.createdAt)+'|'+a.jobId).localeCompare(String(b.createdAt)+'|'+b.jobId);});
    const outlets={},started=Date.now();
    for(let i=0;i<jobs.length&&Date.now()-started<180000;i++){
      const job=jobs[i];if(outlets[job.outlet])continue;outlets[job.outlet]=true;
      // Older unresolved writes block later edits for this outlet, even after a lost acknowledgement.
      if(job.status==='ACTION_REQUIRED'||Number(job.nextAttemptAt||0)>Date.now())continue;
      try{
        const employee=salesAnalysisEmployee_(job.ownerNik);assertEmployeeActive_(employee);
        const role=employee.outlet==='BIHQ'?'admin':'store';
        if(role!==job.role||(role!=='admin'&&salesAnalysisCanonicalOutletCode_(employee.outlet)!==job.outlet))throw new Error('Hak akses outlet berubah. Periksa penyimpanan ini.');
        job.status='PROCESSING';writeGoodsUploadJob_(job);
        SALES_ANALYSIS.useDatabase(job.spreadsheetId);
        SALES_ANALYSIS.syncOutlets([{code:job.outlet,name:job.outlet,role:role}]);
        const session=SALES_ANALYSIS.issueSession(job.outlet,job.outlet,role);
        const method={DAILY:'saveDaily',WEEKLY:'saveWeekly',MONTHLY:'saveMonthly'}[job.type];
        const result=SALES_ANALYSIS[method](session.token,job.payload);
        if(!result||!result.ok)throw new Error(result&&result.error||'Penulisan Sales belum berhasil.');
        job.result=result;job.status='COMPLETE';job.error='';job.nextAttemptAt=0;
        writeGoodsUploadJob_(job);
        outlets[job.outlet]=false; // Next edit can run immediately after confirmed completion.
      }catch(error){
        const message=String(error&&error.message||error);
        const retryable=/lock|penguncian|kunci|timeout|timed out|quota|kuota|too many|try again|sementara|Cloudflare|HTTP 5|service unavailable/i.test(message);
        job.status=retryable?'QUEUED':'ACTION_REQUIRED';job.error=message;job.nextAttemptAt=Date.now()+15000;
        writeGoodsUploadJob_(job);
      }finally{SALES_ANALYSIS.useDatabase('');}
    }
  }finally{gate.releaseLock();}
}
