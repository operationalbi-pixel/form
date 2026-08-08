-- Reset Upload Penjualan, Good Receipt, dan Good Delivery.
-- Showcase Log, transaksi manual, Stock Position, dan master data tidak dihapus.
--
-- CARA PAKAI:
-- 1. Jalankan dengan execute_reset = FALSE untuk melihat preview.
-- 2. Periksa jumlah baris yang akan dihapus dan jumlah Showcase Log yang dilindungi.
-- 3. Hentikan sementara aktivitas upload/penerimaan seluruh outlet.
-- 4. Ubah execute_reset menjadi TRUE, lalu jalankan satu kali.
-- 5. Jangan menjalankan ulang sebelum memeriksa hasil.

DECLARE execute_reset BOOL DEFAULT FALSE;
DECLARE snapshot_suffix STRING DEFAULT FORMAT_TIMESTAMP('%Y%m%d_%H%M%S', CURRENT_TIMESTAMP(), 'Asia/Jakarta');

CREATE TEMP TABLE reset_gd_transfer_ids AS
SELECT DISTINCT transfer_id
FROM `berita-acara-digital.bakerzin_internal.stock_card`
WHERE movement_type = 'Transfer Out Antar Outlet'
  AND NULLIF(TRIM(source_file), '') IS NOT NULL
  AND UPPER(TRIM(source_file)) != 'SHOWCASE_LOG'
  AND NULLIF(TRIM(transfer_id), '') IS NOT NULL;

-- Preview ini selalu ditampilkan, baik execute_reset FALSE maupun TRUE.
SELECT reset_group, row_count
FROM (
  SELECT '1. Upload Penjualan + WIP otomatis' AS reset_group, COUNT(*) AS row_count
  FROM `berita-acara-digital.bakerzin_internal.stock_card`
  WHERE NULLIF(TRIM(source_file), '') IS NOT NULL
    AND UPPER(TRIM(source_file)) != 'SHOWCASE_LOG'
    AND (
      movement_type = 'Terjual'
      OR (movement_type IN ('Production', 'WIP Material Usage') AND NOT STARTS_WITH(source_file, 'WIP_PRODUCTION|'))
    )

  UNION ALL

  SELECT '2. Good Receipt', COUNT(*)
  FROM `berita-acara-digital.bakerzin_internal.stock_card`
  WHERE NULLIF(TRIM(source_file), '') IS NOT NULL
    AND UPPER(TRIM(source_file)) != 'SHOWCASE_LOG'
    AND movement_type = 'Goods Receipt'

  UNION ALL

  SELECT '3. Good Delivery - stock_card', COUNT(*)
  FROM `berita-acara-digital.bakerzin_internal.stock_card`
  WHERE transfer_id IN (SELECT transfer_id FROM reset_gd_transfer_ids)
     OR (
       movement_type = 'Transfer Out Antar Outlet'
       AND NULLIF(TRIM(source_file), '') IS NOT NULL
       AND UPPER(TRIM(source_file)) != 'SHOWCASE_LOG'
     )

  UNION ALL

  SELECT '4. Good Delivery - stock_transfers', COUNT(*)
  FROM `berita-acara-digital.bakerzin_internal.stock_transfers`
  WHERE transfer_id IN (SELECT transfer_id FROM reset_gd_transfer_ids)

  UNION ALL

  SELECT '5. Progress AUTO_UPLOADS', COUNT(*)
  FROM `berita-acara-digital.bakerzin_internal.task_completions`
  WHERE UPPER(TRIM(source)) = 'AUTO_UPLOADS'

  UNION ALL

  SELECT 'DILINDUNGI - Showcase Log stock_card', COUNT(*)
  FROM `berita-acara-digital.bakerzin_internal.stock_card`
  WHERE UPPER(TRIM(source_file)) = 'SHOWCASE_LOG'

  UNION ALL

  SELECT 'DILINDUNGI - Showcase Log progress', COUNT(*)
  FROM `berita-acara-digital.bakerzin_internal.task_completions`
  WHERE UPPER(TRIM(source)) = 'SHOWCASE_LOG'
)
ORDER BY reset_group;

IF execute_reset THEN
  -- Snapshot otomatis berlaku 30 hari dan dapat digunakan untuk pemulihan.
  EXECUTE IMMEDIATE FORMAT("""
    CREATE SNAPSHOT TABLE `berita-acara-digital.bakerzin_internal.stock_card_before_upload_reset_%s`
    CLONE `berita-acara-digital.bakerzin_internal.stock_card`
    OPTIONS(expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
  """, snapshot_suffix);

  EXECUTE IMMEDIATE FORMAT("""
    CREATE SNAPSHOT TABLE `berita-acara-digital.bakerzin_internal.stock_transfers_before_upload_reset_%s`
    CLONE `berita-acara-digital.bakerzin_internal.stock_transfers`
    OPTIONS(expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
  """, snapshot_suffix);

  EXECUTE IMMEDIATE FORMAT("""
    CREATE SNAPSHOT TABLE `berita-acara-digital.bakerzin_internal.task_completions_before_upload_reset_%s`
    CLONE `berita-acara-digital.bakerzin_internal.task_completions`
    OPTIONS(expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
  """, snapshot_suffix);

  EXECUTE IMMEDIATE FORMAT("""
    CREATE SNAPSHOT TABLE `berita-acara-digital.bakerzin_internal.stock_balances_before_upload_reset_%s`
    CLONE `berita-acara-digital.bakerzin_internal.stock_balances`
    OPTIONS(expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
  """, snapshot_suffix);

  BEGIN TRANSACTION;

  -- Hapus semua event transfer yang berasal dari upload Good Delivery,
  -- termasuk status PENDING/ACCEPTED/REJECTED, suhu, waktu, dan foto.
  DELETE FROM `berita-acara-digital.bakerzin_internal.stock_transfers`
  WHERE transfer_id IN (SELECT transfer_id FROM reset_gd_transfer_ids);

  -- Hapus outbound dan inbound Stock Card yang terkait Good Delivery.
  DELETE FROM `berita-acara-digital.bakerzin_internal.stock_card`
  WHERE transfer_id IN (SELECT transfer_id FROM reset_gd_transfer_ids)
     OR (
       movement_type = 'Transfer Out Antar Outlet'
       AND NULLIF(TRIM(source_file), '') IS NOT NULL
       AND UPPER(TRIM(source_file)) != 'SHOWCASE_LOG'
     );

  -- Hapus Upload Penjualan, produksi WIP otomatis, dan Good Receipt.
  DELETE FROM `berita-acara-digital.bakerzin_internal.stock_card`
  WHERE NULLIF(TRIM(source_file), '') IS NOT NULL
    AND UPPER(TRIM(source_file)) != 'SHOWCASE_LOG'
    AND (
      movement_type IN ('Terjual', 'Goods Receipt')
      OR (movement_type IN ('Production', 'WIP Material Usage') AND NOT STARTS_WITH(source_file, 'WIP_PRODUCTION|'))
    );

  -- Hapus progress upload otomatis, tetapi pertahankan Showcase Log.
  DELETE FROM `berita-acara-digital.bakerzin_internal.task_completions`
  WHERE UPPER(TRIM(source)) = 'AUTO_UPLOADS';

  -- Bangun ulang seluruh ringkasan saldo dari ledger yang masih tersisa.
  DELETE FROM `berita-acara-digital.bakerzin_internal.stock_balances` WHERE TRUE;

  INSERT INTO `berita-acara-digital.bakerzin_internal.stock_balances`
    (outlet, location, item_code, item_name, current_qty, updated_at)
  WITH latest AS (
    SELECT *
    FROM `berita-acara-digital.bakerzin_internal.stock_card`
    WHERE record_type = 'MOVEMENT'
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(logical_id, ''), record_id)
      ORDER BY COALESCE(version, 1) DESC, created_at DESC
    ) = 1
  )
  SELECT
    outlet,
    location,
    item_code,
    item_name,
    SUM(CASE WHEN direction = 'IN' THEN qty WHEN direction = 'OUT' THEN -qty ELSE 0 END),
    CURRENT_TIMESTAMP()
  FROM latest
  GROUP BY outlet, location, item_code, item_name;

  COMMIT TRANSACTION;

  SELECT
    'RESET SELESAI' AS status,
    snapshot_suffix AS snapshot_suffix,
    (SELECT COUNT(*) FROM `berita-acara-digital.bakerzin_internal.stock_card`
      WHERE UPPER(TRIM(source_file)) = 'SHOWCASE_LOG') AS showcase_rows_preserved,
    (SELECT COUNT(*) FROM `berita-acara-digital.bakerzin_internal.task_completions`
      WHERE UPPER(TRIM(source)) = 'SHOWCASE_LOG') AS showcase_progress_preserved;
ELSE
  SELECT 'PREVIEW SAJA - tidak ada data yang dihapus' AS status;
END IF;
