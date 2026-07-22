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

  function call(action, args) {
    return new Promise(function (resolve, reject) {
      var id = requestId();
      var frameName = 'bakerzin_api_' + id.replace(/[^a-z0-9]/gi, '');
      var iframe = document.createElement('iframe');
      var form = document.createElement('form');
      var input = document.createElement('input');
      var finished = false;

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
        global.removeEventListener('message', onMessage);
        clearTimeout(timer);
        if (form.parentNode) form.parentNode.removeChild(form);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      function onMessage(event) {
        var message = event.data;
        if (finished || event.source !== iframe.contentWindow || !message || message.bakerzinApi !== true || message.requestId !== id) return;
        finished = true;
        cleanup();
        resolve(message.response);
      }

      var timer = setTimeout(function () {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Server tidak merespons dalam 90 detik. Periksa deployment GAS dan coba lagi.'));
      }, 90000);

      global.addEventListener('message', onMessage);
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
    });
  }

  global.BAKERZIN_API = Object.freeze({ call: call });
}(window));
