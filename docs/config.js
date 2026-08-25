window.BAKERZIN_CONFIG = Object.freeze({
  // Tempel URL deployment Google Apps Script Web App yang berakhiran /exec.
  API_URL: 'https://script.google.com/macros/s/AKfycbw2_tBBWOn9Ld6QcCJBorJyZ06Lh1ZB_gEnIEqc76N7D2WWOv3trlGVqtIAqYml060_/exec',

  // Kosongkan agar alamat dashboard mengikuti lokasi GitHub Pages saat ini.
  SITE_BASE_URL: ''
});

// Enhancement khusus halaman Chat. Dipisahkan dari chat.html agar perubahan
// fitur dapat di-rollback tanpa menyentuh engine chat utama.
try {
  if (/\/chat\.html$/i.test(window.location.pathname)) {
    var biChatEnhancement = document.createElement('script');
    biChatEnhancement.src = 'chat-enhancements.js?v=20260826-target2';
    biChatEnhancement.async = true;
    (document.head || document.documentElement).appendChild(biChatEnhancement);
  }
} catch (e) {}
