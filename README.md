# Bakerzin Internal Hub — GitHub Pages

Paket ini memindahkan tampilan aplikasi dari Google Apps Script ke GitHub Pages. Data, login, Google Sheets, dan BigQuery tetap dijalankan oleh `Code.gs` sebagai API karena GitHub Pages hanya dapat menyajikan file statis dan tidak boleh menyimpan kredensial Google.

## Isi paket

- `docs/index.html` — dashboard dan login.
- `docs/stock-card.html` — halaman Stock Card.
- `docs/showcaselog.html` — form Daily Showcase Log untuk In, Sold, dan Waste.
- `docs/config.js` — alamat API dan alamat GitHub Pages.
- `docs/api-client.js` — jembatan komunikasi aman antara GitHub Pages dan GAS.
- `docs/ui-modern.css` — lapisan desain bersama untuk aksesibilitas dan tampilan responsif.
- `gas/Code.gs` — backend GAS yang sudah memiliki gateway JSON.
- `gas/appsscript.json` — manifest GAS dan layanan BigQuery.

## Sumber file dan sinkronisasi

- Folder `docs/` adalah sumber publikasi GitHub Pages.
- `gas/Code.gs` selalu disamakan dengan `docs/Code.gs` agar backend dan frontend memakai kontrak API yang sama.
- Salinan frontend di root selalu disamakan dengan versi di `docs/` untuk mencegah salah unggah atau salah deployment.
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
- Menu Daily, Weekly, Monthly, dan Yearly terbuka sebagai daftar vertikal ringkas tepat di bawah tombol periode setelah diklik.

## Uji cepat

1. Buka URL `/exec` di browser; halaman backend lama akan muncul jika file HTML lama masih ada di project GAS.
2. Buka GitHub Pages dan pastikan berita publik tampil.
3. Uji login, buka Stock Card, tambah transaksi percobaan, lalu verifikasi Sheets/BigQuery.
4. Uji logout dan muat ulang halaman untuk memastikan sesi telah dibersihkan.
5. Periksa dashboard dan Stock Card pada lebar desktop, tablet, serta ponsel.

Jika halaman terus menampilkan spinner, pastikan deployment GAS sudah memakai
`gas/Code.gs` versi terbaru. Respons HtmlService harus mengirim hasil dengan
`top.postMessage`, karena Google membungkus output GAS dalam iframe internal.
