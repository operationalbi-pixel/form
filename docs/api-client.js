(function (global) {
  'use strict';

  var CHAT_ASSET_VERSION = '20260826-chat110';

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
    if (action === 'chatBootstrap') return 20000;
    if (action === 'uploadUsage' || action === 'previewSalesRepair' || action === 'repairSalesUpload') return 540000;
    if (/^chat(?:Create|Update|Delete)Task$/.test(action)) return 300000;
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

      try {
        if (global.top && global.top !== global) messageTargets.push(global.top);
      } catch (error) {}

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
    style.textContent = '#biChatFloat{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(22px,calc(env(safe-area-inset-bottom) + 18px));z-index:2147482000;width:54px;height:54px;border:0;border-radius:19px;background:linear-gradient(145deg,#8d1027,#c8203e);color:#fff;box-shadow:0 12px 30px rgba(126,18,39,.32);display:grid;place-items:center;cursor:pointer;transition:.18s transform,.18s box-shadow}#biChatFloat:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(126,18,39,.4)}#biChatFloat svg{width:25px;height:25px}#biChatBadge{position:absolute;right:-4px;top:-5px;min-width:19px;height:19px;padding:0 5px;border:2px solid #fff;border-radius:12px;background:#ffcc4d;color:#5d111e;font:700 10px/15px Arial;display:none;place-items:center}#biChatLayer{position:fixed;inset:0;box-sizing:border-box;z-index:2147483000;background:rgba(34,13,19,.48);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}#biChatLayer.open{display:flex}#biChatLayerClose{position:absolute;z-index:3;top:max(22px,calc(env(safe-area-inset-top) + 10px));right:max(22px,calc(env(safe-area-inset-right) + 10px));width:40px;height:40px;border:1px solid #eee5e7;border-radius:13px;background:#fff;color:#2c2528;font:500 22px/1 Arial;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 16px rgba(34,13,19,.08)}#biChatFrame{width:min(1120px,100%);height:min(820px,calc(100dvh - 24px));border:0;border-radius:24px;background:#fff;box-shadow:0 28px 80px rgba(34,13,19,.34)}@media(max-width:700px){#biChatFloat{width:50px;height:50px;border-radius:17px;right:14px;bottom:max(16px,calc(env(safe-area-inset-bottom) + 12px))}#biChatLayer{padding:0}#biChatLayerClose{top:max(34px,calc(env(safe-area-inset-top) + 4px));right:max(10px,env(safe-area-inset-right));width:34px;height:34px;border-radius:10px}#biChatFrame{width:100%;height:100%;border-radius:0}}';
    document.head.appendChild(style);
    var button = document.createElement('button'); button.id = 'biChatFloat'; button.type = 'button'; button.setAttribute('aria-label', 'Buka pesan grup');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 15a4 4 0 0 1-4 4H8l-5 3 1.6-4.2A6.5 6.5 0 0 1 3 13.5v-4A4.5 4.5 0 0 1 7.5 5h8A4.5 4.5 0 0 1 20 9.5z"/><path d="M8 11h.01M12 11h.01M16 11h.01" stroke-linecap="round" stroke-width="2.7"/></svg><span id="biChatBadge"></span>';
    var layer = document.createElement('div'); layer.id = 'biChatLayer';
    var closeButton = document.createElement('button'); closeButton.id = 'biChatLayerClose'; closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Tutup pesan'); closeButton.textContent = '×';
    var frame = document.createElement('iframe'); frame.id = 'biChatFrame'; frame.title = 'Pesan BI-Space'; frame.setAttribute('allow', 'camera');
    layer.appendChild(frame); layer.appendChild(closeButton); document.body.appendChild(button); document.body.appendChild(layer);
    function syncChatLayerViewport() {
      var viewport = global.visualViewport;
      var top = viewport ? Math.max(0, Number(viewport.offsetTop || 0)) : 0;
      var left = viewport ? Math.max(0, Number(viewport.offsetLeft || 0)) : 0;
      var width = viewport ? Math.max(240, Number(viewport.width || global.innerWidth)) : global.innerWidth;
      var height = viewport ? Math.max(240, Number(viewport.height || global.innerHeight)) : global.innerHeight;
      layer.style.inset = 'auto';
      layer.style.top = top + 'px';
      layer.style.left = left + 'px';
      layer.style.width = width + 'px';
      layer.style.height = height + 'px';
    }
    function close() { layer.classList.remove('open'); document.documentElement.style.overflow = ''; }
    closeButton.addEventListener('click', close);
    button.addEventListener('click', function () { if (!frame.src) frame.src = 'chat.html?v=' + encodeURIComponent(CHAT_ASSET_VERSION); syncChatLayerViewport(); layer.classList.add('open'); document.documentElement.style.overflow = 'hidden'; global.setTimeout(syncChatLayerViewport, 40); });
    global.addEventListener('resize', syncChatLayerViewport);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', syncChatLayerViewport);
      global.visualViewport.addEventListener('scroll', syncChatLayerViewport);
    }
    layer.addEventListener('click', function (event) { if (event.target === layer) close(); });
    global.addEventListener('message', function (event) { if (event.data && event.data.biChatClose) close(); });
    function refreshBadge() { call('chatBootstrap', [token]).then(function (response) { if (!response || !response.ok) return; var count = (response.data.rooms || []).reduce(function (sum, room) { return sum + Number(room.unread || 0); }, 0); var badge = document.getElementById('biChatBadge'); if (!badge) return; badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = count ? 'grid' : 'none'; }).catch(function () {}); }
    refreshBadge(); global.setInterval(refreshBadge, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installChatWidget);
  else installChatWidget();
}(window));

// Dashboard quick menu grid
try {
  var s = document.createElement('script');
  s.src = 'quick-menu.js?v=20260822-qm4';
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
} catch (e) {}
