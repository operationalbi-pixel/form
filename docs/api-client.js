(function (global) {
  'use strict';

  var CHAT_ASSET_VERSION = '20260930-unified-chat1';
  var SOPI_ASSET_VERSION = '20261001-sopi10';

  function installBakerzinTypography() {
    if (!document.getElementById('bakerzinTypographyFont')) {
      var font = document.createElement('link');
      font.id = 'bakerzinTypographyFont';
      font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(font);
    }
    if (!document.getElementById('bakerzinTypographyStyle')) {
      var style = document.createElement('style');
      style.id = 'bakerzinTypographyStyle';
      style.textContent = ':root{--bakerzin-ui-font:"Plus Jakarta Sans","Segoe UI",Arial,sans-serif}' +
        'html,body,button,input,select,textarea,.font-sans,' +
        'body *:not(.material-symbols-rounded):not([class^="fa"]):not([class*=" fa-"]){font-family:var(--bakerzin-ui-font)!important}' +
        'body{text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}' +
        'h1,h2,h3,h4{letter-spacing:-.018em}';
      document.head.appendChild(style);
    }
  }

  installBakerzinTypography();

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
    if (/\/(?:chat|sopi(?:-(?:admin|source))?)\.html$/i.test(global.location.pathname)) return;
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
    button.addEventListener('click', function () { var sopiPanel = document.getElementById('biSopiPanel'); if (sopiPanel) sopiPanel.classList.remove('open'); if (!frame.src) frame.src = 'chat.html?v=' + encodeURIComponent(CHAT_ASSET_VERSION); syncChatLayerViewport(); layer.classList.add('open'); document.documentElement.style.overflow = 'hidden'; global.setTimeout(syncChatLayerViewport, 40); });
    global.addEventListener('resize', syncChatLayerViewport);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', syncChatLayerViewport);
      global.visualViewport.addEventListener('scroll', syncChatLayerViewport);
    }
    layer.addEventListener('click', function (event) { if (event.target === layer) close(); });
    function setBadgeCount(value) { var count = Math.max(0, Number(value || 0)); var badge = document.getElementById('biChatBadge'); if (!badge) return; badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = count ? 'grid' : 'none'; }
    global.addEventListener('message', function (event) { if (event.source !== frame.contentWindow || !event.data) return; if (event.data.biChatClose) close(); if (Object.prototype.hasOwnProperty.call(event.data, 'biChatUnread')) setBadgeCount(event.data.biChatUnread); });
    function refreshBadge() { call('chatBootstrap', [token]).then(function (response) { if (!response || !response.ok) return; setBadgeCount((response.data.rooms || []).reduce(function (sum, room) { return sum + Number(room.unread || 0); }, 0)); }).catch(function () {}); }
    refreshBadge(); global.setInterval(refreshBadge, 30000);
  }

  function installSopiWidget() {
    if (/\/(?:chat|sopi(?:-(?:admin|source))?)\.html$/i.test(global.location.pathname)) return;
    var token = '';
    try { token = global.localStorage.getItem('bakerzin_session') || ''; } catch (error) {}
    if (!token || document.getElementById('biSopiFloat')) return;
    var style = document.createElement('style');
    style.id = 'biSopiWidgetStyle';
    style.textContent = '#biSopiFloat{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(88px,calc(env(safe-area-inset-bottom) + 84px));z-index:2147482100;width:54px;height:54px;padding:0;border:2px solid #fff;border-radius:50%;overflow:hidden;background:linear-gradient(145deg,#fff6e9,#f1c9a8);box-shadow:0 12px 30px rgba(92,24,38,.25);cursor:pointer;transition:.18s transform,.18s box-shadow}#biSopiFloat:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 16px 34px rgba(92,24,38,.34)}#biSopiFloat svg{width:100%;height:100%;display:block}#biSopiFloat:after{content:"";position:absolute;right:3px;bottom:3px;width:8px;height:8px;border:2px solid #fff;border-radius:50%;background:#20b879}#biSopiPanel{position:fixed;z-index:2147482200;right:max(18px,env(safe-area-inset-right));bottom:max(154px,calc(env(safe-area-inset-bottom) + 150px));width:min(390px,calc(100vw - 24px));height:min(590px,calc(100dvh - 176px));display:none;overflow:hidden;border:1px solid #eadfe2;border-radius:23px;background:#fff;box-shadow:0 24px 70px rgba(56,24,34,.28);transform-origin:bottom right}#biSopiPanel.open{display:block;animation:biSopiIn .2s ease-out}#biSopiFrame{width:100%;height:100%;border:0;background:#fff}#biSopiClose{position:absolute;z-index:3;top:10px;right:10px;width:32px;height:32px;border:1px solid rgba(255,255,255,.28);border-radius:11px;color:#fff;background:rgba(61,2,15,.24);font:500 20px/1 Arial;display:grid;place-items:center;cursor:pointer;backdrop-filter:blur(4px)}#biSopiAdminFloat{position:fixed;z-index:2147482150;right:max(57px,calc(env(safe-area-inset-right) + 39px));bottom:max(125px,calc(env(safe-area-inset-bottom) + 121px));width:31px;height:31px;padding:0;display:grid;place-items:center;border:2px solid #fff;border-radius:50%;color:#6d4600;background:linear-gradient(145deg,#fff7b8,#ffc928);box-shadow:0 5px 16px rgba(134,86,0,.32);cursor:pointer;animation:biSopiLamp 1.8s ease-in-out infinite}#biSopiAdminFloat svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8}#biSopiAdminBadge{position:absolute;right:-6px;top:-7px;min-width:18px;height:18px;padding:0 4px;display:none;place-items:center;border:2px solid #fff;border-radius:10px;color:#fff;background:#a40d28;font:800 9px/1 Arial}#biSopiAdminLayer{position:fixed;inset:0;z-index:2147483200;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(39,18,24,.56);backdrop-filter:blur(4px)}#biSopiAdminLayer.open{display:flex}#biSopiAdminFrame{width:min(980px,100%);height:min(760px,calc(100dvh - 36px));border:0;border-radius:24px;background:#f7f5f6;box-shadow:0 28px 90px rgba(35,8,16,.4)}#biSopiAdminClose{position:absolute;top:max(28px,calc(env(safe-area-inset-top) + 16px));right:max(28px,calc(env(safe-area-inset-right) + 16px));width:40px;height:40px;display:grid;place-items:center;border:1px solid #eadfe2;border-radius:13px;color:#34282c;background:#fff;font:500 22px/1 Arial;cursor:pointer;box-shadow:0 5px 18px rgba(35,8,16,.1)}@keyframes biSopiIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}@keyframes biSopiLamp{0%,100%{box-shadow:0 5px 16px rgba(134,86,0,.28),0 0 0 0 rgba(255,201,40,.3)}50%{box-shadow:0 7px 20px rgba(134,86,0,.38),0 0 0 7px rgba(255,201,40,0)}}@media(max-width:700px){#biSopiFloat{width:50px;height:50px;right:14px;bottom:max(78px,calc(env(safe-area-inset-bottom) + 74px))}#biSopiPanel{right:10px;bottom:max(140px,calc(env(safe-area-inset-bottom) + 136px));width:calc(100vw - 20px);height:min(610px,calc(100dvh - 156px));border-radius:21px}#biSopiAdminFloat{right:50px;bottom:max(112px,calc(env(safe-area-inset-bottom) + 108px));width:29px;height:29px}#biSopiAdminLayer{padding:0}#biSopiAdminFrame{width:100%;height:100%;border-radius:0}#biSopiAdminClose{top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:34px;height:34px;border-radius:10px}}@media(prefers-reduced-motion:reduce){#biSopiPanel.open{animation:none}#biSopiAdminFloat{animation:none}}';
    style.textContent += '#biAssistantDock{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147482150;display:flex;flex-direction:column;gap:9px;padding:7px;border:1px solid rgba(231,216,220,.9);border-radius:25px;background:rgba(255,255,255,.9);box-shadow:0 16px 38px rgba(67,28,39,.2);backdrop-filter:blur(12px)}#biAssistantDock #biChatFloat,#biAssistantDock #biSopiFloat{position:relative!important;right:auto!important;bottom:auto!important;width:52px;height:52px;border-radius:17px;box-shadow:0 7px 18px rgba(73,28,40,.18)}#biAssistantDock #biSopiFloat{order:1}#biAssistantDock #biChatFloat{order:2}#biAssistantDock #biSopiFloat svg{animation:biSopiAssistantFloat 3s ease-in-out infinite}#biAssistantDock #biSopiAdminFloat{position:absolute;z-index:4;top:-7px;right:-7px;bottom:auto;width:29px;height:29px}#biSopiPanel{left:50%;top:50%;right:auto;bottom:auto;width:min(440px,calc(100vw - 24px));height:min(720px,calc(100dvh - 24px));border-radius:24px;transform:translate(-50%,-50%);transform-origin:center;box-shadow:0 28px 80px rgba(34,13,19,.34),0 0 0 100vmax rgba(34,13,19,.48);backdrop-filter:blur(3px)}#biSopiPanel.open{animation:biSopiModalIn .2s ease-out}@keyframes biSopiAssistantFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes biSopiModalIn{from{opacity:0;transform:translate(-50%,calc(-50% + 12px)) scale(.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@media(max-width:700px){#biAssistantDock{right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));gap:7px;padding:6px;border-radius:22px}#biAssistantDock #biChatFloat,#biAssistantDock #biSopiFloat{width:48px;height:48px;border-radius:15px}#biSopiPanel{inset:0;width:100%;height:100%;border:0;border-radius:0;transform:none;box-shadow:none}#biSopiPanel.open{animation:none}}@media(prefers-reduced-motion:reduce){#biAssistantDock #biSopiFloat svg{animation:none}}';
    style.textContent += '#biSopiDock{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom));z-index:2147482150;display:grid;place-items:end start;pointer-events:none}#biSopiDock #biSopiFloat{position:relative!important;left:auto!important;right:auto!important;bottom:auto!important;width:94px;height:118px;padding:0;border:0;border-radius:0;overflow:visible;background:transparent;box-shadow:none;pointer-events:auto;filter:drop-shadow(0 10px 14px rgba(72,24,37,.25));animation:biSopiAssistantFloat 3s ease-in-out infinite}#biSopiDock #biSopiFloat:hover{transform:translateY(-3px) scale(1.025);box-shadow:none}#biSopiFloat img{width:100%;height:100%;display:block;object-fit:contain;object-position:center bottom}#biSopiDock #biSopiFloat:after{right:14px;bottom:12px;width:9px;height:9px}#biSopiPanel #biSopiAdminFloat{position:absolute!important;z-index:5;top:14px!important;left:14px!important;right:auto!important;bottom:auto!important;width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;aspect-ratio:1/1!important;padding:0!important;display:grid!important;place-items:center!important;box-sizing:border-box!important;border-radius:50%!important;flex:0 0 32px!important;animation:none;box-shadow:0 5px 14px rgba(94,61,0,.24)}#biSopiPanel{left:50%;top:50%;right:auto;bottom:auto;width:min(440px,calc(100vw - 24px));height:min(720px,calc(100dvh - 24px));border-radius:24px;transform:translate(-50%,-50%);transform-origin:center;box-shadow:0 28px 80px rgba(34,13,19,.34),0 0 0 100vmax rgba(34,13,19,.48);backdrop-filter:blur(3px)}@media(max-width:700px){#biSopiDock{left:max(7px,env(safe-area-inset-left));bottom:max(4px,env(safe-area-inset-bottom))}#biSopiDock #biSopiFloat{width:82px;height:104px}#biSopiPanel{top:var(--bi-sopi-visual-top,0px);left:var(--bi-sopi-visual-left,0px);right:auto;bottom:auto;width:var(--bi-sopi-visual-width,100vw);height:var(--bi-sopi-visual-height,100dvh);border:0;border-radius:0;transform:none;box-shadow:none}#biSopiClose{top:max(34px,calc(env(safe-area-inset-top) + 8px));right:max(10px,env(safe-area-inset-right))}#biSopiPanel #biSopiAdminFloat{top:max(34px,calc(env(safe-area-inset-top) + 8px))!important;left:max(12px,env(safe-area-inset-left))!important;width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;flex-basis:30px!important}#biSopiPanel.open{animation:none}}@media(prefers-reduced-motion:reduce){#biSopiDock #biSopiFloat{animation:none}}';
    document.head.appendChild(style);
    var button = document.createElement('button');
    button.id = 'biSopiFloat';
    button.type = 'button';
    button.setAttribute('aria-label', 'Buka SOPi, asisten SOP Bakerzin');
    button.title = 'Tanya SOPi';
    button.innerHTML = '<img src="assets/sopi-assistant-v2.png?v=' + encodeURIComponent(SOPI_ASSET_VERSION) + '" alt="" aria-hidden="true">';
    var panel = document.createElement('div');
    panel.id = 'biSopiPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat SOPi');
    var closeButton = document.createElement('button');
    closeButton.id = 'biSopiClose';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Tutup SOPi');
    closeButton.textContent = '×';
    var frame = document.createElement('iframe');
    frame.id = 'biSopiFrame';
    frame.title = 'SOPi · Asisten SOP Bakerzin';
    panel.appendChild(frame);
    panel.appendChild(closeButton);
    var dock = document.getElementById('biSopiDock');
    if (!dock) { dock = document.createElement('div'); dock.id = 'biSopiDock'; dock.setAttribute('aria-label', 'Asisten SOPi Bakerzin'); document.body.appendChild(dock); }
    dock.appendChild(button);
    document.body.appendChild(panel);
    var adminButton = null, adminLayer = null, adminFrame = null, cachedUser = null, previousRootOverflow = '', previousBodyOverflow = '';
    function postSopiUser() {
      if (!frame.contentWindow || !cachedUser) return;
      frame.contentWindow.postMessage({ biSopiUser: { name: String(cachedUser.name || ''), nik: String(cachedUser.nik || ''), outlet: String(cachedUser.outlet || '') } }, global.location.origin);
    }
    frame.addEventListener('load', postSopiUser);
    function installAdminKnowledge(user) {
      var isBihq = Boolean(user && (user.isAdmin === true || String(user.outlet || '').toUpperCase() === 'BIHQ'));
      if (!isBihq || adminButton) return;
      adminButton = document.createElement('button');
      adminButton.id = 'biSopiAdminFloat';
      adminButton.type = 'button';
      adminButton.title = 'SOPi Knowledge Center';
      adminButton.setAttribute('aria-label', 'Buka SOPi Knowledge Center');
      adminButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 22h4M8.2 14.5A7 7 0 1 1 15.8 14.5C14.7 15.3 14 16.6 14 18h-4c0-1.4-.7-2.7-1.8-3.5Z"/><path d="M12 2V0M4.9 4.9 3.5 3.5M19.1 4.9l1.4-1.4"/></svg><span id="biSopiAdminBadge"></span>';
      adminLayer = document.createElement('div');
      adminLayer.id = 'biSopiAdminLayer';
      adminLayer.setAttribute('role', 'dialog');
      adminLayer.setAttribute('aria-label', 'SOPi Knowledge Center');
      adminFrame = document.createElement('iframe');
      adminFrame.id = 'biSopiAdminFrame';
      adminFrame.title = 'SOPi Knowledge Center';
      var adminClose = document.createElement('button');
      adminClose.id = 'biSopiAdminClose';
      adminClose.type = 'button';
      adminClose.setAttribute('aria-label', 'Tutup Knowledge Center');
      adminClose.textContent = '×';
      adminLayer.appendChild(adminFrame);
      adminLayer.appendChild(adminClose);
      panel.appendChild(adminButton);
      document.body.appendChild(adminLayer);
      function closeAdmin() { adminLayer.classList.remove('open'); document.documentElement.style.overflow = ''; }
      function refreshAdminBadge() { call('sopiAdminBootstrap', [token]).then(function (response) { var badge = document.getElementById('biSopiAdminBadge'); if (!badge || !response || !response.ok) return; var count = Number(response.data && response.data.openCount || 0); badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = count ? 'grid' : 'none'; }).catch(function () {}); }
      adminButton.addEventListener('click', function () { if (!adminFrame.src) adminFrame.src = 'sopi-admin.html?v=' + encodeURIComponent(SOPI_ASSET_VERSION); close(); var chatLayer = document.getElementById('biChatLayer'); if (chatLayer) chatLayer.classList.remove('open'); adminLayer.classList.add('open'); document.documentElement.style.overflow = 'hidden'; });
      adminClose.addEventListener('click', closeAdmin);
      adminLayer.addEventListener('click', function (event) { if (event.target === adminLayer) closeAdmin(); });
      refreshAdminBadge();
      global.setInterval(refreshAdminBadge, 60000);
      global.addEventListener('message', function (event) { if (event.source !== adminFrame.contentWindow || !event.data) return; if (event.data.biSopiAdminClose) closeAdmin(); if (event.data.biSopiKnowledgeChanged) refreshAdminBadge(); });
    }
    try { var cachedData = JSON.parse(global.localStorage.getItem('bakerzin_app_cache') || 'null'); cachedUser = cachedData && cachedData.user; } catch (error) {}
    installAdminKnowledge(cachedUser);
    global.addEventListener('bakerzin:user-ready', function (event) { cachedUser = event && event.detail || null; installAdminKnowledge(cachedUser); postSopiUser(); });
    function lockPage() {
      previousRootOverflow = document.documentElement.style.overflow;
      previousBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    function unlockPage() {
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    }
    function close() {
      panel.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
      unlockPage();
    }
    function syncSopiViewport() {
      var viewport = global.visualViewport;
      panel.style.setProperty('--bi-sopi-visual-top', (viewport ? Math.max(0, Number(viewport.offsetTop || 0)) : 0) + 'px');
      panel.style.setProperty('--bi-sopi-visual-left', (viewport ? Math.max(0, Number(viewport.offsetLeft || 0)) : 0) + 'px');
      panel.style.setProperty('--bi-sopi-visual-width', Math.max(240, viewport ? Number(viewport.width || global.innerWidth) : global.innerWidth) + 'px');
      panel.style.setProperty('--bi-sopi-visual-height', Math.max(240, viewport ? Number(viewport.height || global.innerHeight) : global.innerHeight) + 'px');
    }
    function open() {
      if (!frame.src) frame.src = 'sopi.html?v=' + encodeURIComponent(SOPI_ASSET_VERSION);
      var chatLayer = document.getElementById('biChatLayer');
      if (chatLayer) chatLayer.classList.remove('open');
      lockPage();
      syncSopiViewport();
      panel.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
      postSopiUser();
    }
    global.addEventListener('resize', syncSopiViewport);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', syncSopiViewport);
      global.visualViewport.addEventListener('scroll', syncSopiViewport);
    }
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function () {
      if (panel.classList.contains('open')) close(); else open();
    });
    closeButton.addEventListener('click', close);
    global.addEventListener('message', function (event) {
      if (event.source === frame.contentWindow && event.data && event.data.biSopiClose) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && panel.classList.contains('open')) close();
      if (event.key === 'Escape' && adminLayer && adminLayer.classList.contains('open')) { adminLayer.classList.remove('open'); document.documentElement.style.overflow = ''; }
    });
  }

  function installFloatingWidgets() {
    installChatWidget();
    installSopiWidget();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFloatingWidgets);
  else installFloatingWidgets();
}(window));

// Dashboard quick menu grid
try {
  var s = document.createElement('script');
  s.src = 'quick-menu.js?v=20260822-qm4';
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
} catch (e) {}
