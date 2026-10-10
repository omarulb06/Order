# =====================================================================
# release-apk.ps1
#
# One-shot APK builder for the Order app.
#
#   .\scripts\release-apk.ps1                 # preview profile (default)
#   .\scripts\release-apk.ps1 -Profile production
#   .\scripts\release-apk.ps1 -SkipDownload   # just kick off the build
#
# What it does:
#   1. Verifies eas-cli is installed
#   2. Verifies you are logged into EAS (prompts to log in if not)
#   3. Verifies the project has an EAS projectId (runs `eas init` if not)
#   4. Kicks off the Android build on the EAS cloud (non-interactive)
#   5. Waits for completion
#   6. Downloads the resulting APK into C:\Order\releases\
# =====================================================================

param(
    [ValidateSet("preview", "production", "development")]
    [string]$Profile = "preview",

    [switch]$SkipDownload
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$ReleasesDir = Join-Path $ProjectRoot "releases"
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Path $ReleasesDir | Out-Null
}

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------
# 1. eas-cli present?
# ---------------------------------------------------------------------
Write-Step "1/6  Checking eas-cli"
$easCmd = Get-Command eas -ErrorAction SilentlyContinue
if (-not $easCmd) {
    Write-Host "   eas not found. Installing globally..." -ForegroundColor Yellow
    npm install -g --allow-scripts=protobufjs eas-cli | Out-Host
}
eas --version | Out-Host

# ---------------------------------------------------------------------
# 2. Logged in?
# ---------------------------------------------------------------------
Write-Step "2/6  Checking EAS login"
$whoami = (eas whoami 2>&1) | Out-String
if ($whoami -match "Not logged in" -or $LASTEXITCODE -ne 0) {
    Write-Host "   You are not logged in to EAS." -ForegroundColor Yellow
    Write-Host "   Launching interactive login — enter your expo.dev credentials below."
    Write-Host "   (Don't have an account yet? Create one at https://expo.dev/signup first.)"
    Write-Host ""
    eas login | Out-Host
    $whoami = (eas whoami 2>&1) | Out-String
}
Write-Host "   Logged in as: $($whoami.Trim())" -ForegroundColor Green

# ---------------------------------------------------------------------
# 3. Project linked to EAS?
# ---------------------------------------------------------------------
Write-Step "3/6  Checking EAS project id"
$appJson = Get-Content "$ProjectRoot\app.json" -Raw | ConvertFrom-Json
$projectId = $appJson.expo.extra.eas.projectId 2>$null
if (-not $projectId -or $projectId -eq "REPLACE_WITH_EAS_PROJECT_ID") {
    Write-Host "   No projectId found. Running 'eas init' to create one..." -ForegroundColor Yellow
    eas init --non-interactive --force | Out-Host
} else {
    Write-Host "   projectId already set: $projectId" -ForegroundColor Green
}

# ---------------------------------------------------------------------
# 4. Kick off the build
# ---------------------------------------------------------------------
Write-Step "4/6  Starting '$Profile' Android build on EAS cloud"
Write-Host "   (This will take 10-20 minutes. Streaming output below...)"
Write-Host ""

$buildArgs = @(
    "build",
    "--platform", "android",
    "--profile", $Profile,
    "--non-interactive",
    "--no-wait"
)
$buildOutput = (& eas @buildArgs 2>&1) | Out-String
Write-Host $buildOutput

# Extract build id from the output
if ($buildOutput -notmatch "Build details:\s*https://expo\.dev/accounts/[^/]+/projects/[^/]+/builds/([a-f0-9\-]+)") {
    Write-Host "Could not parse build id from eas output. Falling back to 'eas build:list'." -ForegroundColor Yellow
    $latest = (eas build:list --platform android --limit 1 --json --non-interactive 2>$null) | ConvertFrom-Json
    $buildId = $latest[0].id
} else {
    $buildId = $Matches[1]
}
Write-Host "   Build id: $buildId" -ForegroundColor Green

# ---------------------------------------------------------------------
# 5. Wait for completion
# ---------------------------------------------------------------------
Write-Step "5/6  Waiting for build to finish"
Write-Host "   (You can also watch at: https://expo.dev/accounts/<you>/projects/order/builds/$buildId)"
Write-Host ""

$apkUrl = $null
while ($true) {
    Start-Sleep -Seconds 30
    $buildJson = (eas build:view $buildId --json --non-interactive 2>$null) | ConvertFrom-Json
    $status = $buildJson.status
    $createdAt = $buildJson.createdAt
    $elapsed = ((Get-Date) - [datetime]$createdAt).ToString("mm\:ss")
    Write-Host "   [$elapsed] status = $status"

    if ($status -eq "FINISHED") {
        $apkUrl = $buildJson.artifacts.buildUrl
        Write-Host "   Build finished successfully." -ForegroundColor Green
        break
    } elseif ($status -in @("ERRORED", "CANCELED")) {
        Write-Host "   Build $status. See the EAS dashboard for logs." -ForegroundColor Red
        exit 1
    }
}

# ---------------------------------------------------------------------
# 6. Download APK into releases/
# ---------------------------------------------------------------------
if ($SkipDownload) {
    Write-Step "6/6  Skipped download (SkipDownload flag set)"
    Write-Host "   APK URL: $apkUrl"
    exit 0
}

Write-Step "6/6  Downloading APK into $ReleasesDir"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$filename  = "order-$Profile-$timestamp.apk"
$outPath   = Join-Path $ReleasesDir $filename

Write-Host "   Downloading from: $apkUrl"
Invoke-WebRequest -Uri $apkUrl -OutFile $outPath -UseBasicParsing
$sizeMb = [math]::Round((Get-Item $outPath).Length / 1MB, 1)

Write-Host ""
Write-Host "==> Done!" -ForegroundColor Green
Write-Host "    File: $outPath"
Write-Host "    Size: $sizeMb MB"
Write-Host ""
Write-Host "    Transfer to your phone (USB / Drive / WhatsApp), tap it,"
Write-Host "    allow 'Install from unknown sources', then Install."
