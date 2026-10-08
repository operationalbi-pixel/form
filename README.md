# Bakerzin Internal Hub — GitHub Pages

Paket ini memindahkan tampilan aplikasi dari Google Apps Script ke GitHub Pages. Login dan Google Sheets dijalankan oleh `Code.gs` sebagai API; transaksi inventory memakai Cloudflare D1 karena GitHub Pages hanya dapat menyajikan file statis dan tidak boleh menyimpan kredensial Google.

## Isi paket

- `docs/index.html` — dashboard dan login.
- `docs/stock-card.html` — halaman Stock Card.
- `docs/showcaselog.html` — form Daily Showcase Log untuk In, Sold, dan Waste.
- `docs/config.js` — alamat API dan alamat GitHub Pages.
- `docs/api-client.js` — jembatan komunikasi aman antara GitHub Pages dan GAS.
- `docs/ui-modern.css` — lapisan desain bersama untuk aksesibilitas dan tampilan responsif.
- `gas/Code.gs` — backend GAS yang sudah memiliki gateway JSON.
- `gas/appsscript.json` — manifest GAS tanpa layanan BigQuery.

## Sumber file dan sinkronisasi

- Folder `docs/` adalah sumber publikasi GitHub Pages.
- `gas/Code.gs` selalu disamakan dengan `docs/Code.gs` agar backend dan frontend memakai kontrak API yang sama.
- Frontend hanya disimpan di `docs/`; tidak ada salinan di root repository.
- Setelah mengubah aplikasi, jalankan `npm run sync` lalu `npm test` sebelum commit.

## 1. Perbarui backend GAS

1. Buka project Google Apps Script lama.
2. Ganti isi file backend dengan isi `gas/Code.gs`.
3. Aktifkan tampilan file manifest, lalu ganti dengan isi `gas/appsscript.json`.
4. Jalankan `authorizeProjectServices` satu kali dari editor dan izinkan akses.
5. Pilih **Deploy → New deployment → Web app**.
6. Pilih **Execute as: Me** dan akses **Anyone**. Login aplikasi sendiri tetap melindungi data melalui token sesi.
7. Salin URL deployment yang berakhiran `/exec`.

Jika organisasi Google Workspace tidak mengizinkan akses **Anyone**, GitHub Pages tidak dapat memanggil GAS secara langsung. Gunakan backend lain yang mendukung autentikasi organisasi atau ubah kebijakan deployment bersama admin Workspace.

## 2. Atur situs

Buka `docs/config.js`, lalu ganti:

```js
API_URL: 'PASTE_GOOGLE_APPS_SCRIPT_EXEC_URL_HERE'
```

dengan URL `/exec` dari langkah pertama. `SITE_BASE_URL` boleh tetap kosong; aplikasi akan memakai alamat folder GitHub Pages secara otomatis.

## 3. Terbitkan di GitHub Pages

1. Buat repository GitHub baru, sebaiknya bersifat private bila akun/organisasi mendukung Pages private.
2. Unggah seluruh paket ke repository. File situs ada di folder `docs`, sedangkan backend tetap terpisah di folder `gas`.
3. Di GitHub, buka **Settings → Pages**.
4. Pilih **Deploy from a branch**, branch `main`, folder `/docs`, lalu simpan.
5. Buka URL Pages yang diberikan GitHub dan lakukan login percobaan.

## Catatan keamanan

- Jangan menaruh password, service-account key, token, atau kredensial Google di repository maupun `config.js`.
- URL API GAS bukan rahasia. Perlindungan data tetap berasal dari login aplikasi, validasi token sesi, pembatasan percobaan login, dan daftar aksi API di `Code.gs`.
- Repository private tidak selalu berarti situs Pages private; periksa paket dan kebijakan GitHub organisasi Anda.
- Setiap kali `Code.gs` berubah, buat deployment/version baru atau perbarui deployment aktif.

### Deployment otomatis GAS utama

Backend `gas/Code.gs` dapat diterbitkan otomatis oleh workflow **Deploy Main GAS**. Setup satu kali dilakukan dengan menjalankan `setup-main-gas-auto-deploy.ps1`, lalu masukkan **Script ID** dari Apps Script utama. Script menyimpan tiga GitHub Secret terpisah (`MAIN_GAS_CLASPRC_JSON`, `MAIN_GAS_CLASP_JSON`, dan `MAIN_GAS_DEPLOYMENT_ID`) agar tidak tertukar dengan project Berita Acara.

Setelah setup selesai, buka **Actions → Deploy Main GAS → Run workflow** satu kali. Perubahan berikutnya pada folder `gas/` akan memperbarui deployment produksi otomatis setelah validasi lulus. Fitur Pesan & Tugas baru dapat memuat grup setelah deployment utama ini memakai `Code.gs` terbaru; sheet `CHAT_ROOMS`, `CHAT_MESSAGES`, `CHAT_READS`, `CHAT_TASKS`, `CHAT_ASSIGNMENTS`, dan `CHAT_ATTACHMENTS` kemudian dibuat otomatis pada database chat.

## Database dan alur Showcase

- Backend otomatis membuat sheet `MENU_SHOWCASE` dengan delapan kolom sumber dan 61 baris dari **Menu Showcase.xlsx**, ditambah kolom I `Kode Item` yang dapat diedit.
- Setiap outlet otomatis memiliki pilihan penyimpanan `Showcase`. Daftar item memakai **Menu** (kolom A) sebagai nama dan **Menu Category Detail** (kolom C) sebagai kategori.
- Transaksi Masuk pada `Showcase` otomatis mencatat pasangan transaksi: Product terkait dipotong dari `Store` berdasarkan kolom D, G, dan H, lalu QTY menu ditambahkan ke `Showcase`.
- Jika unit Product pada database berbeda dari unit master, sistem memakai konversi unit yang telah tersimpan dan meminta konversi bila belum tersedia.
- Upload Usage Penjualan melewati Product yang tercantum pada kolom D agar perpindahan ke showcase tidak kembali dihitung sebagai penjualan bahan.
- Jangan mengubah nama header sheet `MENU_SHOWCASE`. Isi baris boleh dikelola langsung di sheet setelah sheet tersebut terbentuk.
- Daftar pada seluruh storage menempatkan stok minus terbesar paling atas. Item lainnya diurutkan berdasarkan kategori lalu nama A–Z.
- Setiap lot pada balance `Showcase` menampilkan tanggal Masuk Showcase, tanggal Kedatangan Barang asal di `Store`, dan tanggal Expired yang diwariskan dari lot Store. Transaksi lama direkonstruksi dari pasangan transfer Store bila datanya masih tersedia.
- Informasi riwayat Stock Card disederhanakan menjadi `Stock In`, `Arrival`, dan `Exp`; catatan teknis lain tidak ditampilkan agar tabel lebih ringkas.
- Input transaksi manual menyediakan `Production Date` opsional yang ditampilkan sebagai `Prd` pada riwayat, rincian FIFO, dan export Stock Card. Jika tidak diisi, keterangan `Prd` tidak ditampilkan.
- Header daftar item dan riwayat Stock Card dibekukan saat tabel digulir. Jika tanggal `Stock In` sama dengan `Arrival`, metadata hanya menampilkan `Arrival` dan `Exp` agar tidak berulang.
- Judul kolom dan transaksi Stock Card diringkas menjadi `IN` dan `OUT`. Info transaksi IN tidak lagi mengulang tanggal Stock In; hanya `Arrival` dan `Exp` yang ditampilkan, termasuk pada export.
- Form Daily `Showcase Log` dibuat otomatis dan memakai `showcaselog.html`. Setiap item memiliki Total/Input untuk In, Sold, dan Waste serta Balance terkini. Penyimpanan form langsung menulis ke Stock Card dan Daily selesai otomatis setelah ketiga aktivitas terisi pada tanggal tersebut.
- Rincian FIFO pada Stock Card selalu direkonsiliasi dengan Balance per tanggal. Jika saldo 0 atau minus, lot sisa tidak lagi ditampilkan; jika riwayat awal tidak lengkap, sistem hanya menambahkan selisih yang diperlukan agar total rincian tetap sama dengan Balance.
- Showcase Log memakai header dan navigasi periode yang konsisten dengan Dashboard serta Stock Card, dilengkapi pencarian global kode, kategori, nama, dan unit. Input yang sudah diketik tetap tersimpan saat daftar difilter.
- Pada ponsel, daftar Showcase Log tetap berupa tabel horizontal yang padat dan dapat digeser kanan-kiri. Header tabel serta kolom Item Showcase dibekukan, sedangkan kontrol tanggal dan Simpan sejajar, sama tinggi, serta tetap terlihat ketika halaman digulir.
- Pencarian ikut dibekukan di bawah kontrol tanggal, header bertingkat memakai latar solid tanpa celah, dan warna In/Sold/Waste/Balance dibedakan. Balance menampilkan kalkulasi sementara secara langsung sebelum data disimpan.
- Ikon informasi `i` abu-abu tersedia pada setiap transaksi Stock Card dan Total In/Sold/Waste Showcase Log. Tooltip hanya menampilkan nama pelaku transaksi tanpa NIK.
- Info transaksi IN menampilkan referensi ringkas `Supplier - No PO` sebelum Arrival dan Exp. Transfer OUT menampilkan `Transfer To [Outlet] [No Transfer]`, sedangkan tooltip ikon `i` menampilkan nama pelaku beserta sumber `Generated By Upload` atau `Manual Input`.
- Transfer IN antar-outlet menampilkan `Transfer From [Outlet] [No Transfer]`; nomor transfer yang sama dipakai pada sisi OUT dan IN.
- Menambahkan fondasi `cloud-run/` untuk API baca Stock Card berlatensi rendah. Tahap awal hanya menyediakan health check dan belum membuka data Stock Card.
- Cloud Run menyediakan endpoint riwayat yang dilindungi kunci internal, memakai Firestore selama dua menit, dan membaca saldo dan riwayat dari Cloudflare ketika cache belum tersedia.
- GAS dan Cloud Run memakai Cloudflare untuk semua pembacaan inventory, termasuk FIFO Store untuk Showcase. Tidak tersedia fallback BigQuery. Cache dihapus setelah mutasi.
- Menu Daily, Weekly, Monthly, dan Yearly terbuka sebagai daftar vertikal ringkas tepat di bawah tombol periode setelah diklik.

## Uji cepat

1. Buka URL `/exec` di browser; halaman backend lama akan muncul jika file HTML lama masih ada di project GAS.
2. Buka GitHub Pages dan pastikan berita publik tampil.
3. Uji login, buka Stock Card, tambah transaksi percobaan, lalu verifikasi Sheets/Cloudflare.
4. Uji logout dan muat ulang halaman untuk memastikan sesi telah dibersihkan.
5. Periksa dashboard dan Stock Card pada lebar desktop, tablet, serta ponsel.

Jika halaman terus menampilkan spinner, pastikan deployment GAS sudah memakai
`gas/Code.gs` versi terbaru. Respons HtmlService harus mengirim hasil dengan
`top.postMessage`, karena Google membungkus output GAS dalam iframe internal.

## Background seluruh upload Stock Card

Goods Delivery, Goods Receipt, Item Journal, Stock Opname, batch Goods BIHQ, template Produksi WIP, dan Repair Upload Lama dikirim melalui `queueGoodsUpload`. Usage Penjualan (termasuk batch BIHQ), Stock Posisi, dan pelengkapan Expired Date memakai antrean background masing-masing, dengan status dalam panel yang sama. Setelah respons **File diterima**, browser boleh berpindah menu atau ditutup. File sumber, pilihan konversi/duplikat, dan rencana transaksi disimpan di Drive; metadata pekerjaan `queueGoodsUpload` dan Showcase disimpan di Cloudflare D1; worker khusus Usage, Stock Posisi, dan Expired Date mempertahankan metadata Script Properties. Token login tidak disimpan di pekerjaan. Worker memeriksa status karyawan dan akses outlet saat memproses.

Tombol **Status Upload** menampilkan semua jenis pekerjaan milik akun yang sedang login. Benturan kunci penyimpanan tetap berstatus Diproses dan tidak menghabiskan batas percobaan ulang; Stock Posisi untuk outlet/lokasi yang sama diproses menurut urutan penerimaan. Kesalahan file atau akses tetap membutuhkan perbaikan pengguna. Statusnya Diproses, Memeriksa, Diproses, Selesai, Perlu Tindakan, atau Gagal. Panel memperbarui status setiap 15 detik ketika terbuka. **Tinjau** membuka kembali file yang membutuhkan keputusan konversi atau duplikat; **Coba Lagi** melanjutkan rencana transaksi yang sama. Repair tetap memerlukan konfirmasi preview; apabila transaksi berubah selama pemrosesan, pekerjaan meminta verifikasi ulang. Input dan edit Produksi WIP manual tetap menggunakan proses langsung. Persentase penyimpanan dihitung dari baris yang sudah dikonfirmasi server, bukan estimasi waktu.

Worker `processGoodsUploadJobs` berjalan melalui trigger satu kali dan dipulihkan oleh maintenance lima menit `refreshDirtyStockBalances`. Antrean memasang maintenance sebelum mengonfirmasi penerimaan. Jadwal GAS dapat terlambat; penerimaan file tidak berarti stok sudah tersimpan. Selesai ditampilkan hanya setelah seluruh movement dan event transfer dikonfirmasi. Rencana transaksi dipersistenkan sebelum penulisan, sehingga pemulihan memakai record/event ID yang sama dan endpoint Cloudflare yang idempoten.

Deploy Main GAS dan GitHub Pages bersama, termasuk `docs/stock-upload-jobs.js`. Tidak diperlukan database atau kredensial baru; akses Drive dan izin trigger memakai layanan GAS yang sudah digunakan antrean Stock Posisi. Riwayat pekerjaan disimpan tujuh hari; file sementara dibuang setelah pekerjaan selesai atau retensi habis. Uji produksi dengan report kecil, tutup halaman setelah File diterima, lalu buka Status Upload kembali dan cocokkan Stock Card serta transfer penerima.

## Cloudflare-only dan Status Simpan Showcase

Semua akses service BigQuery dinonaktifkan, termasuk utilitas migrasi lama, provisioning tabel, penulisan form/completion, ringkasan, audit koreksi, produksi WIP, dan pembaca Cloud Run. Sales Analysis tetap memakai Google Sheets melalui compatibility shim `bq*`; nama fungsi lama tidak menandakan akses BigQuery. Jalur SQL legacy yang sudah pensiun menghasilkan error eksplisit tanpa fallback atau data palsu.

Showcase mengirim JSON ke `queueShowcaseLog`. Request dan rencana lengkap disimpan sebelum stok ditulis. ID transaksi tetap sama setelah timeout/restart. **Status Simpan** menampilkan **Diproses**, **Tersimpan**, atau tindakan yang dibutuhkan. Penerimaan request tidak berarti stok sudah berubah. Input yang belum dikonfirmasi disimpan pada perangkat dengan identitas request yang sama. Refresh penyelesaian mempertahankan draft baru. Progress Daily diselesaikan setelah semua transaksi dikonfirmasi.

Metadata job disimpan pada `application_records` di operations D1 dan tidak memiliki batas 300 job. Replay request yang sudah selesai tetap mengembalikan job lama; pekerjaan gagal atau yang memerlukan koreksi tidak dihapus otomatis. Worker membaca job aktif saja. Riwayat inventory dibaca per halaman tanpa memotong versi koreksi; pemilihan versi terbaru dilakukan sebelum filter tanggal. Kompaksi ringkasan mempertahankan watermark ACK dan pekerjaan yang belum selesai.

### Urutan rollout sebelum merge/deploy GAS

1. Terapkan `cloudflare/migrations/0011_application_records.sql` pada operations D1, kemudian deploy `cloudflare/inventory-api`. Endpoint baru `/v1/application-records` dan `/v1/application-records/compact` harus tersedia sebelum backend GAS diperbarui. `application_records` juga dibuat secara idempoten oleh endpoint sebagai pemulihan schema.
2. Jika ada data form, completion, atau audit yang belum ikut migrasi sebelumnya, impor **ekspor yang sudah tersedia** ke `application_records` dengan nama tabel/record ID yang sesuai. Deploy ini tidak mengunduh ulang data BigQuery dan tidak menganggap histori kosong sebagai data yang sudah dimigrasikan.
3. Pertahankan Script Properties `CLOUDFLARE_INVENTORY_URL`, `CLOUDFLARE_INVENTORY_API_KEY`, dan `INVENTORY_BACKEND=CLOUDFLARE`; deploy `gas/Code.gs` dan manifest terbaru. Hapus trigger migrasi BigQuery lama jika masih terpasang. Nama utilitas impor lama kini berhenti dengan pesan pensiun, tidak mengakses BigQuery.
4. Bila Cloud Run dipakai, deploy versi terbaru dengan `CLOUDFLARE_INVENTORY_API_URL` dan `CLOUDFLARE_INVENTORY_API_KEY`. Cache memakai koleksi baru agar hasil lama tidak digunakan. IAM BigQuery tidak diperlukan.
5. Publikasikan frontend terbaru, lalu uji Simpan Showcase dan Status Simpan pada akun/outlet percobaan. Workflow Main GAS dapat deploy otomatis setelah merge, sehingga Worker harus siap lebih dahulu.

### Password general untuk POV

Password general yang diminta pemilik tersedia sebagai hash bersalt pada backend dan diterima bersama NIK melalui login biasa. Password asli di EMP_LIST tidak ditimpa ketika jalur general digunakan, termasuk akun yang belum membuat password. Status karyawan dan pembatasan login tetap diperiksa. Log mencatat `GENERAL_POV_LOGIN` dengan NIK dan waktu tanpa password.

Script Property `GENERAL_PASSWORD_HASH` dapat mengganti default dengan hasil `hashPassword_(passwordBaru)` atau diisi `DISABLED` untuk menonaktifkan jalur general. Password personal tetap bekerja saat jalur general dinonaktifkan. Jangan menaruh password general dalam frontend atau konfigurasi publik.
