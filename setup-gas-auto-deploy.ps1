$ErrorActionPreference = 'Stop'

$repository = 'operationalbi-pixel/form'
$defaultDeploymentId = 'AKfycbxBCTJ4BbHWrcVqXNZmtQEjfV_AFnPy_G7J8tkz88hXGPrpX_l01BNOozI0COQenXDyxg'

function Find-Npx {
  $command = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    "$env:LOCALAPPDATA\Programs\nodejs\npx.cmd",
    "$env:ProgramFiles\nodejs\npx.cmd"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $downloaded = Get-ChildItem -LiteralPath "$env:USERPROFILE\Downloads" -Filter npx.cmd -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($downloaded) { return $downloaded.FullName }

  $nodeVersion = '22.22.0'
  $archiveName = "node-v$nodeVersion-win-x64.zip"
  $expectedSha256 = 'c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a'
  $toolsRoot = Join-Path $env:LOCALAPPDATA 'BI-Space-Tools'
  $archivePath = Join-Path $toolsRoot $archiveName
  $nodeFolder = Join-Path $toolsRoot "node-v$nodeVersion-win-x64"
  $portableNpx = Join-Path $nodeFolder 'npx.cmd'

  if (-not (Test-Path -LiteralPath $portableNpx)) {
    New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
    Write-Host 'Node.js portable belum tersedia. Mengunduh tanpa Administrator...' -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$archiveName" -OutFile $archivePath
    $actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) {
      Remove-Item -LiteralPath $archivePath -Force
      throw 'Hash Node.js portable tidak sesuai. Unduhan dibatalkan.'
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsRoot -Force
    Remove-Item -LiteralPath $archivePath -Force
  }
  if (Test-Path -LiteralPath $portableNpx) { return $portableNpx }
  throw 'Node.js portable gagal disiapkan.'
}

if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI belum tersedia.'
}

gh auth status
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI belum login. Jalankan: gh auth login -h github.com'
}

$scriptId = Read-Host 'Masukkan Script ID project Apps Script Berita Acara'
if ([string]::IsNullOrWhiteSpace($scriptId)) { throw 'Script ID wajib diisi.' }

$deploymentId = Read-Host "Masukkan Deployment ID, atau Enter untuk memakai $defaultDeploymentId"
if ([string]::IsNullOrWhiteSpace($deploymentId)) { $deploymentId = $defaultDeploymentId }

$npx = Find-Npx
$claspCredentials = Join-Path $env:USERPROFILE '.clasprc.json'

Write-Host 'Login Google untuk clasp. Ikuti URL dan instruksi yang tampil.' -ForegroundColor Cyan
& $npx --yes '@google/clasp@3.1.3' login --no-localhost
if ($LASTEXITCODE -ne 0) { throw 'Login clasp gagal.' }
if (-not (Test-Path -LiteralPath $claspCredentials)) {
  throw "Credential clasp tidak ditemukan di $claspCredentials"
}

$clasprcJson = Get-Content -LiteralPath $claspCredentials -Raw
$claspJson = @{ scriptId = $scriptId.Trim() } | ConvertTo-Json -Compress

Write-Host 'Menyimpan GitHub Secrets...' -ForegroundColor Cyan
$clasprcJson | gh secret set CLASPRC_JSON --repo $repository
if ($LASTEXITCODE -ne 0) { throw 'Gagal menyimpan CLASPRC_JSON.' }
$claspJson | gh secret set CLASP_JSON --repo $repository
if ($LASTEXITCODE -ne 0) { throw 'Gagal menyimpan CLASP_JSON.' }
$deploymentId.Trim() | gh secret set GAS_DEPLOYMENT_ID --repo $repository
if ($LASTEXITCODE -ne 0) { throw 'Gagal menyimpan GAS_DEPLOYMENT_ID.' }

Write-Host ''
Write-Host 'Setup otomatis berhasil.' -ForegroundColor Green
Write-Host 'Pastikan Apps Script API aktif di: https://script.google.com/home/usersettings'
Write-Host 'Setelah PR di-merge ke main, workflow Deploy Berita Acara GAS akan berjalan otomatis.'
