(function (global) {
  'use strict';

  function apiUrl() {
    var value = global.BAKERZIN_CONFIG && global.BAKERZIN_CONFIG.API_URL || '';
    if (!value || value.indexOf('PASTE_') === 0) {
      throw new Error('API_URL belum diatur di config.js.');
    }
    return value;
  }

  function requestId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function timeoutForAction(action) {
    action = String(action || '');
    // Sales Usage dapat membawa ribuan baris dan butuh waktu lebih lama.
    // Beri ruang lebih besar di sisi browser, tetapi backend tetap harus diproses secara batch.
    if (action === 'uploadUsage' || action === 'previewSalesRepair' || action === 'repairSalesUpload') return 540000;
    return /^(verify|upload|salesAnalysis)|^lostFound(?:Save|Update|Process)$/.test(action) ? 300000 : 90000;
  }

  function call(action, args) {
    return new Promise(function (resolve, reject) {
      var id = requestId();
      var frameName = 'bakerzin_api_' + id.replace(/[^a-z0-9]/gi, '');
      var iframe = document.createElement('iframe');
      var form = document.createElement('form');
      var input = document.createElement('input');
      var finished = false;
      var messageTargets = [global];

      // Chat dibuka di dalam iframe BI-Space. Output HtmlService GAS memakai
      // top.postMessage(), sehingga balasannya tiba di jendela aplikasi utama,
      // bukan di iframe chat. Dengarkan keduanya selama masih satu origin.
      try {
        if (global.top && global.top !== global) messageTargets.push(global.top);
      } catch (error) {
        // Bila parent berbeda origin, listener lokal tetap dipakai.
      }

      iframe.name = frameName;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.display = 'none';
      form.method = 'POST';
      form.action = apiUrl();
      form.target = frameName;
      form.style.display = 'none';
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify({
        requestId: id,
        action: action,
        args: args || []
      });
      form.appendChild(input);

      function cleanup() {
        messageTargets.forEach(function (target) {
          try { target.removeEventListener('message', onMessage); } catch (error) {}
        });
        clearTimeout(timer);
        if (form.parentNode) form.parentNode.removeChild(form);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      function onMessage(event) {
        var message = event.data;
        // HtmlService GAS membungkus output dalam iframe internal Google, sehingga
        // event.source bukan iframe luar yang dibuat halaman ini. Request ID acak
        // tetap memastikan hanya jawaban untuk panggilan ini yang diterima.
        if (finished || !message || message.bakerzinApi !== true || message.requestId !== id) return;
        finished = true;
        cleanup();
        resolve(message.response);
      }

      var timeoutMs = timeoutForAction(action);
      var timer = setTimeout(function () {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Server tidak merespons dalam ' + Math.round(timeoutMs / 60000) + ' menit. Periksa deployment GAS dan coba lagi.'));
      }, timeoutMs);

      messageTargets.forEach(function (target) {
        try { target.addEventListener('message', onMessage); } catch (error) {}
      });
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
    });
  }

  global.BAKERZIN_API = Object.freeze({ call: call });

  function installChatWidget() {
    if (/\/chat\.html$/i.test(global.location.pathname)) return;
    var token = '';
    try { token = global.localStorage.getItem('bakerzin_session') || ''; } catch (error) {}
    if (!token || document.getElementById('biChatFloat')) return;
    var style = document.createElement('style');
    style.textContent = '#biChatFloat{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(22px,calc(env(safe-area-inset-bottom) + 18px));z-index:2147482000;width:54px;height:54px;border:0;border-radius:19px;background:linear-gradient(145deg,#8d1027,#c8203e);color:#fff;box-shadow:0 12px 30px rgba(126,18,39,.32);display:grid;place-items:center;cursor:pointer;transition:.18s transform,.18s box-shadow}#biChatFloat:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(126,18,39,.4)}#biChatFloat svg{width:25px;height:25px}#biChatBadge{position:absolute;right:-4px;top:-5px;min-width:19px;height:19px;padding:0 5px;border:2px solid #fff;border-radius:12px;background:#ffcc4d;color:#5d111e;font:700 10px/15px Arial;display:none;place-items:center}#biChatLayer{position:fixed;inset:0;z-index:2147483000;background:rgba(34,13,19,.48);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}#biChatLayer.open{display:flex}#biChatFrame{width:min(1120px,100%);height:min(820px,calc(100dvh - 24px));border:0;border-radius:24px;background:#fff;box-shadow:0 28px 80px rgba(34,13,19,.34)}@media(max-width:700px){#biChatFloat{width:50px;height:50px;border-radius:17px;right:14px;bottom:max(16px,calc(env(safe-area-inset-bottom) + 12px))}#biChatLayer{padding:0}#biChatFrame{width:100%;height:100dvh;border-radius:0}}';
    document.head.appendChild(style);
    var button = document.createElement('button'); button.id = 'biChatFloat'; button.type = 'button'; button.setAttribute('aria-label', 'Buka pesan grup');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 15a4 4 0 0 1-4 4H8l-5 3 1.6-4.2A6.5 6.5 0 0 1 3 13.5v-4A4.5 4.5 0 0 1 7.5 5h8A4.5 4.5 0 0 1 20 9.5z"/><path d="M8 11h.01M12 11h.01M16 11h.01" stroke-linecap="round" stroke-width="2.7"/></svg><span id="biChatBadge"></span>';
    var layer = document.createElement('div'); layer.id = 'biChatLayer';
    var frame = document.createElement('iframe'); frame.id = 'biChatFrame'; frame.title = 'Pesan BI-Space'; frame.setAttribute('allow', 'camera');
    layer.appendChild(frame); document.body.appendChild(button); document.body.appendChild(layer);
    function close() { layer.classList.remove('open'); document.documentElement.style.overflow = ''; }
    button.addEventListener('click', function () { if (!frame.src) frame.src = 'chat.html'; layer.classList.add('open'); document.documentElement.style.overflow = 'hidden'; });
    layer.addEventListener('click', function (event) { if (event.target === layer) close(); });
    global.addEventListener('message', function (event) { if (event.data && event.data.biChatClose) close(); });
    function refreshBadge() { call('chatBootstrap', [token]).then(function (response) { if (!response || !response.ok) return; var count = (response.data.rooms || []).reduce(function (sum, room) { return sum + Number(room.unread || 0); }, 0); var badge = document.getElementById('biChatBadge'); if (!badge) return; badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = count ? 'grid' : 'none'; }).catch(function () {}); }
    refreshBadge(); global.setInterval(refreshBadge, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installChatWidget);
  else installChatWidget();
}(window));
