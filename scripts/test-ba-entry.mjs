import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
const source=await readFile('docs/ba-entry.js','utf8');
const pdf=await readFile('berita-acara-gas/PDFGenerator.html','utf8');
const css=await readFile('berita-acara-gas/TailwindStyles.html','utf8');
const session='a'.repeat(64),identityKey='IDENTITY-1',token='main-token';
const owner=createHash('sha256').update(token).digest('hex');
const cacheKey='bakerzin_ba_entry_v1';
const cached={owner,session,identityKey,expiresAt:Date.now()+300000};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(entry,prewarm=false){
 const warmMessages=[];
 const storage=new Map(entry?[[cacheKey,JSON.stringify(entry)]]:[]),calls=[],listeners={},timers=new Map();let timer=0,now=0;
 const frame={style:{visibility:'hidden'},src:''},state={style:{},innerHTML:''};
 const context={console:{info(){}},URL,URLSearchParams,Uint8Array,TextEncoder,crypto:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto),subtle:{digest:async(name,value)=>Uint8Array.from(createHash('sha256').update(value).digest()).buffer}},performance:{now:()=>now},
 document:{getElementById:id=>id==='state'?state:frame},location:{search:prewarm?'?prewarm=1':'',origin:'https://app.test',replace(){}},
 localStorage:{getItem:()=>token},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),
 BAKERZIN_API:{call:()=>new Promise((resolve,reject)=>calls.push({resolve,reject}))},addEventListener:(name,fn)=>listeners[name]=fn};
 context.window=context;context.parent=prewarm?{postMessage:data=>warmMessages.push(data)}:context;context.top=context;vm.createContext(context);vm.runInContext(source,context);
 for(let i=0;i<100&&calls.length===0;i++)await tick();assert.equal(calls.length,1);
 return {context,frame,state,calls,storage,timers,warmMessages,advance:ms=>now=ms,
 message(data,origin='https://app.googleusercontent.com'){listeners.message({origin,data:{entryNonce:frame.src?new URL(frame.src).searchParams.get('entryNonce'):'',...data}})},
 async validate(key=identityKey,index=0){calls[index].resolve({ok:true,data:{handoff:'h'.repeat(64),identityKey:key}});await tick();}};
}
let h=await harness();assert.equal(h.frame.src,'','fresh entry waits for a real handoff');
await h.validate();assert.ok(h.frame.src.includes('handoff='));assert.equal(h.frame.style.visibility,'hidden');
h.message({baEntryReady:true,session,identityKey},'https://evil.test');assert.equal(h.frame.style.visibility,'hidden');
h.message({baEntryReady:true,session,identityKey,entryNonce:'wrong'});assert.equal(h.frame.style.visibility,'hidden');
h.advance(1500);h.message({baEntryReady:true,session,identityKey});assert.equal(h.frame.style.visibility,'visible');
assert.equal(h.context.baEntryPerformance.entryMs,1500,'metric records simulated readiness, not iframe-load');
assert.equal(JSON.parse(h.storage.get(cacheKey)).owner,owner);

h=await harness(cached);assert.ok(h.frame.src.includes('baSession='),'resume starts in parallel with main authentication');
h.message({baEntryReady:true,session,identityKey});assert.equal(h.frame.style.visibility,'hidden','ready BA alone cannot unlock the page');
await h.validate();assert.equal(h.frame.style.visibility,'visible');assert.equal(h.context.baEntryPerformance.resumed,true);
h.message({baHistoryReady:true});assert.equal(h.context.baEntryPerformance.historyMs,0);

h=await harness(cached);h.message({baEntryReady:true,session,identityKey});h.calls[0].resolve({ok:false,error:'Resign'});await tick();
assert.equal(h.frame.src,'about:blank');assert.equal(h.frame.style.visibility,'hidden');assert.equal(h.storage.has(cacheKey),false);
assert.ok(h.state.innerHTML.includes('Resign'));

h=await harness({...cached,owner:'another-account'});assert.equal(h.frame.src,'','another account never resumes the cached BA session');
h=await harness({...cached,expiresAt:Date.now()-1});assert.equal(h.frame.src,'');
h=await harness(cached);const staleNonce=new URL(h.frame.src).searchParams.get('entryNonce');h.message({baEntryReady:true,session,identityKey});
await h.validate('CHANGED-OUTLET');assert.ok(h.frame.src.includes('handoff='));assert.equal(h.frame.style.visibility,'hidden');
h.message({baEntryReady:true,session,identityKey,entryNonce:staleNonce});assert.equal(h.frame.style.visibility,'hidden');
h.message({baEntryReady:true,session,identityKey:'CHANGED-OUTLET'});assert.equal(h.frame.style.visibility,'visible');
assert.equal(h.context.baEntryPerformance.resumed,false);

h=await harness(null,true);await h.validate();assert.ok(h.frame.src.includes('prepareOnly=1'));
h.message({baEntryReady:true,session,identityKey});assert.equal(h.warmMessages.length,1);
assert.equal(h.warmMessages[0].bakerzinBaPrewarmComplete,true);

// CacheService eviction is retried immediately with the already-issued handoff.
h=await harness(cached);h.message({baEntryError:true,message:'Expired'});await h.validate();assert.ok(h.frame.src.includes('handoff='));
h=await harness(cached);await h.validate();h.message({baEntryError:true,message:'Expired'});assert.ok(h.frame.src.includes('handoff='));
h.message({baEntryReady:true,session,identityKey});assert.equal(h.frame.style.visibility,'visible');
// A request which times out cannot reopen itself when a late response arrives.
h=await harness();Array.from(h.timers.values())[0]();await h.validate();assert.equal(h.frame.src,'about:blank');

// PDF dependencies make zero startup requests, deduplicate clicks and retry failures.
const scripts=[];const loader={window:{},document:{head:{appendChild:s=>scripts.push(s)},createElement:()=>({remove(){}})},Promise,Error};
vm.createContext(loader);vm.runInContext(pdf.slice(pdf.indexOf('    window.pdfLibsLoaded'),pdf.indexOf('    // Helper Functions')),loader);
assert.equal(scripts.length,0);
const first=loader.startLoadingPDFLibs();assert.equal(loader.startLoadingPDFLibs(),first);assert.equal(scripts.length,1);
loader.window.jspdf={jsPDF:function(){}};scripts[0].onload();await tick();assert.equal(scripts.length,2);scripts[1].onload();await first;
assert.equal(loader.window.pdfLibsLoaded,true);await loader.startLoadingPDFLibs();assert.equal(scripts.length,2);
loader.window.pdfLibsLoaded=false;loader.window.baPdfLoadPromise=null;
const failed=loader.startLoadingPDFLibs();scripts[2].onerror();await assert.rejects(failed,/PDF/);
assert.equal(loader.window.baPdfLoadPromise,null,'failed lazy downloads can retry');
const retry=loader.startLoadingPDFLibs();scripts[3].onload();await tick();scripts[4].onload();await retry;
assert.ok(css.includes('.hidden')&&css.includes('.border-green-600')&&css.includes('.text-red-600'));
// Dashboard visits must not consume BA handoffs or URL Fetch quota.
const index=await readFile('docs/index.html','utf8');
const start=index.indexOf('    function scheduleBeritaAcaraWarmup('),end=index.indexOf('    function removeAppCache()',start);
let scheduled=0;
const warm={setTimeout:()=>scheduled++,document:{createElement:()=>{throw Error('Unexpected background frame')}}};
vm.createContext(warm);vm.runInContext(index.slice(start,end),warm);
warm.scheduleBeritaAcaraWarmup({tasks:[{target:'berita-acara'}]});assert.equal(scheduled,0);
// Quota exhaustion offers an explanation instead of a futile reload loop.
h=await harness();h.calls[0].reject(new Error('Layanan terlalu sering diminta di hari yang sama: urlfetch.'));await tick();
assert.match(h.state.innerHTML,/Batas pemakaian harian/);assert.doesNotMatch(h.state.innerHTML,/location.reload/);
assert.match(h.state.innerHTML,/Kembali ke Dashboard/);
new vm.Script(source);
console.log('OK: BA resumes with identity revalidation, rejects forged replies, disables background handoffs and explains daily quotas.');
