# Integrasi Berita Acara ke BI-Space

Folder ini adalah sumber lengkap project Google Apps Script Berita Acara yang memakai deployment:

`https://script.google.com/macros/s/AKfycbxBCTJ4BbHWrcVqXNZmtQEjfV_AFnPy_G7J8tkz88hXGPrpX_l01BNOozI0COQenXDyxg/exec`

## Arsitektur

- Login hanya dilakukan pada BI-Space.
- BI-Space membuat kode handoff acak yang berlaku lima menit dan hanya dapat digunakan satu kali.
- Backend Berita Acara menukarkan kode tersebut ke backend BI-Space.
- Identitas NIK, nama, outlet, posisi, grade, dan status aktif dibaca dari `EMP_LIST`.
- Penyimpanan tetap memakai `berita-acara-digital.berita_acara_app.submissions`.
- Posisi `AREA MANAGER` dan `FNB` diarahkan ke Approval Dashboard. Posisi lain diarahkan ke Outlet Dashboard.
- `AREA MANAGER` dan `FNB` dapat berpindah antara User Mode dan Approval Mode.
- Dokumen buatan `FNB` tetap membutuhkan persetujuan `AREA MANAGER`.
- Dokumen buatan `AREA MANAGER` otomatis disetujui pada seluruh tahap.
- Dokumen baru, revisi, persetujuan, dan penolakan mengirim push realtime ke pembuat serta approver tahap berikutnya melalui token callback SSO berumur enam jam.

## GitHub sebagai sumber utama

Branch `main` GitHub adalah satu-satunya sumber kode. Jangan mengedit file langsung pada Apps Script karena perubahan tersebut akan ditimpa pada deployment berikutnya.

Alur perubahan:

1. Perubahan dibuat melalui branch dan pull request.
2. GitHub Actions menjalankan `npm test` untuk memvalidasi backend, kontrak API, dan seluruh HTML.
3. Setelah pull request di-merge ke `main`, workflow `Deploy Berita Acara GAS` menjalankan `clasp push --force`.
4. Workflow membuat versi baru dan memperbarui deployment yang sama sehingga URL lama tetap digunakan.

## Setup otomatis satu kali

Jalankan dari PowerShell pada folder repository:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-gas-auto-deploy.ps1`

Skrip akan meminta Script ID Apps Script Berita Acara dan menyimpan tiga GitHub Secrets:

- `CLASPRC_JSON`: autentikasi clasp.
- `CLASP_JSON`: Script ID project Berita Acara.
- `GAS_DEPLOYMENT_ID`: deployment produksi yang mempertahankan URL lama.

Credential tidak disimpan di repository. Apps Script API harus diaktifkan di `https://script.google.com/home/usersettings`.

## Database yang dipertahankan

- Project: `berita-acara-digital`
- Dataset: `berita_acara_app`
- Table: `submissions`

Deployment otomatis tidak melakukan migrasi atau penghapusan data.
