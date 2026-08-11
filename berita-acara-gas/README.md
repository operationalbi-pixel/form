# Integrasi Berita Acara ke BI-Space

Folder ini adalah sumber lengkap untuk project Google Apps Script Berita Acara yang memakai deployment:

`https://script.google.com/macros/s/AKfycbxBCTJ4BbHWrcVqXNZmtQEjfV_AFnPy_G7J8tkz88hXGPrpX_l01BNOozI0COQenXDyxg/exec`

## Arsitektur

- Login hanya dilakukan pada BI-Space.
- BI-Space membuat kode handoff acak yang berlaku lima menit dan hanya dapat digunakan satu kali.
- Backend Berita Acara menukarkan kode tersebut ke backend BI-Space.
- Identitas NIK, nama, outlet, posisi, grade, dan status aktif dibaca dari `EMP_LIST`.
- Penyimpanan Berita Acara tetap memakai `berita-acara-digital.berita_acara_app.submissions`.
- Posisi `AREA MANAGER` dan `FNB` diarahkan ke Approval Dashboard. Posisi lain diarahkan ke Outlet Dashboard.
- `AREA MANAGER` dan `FNB` dapat berpindah ke User Mode untuk membuat dokumen, lalu kembali ke Approval Mode.
- Dokumen yang dibuat `FNB` otomatis melewati tahap FNB dan tetap menunggu persetujuan `AREA MANAGER`.
- Dokumen yang dibuat `AREA MANAGER` otomatis disetujui pada seluruh tahap yang dibutuhkan.

## Urutan penerapan

1. Terapkan `gas/Code.gs` dari repository utama ke Apps Script BI-Space dan perbarui deployment-nya.
2. Salin seluruh file dalam folder ini ke project Apps Script Berita Acara. Nama file harus dipertahankan.
3. Ganti manifest project dengan `appsscript.json` dari folder ini.
4. Pada Apps Script Berita Acara, pilih **Deploy → Manage deployments → Edit** pada deployment yang sudah ada.
5. Pilih **New version**, lalu deploy. Jangan membuat deployment terpisah agar URL lama tetap sama.
6. Buka menu Berita Acara dari BI-Space. Membuka URL Berita Acara secara langsung memang akan ditolak karena tidak memiliki handoff.

## Database yang dipertahankan

- Project: `berita-acara-digital`
- Dataset: `berita_acara_app`
- Table: `submissions`

Tidak ada migrasi atau penghapusan data pada proses integrasi ini.
