(function () {
  'use strict';
  var STORAGE_KEY = 'bakerzin_dashboard_quick_menus_v4';
  var DEFAULT_MENUS = [];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      var map = {};
      map['&'] = '&' + 'amp;';
      map['<'] = '&' + 'lt;';
      map['>'] = '&' + 'gt;';
      map['"'] = '&' + 'quot;';
      map["'"] = '&#39;';
      return map[ch];
    });
  }

  function matchTaskIcon(titleNeedle, urlNeedle) {
    var tasks = (window.BAKERZIN_STATE && BAKERZIN_STATE.tasks) || [];
    var needles = (titleNeedle || '').toLowerCase().split('|').filter(Boolean);
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var title = String(t.title || '').toLowerCase();
      var target = String(t.target || '').toLowerCase();
      var hit = needles.some(function (n) { return n && (title.indexOf(n) >= 0 || target.indexOf(n) >= 0); });
      if (!hit && urlNeedle) {
        hit = target.indexOf(String(urlNeedle).toLowerCase()) >= 0 || String(t.target || '').indexOf(urlNeedle) >= 0;
      }
      if (hit) {
        try {
          if (typeof taskIcon === 'function') return taskIcon(t);
        } catch (e) {}
        if (t.icon) return String(t.icon).toLowerCase().replace(/[^a-z0-9_]/g, '');
      }
    }
    return '';
  }

  function enrichMenuIcon(item) {
    if (!item) return item;
    var live = '';
    if (item.type === 'task' && item.taskId) {
      var task = ((window.BAKERZIN_STATE && BAKERZIN_STATE.tasks) || []).filter(function (t) { return t.id === item.taskId; })[0];
      if (task) {
        try { if (typeof taskIcon === 'function') live = taskIcon(task); } catch (e) {}
        if (!live && task.icon) live = String(task.icon).toLowerCase().replace(/[^a-z0-9_]/g, '');
      }
    } else if (item.type === 'page' && item.pageId) {
      var page = ((window.BAKERZIN_STATE && BAKERZIN_STATE.pages) || []).filter(function (p) { return p.id === item.pageId; })[0];
      if (page && page.icon) live = String(page.icon).toLowerCase().replace(/[^a-z0-9_]/g, '');
    } else if (item.type === 'static') {
      if (item.id === 'static:absensi-break') live = matchTaskIcon('absensi|break', 'absensibreak');
      else if (item.id === 'static:opening-closing') live = matchTaskIcon('opening|closing|checklist', '');
      else if (item.id === 'static:berita-acara') live = matchTaskIcon('berita acara|berita-acara', 'berita-acara');
      else if (item.id === 'static:stock-card') live = matchTaskIcon('stock card|stockcard', 'StockCard') || 'inventory_2';
      else if (item.id === 'static:lost-found') live = matchTaskIcon('lost|found|sabar', 'lost');
      else if (item.id === 'static:mpp') live = matchTaskIcon('mpp|uang tip', 'mpp-schedule');
      else if (item.id === 'static:sales') live = matchTaskIcon('sales|analisa', 'sales-analysis');
      else if (item.id === 'static:sosialisasi') live = matchTaskIcon('sosialisasi', 'sosialisasi');
      else if (item.id === 'static:showcase') live = matchTaskIcon('showcase', 'showcase');
      else if (item.id === 'static:chat') live = 'chat';
    }
    if (live) item.icon = live;
    return item;
  }

  function defaultMenus() {
    return DEFAULT_MENUS.map(function (m) {
      return enrichMenuIcon({ id: m.id, title: m.title, icon: m.icon, type: m.type, url: m.url });
    });
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultMenus();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultMenus();
      return parsed.map(function (item) { return enrichMenuIcon(item); });
    } catch (e) {
      return defaultMenus();
    }
  }

  function saveMenus(menus) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(menus));
    } catch (e) {}
  }

  function resolveStaticUrl(item) {
    if (item.url) return item.url;
    var tasks = (window.BAKERZIN_STATE && BAKERZIN_STATE.tasks) || [];
    var match = tasks.filter(function (t) {
      var title = String(t.title || '').toLowerCase();
      return title.indexOf('opening') >= 0 || title.indexOf('closing') >= 0 || title.indexOf('checklist') >= 0;
    })[0];
    if (match && typeof taskDestination === 'function') {
      try { return taskDestination(match).url; } catch (e) {}
    }
    return 'index.html';
  }

  function catalog() {
    var items = [];
    var seen = {};
    function add(item) {
      if (!item || !item.id || seen[item.id]) return;
      seen[item.id] = true;
      items.push(item);
    }
    defaultMenus().forEach(add);
    var staticPages = [
      { id: 'static:chat', title: 'Pesan / Chat', icon: 'chat', type: 'static', url: 'chat.html' },
      { id: 'static:stock-card', title: 'Stock Card', icon: 'inventory_2', type: 'static', url: 'stock-card.html' },
      { id: 'static:lost-found', title: 'Lost & Found', icon: 'search', type: 'static', url: 'lost-and-found.html' },
      { id: 'static:mpp', title: 'MPP Schedule', icon: 'calendar_month', type: 'static', url: 'mpp-schedule.html' },
      { id: 'static:sales', title: 'Sales Analysis', icon: 'analytics', type: 'static', url: 'sales-analysis.html' },
      { id: 'static:sosialisasi', title: 'Sosialisasi', icon: 'campaign', type: 'static', url: 'sosialisasi.html' },
      { id: 'static:showcase', title: 'Showcase Log', icon: 'storefront', type: 'static', url: 'showcaselog.html' }
    ];
    staticPages.forEach(function (p) { add(enrichMenuIcon(p)); });
    var tasks = (window.BAKERZIN_STATE && BAKERZIN_STATE.tasks) || [];
    tasks.forEach(function (t) {
      var icon = 'link';
      try {
        if (typeof taskIcon === 'function') icon = taskIcon(t);
      } catch (e) {}
      var url = '';
      try {
        if (typeof taskDestination === 'function') url = taskDestination(t).url;
      } catch (e) {}
      add({
        id: 'task:' + t.id,
        title: t.title || 'Tanpa judul',
        icon: icon,
        type: 'task',
        taskId: t.id,
        url: url
      });
    });
    var pages = (window.BAKERZIN_STATE && BAKERZIN_STATE.pages) || [];
    pages.forEach(function (p) {
      add({
        id: 'page:' + p.id,
        title: p.title || 'Halaman',
        icon: p.icon || 'folder',
        type: 'page',
        pageId: p.id,
        url: ''
      });
    });
    return items;
  }

  function openItem(item) {
    if (item.type === 'page' && item.pageId && typeof navigate === 'function') {
      navigate('PAGE:' + item.pageId);
      return;
    }
    if (item.type === 'task' && item.taskId) {
      var task = ((window.BAKERZIN_STATE && BAKERZIN_STATE.tasks) || []).filter(function (t) { return t.id === item.taskId; })[0];
      if (task && typeof taskDestination === 'function') {
        var dest = taskDestination(task);
        if (dest && dest.url) {
          if (String(dest.attrs || '').indexOf('_blank') >= 0) window.open(dest.url, '_blank');
          else window.location.href = dest.url;
          return;
        }
      }
    }
    var url = item.type === 'static' ? resolveStaticUrl(item) : item.url;
    if (url) window.location.href = url;
  }

  function renderGrid() {
    var menus = loadSaved();
    var html = '<section class="qm-section" aria-label="Menu cepat dashboard">';
    html += '<div class="qm-head"><div class="qm-kicker"><span class="material-symbols-rounded" aria-hidden="true">apps</span>Menu Cepat</div>';
    html += '<button type="button" class="qm-reset" id="qmReset" title="Kosongkan menu">Kosongkan</button></div>';
    html += '<div class="qm-grid">';
    menus.forEach(function (item, index) {
      html += '<button type="button" class="qm-item" data-qm-index="' + index + '">';
      html += '<span class="material-symbols-rounded qm-icon" aria-hidden="true">' + esc(item.icon || 'link') + '</span>';
      html += '<span class="qm-label">' + esc(item.title) + '</span>';
      html += '<span class="qm-remove" data-qm-remove="' + index + '" title="Hapus">×</span>';
      html += '</button>';
    });
    html += '<button type="button" class="qm-add" id="qmAdd" aria-label="Tambah menu">';
    html += '<span class="material-symbols-rounded" aria-hidden="true">add</span>';
    html += '<span>Tambah menu</span></button>';
    html += '</div></section>';
    return html;
  }

  function ensureStyles() {
    if (!document.getElementById('qm-material-icons')) {
      var link = document.createElement('link');
      link.id = 'qm-material-icons';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=block';
      document.head.appendChild(link);
    }
    var oldStyle = document.getElementById('qm-styles');
    if (oldStyle) oldStyle.remove();
    var style = document.createElement('style');
    style.id = 'qm-styles';
    style.textContent = [
      '.qm-section{margin:0 0 20px}',
      '.qm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}',
      '.qm-kicker{display:flex;align-items:center;gap:8px;color:var(--red,#a91431);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}',
      '.qm-kicker .material-symbols-rounded{font-size:18px}',
      '.qm-reset{border:0;background:transparent;color:#8b8084;font-size:11px;font-weight:700;cursor:pointer;padding:4px 8px;border-radius:8px}',
      '.qm-reset:hover{background:#f5eef0;color:var(--red,#a91431)}',
      '.qm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
      '.qm-item,.qm-add{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:92px;padding:12px 6px;border-radius:14px;cursor:pointer;font:inherit;text-align:center;transition:transform .15s,box-shadow .15s,border-color .15s}',
      '.qm-item{border:1px solid #e7dfe1;background:#fff;box-shadow:0 6px 18px rgba(54,35,40,.04)}',
      '.qm-item:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(54,35,40,.08);border-color:#dfb9c1}',
      '.qm-icon.material-symbols-rounded{font-family:"Material Symbols Rounded";font-weight:normal;font-style:normal;font-size:28px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;font-feature-settings:"liga";-webkit-font-feature-settings:"liga";-webkit-font-smoothing:antialiased;color:var(--red,#a91431);font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 24}',
      '.qm-label{font-size:11px;font-weight:700;color:#2c2528;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
      '.qm-remove{position:absolute;top:4px;right:6px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:13px;color:#b0a4a8;opacity:0;transition:opacity .15s}',
      '.qm-item:hover .qm-remove{opacity:1}',
      '.qm-remove:hover{background:#fff1f3;color:#a91431}',
      '.qm-add{border:1.5px dashed #d5c6ca;background:#faf7f8;color:#8b8084}',
      '.qm-add:hover{border-color:var(--red,#a91431);color:var(--red,#a91431);background:#fff8f9}',
      '.qm-add .material-symbols-rounded{font-family:"Material Symbols Rounded";font-size:24px;font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 24}',
      '.qm-add span:last-child{font-size:10px;font-weight:700}',
      '.qm-modal{position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(40,28,32,.45)}',
      '.qm-modal.open{display:flex}',
      '.qm-dialog{width:min(520px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(40,28,32,.22)}',
      '.qm-dialog-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #eee5e7}',
      '.qm-dialog-head strong{font-size:15px}',
      '.qm-dialog-head button{border:0;background:transparent;font-size:20px;cursor:pointer;color:#8b8084}',
      '.qm-dialog-body{padding:12px 14px;overflow:auto;display:grid;gap:6px}',
      '.qm-pick{display:flex;align-items:center;gap:12px;width:100%;border:1px solid #eee5e7;border-radius:12px;padding:10px 12px;background:#fff;cursor:pointer;text-align:left;font:inherit}',
      '.qm-pick:hover{border-color:#dfb9c1;background:#fffafb}',
      '.qm-pick .material-symbols-rounded{font-family:"Material Symbols Rounded";color:var(--red,#a91431);font-size:22px;font-variation-settings:"FILL" 0,"wght" 400,"GRAD" 0,"opsz" 24}',
      '.qm-pick span:last-child{font-size:13px;font-weight:600;color:#2c2528}',
      '.qm-pick.disabled{opacity:.45;pointer-events:none}',
      '@media (max-width:640px){.qm-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.qm-item,.qm-add{min-height:84px;padding:10px 4px;border-radius:12px}.qm-icon.material-symbols-rounded{font-size:24px}.qm-label{font-size:10px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('qmModal')) return;
    var modal = document.createElement('div');
    modal.id = 'qmModal';
    modal.className = 'qm-modal';
    modal.innerHTML = '<div class="qm-dialog" role="dialog" aria-modal="true" aria-label="Tambah menu cepat"><div class="qm-dialog-head"><strong>Tambah Menu</strong><button type="button" id="qmModalClose" aria-label="Tutup">✕</button></div><div class="qm-dialog-body" id="qmModalBody"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.getElementById('qmModalClose').onclick = function () {
      modal.classList.remove('open');
    };
  }

  function openPicker() {
    ensureModal();
    var body = document.getElementById('qmModalBody');
    var saved = loadSaved();
    var savedIds = {};
    saved.forEach(function (m) { savedIds[m.id] = true; });
    var items = catalog();
    body.innerHTML = items.map(function (item) {
      var disabled = savedIds[item.id] ? ' disabled' : '';
      return '<button type="button" class="qm-pick' + disabled + '" data-qm-add-id="' + esc(item.id) + '"><span class="material-symbols-rounded" aria-hidden="true">' + esc(item.icon || 'link') + '</span><span>' + esc(item.title) + '</span></button>';
    }).join('') || '<div style="padding:16px;color:#8b8084;font-size:13px">Tidak ada menu tersedia.</div>';
    body.querySelectorAll('[data-qm-add-id]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-qm-add-id');
        var item = catalog().filter(function (x) { return x.id === id; })[0];
        if (!item) return;
        var menus = loadSaved();
        if (menus.some(function (m) { return m.id === id; })) return;
        menus.push(item);
        saveMenus(menus);
        document.getElementById('qmModal').classList.remove('open');
        injectGrid(true);
      };
    });
    document.getElementById('qmModal').classList.add('open');
  }

  function wireGrid(root) {
    if (!root) return;
    root.querySelectorAll('.qm-item').forEach(function (btn) {
      btn.onclick = function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-qm-remove') != null) return;
        var index = Number(btn.getAttribute('data-qm-index'));
        var menus = loadSaved();
        if (menus[index]) openItem(menus[index]);
      };
    });
    root.querySelectorAll('[data-qm-remove]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var index = Number(btn.getAttribute('data-qm-remove'));
        var menus = loadSaved();
        menus.splice(index, 1);
        saveMenus(menus);
        injectGrid(true);
      };
    });
    var add = root.querySelector('#qmAdd');
    if (add) add.onclick = openPicker;
    var reset = root.querySelector('#qmReset');
    if (reset) reset.onclick = function () {
      saveMenus(defaultMenus());
      injectGrid(true);
    };
  }

  function injectGrid(force) {
    ensureStyles();
    ensureModal();
    var workspace = document.getElementById('workspace');
    if (!workspace) return;
    var existing = workspace.querySelector('.qm-section');
    var news = workspace.querySelector('#dashboardNews') || workspace.querySelector('.dashboard-news');
    if (!force && existing) {
      wireGrid(existing);
      return;
    }
    var html = renderGrid();
    if (existing) {
      existing.outerHTML = html;
    } else if (news) {
      news.insertAdjacentHTML('afterend', html);
    } else if (window.BAKERZIN_STATE && BAKERZIN_STATE.page === 'dashboard') {
      var hero = workspace.querySelector('.dashboard-hero');
      if (hero) hero.insertAdjacentHTML('afterend', html);
      else workspace.insertAdjacentHTML('afterbegin', html);
    } else {
      return;
    }
    wireGrid(workspace.querySelector('.qm-section'));
  }

  function hookRenderPage() {
    if (typeof window.renderPage !== 'function') return false;
    if (window.renderPage.__qmHooked) return true;
    var original = window.renderPage;
    window.renderPage = function () {
      var result = original.apply(this, arguments);
      try {
        if (window.BAKERZIN_STATE && BAKERZIN_STATE.page === 'dashboard') {
          setTimeout(function () { injectGrid(true); }, 0);
        }
      } catch (e) {}
      return result;
    };
    window.renderPage.__qmHooked = true;
    return true;
  }

  function boot() {
    ensureStyles();
    if (!hookRenderPage()) {
      setTimeout(boot, 200);
      return;
    }
    if (window.BAKERZIN_STATE && BAKERZIN_STATE.page === 'dashboard') {
      injectGrid(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
})();
