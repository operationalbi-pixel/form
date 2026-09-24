*** Begin Patch
*** Update File: scripts/validate.mjs
@@
-  if (!baBackend.includes("BQ_PROJECT_ID = 'berita-acara-digital'")) failures.push('Backend Berita Acara tidak lagi memakai project BigQuery lama');
-  if (!baBackend.includes("BQ_DATASET_ID = 'berita_acara_app'")) failures.push('Backend Berita Acara tidak lagi memakai dataset lama');
-  if (!baBackend.includes("BQ_TABLE_ID   = 'submissions'")) failures.push('Backend Berita Acara tidak lagi memakai tabel submissions');
-  if (!baBackend.includes("action: 'consumeBeritaAcaraHandoff'")) failures.push('Backend Berita Acara belum memvalidasi handoff melalui EMP_LIST BI-Space');
-  if (!baBackend.includes('function requireBaSession_(')) failures.push('Operasi Berita Acara belum dilindungi sesi server-side');
-  if (!baBackend.includes("creatorPosition === 'AREA MANAGER'")) failures.push('Dokumen buatan AREA MANAGER belum auto approve');
-  if (!baBackend.includes("creatorPosition === 'FNB'")) failures.push('Dokumen buatan FNB belum melewati tahap approval FNB otomatis');
-  if (!baBackend.includes('function notifyBiSpaceBaEvent_(')) failures.push('Backend Berita Acara belum mengirim aktivitas ke push BI-Space');
-  if (!baBackend.includes("kind: 'NEW'") || !baBackend.includes("kind: 'UPDATED'") || !baBackend.includes("kind: 'APPROVED'") || !baBackend.includes("kind: 'REJECTED'")) failures.push('Notifikasi Berita Acara belum mencakup baru, revisi, approval, dan penolakan');
+  // Berita Acara production is Cloudflare-only. BigQuery is forbidden here.
+  if (!baBackend.includes('CLOUDFLARE ONLY BACKEND')) failures.push('Backend Berita Acara belum ditandai sebagai Cloudflare-only');
+  if (!baBackend.includes('BA_CLOUDFLARE_DEFAULT_URL') || !baBackend.includes('bakerzin-inventory-api.operational-bi.workers.dev')) failures.push('Backend Berita Acara belum menunjuk Worker Cloudflare production');
+  if (!baBackend.includes('function baCloudflareRequest_(') || !baBackend.includes('function baCloudflareAppend_(')) failures.push('Backend Berita Acara belum memakai helper read/write Cloudflare');
+  if (/\bBigQuery\.|BQ_PROJECT_ID|BQ_DATASET_ID|BQ_TABLE_ID|runBqQuery\s*\(|insertToBq\s*\(|berita-acara-digital|berita_acara_app/.test(baBackend)) failures.push('Backend Berita Acara masih memiliki akses atau fallback BigQuery');
+  if (!/consumeBeritaAcaraHandoff/.test(baBackend)) failures.push('Backend Berita Acara belum memvalidasi handoff melalui EMP_LIST BI-Space');
+  if (!baBackend.includes('function requireBaSession_(')) failures.push('Operasi Berita Acara belum dilindungi sesi server-side');
+  if (!/creatorPosition\s*===\s*['"]AREA MANAGER['"]/.test(baBackend)) failures.push('Dokumen buatan AREA MANAGER belum auto approve');
+  if (!/creatorPosition\s*===\s*['"]FNB['"]/.test(baBackend)) failures.push('Dokumen buatan FNB belum melewati tahap approval FNB otomatis');
+  if (!baBackend.includes('function notifyBiSpaceBaEvent_(')) failures.push('Backend Berita Acara belum mengirim aktivitas ke push BI-Space');
+  for (const kind of ['NEW', 'UPDATED', 'APPROVED', 'REJECTED']) {
+    if (!new RegExp("kind\\s*:\\s*['\\\"]" + kind + "['\\\"]").test(baBackend)) failures.push(`Notifikasi Berita Acara belum mencakup ${kind}`);
+  }
   if (/SpreadsheetApp\.openById|USER_SHEET_NAME|USER_SS_ID/.test(baBackend)) failures.push('Backend Berita Acara masih memakai database login lama');
@@
-  if (!baBackend.includes("throw new Error('Data Berita Acara gagal dimuat: '")) failures.push('Backend Berita Acara masih menyembunyikan error pemuatan sebagai daftar kosong');
+  if (!/Data Berita Acara gagal dimuat(?: dari Cloudflare)?:/.test(baBackend)) failures.push('Backend Berita Acara masih menyembunyikan error pemuatan sebagai daftar kosong');
@@
-  try { JSON.parse(await text('berita-acara-gas/appsscript.json')); }
-  catch (error) { failures.push(`berita-acara-gas/appsscript.json: ${error.message}`); }
+  try {
+    const baManifestText = await text('berita-acara-gas/appsscript.json');
+    const baManifest = JSON.parse(baManifestText);
+    const baScopes = Array.isArray(baManifest.oauthScopes) ? baManifest.oauthScopes : [];
+    const baServices = baManifest.dependencies && Array.isArray(baManifest.dependencies.enabledAdvancedServices)
+      ? baManifest.dependencies.enabledAdvancedServices
+      : [];
+    if (baScopes.some(scope => /bigquery/i.test(String(scope)))) failures.push('Manifest Berita Acara masih meminta OAuth scope BigQuery');
+    if (baServices.some(service => /bigquery/i.test(String(service.serviceId || service.userSymbol || '')))) failures.push('Manifest Berita Acara masih mengaktifkan Advanced Service BigQuery');
+  } catch (error) {
+    failures.push(`berita-acara-gas/appsscript.json: ${error.message}`);
+  }
*** End Patch
