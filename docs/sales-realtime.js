/* Latest editable drafts, bounded direct retries and optimistic field guards. No job queue. */
(function(root){
  'use strict';
  root.SalesRealtime={create:function(options){
    const drafts=new Map(),running=new Map(),timers=new Map(),states=new Map(),confirmed=new Map();
    let generation=0,storageHealthy=true;
    try{for(const [id,value] of JSON.parse(options.storage.getItem(options.key)||'[]')){drafts.set(id,value);generation=Math.max(generation,Number(value.revision)||0);}}
    catch(error){storageHealthy=false;options.onStatus('','error','Draf perangkat tidak dapat dibaca.');}
    function persist(){try{options.storage.setItem(options.key,JSON.stringify([...drafts]));storageHealthy=true;return true;}catch(error){storageHealthy=false;options.onStatus('','error','Cadangan perangkat gagal. Tetap gunakan Simpan sebelum menutup halaman.');return false;}}
    function status(id,state,message){states.set(id,{state,message});options.onStatus(id,state,message);}
    function cancel(id){if(timers.has(id))clearTimeout(timers.get(id));timers.delete(id);}
    function schedule(id){cancel(id);timers.set(id,setTimeout(()=>{timers.delete(id);void flush(id).catch(()=>{});},options.delay??800));}
    function edit(id,request,automatic=true,review=false){
      const previous=drafts.get(id);
      const expected={...(request.payload.expected||{}),...(previous?.payload.expected||{})};
      if(review && request.payload.expected)Object.assign(expected,request.payload.expected);
      const payload={...(previous?.payload||{}),...request.payload};
      if(Object.keys(expected).length)payload.expected=expected;
      if(previous && previous.fn===request.fn && JSON.stringify(previous.payload)===JSON.stringify(payload) && previous.valid===request.valid){if(automatic && previous.valid!==false)schedule(id);return previous;}
      const value={...request,payload,revision:++generation};
      if(previous?.snapshot)value.snapshot={...previous.snapshot,...request.snapshot,
        salesInput:Object.hasOwn(request.payload,'sales')?request.snapshot.salesInput:previous.snapshot.salesInput,
        analysisInput:Object.hasOwn(request.payload,'analisa')?request.snapshot.analysisInput:previous.snapshot.analysisInput};
      drafts.set(id,value);persist();status(id,storageHealthy?'dirty':'error',storageHealthy?'Belum tersimpan':'Cadangan perangkat gagal · tekan Simpan');
      if(automatic && value.valid!==false)schedule(id);else cancel(id);
      return value;
    }
    function guarded(request){return ['sales','analisa'].filter(field=>Object.hasOwn(request.payload,field)).every(field=>Object.hasOwn(request.payload.expected||{},field));}
    function transient(error){return !/too many times for (?:one )?day|daily quota|kuota harian|SAVE_CONFLICT|sesi|session|unauthorized|kredensial|izin|tidak valid/i.test(error.message||'') && /network|fetch|offline|koneksi|timeout|timed out|tidak merespons|sementara|temporar|too many|quota|kuota|HTTP 5|penguncian|lock|service unavailable/i.test(error.message||'');}
    function online(){return !options.isOnline || options.isOnline();}
    async function flush(id){
      cancel(id);
      if(running.has(id))return running.get(id);
      const current=drafts.get(id);if(!current||current.valid===false)return null;
      if(!online()){status(id,'offline',storageHealthy?'Offline · draf aman di perangkat':'Offline · cadangan perangkat gagal');return null;}
      const operation=(async()=>{
        let sent;
        try{
          const latest=drafts.get(id);if(!latest||latest.valid===false)return null;
          // Retry the same absolute write: a timed-out attempt may already be committed.
          sent=JSON.parse(JSON.stringify(latest));
          for(let attempt=0;;attempt++){
            status(id,attempt?'retrying':'saving',attempt?'Mencoba menyimpan kembali…':'Menyimpan…');
            try{
              const result=await Promise.resolve().then(()=>options.write(sent));
              if(!result||!result.ok||result.accepted)throw Error(result?.error||'Penyimpanan langsung belum terkonfirmasi. Muat ulang halaman dan coba lagi.');
              const latest=drafts.get(id);
              if(latest?.revision===sent.revision)drafts.delete(id);
              else if(latest){
                for(const field of ['sales','analisa']){
                  if(Object.hasOwn(sent.payload,field)&&latest.payload[field]===sent.payload[field])delete latest.payload[field];
                  if(Object.hasOwn(latest.payload.expected||{},field)&&Object.hasOwn(result,field))latest.payload.expected[field]=result[field];
                }
                if(!Object.hasOwn(latest.payload,'sales')&&!Object.hasOwn(latest.payload,'analisa'))drafts.delete(id);
              }
              confirmed.set(id,sent.revision);
              persist();
              try{options.onSaved(sent,result);}catch(error){if(root.console)root.console.error('Sales tersimpan; tampilan belum diperbarui.',error);}
              status(id,drafts.has(id)?'dirty':'saved',drafts.has(id)?'Perubahan terbaru belum tersimpan':'Tersimpan');
              return result;
            }catch(error){
              if(!online()){status(id,'offline',storageHealthy?'Offline · draf aman di perangkat':'Offline · cadangan perangkat gagal');return null;}
              if(!guarded(sent)||!transient(error)||attempt>=2)throw error;
              status(id,'retrying','Mencoba menyimpan kembali…');
              await (options.sleep?options.sleep(750*(attempt+1)):new Promise(resolve=>setTimeout(resolve,750*(attempt+1))));
            }
          }
        }catch(error){
          status(id,'error','Belum tersimpan: '+(error.message||error));
          if(/SAVE_CONFLICT/.test(error.message||'') && options.onConflict)options.onConflict(sent);
          throw error;
        }finally{running.delete(id);}
      })();
      running.set(id,operation);
      try{const result=await operation;if(result&&drafts.has(id))schedule(id);return result;}catch(error){cancel(id);throw error;}
    }
    async function save(id){
      // A click covers the draft visible now, even when an older autosave is in flight.
      const target=drafts.get(id)?.revision;
      if(target===undefined)return running.has(id)?running.get(id):null;
      let result=null;
      while(drafts.has(id) && (confirmed.get(id)||0)<target){
        cancel(id);
        if(drafts.get(id).valid===false)return null;
        if(running.has(id))status(id,'saving','Menyimpan…');
        result=await flush(id);
        if(!result)return null;
      }
      return result;
    }
    return {edit,flush,save,drafts:()=>[...drafts],state:id=>states.get(id),busy:()=>running.size>0,hasDrafts:()=>drafts.size>0,
      resume(){for(const [id,state] of states)if(state.state==='offline'&&drafts.has(id))void flush(id).catch(()=>{});}};
  }};
})(typeof window==='undefined'?globalThis:window);
