param(
  [switch]$SkipGoogleLogin
)

$ErrorActionPreference = 'Stop'
$repository = 'operationalbi-pixel/form'
$defaultDeploymentId = 'AKfycbw2_tBBWOn9Ld6QcCJBorJyZ06Lh1ZB_gEnIEqc76N7D2WWOv3trlGVqtIAqYml060_'

function Test-NpxCandidate([string]$NpxPath) {
  if (-not (Test-Path -LiteralPath $NpxPath)) { return $false }
  $nodePath = Join-Path (Split-Path -Parent $NpxPath) 'node.exe'
  if (-not (Test-Path -LiteralPath $nodePath)) { return $false }
  try {
    $nodeVersion = (& $nodePath --version 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { return $false }
    if ([int]$Matches[1] -lt 22) { return $false }
    & $NpxPath --version *> $null
    return $LASTEXITCODE -eq 0
  } catch { return $false }
}

function Find-Npx {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'BI-Space-Tools\node-v22.22.0-win-x64\npx.cmd'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\npx.cmd'),
    (Join-Path $env:ProgramFiles 'nodejs\npx.cmd'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\npx.cmd')
  )
  foreach ($candidate in $candidates) {
    if (Test-NpxCandidate $candidate) { return $candidate }
  }
  throw 'Node.js 22 belum tersedia. Jalankan setup-gas-auto-deploy.ps1 -CheckNodeOnly terlebih dahulu.'
}

if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI belum tersedia.'
}

gh auth status
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI belum login. Jalankan: gh auth login -h github.com'
}

$scriptId = Read-Host 'Masukkan Script ID project Apps Script utama (Project Settings > Script ID)'
if ([string]::IsNullOrWhiteSpace($scriptId)) { throw 'Script ID wajib diisi.' }

$deploymentId = Read-Host "Masukkan Deployment ID, atau Enter untuk memakai $defaultDeploymentId"
if ([string]::IsNullOrWhiteSpace($deploymentId)) { $deploymentId = $defaultDeploymentId }

$npx = Find-Npx
$nodeDirectory = Split-Path -Parent $npx
$env:PATH = "$nodeDirectory;$env:PATH"
$claspCredentials = Join-Path $env:USERPROFILE '.clasprc.json'

& $npx --yes '@google/clasp@3.1.3' --version
if ($LASTEXITCODE -ne 0) { throw 'clasp gagal disiapkan.' }

if (-not $SkipGoogleLogin -or -not (Test-Path -LiteralPath $claspCredentials)) {
  Write-Host 'Login Google untuk project GAS utama. Ikuti URL dan instruksi yang tampil.' -ForegroundColor Cyan
  & $npx --yes '@google/clasp@3.1.3' login --no-localhost
  if ($LASTEXITCODE -ne 0) { throw 'Login clasp gagal.' }
}
if (-not (Test-Path -LiteralPath $claspCredentials)) {
  throw "Credential clasp tidak ditemukan di $claspCredentials"
}

$clasprcJson = Get-Content -LiteralPath $claspCredentials -Raw
$claspJson = @{ scriptId = $scriptId.Trim() } | ConvertTo-Json -Compress

Write-Host 'Menyimpan GitHub Secrets untuk GAS utama...' -ForegroundColor Cyan
$clasprcJson | gh secret set MAIN_GAS_CLASPRC_JSON --repo $repository
if ($LASTEXITCODE -ne 0) { throw 'Gagal menyimpan MAIN_GAS_CLASPRC_JSON.' }
$claspJson | gh secret set MAIN_GAS_CLASP_JSON --repo $repository
if ($LASTEXITCODE -ne 0) { throw 'Gagal menyimpan MAIN_GAS_CLASP_JSON.' }
$deploymentId.Trim() | gh secret set MAIN_GAS_DEPLOYMENT_ID --repo $repository
if ($LASTEXITCODE -ne 0) { throw 'Gagal menyimpan MAIN_GAS_DEPLOYMENT_ID.' }

Write-Host ''
Write-Host 'Setup GAS utama berhasil.' -ForegroundColor Green
Write-Host 'Sesudah PR di-merge, buka Actions > Deploy Main GAS > Run workflow satu kali.'
Write-Host 'Perubahan Code.gs berikutnya akan diterbitkan otomatis dari branch main.'
