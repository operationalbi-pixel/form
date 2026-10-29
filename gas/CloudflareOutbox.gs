/** Private outbound outbox. This module must never issue outbound HTTP from GAS. */
var CLOUDFLARE_OUTBOUND_REQUEST_IDS_=[];
function cloudflareOutboxSheet_(){return ensureSheet_('CF_APP_OUTBOX',['ID','KIND','PAYLOAD_FILE','STATUS','CREATED_AT','LEASE_TOKEN','LEASE_UNTIL','ATTEMPTS','ERROR']);}
function enqueueCloudflareOutbound_(kind,payload){
  if(['FCM','RTDB'].indexOf(kind)<0)throw new Error('Jenis outbox tidak valid.');
  const id=Utilities.getUuid(),json=JSON.stringify(payload);if(json.length>400000)throw new Error('Payload outbox terlalu besar.');
  const file=DriveApp.createFile(Utilities.newBlob(json,'application/json','CF_OUTBOX_'+id+'.json'));
  cloudflareOutboxSheet_().appendRow([id,kind,file.getId(),'PENDING',new Date(),'','',0,'']);
  CLOUDFLARE_OUTBOUND_REQUEST_IDS_.push(id);return{id:id,queued:true};
}
function cloudflareOutboxHmac_(text){const key=cloudflareInventoryConfig_().apiKey;return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text,key,Utilities.Charset.UTF_8)).replace(/=+$/,'');}
function cloudflareOutboxConstantEqual_(a,b){a=String(a||'');b=String(b||'');let different=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return different===0;}
function attachCloudflareOutboundHint_(response){
  if(!response||!CLOUDFLARE_OUTBOUND_REQUEST_IDS_.length)return response;
  try{const now=Math.floor(Date.now()/1000),claims={aud:'outbound-hint-v1',iat:now,exp:now+300,ids:CLOUDFLARE_OUTBOUND_REQUEST_IDS_.slice(0,50)},encoded=Utilities.base64EncodeWebSafe(JSON.stringify(claims),Utilities.Charset.UTF_8).replace(/=+$/,'');
    response.outboundHint={url:cloudflareInventoryConfig_().url+'/v1/app-outbound',token:encoded+'.'+cloudflareOutboxHmac_('outbound-hint-v1.'+encoded)};
  }catch(error){console.warn('Outbox tetap tersimpan; hint tidak tersedia.');}return response;
}
function cloudflareOutboundAssertion_(kind){
  const config=kind==='FCM'?mobilePushConfig_():firebaseRtdbConfig_();if(!config)throw new Error('Konfigurasi Firebase belum tersedia.');
  const now=Math.floor(Date.now()/1000),encode=function(v){return Utilities.base64EncodeWebSafe(JSON.stringify(v),Utilities.Charset.UTF_8).replace(/=+$/,'');};
  const scopes=kind==='FCM'?'https://www.googleapis.com/auth/firebase.messaging':'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
  const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:config.clientEmail,scope:scopes,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  return{assertion:unsigned+'.'+Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned,config.privateKey)).replace(/=+$/,''),projectId:config.projectId,databaseURL:config.databaseURL||''};
}
function cloudflareOutboundService_(request){
  try{
    const envelope=String(request.envelope||'');if(envelope.length>32000||!cloudflareOutboxConstantEqual_(request.signature,cloudflareOutboxHmac_('cloudflare-outbound-v1.'+envelope)))throw new Error('Akses layanan ditolak.');
    const proof=JSON.parse(envelope),now=Date.now();if(!Number.isInteger(proof.iat)||proof.iat*1000<now-300000||proof.iat*1000>now+30000||!/^[a-zA-Z0-9-]{16,100}$/.test(String(proof.nonce||'')))throw new Error('Bukti layanan kedaluwarsa.');
    const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return{ok:false,retryable:true,error:'Outbox sedang sibuk.'};
    try{
      const cache=CacheService.getScriptCache(),nonceKey='cf-outbox-nonce-'+proof.nonce;if(cache.get(nonceKey))throw new Error('Bukti layanan sudah dipakai.');cache.put(nonceKey,'1',330);
      if(proof.action==='ping')return{ok:true,data:{service:'cloudflare-outbound-v1'}};
      const sheet=cloudflareOutboxSheet_(),rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues():[],args=proof.args||{};
      if(proof.action==='pending'){return{ok:true,data:{ids:rows.filter(function(r){return r[3]==='PENDING'||r[3]==='PROCESSING'&&new Date(r[6]||0).getTime()<now;}).slice(0,20).map(function(r){return String(r[0]);})}};}
      const index=rows.findIndex(function(r){return String(r[0])===String(args.id||'');});if(index<0)return{ok:true,data:{skip:true}};
      const row=rows[index],rowNumber=index+2;
      if(proof.action==='prepare'){
        if(row[3]==='COMPLETE'||row[3]==='FAILED')return{ok:true,data:{skip:true}};
        if(row[3]==='PROCESSING'&&new Date(row[6]||0).getTime()>now)return{ok:true,data:{busy:true}};
        const lease=Utilities.getUuid(),attempts=Number(row[7]||0)+1;
        const payload=JSON.parse(DriveApp.getFileById(row[2]).getBlob().getDataAsString('UTF-8'));
        if(row[1]==='FCM'){const registered=readMobilePushTokens_({});payload.tokens=(payload.tokens||[]).filter(function(token){return registered.indexOf(token)>=0;});}
        const credential=cloudflareOutboundAssertion_(String(row[1]));
        sheet.getRange(rowNumber,4,1,6).setValues([['PROCESSING',row[4],lease,new Date(now+300000),attempts,'']]);SpreadsheetApp.flush();
        return{ok:true,data:{id:String(row[0]),kind:String(row[1]),lease:lease,attempts:attempts,payload:payload,credential:credential}};
      }
      if(proof.action==='finish'){
        if(String(row[5])!==String(args.lease||'')||row[3]!=='PROCESSING')return{ok:true,data:{stale:true}};
        const status=args.success?'COMPLETE':args.permanent?'FAILED':'PENDING';
        sheet.getRange(rowNumber,4,1,6).setValues([[status,row[4],'','',row[7],String(args.error||'').slice(0,300)]]);SpreadsheetApp.flush();
        if(status==='COMPLETE'){try{DriveApp.getFileById(row[2]).setTrashed(true);}catch(cleanupError){console.warn('Pembersihan file outbox ditunda.');}}
        return{ok:true,data:{status:status}};
      }
      throw new Error('Aksi outbox tidak tersedia.');
    }finally{lock.releaseLock();}
  }catch(error){console.error('Layanan outbox: '+error.message);return{ok:false,error:'Permintaan layanan outbox tidak dapat diproses.'};}
}

function getCloudflareOutboxStatus(token){return safe_(function(){requireAdmin_(token);const sheet=cloudflareOutboxSheet_(),rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues():[];return{jobs:rows.slice(-200).reverse().map(function(r){return{id:String(r[0]),kind:String(r[1]),status:String(r[3]),createdAt:r[4],attempts:Number(r[7]||0),error:String(r[8]||'')};})};});}
function retryCloudflareOutbound(token,id){return safe_(function(){requireAdmin_(token);const lock=LockService.getScriptLock();lock.waitLock(10000);try{const sheet=cloudflareOutboxSheet_(),rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues():[],index=rows.findIndex(function(r){return String(r[0])===String(id);});if(index<0||rows[index][3]!=='FAILED')throw new Error('Pekerjaan ini tidak dapat dicoba ulang.');DriveApp.getFileById(rows[index][2]).getBlob();sheet.getRange(index+2,4,1,6).setValues([['PENDING',rows[index][4],'','',0,'']]);SpreadsheetApp.flush();CLOUDFLARE_OUTBOUND_REQUEST_IDS_.push(String(id));return{queued:true,id:String(id)};}finally{lock.releaseLock();}});}
