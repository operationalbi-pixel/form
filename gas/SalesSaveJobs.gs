/** Read-only legacy Sales history. New saves and background execution are retired. */
function salesSaveJobView_(job) {
  return {jobId:job.jobId,requestId:job.requestId,type:job.type,outlet:job.outlet,status:job.status,
    progress:job.status==='COMPLETE'?100:10,error:job.error||'',createdAt:job.createdAt,result:job.result||null};
}
function queueSalesSave(token, input) {
  return safe_(function(){
    const session=requireSession_(token),employee=salesAnalysisEmployee_(session.nik);assertEmployeeActive_(employee);
    throw new Error('Penyimpanan antrean sudah dihentikan. Muat ulang Analisa Sales Harian untuk memakai simpan langsung. Draf Anda belum tersimpan di server.');
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
  return safe_(function(){
    const session=requireSession_(token),employee=salesAnalysisEmployee_(session.nik);assertEmployeeActive_(employee);
    throw new Error('Antrean Sales lama sudah dinonaktifkan. Buka Analisa Sales dan simpan draf melalui tombol Simpan.');
  });
}
// All accepted Sales jobs were confirmed COMPLETE before retirement (2026-10-27).
// Keep history intact, stop background writes and remove only this retired trigger.
function processSalesSaveJobs() {
  ScriptApp.getProjectTriggers().forEach(function(trigger){
    if(trigger.getHandlerFunction()==='processSalesSaveJobs')ScriptApp.deleteTrigger(trigger);
  });
  return {retired:true};
}
