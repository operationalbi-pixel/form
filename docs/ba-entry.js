(function(global){
  'use strict';
  var WEB_APP_URL='https://script.google.com/macros/s/AKfycbxBCTJ4BbHWrcVqXNZmtQEjfV_AFnPy_G7J8tkz88hXGPrpX_l01BNOozI0COQenXDyxg/exec';
  var token='';try{token=localStorage.getItem('bakerzin_session')||''}catch(error){}
  var state=document.getElementById('state'),frame=document.getElementById('beritaAcaraFrame');
  var cacheKey='bakerzin_ba_entry_v1',current=null,owner='';
  var prewarm=new URLSearchParams(location.search||'').get('prewarm')==='1';
  var clock=()=>performance.now();
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  function clearEntry(){try{sessionStorage.removeItem(cacheKey)}catch(error){}}
  function fail(message){if(current)clearTimeout(current.timer);current=null;clearEntry();frame.src='about:blank';frame.style.visibility='hidden';state.style.display='grid';state.innerHTML='<div class="card"><strong>Berita Acara belum dapat dibuka</strong><p>'+escapeHtml(message)+'</p><button class="retry" type="button" onclick="location.reload()">Coba Lagi</button></div>'}
  function readEntry(){try{var entry=JSON.parse(sessionStorage.getItem(cacheKey)||'null');return entry&&entry.owner===owner&&entry.expiresAt>Date.now()&&/^[a-f0-9]{64}$/i.test(entry.session)&&entry.identityKey?entry:null}catch(error){return null}}
  function nonce(){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}
  function navigate(request,params){
    request.nonce=nonce();request.ready=null;request.shown=false;
    frame.style.visibility='hidden';
    frame.src=WEB_APP_URL+'?'+new URLSearchParams(Object.assign({},params,{mode:request.mode,entryNonce:request.nonce,prepareOnly:prewarm?'1':''}));
  }
  function showReady(request){
    if(current!==request||!request.validated||!request.ready)return;
    if(request.expectedIdentity && request.ready.identityKey!==request.expectedIdentity){fail('Identitas akun berubah. Silakan buka kembali Berita Acara.');return}
    request.shown=true;clearTimeout(request.timer);
    frame.style.visibility='visible';state.style.display='none';
    var entry=request.ready;
    if(entry.identityKey&&/^[a-f0-9]{64}$/i.test(entry.session||''))try{sessionStorage.setItem(cacheKey,JSON.stringify({owner:owner,session:entry.session,identityKey:entry.identityKey,expiresAt:Date.now()+300000}))}catch(error){}
    global.baEntryPerformance={entryMs:Math.round(clock()-request.started),historyMs:request.historyReadyAt?Math.round(request.historyReadyAt-request.started):null,resumed:request.resumed};
    console.info('BA entry ready',global.baEntryPerformance);
    if(prewarm && global.parent!==global)global.parent.postMessage({bakerzinBaPrewarmComplete:true},location.origin);
  }
  function openFrame(mode){
    if(current)clearTimeout(current.timer);
    var entry=readEntry();
    var request=current={mode:mode||'',started:clock(),resumed:!!entry,validated:false,ready:null};
    state.style.display='grid';
    state.innerHTML='<div class="card"><div class="spinner"></div><strong>Membuka Berita Acara...</strong><p>Memverifikasi akun dan menyiapkan halaman.</p></div>';
    request.timer=setTimeout(()=>{if(current===request&&!request.shown)fail('Halaman belum merespons. Coba buka kembali Berita Acara.')},45000);
    // Resume the existing BA session while BI-Space revalidates the employee in parallel.
    // The iframe stays hidden until both checks are complete and identities match.
    if(entry)navigate(request,{baSession:entry.session});
    BAKERZIN_API.call('beritaAcaraHandoff',[token]).then(result=>{
      if(current!==request)return;
      if(!result||!result.ok||!result.data||!result.data.handoff)throw new Error(result&&result.error||'Sesi BI-Space tidak dapat diteruskan.');
      var data=result.data;request.handoff=data.handoff;request.expectedIdentity=data.identityKey||'';
      request.validated=true;
      if(entry&&!request.resumeFailed&&data.identityKey&&entry.identityKey===data.identityKey){showReady(request);return}
      clearEntry();request.resumed=false;
      navigate(request,{handoff:data.handoff});
    }).catch(error=>{if(current===request){clearTimeout(request.timer);fail(error&&error.message||error)}});
  }
  function onMessage(event){
    var data=event.data||{},host='';try{host=new URL(event.origin).hostname}catch(error){}
    var request=current;
    if(!request||!request.nonce||!/(^|\.)googleusercontent\.com$|^script\.google\.com$/.test(host)||data.entryNonce!==request.nonce)return;
    if(data.baEntryError){
      clearEntry();
      if(request.resumed){request.resumeFailed=true;if(request.validated){request.resumed=false;navigate(request,{handoff:request.handoff})}return}
      clearTimeout(request.timer);fail(data.message||'Sesi Berita Acara tidak tersedia.');return;
    }
    if(data.baEntryReady){request.ready=data;showReady(request);return}
    if(data.baHistoryReady){request.historyReadyAt=clock();if(request.shown&&global.baEntryPerformance){global.baEntryPerformance.historyMs=Math.round(clock()-request.started);console.info('BA history ready',global.baEntryPerformance);}return}
    if(data.biSpaceBeritaAcara)openFrame(data.mode==='user'?'user':'approval');
  }
  global.addEventListener('message',onMessage);
  try{if(global.top!==global)global.top.addEventListener('message',onMessage)}catch(error){}
  if(!token){location.replace('index.html');return}
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)).then(hash=>{
    owner=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');openFrame('');
  }).catch(()=>{clearEntry();openFrame('')});
}(window));
