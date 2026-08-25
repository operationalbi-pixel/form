(function (global) {
  'use strict';

  if (!/\/chat\.html$/i.test(global.location.pathname) || global.__BI_CHAT_ENHANCEMENTS__) return;
  global.__BI_CHAT_ENHANCEMENTS__ = true;

  var MARK = 'BI_TARGET_V1';
  var token = '';
  var bootstrap = null;
  var currentRoom = '';
  var originalRoomCreateTask = null;
  var pendingSystemReply = null;
  var selectedTarget = null;

  try { token = global.localStorage.getItem('bakerzin_session') || ''; } catch (e) {}

  function q(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function api(action, args) {
    return global.BAKERZIN_API.call(action, args || []).then(function (r) {
      if (!r || !r.ok) throw new Error(r && r.error || 'Server tidak merespons.');
      return r.data;
    });
  }
  function toast(message) {
    var el = q('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function activeRoomId() {
    var active = document.querySelector('.room.active[data-room]');
    return active ? active.getAttribute('data-room') : currentRoom;
  }
  function currentRoomObject() {
    var id = activeRoomId();
    var rooms = bootstrap && bootstrap.rooms || [];
    for (var i = 0; i < rooms.length; i += 1) if (rooms[i].id === id) return rooms[i];
    return null;
  }
  function monthName(month) {
    return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][Math.max(1, Math.min(12, Number(month))) - 1];
  }
  function periodKey(month, year) { return String(year) + '-' + String(month).padStart(2, '0'); }
  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'target-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
  function b64Encode(obj) {
    var json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function b64Decode(text) {
    try {
      var normalized = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4) normalized += '=';
      return JSON.parse(decodeURIComponent(escape(atob(normalized))));
    } catch (e) { return null; }
  }
  function targetMarker(period, eventType, payload) {
    return '[[' + MARK + '|' + period + '|' + eventType + '|' + b64Encode(payload) + ']]';
  }
  function parseTargetMarker(body) {
    var re = /\[\[BI_TARGET_V1\|(\d{4}-\d{2})\|(CREATE|EDIT|COMPLETE|DELETE)\|([A-Za-z0-9_-]+)\]\]/g;
    var match, out = [];
    while ((match = re.exec(String(body || '')))) {
      var payload = b64Decode(match[3]);
      if (payload) out.push({ period: match[1], type: match[2], payload: payload });
    }
    return out;
  }
  function stripTargetMarker(text) {
    return String(text || '').replace(/\n?\[\[BI_TARGET_V1\|\d{4}-\d{2}\|(CREATE|EDIT|COMPLETE|DELETE)\|[A-Za-z0-9_-]+\]\]/g, '').trim();
  }
  function refreshBootstrap() {
    return api('chatBootstrap', [token]).then(function (data) { bootstrap = data; return data; });
  }

  function injectStyles() {
    if (q('biChatEnhanceStyle')) return;
    var style = document.createElement('style');
    style.id = 'biChatEnhanceStyle';
    style.textContent = [
      '.bi-group-search{position:relative;margin:0 0 10px}.bi-group-search input{width:100%;height:42px;border:1px solid var(--line);border-radius:13px;padding:0 12px 0 37px;outline:none;background:#fff}.bi-group-search:before{content:"⌕";position:absolute;left:13px;top:8px;color:var(--muted);font-size:20px}',
      '.bi-pop{position:fixed;z-index:90;min-width:190px;padding:6px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 16px 45px rgba(45,24,30,.2);display:none}.bi-pop.open{display:grid;gap:3px}.bi-pop button{border:0;background:#fff;border-radius:10px;padding:10px 12px;text-align:left;cursor:pointer;color:var(--ink);font-weight:600}.bi-pop button:hover{background:#fff0f3;color:var(--wine)}.bi-attach-option{display:flex!important;align-items:center;gap:9px}.bi-attach-option span{width:26px;height:26px;border-radius:9px;background:#f6e9ec;display:grid;place-items:center}',
      '.bi-panel-layer{position:fixed;inset:0;z-index:90;background:rgba(37,19,24,.52);display:none;align-items:center;justify-content:center;padding:16px}.bi-panel-layer.open{display:flex}.bi-panel{width:min(760px,100%);max-height:calc(100dvh - 32px);overflow:hidden;background:#fff;border-radius:22px;box-shadow:0 25px 70px rgba(48,19,27,.35);display:flex;flex-direction:column}.bi-panel-head{display:flex;align-items:center;gap:10px;padding:18px 20px;border-bottom:1px solid var(--line)}.bi-panel-head strong{font-size:54px;line-height:1.02;font-weight:900;flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.bi-x{width:36px;height:36px;border:1px solid var(--line);border-radius:11px;background:#fff;cursor:pointer}.bi-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--line)}.bi-tab{border:0;background:#fff;padding:12px;font-weight:800;color:var(--muted);cursor:pointer}.bi-tab.active{color:var(--wine);box-shadow:inset 0 -2px var(--wine)}.bi-panel-body{padding:16px 18px 20px;overflow-y:auto;overflow-x:hidden;min-width:0}.bi-monthbar{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:14px}.bi-monthbar select{border:1px solid var(--line);border-radius:11px;padding:9px 10px;background:#fff}.bi-refresh{border:0;border-radius:11px;background:#f4edef;color:var(--wine);padding:0 12px;font-weight:800;cursor:pointer}',
      '.bi-summary{display:block;padding:13px 14px;border:1px solid #f0d8de;border-radius:15px;background:#fff8fa;margin-bottom:12px}.bi-summary strong{font-size:24px;color:var(--wine);display:block}.bi-summary span{font-size:11px;color:var(--muted)}.bi-progress{height:8px;border-radius:8px;background:#eee7e9;overflow:hidden;margin-top:8px}.bi-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--wine-dark),var(--wine));border-radius:inherit}.bi-list{display:grid;gap:8px;width:100%;max-width:100%;min-width:0;overflow:hidden}.bi-row{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:#fff;width:100%;max-width:100%;min-width:0;overflow:hidden}.bi-row.done{opacity:.72;background:#fafafa}.bi-row-copy{flex:1 1 auto;min-width:0;max-width:100%;overflow:hidden}.bi-row-copy strong{display:block;font-size:12px;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}.bi-row-copy span{display:block;font-size:10px;color:var(--muted);margin-top:3px;white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}.bi-row-action{width:32px;height:32px;border-radius:9px;border:1px solid var(--line);background:#fff;cursor:pointer;display:grid;place-items:center;flex:0 0 auto}.bi-row-action.complete{background:#1fa361;color:#fff;border-color:#1a8a53}.bi-row-action.menu{color:var(--wine);font-size:18px}.bi-empty{text-align:center;padding:30px 10px;color:var(--muted);font-size:12px}',
      '.bi-form-layer{position:fixed;inset:0;z-index:100;background:rgba(37,19,24,.52);display:none;align-items:center;justify-content:center;padding:16px}.bi-form-layer.open{display:flex}.bi-form{width:min(520px,100%);max-height:calc(100dvh - 32px);overflow:auto;background:#fff;border-radius:22px;padding:20px;box-shadow:0 25px 70px rgba(48,19,27,.35)}.bi-form-head{display:flex;align-items:center;gap:10px;margin-bottom:15px}.bi-form-head h3{margin:0;flex:1}.bi-field{margin:12px 0}.bi-field label{display:block;font-size:10px;font-weight:800;color:#665b5f;margin-bottom:6px}.bi-field input,.bi-field select{width:100%;border:1px solid var(--line);border-radius:12px;padding:11px;outline:none}.bi-rule{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bi-rule label{border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center;cursor:pointer}.bi-rule label:has(input:checked){border-color:var(--wine);background:#fff0f3;color:var(--wine)}.bi-number-wrap{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.bi-percent{height:44px;min-width:52px;border:1px solid var(--line);border-radius:12px;display:flex!important;align-items:center;justify-content:center;gap:5px;padding:0 9px;margin:0!important}.bi-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:17px}.bi-secondary,.bi-primary{border:0;border-radius:12px;padding:10px 15px;cursor:pointer}.bi-secondary{background:#f4edef}.bi-primary{background:var(--wine);color:#fff;font-weight:800}',
      '.bi-pop .bi-create-icon{width:28px;height:28px;border-radius:9px;background:#f6e9ec;color:var(--wine);display:grid;place-items:center;font-weight:900;flex:0 0 auto}.bi-create-option{display:flex!important;align-items:center;gap:9px}.top #chatSearch,.top #roomCreateTask,.top .close{width:40px!important;height:40px!important;min-width:40px!important;border:1px solid var(--line)!important;border-radius:13px!important;background:#fff!important;color:var(--wine)!important;display:grid!important;place-items:center!important;padding:0!important;box-shadow:none!important}.top #chatSearch:hover,.top #roomCreateTask:hover,.top .close:hover{background:#fff0f3!important}.bi-target-menu{position:fixed;z-index:120;min-width:150px;padding:6px;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 14px 40px rgba(45,24,30,.2);display:none}.bi-target-menu.open{display:grid}.bi-target-menu button{border:0;background:#fff;padding:10px 12px;border-radius:9px;text-align:left;cursor:pointer}.bi-target-menu button:hover{background:#fff0f3;color:var(--wine)}.bi-camera-layer{position:fixed;inset:0;z-index:140;background:#111;display:none;flex-direction:column}.bi-camera-layer.open{display:flex}.bi-camera-video{flex:1;width:100%;min-height:0;object-fit:cover;background:#000}.bi-camera-controls{display:flex;align-items:center;justify-content:center;gap:18px;padding:18px max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom));background:#111}.bi-camera-shot{width:68px;height:68px;border:6px solid #fff;border-radius:50%;background:#ddd;cursor:pointer}.bi-camera-close{position:absolute;z-index:2;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));width:42px;height:42px;border:1px solid rgba(255,255,255,.5);border-radius:13px;background:rgba(0,0,0,.35);color:#fff;font-size:20px;cursor:pointer}',
      '.bi-goodjob{text-align:center}.bi-thumb{font-size:58px;display:block;animation:biThumb .65s ease both}.bi-goodjob h3{font-size:24px;margin:8px 0 4px;color:#197149}.bi-goodjob p{font-size:12px;color:var(--muted);line-height:1.5}@keyframes biThumb{0%{transform:scale(.25) rotate(-18deg);opacity:0}65%{transform:scale(1.18) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0)}}',
      '.message.system .bi-system-reply{display:grid!important}.bi-system-reply{width:24px;height:22px;border:0;background:transparent;color:var(--wine);padding:2px;cursor:pointer;place-items:center}.bi-system-reply svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.top-copy{min-width:0}.top{gap:8px}.header-action,.top .close,.back{flex:0 0 auto}.group-title{min-width:0}.composer{position:relative}.reply-bar{flex:0 0 auto}',
      '@media(max-width:720px){.bi-panel-head strong{font-size:42px}.bi-panel-layer,.bi-form-layer{padding:0;align-items:flex-end}.bi-panel,.bi-form{border-radius:22px 22px 0 0;max-height:calc(92dvh - max(30px,env(safe-area-inset-top)))}.bi-panel-body{padding:13px 12px 18px}.bi-row{padding:10px}.top{gap:5px!important;padding-left:8px!important;padding-right:8px!important}.group-title{font-size:13px!important}.header-action,.top .close{width:32px!important;height:32px!important}.composer{gap:6px!important}.attach-btn,.send-btn{width:42px!important;height:42px!important;flex:0 0 auto}.file-strip{z-index:8}}'
    ].join('');
    document.head.appendChild(style);
  }

  function positionPop(pop, anchor) {
    pop.classList.add('open');
    var rect = anchor.getBoundingClientRect();
    var width = Math.max(190, pop.offsetWidth || 190);
    var left = Math.min(global.innerWidth - width - 10, Math.max(10, rect.right - width));
    var top = rect.bottom + 7;
    if (top + 155 > global.innerHeight) top = Math.max(10, rect.top - 155);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }

  function installGroupSearch() {
    var create = q('createTask');
    if (!create || q('biGroupSearch')) return;
    create.style.display = 'none';
    var wrap = document.createElement('div');
    wrap.className = 'bi-group-search';
    wrap.innerHTML = '<input id="biGroupSearch" type="search" placeholder="Cari group..." autocomplete="off">';
    create.parentNode.insertBefore(wrap, create.nextSibling);
    q('biGroupSearch').addEventListener('input', function () {
      var term = this.value.trim().toLowerCase();
      Array.prototype.forEach.call(document.querySelectorAll('#rooms .room'), function (room) {
        room.style.display = !term || room.textContent.toLowerCase().indexOf(term) >= 0 ? '' : 'none';
      });
    });
  }

  function installRoomCreateMenu() {
    var button = q('roomCreateTask');
    if (!button || q('biRoomCreateMenu')) return;
    originalRoomCreateTask = button.onclick;
    button.title = 'Create Task / Target';
    button.setAttribute('aria-label', 'Create Task atau Target');
    var pop = document.createElement('div');
    pop.id = 'biRoomCreateMenu'; pop.className = 'bi-pop';
    pop.innerHTML = '<button type="button" class="bi-create-option" id="biCreateTaskOption"><span class="bi-create-icon">✓</span>Create Task</button><button type="button" class="bi-create-option" id="biCreateTargetOption"><span class="bi-create-icon">◎</span>Create Target</button>';
    document.body.appendChild(pop);
    button.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      if (pop.classList.contains('open')) pop.classList.remove('open'); else positionPop(pop, button);
    };
    q('biCreateTaskOption').onclick = function () { pop.classList.remove('open'); if (typeof originalRoomCreateTask === 'function') originalRoomCreateTask.call(button); };
    q('biCreateTargetOption').onclick = function () { pop.classList.remove('open'); openTargetForm(); };
    document.addEventListener('click', function (e) { if (!e.target.closest('#biRoomCreateMenu') && e.target !== button) pop.classList.remove('open'); }, true);
  }

  function mergeIntoComposer(files) {
    var main = q('files');
    if (!main || !files || !files.length) return;
    try {
      var dt = new DataTransfer();
      Array.prototype.forEach.call(main.files || [], function (f) { dt.items.add(f); });
      Array.prototype.forEach.call(files, function (f) { if (dt.items.length < 5) dt.items.add(f); });
      main.files = dt.files;
      main.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { toast('Browser tidak mendukung pemilihan file ini.'); }
  }

  function installAttachmentMenu() {
    var button = q('attach');
    if (!button || q('biAttachMenu')) return;
    var camera = document.createElement('input'); camera.type = 'file'; camera.accept = 'image/*'; camera.capture = 'environment'; camera.hidden = true;
    var gallery = document.createElement('input'); gallery.type = 'file'; gallery.accept = 'image/*'; gallery.multiple = true; gallery.hidden = true;
    var docs = document.createElement('input'); docs.type = 'file'; docs.accept = '.pdf,.xls,.xlsx,.doc,.docx'; docs.multiple = true; docs.hidden = true;
    document.body.appendChild(camera); document.body.appendChild(gallery); document.body.appendChild(docs);
    var pop = document.createElement('div'); pop.id = 'biAttachMenu'; pop.className = 'bi-pop';
    pop.innerHTML = '<button class="bi-attach-option" id="biAttachCamera"><span>📷</span>Camera</button><button class="bi-attach-option" id="biAttachGallery"><span>🖼️</span>Gambar</button><button class="bi-attach-option" id="biAttachDocs"><span>📄</span>Dokumen</button>';
    document.body.appendChild(pop);
    button.onclick = function (e) { e.preventDefault(); e.stopPropagation(); if (pop.classList.contains('open')) pop.classList.remove('open'); else positionPop(pop, button); };
    q('biAttachCamera').onclick = function () { pop.classList.remove('open'); openDirectCamera(camera); };
    q('biAttachGallery').onclick = function () { pop.classList.remove('open'); gallery.click(); };
    q('biAttachDocs').onclick = function () { pop.classList.remove('open'); docs.click(); };
    camera.onchange = function () { mergeIntoComposer(this.files); this.value = ''; };
    gallery.onchange = function () { mergeIntoComposer(this.files); this.value = ''; };
    docs.onchange = function () { mergeIntoComposer(this.files); this.value = ''; };
    document.addEventListener('click', function (e) { if (!e.target.closest('#biAttachMenu') && e.target !== button) pop.classList.remove('open'); }, true);
  }

  function wireSystemReplies() {
    var replyBar = q('replyBar'), replyName = q('replyBarName'), replyText = q('replyBarText');
    Array.prototype.forEach.call(document.querySelectorAll('.message.system[data-message-id]'), function (message) {
      var meta = message.querySelector('.meta');
      if (!meta || meta.querySelector('.bi-system-reply')) return;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'bi-system-reply'; btn.title = 'Balas'; btn.setAttribute('aria-label', 'Balas aktivitas Task');
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 8-5 4 5 4"></path><path d="M5 12h8c4 0 6 2 6 6"></path></svg>';
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        var text = message.querySelector('.text');
        pendingSystemReply = { id: message.getAttribute('data-message-id'), body: text ? text.textContent.trim().slice(0, 120) : 'Aktivitas Task' };
        if (replyName) replyName.textContent = 'Balas aktivitas Task';
        if (replyText) replyText.textContent = pendingSystemReply.body;
        if (replyBar) replyBar.classList.add('show');
        if (q('messageInput')) q('messageInput').focus();
      };
      meta.appendChild(btn);
    });
  }

  function installSystemReplySupport() {
    var messages = q('messages'), composer = q('composer'), close = q('replyBarClose');
    if (!messages || !composer) return;
    new MutationObserver(function () { wireSystemReplies(); cleanTargetMarkersInView(); }).observe(messages, { childList: true, subtree: true });
    wireSystemReplies();
    if (close) close.addEventListener('click', function () { pendingSystemReply = null; }, true);
    composer.addEventListener('submit', function (e) {
      if (!pendingSystemReply) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var input = q('messageInput'), body = input ? input.value.trim() : '';
      var files = q('files') && q('files').files ? Array.prototype.slice.call(q('files').files).slice(0, 5) : [];
      if (!body && !files.length) return;
      Promise.all(files.map(function (file) {
        return new Promise(function (resolve, reject) {
          if (file.size > 5 * 1024 * 1024) return reject(new Error(file.name + ' lebih dari 5 MB.'));
          var reader = new FileReader();
          reader.onload = function () { resolve({ fileName: file.name, mimeType: file.type || 'application/octet-stream', base64: String(reader.result).split(',')[1] }); };
          reader.onerror = reject; reader.readAsDataURL(file);
        });
      })).then(function (attachments) {
        return api('chatSend', [token, { roomId: activeRoomId(), body: body, replyToId: pendingSystemReply.id, attachments: attachments }]);
      }).then(function () {
        if (input) input.value = '';
        if (q('files')) { q('files').value = ''; q('files').dispatchEvent(new Event('change', { bubbles: true })); }
        if (q('replyBar')) q('replyBar').classList.remove('show');
        pendingSystemReply = null; toast('Balasan terkirim.');
      }).catch(function (err) { toast('Balasan gagal: ' + err.message); });
    }, true);
  }

  function cleanTargetMarkersInView() {
    Array.prototype.forEach.call(document.querySelectorAll('#messages .text'), function (el) {
      if (el.dataset.biTargetCleaned === '1') return;
      if (el.textContent.indexOf(MARK) < 0) return;
      el.textContent = stripTargetMarker(el.textContent);
      el.dataset.biTargetCleaned = '1';
    });
  }

  function taskAgeTerminology() {
    Array.prototype.forEach.call(document.querySelectorAll('.task-detail-row span'), function (span) {
      if (span.textContent.trim() === 'UMUR TUGAS') span.textContent = 'DURASI BERJALAN';
    });
  }

  function installTerminologyObserver() {
    new MutationObserver(function () { taskAgeTerminology(); }).observe(document.body, { childList: true, subtree: true });
    taskAgeTerminology();
  }

  function createTargetMessage(meta) {
    var period = periodKey(meta.month, meta.year);
    var human = '🎯 Target dibuat: ' + meta.goal + '\n' + (meta.rule === 'MAX' ? 'Maksimal ' : 'Minimal ') + formatThousands(meta.value) + (meta.percent ? '%' : '') + ' · ' + monthName(meta.month) + ' ' + meta.year;
    return human + '\n' + targetMarker(period, 'CREATE', meta);
  }
  function completeTargetMessage(target, actual, achieved) {
    var period = periodKey(target.month, target.year);
    var payload = { id: target.id, actual: actual, achieved: achieved, completedAt: new Date().toISOString() };
    var human = '🎯 Target diselesaikan: ' + target.goal + '\nTarget: ' + (target.rule === 'MAX' ? 'Maksimal ' : 'Minimal ') + formatThousands(target.value) + (target.percent ? '%' : '') + '\nRealisasi: ' + formatThousands(actual) + (target.percent ? '%' : '') + '\n' + (achieved ? '✅ Tercapai' : '⚠️ Belum mencapai target');
    return human + '\n' + targetMarker(period, 'COMPLETE', payload);
  }

  function fetchTargets(month, year) {
    var roomId = activeRoomId(), period = periodKey(month, year);
    return api('chatSearch', [token, roomId, MARK + '|' + period]).then(function (data) {
      var results = data.results || [], creates = {}, completes = {}; results.sort(function(a,b){return new Date(a.createdAt||0)-new Date(b.createdAt||0);});
      results.forEach(function (item) {
        parseTargetMarker(item.body).forEach(function (event) {
          if (event.period !== period) return;
          if ((event.type === 'CREATE' || event.type === 'EDIT') && event.payload.id) creates[event.payload.id] = Object.assign({}, event.payload, { createdAt: item.createdAt, createdBy: item.senderName });
          if (event.type === 'COMPLETE' && event.payload.id) completes[event.payload.id] = Object.assign({}, event.payload, { completedAt: item.createdAt, completedBy: item.senderName });
          if (event.type === 'DELETE' && event.payload.id) creates[event.payload.id] = Object.assign({}, creates[event.payload.id] || {}, { deleted: true, deletedAt: item.createdAt });
        });
      });
      return Object.keys(creates).filter(function (id) { return !creates[id].deleted; }).map(function (id) {
        var target = creates[id], completion = completes[id] || null;
        target.completion = completion;
        return target;
      });
    });
  }


  var mentionCache = {};
  var activeCameraStream = null;

  function formatThousands(value) {
    if (value === '' || value == null) return '';
    var number = Number(value);
    if (!isFinite(number)) return String(value);
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(number);
  }

  function parseFormattedNumber(value) {
    var text = String(value == null ? '' : value).trim().replace(/\s/g, '');
    if (!text) return NaN;
    if (text.indexOf(',') >= 0) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/\./g, '');
    text = text.replace(/[^0-9.-]/g, '');
    return Number(text);
  }

  function formatNumericField(input) {
    if (!input) return;
    var raw = String(input.value || '').replace(/[^0-9,]/g, '');
    if (!raw) { input.value = ''; return; }
    var parts = raw.split(',');
    var integer = parts.shift().replace(/^0+(?=\d)/, '') || '0';
    integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = integer + (parts.length ? ',' + parts.join('').slice(0, 6) : '');
  }

  function returnToRoomChat() {
    ['biTargetFormLayer','biPanelLayer','biResultLayer','biRepeatLayer','biRepeatValueLayer'].forEach(function (id) {
      var el = q(id); if (el) el.classList.remove('open');
    });
    var side = document.querySelector('.side');
    var main = document.querySelector('.main');
    if (side && main && global.matchMedia('(max-width:720px)').matches) {
      side.classList.add('room-open');
      main.classList.add('room-open');
    }
    var messages = q('messages');
    if (messages) setTimeout(function () { messages.scrollTop = messages.scrollHeight; }, 80);
  }

  function editTargetMessage(meta) {
    var period = periodKey(meta.month, meta.year);
    var human = '🎯 Target diperbarui: ' + meta.goal + '\n' + (meta.rule === 'MAX' ? 'Maksimal ' : 'Minimal ') + formatThousands(meta.value) + (meta.percent ? '%' : '') + ' · ' + monthName(meta.month) + ' ' + meta.year;
    return human + '\n' + targetMarker(period, 'EDIT', meta);
  }

  function deleteTargetMessage(target) {
    var period = periodKey(target.month, target.year);
    var payload = { id: target.id, deletedAt: new Date().toISOString() };
    return '🗑️ Target dihapus: ' + target.goal + '\n' + targetMarker(period, 'DELETE', payload);
  }

  function ensureTargetMenu() {
    var menu = q('biTargetMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'biTargetMenu';
    menu.className = 'bi-target-menu';
    menu.innerHTML = '<button type="button" id="biTargetEdit">✎ Edit</button><button type="button" id="biTargetDelete">🗑 Hapus</button>';
    document.body.appendChild(menu);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#biTargetMenu') && !e.target.closest('[data-target-menu]')) menu.classList.remove('open');
    }, true);
    return menu;
  }

  function openTargetMenu(target, anchor) {
    var menu = ensureTargetMenu();
    selectedTarget = target;
    menu.classList.add('open');
    var rect = anchor.getBoundingClientRect();
    var width = 160;
    menu.style.left = Math.max(10, Math.min(global.innerWidth - width - 10, rect.right - width)) + 'px';
    menu.style.top = Math.min(global.innerHeight - 110, rect.bottom + 6) + 'px';
    q('biTargetEdit').onclick = function () {
      menu.classList.remove('open');
      openTargetForm({
        id: target.id, goal: target.goal, rule: target.rule, value: target.value,
        percent: target.percent, month: target.month, year: target.year
      });
    };
    q('biTargetDelete').onclick = function () {
      menu.classList.remove('open');
      if (!global.confirm('Hapus target "' + target.goal + '"?')) return;
      api('chatSend', [token, { roomId: activeRoomId(), body: deleteTargetMessage(target), attachments: [] }])
        .then(function () { toast('Target berhasil dihapus.'); renderTargetPanel(); })
        .catch(function (e) { toast('Target gagal dihapus: ' + e.message); });
    };
  }

  function findStickyTaskButton(taskId, attr) {
    var safe = String(taskId || '').replace(/"/g, '');
    var selector = '#pins [' + attr + '="' + safe + '"]';
    var button = document.querySelector(selector);
    if (button) return button;
    var more = q('pinMore') || document.querySelector('.pin-more');
    if (more) {
      try { more.click(); } catch (e) {}
      button = document.querySelector(selector);
    }
    return button;
  }

  function showTaskFallbackMenu(data, taskId) {
    var title = data && data.title ? data.title : 'Task';
    toast(title + ' · buka Task dari sticky list untuk Edit/Hapus.');
    var pin = findStickyTaskButton(taskId, 'data-task-menu');
    if (pin) setTimeout(function () { pin.click(); }, 50);
  }

  function stopDirectCamera() {
    if (activeCameraStream) {
      activeCameraStream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) {} });
      activeCameraStream = null;
    }
    var layer = q('biCameraLayer');
    if (layer) layer.classList.remove('open');
  }

  function ensureCameraLayer() {
    if (q('biCameraLayer')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="bi-camera-layer" id="biCameraLayer">' +
      '<button type="button" class="bi-camera-close" id="biCameraClose">✕</button>' +
      '<video class="bi-camera-video" id="biCameraVideo" autoplay playsinline muted></video>' +
      '<div class="bi-camera-controls"><button type="button" class="bi-camera-shot" id="biCameraShot" aria-label="Ambil foto"></button></div></div>'
    );
    q('biCameraClose').onclick = stopDirectCamera;
    q('biCameraShot').onclick = function () {
      var video = q('biCameraVideo');
      if (!video || !video.videoWidth) return toast('Kamera belum siap.');
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(function (blob) {
        if (!blob) return toast('Foto gagal diambil.');
        var file = new File([blob], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' });
        mergeIntoComposer([file]);
        stopDirectCamera();
      }, 'image/jpeg', 0.88);
    };
  }

  function openDirectCamera(fallbackInput) {
    ensureCameraLayer();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fallbackInput.setAttribute('capture', 'environment');
      fallbackInput.click();
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (stream) {
        activeCameraStream = stream;
        q('biCameraVideo').srcObject = stream;
        q('biCameraLayer').classList.add('open');
      })
      .catch(function () {
        fallbackInput.setAttribute('capture', 'environment');
        fallbackInput.click();
      });
  }

  function mentionContextFast() {
    var input = q('messageInput');
    if (!input) return null;
    var caret = input.selectionStart || 0;
    var before = input.value.slice(0, caret);
    var match = before.match(/(?:^|\s)@([^@\n]{0,80})$/);
    return match ? { query: match[1].trim(), start: caret - match[1].length - 1, end: caret } : null;
  }

  function insertFullMention(person) {
    var context = mentionContextFast();
    if (!context || !person) return;
    var input = q('messageInput');
    var fullName = String(person.name || '').trim().replace(/[\r\n@]/g, ' ').replace(/\s+/g, ' ');
    var tag = '@' + fullName;
    var value = input.value;
    input.value = value.slice(0, context.start) + tag + ' ' + value.slice(context.end);
    var caret = context.start + tag.length + 1;
    var menu = q('mentionMenu'); if (menu) { menu.classList.remove('visible'); menu.innerHTML = ''; }
    input.focus(); input.setSelectionRange(caret, caret);
  }

  function renderFastMentions(people) {
    var menu = q('mentionMenu');
    if (!menu) return;
    if (!people.length) { menu.classList.remove('visible'); menu.innerHTML = ''; return; }
    menu.innerHTML = people.slice(0, 20).map(function (person, index) {
      var initial = String(person.name || '?').trim().slice(0, 2).toUpperCase();
      return '<button type="button" class="mention-option" data-bi-mention="' + index + '"><span class="mention-avatar">' + esc(initial) + '</span><span class="mention-copy"><strong>' + esc(person.name) + '</strong><span>' + esc(person.outlet) + ' · ' + esc(person.nik) + '</span></span></button>';
    }).join('');
    menu.classList.add('visible');
    Array.prototype.forEach.call(document.querySelectorAll('[data-bi-mention]'), function (button) {
      button.onclick = function () { insertFullMention(people[Number(button.dataset.biMention)]); };
    });
  }

  function preloadMentions(roomId) {
    if (!roomId) return Promise.resolve([]);
    return api('chatMentions', [token, roomId, '']).then(function (data) {
      var people = (data.people || []).slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), 'id');
      });
      mentionCache[roomId] = people;
      return people;
    }).catch(function () { return mentionCache[roomId] || []; });
  }

  function realtimeMentions() {
    var context = mentionContextFast();
    var roomId = activeRoomId();
    if (!roomId || !context) {
      var menu = q('mentionMenu'); if (menu) { menu.classList.remove('visible'); menu.innerHTML = ''; }
      return;
    }
    var people = mentionCache[roomId] || [];
    var query = context.query.toLowerCase();
    if (people.length) {
      renderFastMentions(people.filter(function (p) {
        return !query || [p.name, p.nik, p.outlet].join(' ').toLowerCase().indexOf(query) >= 0;
      }));
      return;
    }
    preloadMentions(roomId).then(function (loaded) {
      var latest = mentionContextFast();
      if (!latest) return;
      var qtext = latest.query.toLowerCase();
      renderFastMentions(loaded.filter(function (p) {
        return !qtext || [p.name, p.nik, p.outlet].join(' ').toLowerCase().indexOf(qtext) >= 0;
      }));
    });
  }

  function installRealtimeMentions() {
    var input = q('messageInput');
    if (!input) return;
    input.oninput = realtimeMentions;
    var roomId = activeRoomId();
    if (roomId) preloadMentions(roomId);
  }

  function installNumericFormatting() {
    ['biTargetValue','biActualValue','biRepeatValue'].forEach(function (id) {
      var input = q(id);
      if (!input) return;
      input.addEventListener('input', function () { formatNumericField(input); });
    });
  }

  function adjustOuterChatClose() {
    try {
      if (global.parent && global.parent !== global && global.parent.document) {
        var outerClose = global.parent.document.getElementById('biChatLayerClose');
        if (outerClose && global.matchMedia('(max-width:720px)').matches) outerClose.style.display = 'none';
      }
    } catch (e) {}
  }

  function installForms() {
    if (q('biTargetFormLayer')) return;
    var now = new Date(), months = '', years = '';
    for (var m = 1; m <= 12; m += 1) months += '<option value="' + m + '">' + monthName(m) + '</option>';
    for (var y = now.getFullYear() - 2; y <= now.getFullYear() + 3; y += 1) years += '<option value="' + y + '">' + y + '</option>';
    document.body.insertAdjacentHTML('beforeend',
      '<div class="bi-form-layer" id="biTargetFormLayer"><div class="bi-form"><div class="bi-form-head"><h3>Create Target</h3><button class="bi-x" data-bi-close="biTargetFormLayer">✕</button></div><div class="bi-field"><label>APA YANG INGIN DICAPAI</label><input id="biTargetGoal" maxlength="180" placeholder="Contoh: Tambahan Sales B2B"></div><div class="bi-field"><label>TARGET</label><div class="bi-rule"><label><input type="radio" name="biTargetRule" value="MIN" checked> Minimal</label><label><input type="radio" name="biTargetRule" value="MAX"> Maksimal</label></div></div><div class="bi-field"><label>NILAI TARGET</label><div class="bi-number-wrap"><input id="biTargetValue" type="text" inputmode="numeric" autocomplete="off" placeholder="0"><label class="bi-percent"><input id="biTargetPercent" type="checkbox"> %</label></div></div><div class="bi-field"><label>BULAN & TAHUN</label><div class="bi-rule"><select id="biTargetMonth">' + months + '</select><select id="biTargetYear">' + years + '</select></div></div><div class="bi-actions"><button class="bi-secondary" data-bi-close="biTargetFormLayer">Batal</button><button class="bi-primary" id="biSaveTarget">Buat Target</button></div></div></div>' +
      '<div class="bi-form-layer" id="biActualLayer"><div class="bi-form"><div class="bi-form-head"><h3>Realisasi Target</h3><button class="bi-x" data-bi-close="biActualLayer">✕</button></div><p id="biActualQuestion" style="font-size:13px;line-height:1.5"></p><div class="bi-field"><label>REALISASI</label><div class="bi-number-wrap"><input id="biActualValue" type="text" inputmode="numeric" autocomplete="off"><strong id="biActualUnit"></strong></div></div><div class="bi-actions"><button class="bi-secondary" data-bi-close="biActualLayer">Batal</button><button class="bi-primary" id="biSubmitActual">OK</button></div></div></div>' +
      '<div class="bi-form-layer" id="biResultLayer"><div class="bi-form"><div id="biResultBody"></div><div class="bi-actions" style="justify-content:center"><button class="bi-primary" id="biResultNext">Lanjut</button></div></div></div>' +
      '<div class="bi-form-layer" id="biRepeatLayer"><div class="bi-form"><div class="bi-form-head"><h3>Target Bulan Depan</h3></div><p style="font-size:13px;line-height:1.5">Apakah target ini akan diulang untuk bulan depan?</p><div class="bi-actions"><button class="bi-secondary" id="biRepeatNo">Tidak</button><button class="bi-primary" id="biRepeatYes">Ya</button></div></div></div>' +
      '<div class="bi-form-layer" id="biRepeatValueLayer"><div class="bi-form"><div class="bi-form-head"><h3>Berapa targetnya?</h3></div><p id="biRepeatLabel" style="font-size:12px;color:var(--muted)"></p><div class="bi-field"><label>TARGET BULAN DEPAN</label><div class="bi-number-wrap"><input id="biRepeatValue" type="text" inputmode="numeric" autocomplete="off"><strong id="biRepeatUnit"></strong></div></div><div class="bi-actions"><button class="bi-secondary" data-bi-close="biRepeatValueLayer">Batal</button><button class="bi-primary" id="biRepeatSave">OK</button></div></div></div>'
    );
    Array.prototype.forEach.call(document.querySelectorAll('[data-bi-close]'), function (b) { b.onclick = function () { var layer=q(b.dataset.biClose); layer.classList.remove('open'); if(b.dataset.biClose==='biTargetFormLayer') layer.dataset.editId=''; }; });
    q('biSaveTarget').onclick = saveTarget;
    q('biSubmitActual').onclick = submitActual;
    q('biResultNext').onclick = function () { q('biResultLayer').classList.remove('open'); q('biRepeatLayer').classList.add('open'); };
    q('biRepeatNo').onclick = function () { q('biRepeatLayer').classList.remove('open'); selectedTarget = null; openGroupPanel('target'); };
    q('biRepeatYes').onclick = openRepeatValue;
    q('biRepeatSave').onclick = saveRepeatTarget;
  }

  function openTargetForm(prefill) {
    prefill = prefill || {};
    if (!currentRoomObject()) { toast('Pilih group terlebih dahulu.'); return; }
    var now = new Date();
    q('biTargetGoal').value = prefill.goal || '';
    q('biTargetValue').value = prefill.value != null ? formatThousands(prefill.value) : '';
    q('biTargetPercent').checked = !!prefill.percent;
    q('biTargetMonth').value = String(prefill.month || now.getMonth() + 1);
    q('biTargetYear').value = String(prefill.year || now.getFullYear());
    var radio = document.querySelector('input[name="biTargetRule"][value="' + (prefill.rule || 'MIN') + '"]'); if (radio) radio.checked = true;
    q('biTargetFormLayer').dataset.editId = prefill.id || ''; q('biSaveTarget').textContent = prefill.id ? 'Simpan Perubahan' : 'Buat Target'; q('biTargetFormLayer').classList.add('open');
  }

  function saveTarget() {
    var roomId = activeRoomId(), goal = q('biTargetGoal').value.trim(), raw = q('biTargetValue').value.trim(), value = parseFormattedNumber(raw);
    var rule = (document.querySelector('input[name="biTargetRule"]:checked') || {}).value || 'MIN';
    var month = Number(q('biTargetMonth').value), year = Number(q('biTargetYear').value), percent = q('biTargetPercent').checked;
    if (!goal) return toast('Apa yang ingin dicapai wajib diisi.');
    if (!raw || !isFinite(value)) return toast('Target harus berupa angka.');
    var editId = q('biTargetFormLayer').dataset.editId || ''; var meta = { id: editId || uuid(), goal: goal, rule: rule, value: value, percent: percent, month: month, year: year, createdAt: new Date().toISOString() };
    var button = q('biSaveTarget'); button.disabled = true; button.textContent = 'Menyimpan...';
    api('chatSend', [token, { roomId: roomId, body: (editId ? editTargetMessage(meta) : createTargetMessage(meta)), attachments: [] }]).then(function () {
      q('biTargetFormLayer').classList.remove('open'); q('biTargetFormLayer').dataset.editId = ''; toast(editId ? 'Target berhasil diperbarui.' : 'Target berhasil dibuat.'); cleanTargetMarkersInView(); returnToRoomChat();
    }).catch(function (e) { toast('Target gagal dibuat: ' + e.message); }).finally(function () { button.disabled = false; button.textContent = 'Buat Target'; });
  }

  function startTargetCompletion(target) {
    selectedTarget = target;
    q('biActualQuestion').textContent = 'Berapa ' + target.goal + ' untuk ' + monthName(target.month) + ' ' + target.year + '?';
    q('biActualValue').value = '';
    q('biActualUnit').textContent = target.percent ? '%' : '';
    q('biPanelLayer').classList.remove('open'); q('biActualLayer').classList.add('open');
  }

  function submitActual() {
    if (!selectedTarget) return;
    var raw = q('biActualValue').value.trim(), actual = parseFormattedNumber(raw);
    if (!raw || !isFinite(actual)) return toast('Realisasi harus berupa angka.');
    var achieved = selectedTarget.rule === 'MAX' ? actual <= Number(selectedTarget.value) : actual >= Number(selectedTarget.value);
    var button = q('biSubmitActual'); button.disabled = true; button.textContent = 'Menyimpan...';
    api('chatSend', [token, { roomId: activeRoomId(), body: completeTargetMessage(selectedTarget, actual, achieved), attachments: [] }]).then(function () {
      q('biActualLayer').classList.remove('open');
      if (achieved) q('biResultBody').innerHTML = '<div class="bi-goodjob"><span class="bi-thumb">👍</span><h3>Good Job!</h3><p>Realisasi memenuhi target <b>' + esc(selectedTarget.goal) + '</b>.</p></div>';
      else q('biResultBody').innerHTML = '<div class="bi-goodjob"><h3 style="color:var(--wine)">Target Selesai</h3><p>Realisasi sudah dicatat. Nilai belum memenuhi target yang ditetapkan.</p></div>';
      q('biResultLayer').classList.add('open'); cleanTargetMarkersInView();
    }).catch(function (e) { toast('Target gagal diselesaikan: ' + e.message); }).finally(function () { button.disabled = false; button.textContent = 'OK'; });
  }

  function openRepeatValue() {
    if (!selectedTarget) return;
    q('biRepeatLayer').classList.remove('open');
    var month = Number(selectedTarget.month) + 1, year = Number(selectedTarget.year);
    if (month > 12) { month = 1; year += 1; }
    q('biRepeatValueLayer').dataset.month = month; q('biRepeatValueLayer').dataset.year = year;
    q('biRepeatLabel').textContent = selectedTarget.goal + ' · ' + monthName(month) + ' ' + year;
    q('biRepeatValue').value = formatThousands(selectedTarget.value); q('biRepeatUnit').textContent = selectedTarget.percent ? '%' : '';
    q('biRepeatValueLayer').classList.add('open');
  }

  function saveRepeatTarget() {
    var raw = q('biRepeatValue').value.trim(), value = parseFormattedNumber(raw);
    if (!raw || !isFinite(value)) return toast('Target bulan depan harus berupa angka.');
    var month = Number(q('biRepeatValueLayer').dataset.month), year = Number(q('biRepeatValueLayer').dataset.year);
    var meta = { id: uuid(), goal: selectedTarget.goal, rule: selectedTarget.rule, value: value, percent: selectedTarget.percent, month: month, year: year, repeatFrom: selectedTarget.id, createdAt: new Date().toISOString() };
    api('chatSend', [token, { roomId: activeRoomId(), body: createTargetMessage(meta), attachments: [] }]).then(function () {
      q('biRepeatValueLayer').classList.remove('open'); toast('Target bulan depan berhasil dibuat.'); selectedTarget = null; openGroupPanel('target');
    }).catch(function (e) { toast(e.message); });
  }

  function installGroupPanel() {
    if (q('biPanelLayer')) return;
    var now = new Date(), months = '', years = '';
    for (var m = 1; m <= 12; m += 1) months += '<option value="' + m + '"' + (m === now.getMonth() + 1 ? ' selected' : '') + '>' + monthName(m) + '</option>';
    for (var y = now.getFullYear() - 2; y <= now.getFullYear() + 3; y += 1) years += '<option value="' + y + '"' + (y === now.getFullYear() ? ' selected' : '') + '>' + y + '</option>';
    document.body.insertAdjacentHTML('beforeend', '<div class="bi-panel-layer" id="biPanelLayer" data-tab="task"><div class="bi-panel"><div class="bi-panel-head"><strong id="biPanelTitle">Group</strong><button class="bi-x" id="biPanelClose">✕</button></div><div class="bi-tabs"><button class="bi-tab active" id="biTaskTab">Task</button><button class="bi-tab" id="biTargetTab">Target</button></div><div class="bi-panel-body"><div class="bi-monthbar"><select id="biDashMonth">' + months + '</select><select id="biDashYear">' + years + '</select><button class="bi-refresh" id="biDashRefresh">↻</button></div><div class="bi-summary" id="biDashSummary"></div><div class="bi-list" id="biDashList"></div></div></div></div>');
    q('biPanelClose').onclick = function () { q('biPanelLayer').classList.remove('open'); };
    q('biTaskTab').onclick = function () { renderPanel('task'); };
    q('biTargetTab').onclick = function () { renderPanel('target'); };
    q('biDashRefresh').onclick = function () { renderPanel(q('biPanelLayer').dataset.tab || 'task'); };
    q('biDashMonth').onchange = q('biDashRefresh').onclick; q('biDashYear').onchange = q('biDashRefresh').onclick;
    q('biPanelLayer').onclick = function (e) { if (e.target === q('biPanelLayer')) q('biPanelLayer').classList.remove('open'); };
    var roomTitle = q('roomTitle');
    if (roomTitle) roomTitle.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); openGroupPanel('task'); }, true);
    if (q('roomSubtitle')) q('roomSubtitle').style.display = 'none';
    if (q('groupModal')) q('groupModal').style.display = 'none';
  }

  function openGroupPanel(tab) {
    var room = currentRoomObject();
    if (!room) return toast('Pilih group terlebih dahulu.');
    q('biPanelTitle').textContent = room.title; q('biPanelLayer').classList.add('open'); renderPanel(tab || 'task');
  }

  function renderPanel(tab) {
    q('biPanelLayer').dataset.tab = tab; q('biTaskTab').classList.toggle('active', tab === 'task'); q('biTargetTab').classList.toggle('active', tab === 'target');
    q('biDashList').innerHTML = '<div class="bi-empty">Memuat data...</div>';
    if (tab === 'target') renderTargetPanel(); else renderTaskPanel();
  }

  function renderTargetPanel() {
    var month = Number(q('biDashMonth').value), year = Number(q('biDashYear').value);
    fetchTargets(month, year).then(function (targets) {
      targets.sort(function (a, b) { var ad = !!a.completion, bd = !!b.completion; if (ad !== bd) return ad ? 1 : -1; return String(a.goal).localeCompare(String(b.goal)); });
      var done = targets.filter(function (t) { return !!t.completion; }).length, percent = targets.length ? Math.round(done * 100 / targets.length) : 0;
      q('biDashSummary').innerHTML = '<strong>' + percent + '%</strong><span>Target complete · ' + done + ' dari ' + targets.length + '</span><div class="bi-progress"><i style="width:' + percent + '%"></i></div>';
      q('biDashList').innerHTML = targets.length ? targets.map(function (t, index) {
        var comp = t.completion, desc = (t.rule === 'MAX' ? 'Maksimal ' : 'Minimal ') + formatThousands(t.value) + (t.percent ? '%' : '');
        if (comp) desc += ' · Realisasi ' + formatThousands(comp.actual) + (t.percent ? '%' : '') + (comp.achieved ? ' · Tercapai' : ' · Tidak tercapai');
        else desc += ' · Belum diselesaikan';
        return '<article class="bi-row' + (comp ? ' done' : '') + '"><div class="bi-row-copy"><strong>' + esc(t.goal) + '</strong><span>' + esc(desc) + '</span></div>' + (!comp ? '<button class="bi-row-action complete" data-target-index="' + index + '" title="Isi realisasi">✓</button>' : '') + '<button class="bi-row-action menu" data-target-menu="' + index + '" title="Edit / Hapus">⋮</button></article>';
      }).join('') : '<div class="bi-empty">Belum ada Target pada ' + monthName(month) + ' ' + year + '.</div>';
      Array.prototype.forEach.call(document.querySelectorAll('[data-target-index]'), function (b) { b.onclick = function () { startTargetCompletion(targets[Number(b.dataset.targetIndex)]); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-target-menu]'), function (b) { b.onclick = function () { openTargetMenu(targets[Number(b.dataset.targetMenu)], b); }; });
    }).catch(function (e) { q('biDashList').innerHTML = '<div class="bi-empty">' + esc(e.message) + '</div>'; });
  }

  function renderTaskPanel() {
    var roomId = activeRoomId(), month = Number(q('biDashMonth').value), year = Number(q('biDashYear').value);
    Promise.all([refreshBootstrap(), api('chatRoomDetails', [token, roomId])]).then(function (all) {
      var open = (all[0].tasks || []).filter(function (t) { return t.roomId === roomId; }).map(function (t) { return Object.assign({}, t, { status: 'OPEN' }); });
      var history = all[1].history || [];
      var tasks = open.concat(history).filter(function (t) { var d = new Date(t.createdAt || 0); return !isNaN(d.getTime()) && d.getMonth() + 1 === month && d.getFullYear() === year; });
      var uniq = {}, merged = []; tasks.forEach(function (t) { if (!uniq[t.id]) { uniq[t.id] = true; merged.push(t); } }); tasks = merged;
      tasks.sort(function (a, b) { var ad = a.status !== 'OPEN', bd = b.status !== 'OPEN'; if (ad !== bd) return ad ? 1 : -1; return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
      var done = tasks.filter(function (t) { return t.status !== 'OPEN'; }).length, percent = tasks.length ? Math.round(done * 100 / tasks.length) : 0;
      q('biDashSummary').innerHTML = '<strong>' + percent + '%</strong><span>Penyelesaian Task · ' + done + ' dari ' + tasks.length + '</span><div class="bi-progress"><i style="width:' + percent + '%"></i></div>';
      q('biDashList').innerHTML = tasks.length ? tasks.map(function (t) { var isDone = t.status !== 'OPEN'; return '<article class="bi-row' + (isDone ? ' done' : '') + '"><div class="bi-row-copy"><strong>' + esc(t.title) + '</strong><span>' + (isDone ? (t.status === 'DELETED' ? 'Dihapus' : 'Selesai') : 'Belum selesai') + '</span></div>' + (!isDone ? '<button class="bi-row-action complete" data-task-complete="' + esc(t.id) + '">✓</button>' : '') + '<button class="bi-row-action menu" data-task-menu="' + esc(t.id) + '">⋮</button></article>'; }).join('') : '<div class="bi-empty">Belum ada Task pada ' + monthName(month) + ' ' + year + '.</div>';
      Array.prototype.forEach.call(document.querySelectorAll('[data-task-complete]'), function (b) { b.onclick = function () { q('biPanelLayer').classList.remove('open'); var pin = document.querySelector('#pins [data-complete="' + b.dataset.taskComplete.replace(/"/g, '') + '"]'); if (pin) pin.click(); else toast('Task tidak ditemukan pada sticky list.'); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-task-menu]'), function (b) { b.onclick = function () { q('biPanelLayer').classList.remove('open'); var taskId = b.dataset.taskMenu; var pin = findStickyTaskButton(taskId, 'data-task-menu'); if (pin) pin.click(); else if (typeof global.openTaskManager === 'function') global.openTaskManager(taskId); else if (typeof global.openTaskDetail === 'function') global.openTaskDetail(taskId); else api('chatTaskProgress', [token, taskId]).then(function (data) { showTaskFallbackMenu(data, taskId); }).catch(function (e) { toast(e.message); }); }; });
    }).catch(function (e) { q('biDashList').innerHTML = '<div class="bi-empty">' + esc(e.message) + '</div>'; });
  }

  function observeRooms() {
    if (!q('rooms')) return;
    new MutationObserver(function () { currentRoom = activeRoomId(); if (q('biGroupSearch') && q('biGroupSearch').value) q('biGroupSearch').dispatchEvent(new Event('input')); }).observe(q('rooms'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', function (e) { var room = e.target.closest && e.target.closest('.room[data-room]'); if (room) { currentRoom = room.getAttribute('data-room'); preloadMentions(currentRoom); } }, true);
  }

  function boot() {
    injectStyles(); installGroupSearch(); installRoomCreateMenu(); installAttachmentMenu(); installForms(); installNumericFormatting(); installGroupPanel(); installSystemReplySupport(); installTerminologyObserver(); observeRooms(); installRealtimeMentions(); adjustOuterChatClose(); cleanTargetMarkersInView(); refreshBootstrap().then(function(){var roomId=activeRoomId(); if(roomId) preloadMentions(roomId);}).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
}(window));
