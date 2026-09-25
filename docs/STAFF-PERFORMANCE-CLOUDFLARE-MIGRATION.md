# Migrasi Staff Performance ke Cloudflare

Runtime halaman `staff-performance.html` hanya membaca dan menulis Cloudflare D1 melalui Bakerzin Workspace. BigQuery `berita-acara-digital.staff_performance_db.Data_Performance` hanya digunakan sebagai sumber migrasi satu kali.

## Persiapan

1. Terapkan migrasi D1 `cloudflare/migrations/0004_staff_performance.sql` ke database `bakerzin-inventory-operations`.
2. Deploy Worker `cloudflare/inventory-api`.
3. Buka project Apps Script Staff Performance lama (project yang memiliki sheet `Data_Staff` dan `Config_Indicators`).
4. Tambahkan isi `gas/StaffPerformanceCloudflareMigration.gs` sebagai file script baru.
5. Aktifkan Advanced Google Service **BigQuery API**.
6. Di **Project Settings → Script Properties**, isi `CLOUDFLARE_INVENTORY_API_KEY` dengan secret API Worker yang sama. Jangan menaruh key di HTML.

## Menjalankan migrasi

Jalankan fungsi berikut dari editor Apps Script:

```text
startStaffPerformanceCloudflareMigration
```

Skrip memindahkan master outlet, staff, indikator, lalu skor secara bertahap. Jika waktu eksekusi hampir habis, proses dilanjutkan otomatis oleh time trigger.

## Mengecek progres

Jalankan:

```text
checkStaffPerformanceCloudflareMigrationProgress
```

Hasil dan log menampilkan `status`, persentase, jumlah baris yang sudah diproses, jumlah total baris, checkpoint, dan hitungan aktual pada D1. Status akhir yang diharapkan adalah `COMPLETED` dan `progressPercent: 100`.

Jika proses berhenti karena gangguan sementara, jalankan:

```text
retryStaffPerformanceCloudflareMigration
```

Migrasi aman dijalankan ulang: setiap batch memiliki ID tetap dan setiap nilai memakai upsert unik berdasarkan tanggal, NIK, dan indikator.

## Cutover aplikasi

Setelah migrasi selesai, deploy `docs/Code.gs` ke backend Bakerzin Workspace dan publish folder `docs`. Menu **Staff Performance** otomatis ditambahkan ke daftar tugas Workspace. Tidak ada login outlet kedua dan tidak ada fallback runtime ke BigQuery.
