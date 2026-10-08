/* Durable browser outbox. Server acknowledgement and Sheet completion are separate. */
(function () {
  const types={saveDaily:'DAILY',saveWeekly:'WEEKLY',saveMonthly:'MONTHLY'};
  let busy=false,timer=null,account='',entries=[],jobs=[],complete=null;
  const token=()=>localStorage.getItem('bakerzin_session')||'';
  const key=()=> 'sales-save-outbox-v1:'+account;
  function save(){localStorage.setItem(key(),JSON.stringify(entries));}
  function api(action,args){if(token()!==account)throw Error('Sesi akun berubah.');return BAKERZIN_API.call(action,[account].concat(args||[])).then(r=>{if(!r||!r.ok)throw Error(r&&r.error||'Layanan Simpan belum tersedia.');return r.data;});}
  function node(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function render(){
    if(account!==token())return;
    let panel=document.getElementById('salesSaveStatus');
    if(!panel){panel=node('details');panel.id='salesSaveStatus';panel.style.cssText='position:fixed;right:18px;bottom:24px;z-index:1500;background:white;border:1px solid #ddd;border-radius:12px;padding:12px;max-width:360px;max-height:60vh;overflow:auto;box-shadow:0 4px 20px #0002';document.body.append(panel);}
    panel.replaceChildren();panel.append(node('summary','Status Simpan'));
    const remote=new Set(jobs.map(j=>j.requestId));
    const list=entries.filter(e=>!remote.has(e.requestId)).map(e=>({requestId:e.requestId,type:types[e.fn],outlet:e.payload.outlet_code,status:'LOCAL',error:e.error||''})).concat(jobs);
    if(!list.length)panel.append(node('p','Belum ada penyimpanan.'));
    list.slice(0,100).forEach(job=>{
      const row=node('div');row.style.cssText='padding:10px 0;border-top:1px solid #eee';
      const status=job.status==='COMPLETE'?'Tersimpan':job.status==='ACTION_REQUIRED'?'Perlu diperiksa':'Diproses';
      row.append(node('strong',status+' · '+(job.outlet||'')+' · '+({DAILY:'Harian',WEEKLY:'Mingguan',MONTHLY:'Bulanan'}[job.type]||'Sales')));
      if(job.status==='LOCAL')row.append(node('p','Permintaan tersimpan di perangkat ini dan dikirim otomatis.'));
      if(job.status==='QUEUED'||job.status==='PROCESSING')row.append(node('p','Permintaan sudah diterima. Penulisan ke sheet berlangsung di background.'));
      if(job.error)row.append(node('p',job.error));
      if(job.status==='ACTION_REQUIRED'||job.status==='LOCAL'){
        const button=node('button','Coba lagi');button.onclick=async()=>{button.disabled=true;try{if(job.jobId)await api('retrySalesSave',[job.jobId]);await pump();}catch(e){button.disabled=false;row.append(node('p',e.message));}};row.append(button);
      }
      panel.append(row);
    });
  }
  async function pump(){
    if(busy||!account||token()!==account)return;busy=true;
    try{
      for(const entry of entries){
        if(entry.jobId)continue;
        try{
          const result=await api('queueSalesSave',[{type:types[entry.fn],payload:entry.payload,requestId:entry.requestId}]);
          if(token()!==account)return;
          if(!result||!result.accepted||!result.job?.jobId)throw Error('Penerimaan penyimpanan belum terkonfirmasi.');
          entry.jobId=result.job.jobId;entry.error='';save();
        }catch(error){entry.error=String(error.message||error);save();break;}
      }
      const result=await api('salesSaveJobs',[]);if(token()!==account)return;jobs=result.jobs||[];
      for(let index=0;index<entries.length;index+=15){
        const response=await api('salesSaveJobs',[entries.slice(index,index+15).map(e=>e.requestId)]);
        if(token()!==account)return;
        for(const job of response.jobs||[]){const old=jobs.findIndex(j=>j.requestId===job.requestId);if(old<0)jobs.push(job);else jobs[old]=job;}
      }
      for(const job of jobs.filter(j=>j.status==='COMPLETE')){
        const entry=entries.find(e=>e.requestId===job.requestId);
        if(!entry)continue;
        if(complete)complete(entry,job.result);
        entries=entries.filter(e=>e!==entry);save();
      }
    }catch(error){/* A lost reply never clears the persisted request. */}
    finally{busy=false;render();}
  }
  window.SalesSaveOutbox={
    accepts:fn=>Object.prototype.hasOwnProperty.call(types,fn),
    enqueue(fn,payload,snapshot){
      if(!account||account!==token())throw Error('Sesi Simpan belum siap.');
      const body=JSON.parse(JSON.stringify(payload||{}));
      let entry=entries.find(e=>e.fn===fn&&JSON.stringify(e.payload)===JSON.stringify(body));
      if(!entry){entry={requestId:crypto.randomUUID(),fn,payload:body,snapshot,createdAt:new Date().toISOString()};entries.push(entry);try{save();}catch(error){entries.pop();throw Error('Permintaan belum tersimpan di perangkat. Kosongkan ruang browser dan coba lagi.');}}
      render();void pump();return {ok:true,accepted:true,local:true,requestId:entry.requestId};
    },
    start(callback){account=token();complete=callback;try{entries=JSON.parse(localStorage.getItem(key())||'[]');if(!Array.isArray(entries))throw Error('Invalid outbox');}catch(e){throw Error('Status Simpan di perangkat tidak dapat dibaca.');}
      render();void pump();if(timer)clearInterval(timer);timer=setInterval(pump,15000);return entries;},
    poll:pump
  };
})();
