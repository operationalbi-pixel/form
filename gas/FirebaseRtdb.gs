/**
 * Firebase Realtime Database — chat tick channel (near WebSocket).
 *
 * PASANG:
 * 1. Apps Script → Files (+) → Script → tempel isi file ini sebagai FirebaseRtdb.gs
 *    ATAU tempel semua function ke Code.gs
 * 2. Di apiActions_() tambahkan:
 *      getFirebasePublicConfig: getFirebasePublicConfig,
 * 3. Di sendChatMessage setelah appendChatMessage_ / dapat object message:
 *      try { publishChatRealtimeTick_(roomId, message); } catch (e) {}
 *    Untuk task di notifyChatRoom_ (opsional):
 *      try { publishChatRealtimeTick_(roomId, { id: entityId, sequence: 0 }); } catch (e) {}
 * 4. Script properties (lihat docs/FIREBASE_RTDB_SETUP.md)
 * 5. Deploy Web App → New version
 */

function firebaseRtdbConfig_() {
  const p = PropertiesService.getScriptProperties();
  const databaseURL = String(p.getProperty('FIREBASE_DATABASE_URL') || '').replace(/\/$/, '').trim();
  const projectId = String(p.getProperty('FCM_PROJECT_ID') || p.getProperty('FIREBASE_PROJECT_ID') || '').trim();
  const clientEmail = String(p.getProperty('FCM_CLIENT_EMAIL') || '').trim();
  const privateKey = String(p.getProperty('FCM_PRIVATE_KEY') || '').replace(/\\n/g, '\n').trim();
  if (!databaseURL || !clientEmail || !privateKey) return null;
  return { databaseURL: databaseURL, projectId: projectId, clientEmail: clientEmail, privateKey: privateKey };
}

function firebasePublicConfig_() {
  const p = PropertiesService.getScriptProperties();
  const apiKey = String(p.getProperty('FIREBASE_API_KEY') || '').trim();
  const authDomain = String(p.getProperty('FIREBASE_AUTH_DOMAIN') || '').trim();
  const databaseURL = String(p.getProperty('FIREBASE_DATABASE_URL') || '').replace(/\/$/, '').trim();
  const projectId = String(p.getProperty('FIREBASE_PROJECT_ID') || p.getProperty('FCM_PROJECT_ID') || '').trim();
  if (!apiKey || !databaseURL || !projectId) return null;
  return {
    apiKey: apiKey,
    authDomain: authDomain || (projectId + '.firebaseapp.com'),
    databaseURL: databaseURL,
    projectId: projectId
  };
}

function getFirebasePublicConfig() {
  return safe_(function () {
    const cfg = firebasePublicConfig_();
    return { configured: Boolean(cfg), firebase: cfg };
  });
}

function firebaseRtdbAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('firebase-rtdb-oauth-token-v1');
  if (cached) return cached;
  const config = firebaseRtdbConfig_();
  if (!config) return '';
  const now = Math.floor(Date.now() / 1000);
  const encode = function (value) {
    return Utilities.base64EncodeWebSafe(typeof value === 'string' ? value : JSON.stringify(value)).replace(/=+$/g, '');
  };
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claim = encode({
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const unsigned = header + '.' + claim;
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, config.privateKey)
  ).replace(/=+$/g, '');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    console.error('RTDB OAuth gagal: ' + response.getContentText());
    return '';
  }
  const token = JSON.parse(response.getContentText()).access_token || '';
  if (token) cache.put('firebase-rtdb-oauth-token-v1', token, 3000);
  return token;
}

function chatRealtimePathKey_(roomId) {
  return String(roomId || 'GENERAL').replace(/[.#$\[\]]/g, '_');
}

/**
 * Publish tick ke RTDB. Dipanggil setelah pesan/tugas tersimpan.
 * message: { id, sequence } dari appendChatMessage_
 */
function publishChatRealtimeTick_(roomId, message) {
  try {
    const config = firebaseRtdbConfig_();
    const accessToken = firebaseRtdbAccessToken_();
    if (!config || !accessToken) return { ok: false, reason: 'not_configured' };
    message = message || {};
    const pathKey = chatRealtimePathKey_(roomId);
    const payload = {
      roomId: String(roomId),
      sequence: Number(message.sequence || message.seq || 0),
      messageId: String(message.id || message.messageId || ''),
      updatedAt: new Date().toISOString()
    };
    const url = config.databaseURL + '/chatTicks/' + encodeURIComponent(pathKey) + '.json?access_token=' + encodeURIComponent(accessToken);
    const response = UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    if (code >= 300) {
      console.error('RTDB tick gagal ' + code + ': ' + response.getContentText());
      return { ok: false, code: code };
    }
    return { ok: true };
  } catch (error) {
    console.warn('publishChatRealtimeTick_ failed: ' + error);
    return { ok: false, error: String(error.message || error) };
  }
}
