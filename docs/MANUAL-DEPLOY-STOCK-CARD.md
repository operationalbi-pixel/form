# Petunjuk Deployment Perbaikan Stock Card

## 1. Publikasikan perubahan GitHub

1. Masukkan perubahan `docs/Code.gs`, `gas/Code.gs`, dan `docs/stock-card.html` ke Pull Request.
2. Pastikan pemeriksaan GitHub Actions selesai tanpa error.
3. Merge Pull Request ke `main`.
4. Tunggu GitHub Pages memperbarui halaman `stock-card.html`.

## 2. Terapkan backend Google Apps Script

1. Buka project Google Apps Script yang menjadi backend aplikasi.
2. Pastikan isi file backend sama dengan `gas/Code.gs` dari branch `main` terbaru.
3. Klik **Deploy > Manage deployments**.
4. Edit deployment Web App yang aktif.
5. Pilih **New version**, lalu klik **Deploy**.
6. Jangan membuat URL Web App baru. Pertahankan deployment dan URL yang sudah dipakai website.

## 3. Pasang trigger pemeliharaan saldo — wajib satu kali

Cara paling mudah:

1. Di editor Google Apps Script, pilih fungsi `installStockMaintenanceTrigger` pada daftar fungsi.
2. Klik **Run**.
3. Berikan izin saat Google meminta otorisasi.
4. Buka menu **Triggers** dan pastikan ada trigger:
   - Function: `refreshDirtyStockBalances`
   - Event source: **Time-driven**
   - Interval: **Every 5 minutes**

Fungsi instalasi aman dijalankan ulang. Jika trigger sudah ada, fungsi tidak membuat trigger kedua.

Trigger ini memindahkan pembangunan ringkasan saldo dari proses pengguna ke background. Tanpa trigger, data tetap akurat karena sistem membaca ledger aktual, tetapi pembacaan dapat lebih lambat.

## 4. Pemeriksaan setelah deployment

1. Buka Stock Card dan lakukan hard refresh dengan `Ctrl+F5`.
2. Pastikan daftar item tampil lebih dahulu; progress dan notifikasi expired boleh muncul beberapa saat setelahnya.
3. Input satu transaksi manual dan pastikan saldo serta history berubah.
4. Upload satu file Usage Penjualan.
5. Upload ulang file yang sama: sistem harus menolak file identik.
6. Upload file tanggal yang sama tetapi berisi item berbeda: item baru harus dapat masuk.
7. Login sebagai BIHQ, lalu klik **Monitoring Semua Outlet** pada kartu progress.
8. Pastikan status hanya menjadi selesai apabila transaksi item aktual sudah ada.
9. Untuk batch BIHQ, buka **Upload > Batch Multi-Outlet (BIHQ)**, pilih jenis file, verifikasi, lalu upload.

## 5. Aturan batch BIHQ

- Good Receipt dikelompokkan menggunakan kolom **Destination**.
- Good Delivery dikelompokkan menggunakan kolom **Origin**.
- Baris yang sudah tercatat akan dilewati; item berbeda tetap diproses.
- Semua nama outlet pada file wajib tersedia di sheet `STORE CODE` dan outlet harus aktif.
- Jika unit file berbeda dengan unit master, lengkapi dahulu melalui menu **Unit Konversi**, kemudian verifikasi batch kembali.
- Usage Penjualan ESB saat ini hanya memberikan satu outlet pada sel B6. Satu file Usage belum dapat dibagi menjadi beberapa outlet kecuali format file menyediakan outlet pada setiap baris atau section.

## 6. Perubahan yang tidak memerlukan setup manual

- Cache master item, outlet, lokasi, dan unit berjalan otomatis selama 10 menit.
- Raw material WIP yang belum ada akan ditambahkan otomatis ke `STOCK_ITEMS` saat dibutuhkan.
- Monitoring membaca transaksi aktual dari BigQuery, bukan hanya marker import.
- Notifikasi expired dan progress dimuat setelah daftar stok agar tampilan awal lebih cepat.

