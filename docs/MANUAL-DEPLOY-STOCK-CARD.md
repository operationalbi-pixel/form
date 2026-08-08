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

Setelah backend versi ini pertama kali di-deploy, jalankan fungsi `backfillStockTransferDeliveryDates` satu kali dari editor Google Apps Script. Fungsi ini mengisi tanggal Good Delivery untuk transfer lama yang masih belum memiliki field `delivery_date`; data transaksi tidak dihapus.

Jalankan juga fungsi `backfillStockUploadDailySummary` satu kali. Fungsi ini mengisi tabel monitoring ringkas dari transaksi aktual yang sudah ada. Setelah itu, trigger yang sama akan memperbarui hanya tanggal/outlet yang berubah. Tanpa backfill ini, monitoring lama akan tampak belum lengkap sampai setiap tanggal diperbarui lagi.

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
10. Klik lingkaran persentase pada monitoring Stock Card atau Showcase Log dan pastikan daftar tanggal yang belum selesai muncul.
11. Pada Showcase Log, ubah salah satu kolom **Total**, simpan, lalu pastikan Balance dan history berubah sebesar selisihnya.
12. Buka **Produksi WIP**, lalu coba pencarian kode/nama dan pilih hasil autosuggest.
13. Klik **Download Template Excel**, isi minimal satu baris dari dropdown WIP, lalu upload kembali melalui **Upload Produksi WIP**.
14. Jika Unit Resep berbeda dengan Unit Default hasil atau bahan, pastikan pop-up konversi muncul sebelum produksi dapat diproses.
15. Buka kiriman Good Delivery pada outlet penerima dan pastikan tanggal default Waktu Terima serta Waktu Masuk Storage sama dengan tanggal Good Delivery.

## 5. Aturan batch BIHQ

- Good Receipt dikelompokkan menggunakan kolom **Destination**.
- Good Delivery dikelompokkan menggunakan kolom **Origin**.
- Baris yang sudah tercatat akan dilewati; item berbeda tetap diproses.
- Semua nama outlet pada file wajib tersedia di sheet `STORE CODE` dan outlet harus aktif.
- Jika unit file berbeda dengan unit master, lengkapi dahulu melalui menu **Unit Konversi**, kemudian verifikasi batch kembali.
- Usage Penjualan ESB saat ini hanya memberikan satu outlet pada sel B6. Satu file Usage belum dapat dibagi menjadi beberapa outlet kecuali format file menyediakan outlet pada setiap baris atau section.

## 6. Perubahan yang tidak memerlukan setup manual

- Bootstrap halaman, navigasi, progress, dan completion digabungkan sehingga pembukaan awal tidak meminta data yang sama berulang kali.
- Daftar stok menggunakan cache 45 detik dan monitoring seluruh outlet menggunakan cache 60 detik. Cache terkait dibersihkan otomatis setelah perubahan stok.
- Monitoring BIHQ membaca tabel ringkas `stock_upload_daily_summary`, bukan memindai seluruh history setiap membuka halaman.
- Cache master item, outlet, lokasi, dan unit berjalan otomatis selama 10 menit.
- Raw material WIP yang belum ada akan ditambahkan otomatis ke `STOCK_ITEMS` saat dibutuhkan.
- Monitoring membaca transaksi aktual dari BigQuery, bukan hanya marker import.
- Notifikasi expired dan progress dimuat setelah daftar stok agar tampilan awal lebih cepat.
- Angka QTY, suhu, saldo, konversi, dan total pada tampilan aplikasi serta tanda terima ditampilkan dengan maksimal dua angka di belakang koma. Nilai asli di database tidak dibulatkan.
- Produksi WIP dapat diinput melalui autosuggest atau template Excel dengan dropdown item WIP. File yang sama tidak dapat diproses dua kali pada outlet dan penyimpanan yang sama.
- Hasil WIP selalu disimpan menggunakan Unit Default hasil pada `STOCK_ITEMS`; bahan baku juga selalu dipotong dalam Unit Default masing-masing. Perbedaan unit wajib melewati `STOCK_UNIT_CONVERSIONS`.
- Deployment backend pertama dapat meminta izin Google Drive saat membuat template Excel. File Google Sheets sementara otomatis dipindahkan ke Trash setelah file XLSX selesai dibuat.
- Field BigQuery `stock_transfers.delivery_date` ditambahkan otomatis ketika backend versi baru pertama kali dijalankan.

## 7. Migrasi aman partisi `stock_card` ke `event_date`

Lakukan setelah deployment dan backfill monitoring selesai, sebaiknya pada jam aktivitas rendah. Seluruh fungsi dijalankan satu per satu dari editor Google Apps Script. Tabel lama tidak pernah dihapus otomatis.

Jika reset dan reupload data masih direncanakan, selesaikan reset/reupload terlebih dahulu sebelum memulai migrasi v2. Jangan menjalankan `RESET-UPLOAD-DATA.sql` ketika dual-write sedang aktif karena penghapusan langsung di BigQuery tidak otomatis dicerminkan ke tabel pasangannya.

1. Jalankan `prepareStockCardV2Migration`.
   - Sistem membuat `stock_card_v2` dengan partisi harian `event_date` dan clustering outlet, lokasi, item, serta jenis record.
   - Sistem langsung mengaktifkan dual-write ke tabel lama dan v2, lalu menyalin data lama.
   - Periksa hasil eksekusi. `matched` dan `safeToActivate` harus bernilai `true`.
2. Jalankan `auditStockCardV2Migration`.
   - Bandingkan `rowCount`, `recordCount`, `qtyTotal`, `minDate`, dan `maxDate` antara tabel lama dan v2.
   - Jangan lanjut apabila `matched` masih `false`.
3. Jika belum cocok, jalankan `syncStockCardV2Migration`, lalu audit ulang. Tabel lama masih menjadi sumber aktif selama tahap ini.
4. Jika audit cocok, jalankan `activateStockCardV2AfterAudit`.
   - Fungsi melakukan sinkronisasi dan audit sekali lagi sebelum beralih.
   - `stock_card_v2` menjadi tabel aktif; `stock_card` lama tetap menerima mirror sebagai jalur rollback.
5. Uji Stock Card, upload, transfer, produksi WIP, Showcase, dan monitoring BIHQ. Pantau minimal tujuh hari.
6. Jika ada masalah, jalankan `rollbackStockCardV2Migration`. Peralihan kembali ke tabel lama berlangsung tanpa menghapus v2.
7. Setelah masa observasi dan audit tetap cocok, jalankan `finishStockCardV2Migration` untuk menghentikan dual-write. Tabel `stock_card` lama tetap disimpan di BigQuery dan dapat dihapus manual hanya setelah kebijakan retensi internal mengizinkan.

Catatan penting:

- Jangan mengubah Script Properties `STOCK_CARD_TABLE_ID` dan `STOCK_CARD_MIRROR_TABLE_ID` secara manual.
- Jika Script Property `STOCK_CARD_MIRROR_LAST_ERROR` terisi, jalankan `syncStockCardV2Migration` dan pastikan audit cocok sebelum aktivasi/finalisasi.
- Migrasi ini tidak mengubah presisi QTY dan tidak menghapus Showcase Log.

## 8. Rencana reset upload tanpa menghapus Showcase Log

Jangan menghapus tabel `stock_card` seluruhnya. Showcase Log berada pada tabel yang sama dengan transaksi upload dan ditandai dengan `source_file = 'SHOWCASE_LOG'`.

Urutan reset yang aman:

1. Hentikan sementara aktivitas upload dan penerimaan transfer oleh seluruh outlet.
2. Nonaktifkan sementara trigger `refreshDirtyStockBalances`.
3. Buat snapshot BigQuery untuk tabel `stock_card`, `stock_transfers`, `task_completions`, dan `stock_balances`. Catat waktu serta nama snapshot.
4. Buat daftar `transfer_id` Good Delivery dari baris `stock_card` dengan movement type `Transfer Out Antar Outlet` yang berasal dari file upload.
5. Dalam satu transaksi BigQuery:
   - hapus data Upload Penjualan beserta `Production` dan `WIP Material Usage` otomatis yang berasal dari file Usage;
   - hapus data Good Receipt;
   - hapus seluruh baris `stock_card` untuk `transfer_id` Good Delivery yang sudah didaftar, termasuk Transfer In penerima;
   - hapus transaksi yang sama dari `stock_transfers`;
   - hapus `task_completions` dengan source `AUTO_UPLOADS` saja;
   - pertahankan seluruh baris dengan `source_file = 'SHOWCASE_LOG'` dan `task_completions` dengan source `SHOWCASE_LOG`.
6. Kosongkan ringkasan `stock_balances`, lalu tandai semua outlet/lokasi agar saldo dibangun kembali dari ledger aktual.
7. Bersihkan cache aplikasi dan aktifkan kembali trigger `refreshDirtyStockBalances`.
8. Periksa Showcase Log masih tampil, lalu upload ulang secara kronologis: Good Receipt, Usage Penjualan, kemudian Good Delivery.
9. Untuk Good Delivery, lakukan kembali proses penerimaan di outlet tujuan.

Peringatan penting:

- Reset Good Delivery penuh ikut menghapus status penerimaan, waktu terima, waktu masuk storage, suhu per item, dan foto tanda terima karena semuanya berada pada record transfer yang sama.
- Selama data sumber belum selesai di-upload ulang, saldo Store dapat sementara minus atau tidak seimbang terhadap Showcase. Hal ini normal selama urutan reupload belum lengkap.
- Jangan menjalankan penghapusan tanpa snapshot dan hasil preview jumlah baris per jenis transaksi serta outlet.
- Gunakan query `RESET-UPLOAD-DATA.sql`. Nilai awal `execute_reset` adalah `FALSE`, sehingga query hanya menampilkan preview. Ubah menjadi `TRUE` hanya setelah hasil preview diperiksa.
