# Starts the Docker demo (if needed) and opens a free public HTTPS link via a Cloudflare Quick Tunnel.
# Usage (PowerShell, from the project folder):  .\scripts\share-link.ps1
# Keep this window open — closing it ends the link. A new link is generated on every run.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:APP_PORT) { $env:APP_PORT } else { "8080" }
$bin = Join-Path $root ".tools\cloudflared.exe"

Push-Location $root
try {
  Write-Host "Starting the demo containers..." -ForegroundColor Cyan
  docker compose up -d --build
  Write-Host "Waiting for http://localhost:$port ..." -ForegroundColor Cyan
  for ($i = 0; $i -lt 60; $i++) {
    try { if ((Invoke-WebRequest "http://localhost:$port/login" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { break } } catch { Start-Sleep -Seconds 2 }
  }

  if (-not (Test-Path $bin)) {
    Write-Host "Downloading cloudflared (one time)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force (Split-Path $bin) | Out-Null
    Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $bin -UseBasicParsing
  }

  Write-Host "Opening the public link — look for https://<name>.trycloudflare.com below." -ForegroundColor Green
  & $bin tunnel --no-autoupdate --url "http://localhost:$port"
} finally {
  Pop-Location
}
