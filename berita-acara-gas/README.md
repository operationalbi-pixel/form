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

## Loading Berita Acara

Halaman memakai CSS Tailwind yang sudah dibangun pada `TailwindStyles.html`; tidak menjalankan compiler Tailwind CDN saat masuk. Setelah mengubah class di dashboard/form, jalankan `npm run build:ba-css` dan commit hasilnya. File ini harus ikut deployment Apps Script.

Persiapan sesi BA di latar belakang dinonaktifkan: kunjungan dashboard tidak membuat handoff atau iframe BA. Jalur `prepareOnly=1` tetap memerlukan handoff/sesi sah, tetapi tidak membuka dashboard atau membaca riwayat. Sesi disimpan selama paling lama 30 menit di sessionStorage tab dan terikat pada hash token BI-Space. Sesi server dan identitas karyawan tetap divalidasi setiap pembukaan. Pada kunjungan berikutnya, pembukaan sesi BA dan pemeriksaan karyawan berjalan paralel; halaman ditampilkan hanya setelah keduanya siap dan fingerprint identitas cocok. Perubahan identitas atau sesi BA yang tidak tersedia kembali memakai handoff baru.

Pustaka PDF dimuat saat tombol PDF digunakan. Font dan ikon tidak menahan parsing halaman. Tidak ada perubahan pada data transaksi atau keputusan approval.

Deploy bersama backend BI-Space, halaman `docs/berita-acara.html`, `docs/ba-entry.js`, `docs/index.html`, `docs/api-client.js`, serta seluruh file proyek BA yang berubah. Workflow deployment GAS pada `main` mengikutsertakan file HTML baru.

Untuk mengukur produksi, buka Berita Acara lalu periksa `window.baEntryPerformance` di console halaman pembungkus: `entryMs` adalah waktu sampai dashboard siap dan akun lolos pemeriksaan; `historyMs` adalah waktu sampai riwayat pertama siap; `resumed` menandai jalur sesi yang digunakan kembali. Ukur setelah deployment selesai, baik tanpa sesi tersimpan maupun setelah persiapan latar belakang. Target 3 detik tidak dapat disahkan hanya dari tes lokal karena waktu jaringan dan cold start GAS belum diukur.

## Pengurangan kuota URL Fetch (25 Oktober 2026)

- Daftar metadata Cloudflare disimpan dalam cache terkompresi selama 15 detik, dipisahkan menurut endpoint, kredensial, outlet, dan versi data. Validasi sesi tetap dilakukan sebelum membaca cache.
- Setiap write Cloudflare yang berhasil mengganti versi cache. Pembacaan untuk keputusan approval, detail, dan verifikasi pembayaran tidak memakai cache daftar.
- Ukuran cache dibatasi; cache rusak, terlalu besar, atau tidak tersedia tidak menggagalkan permintaan data.
- Backend BI-Space tidak mengulang panggilan yang sudah ditolak karena kuota harian URL Fetch.
- Perubahan ini mengurangi konsumsi kuota; tidak mereset kuota yang sudah habis. Migrasi transport browser langsung ke Worker belum diaktifkan dan memerlukan akses ke akun Cloudflare pemilik Worker produksi.
