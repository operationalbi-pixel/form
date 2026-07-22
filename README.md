# Bakerzin Internal Hub — GitHub Pages

Paket ini memindahkan tampilan aplikasi dari Google Apps Script ke GitHub Pages. Data, login, Google Sheets, dan BigQuery tetap dijalankan oleh `Code.gs` sebagai API karena GitHub Pages hanya dapat menyajikan file statis dan tidak boleh menyimpan kredensial Google.

## Isi paket

- `docs/index.html` — dashboard dan login.
- `docs/stock-card.html` — halaman Stock Card.
- `docs/config.js` — alamat API dan alamat GitHub Pages.
- `docs/api-client.js` — jembatan komunikasi aman antara GitHub Pages dan GAS.
- `gas/Code.gs` — backend GAS yang sudah memiliki gateway JSON.
- `gas/appsscript.json` — manifest GAS dan layanan BigQuery.

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

## Uji cepat

1. Buka URL `/exec` di browser; halaman backend lama akan muncul jika file HTML lama masih ada di project GAS.
2. Buka GitHub Pages dan pastikan berita publik tampil.
3. Uji login, buka Stock Card, tambah transaksi percobaan, lalu verifikasi Sheets/BigQuery.
4. Uji logout dan muat ulang halaman untuk memastikan sesi telah dibersihkan.

Jika halaman terus menampilkan spinner, pastikan deployment GAS sudah memakai
`gas/Code.gs` versi terbaru. Respons HtmlService harus mengirim hasil dengan
`top.postMessage`, karena Google membungkus output GAS dalam iframe internal.
