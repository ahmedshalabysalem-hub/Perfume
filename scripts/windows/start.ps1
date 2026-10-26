# Starts the Perfume site for local development on Windows: database, dependencies, migrations,
# seed (first run only), development server, then opens the browser. Safe to run again.
# Usage: double-click scripts\windows\start.cmd. Set PERFUME_CI=1 to skip the browser.

. (Join-Path $PSScriptRoot "common.ps1")

Say "Perfume site - starting"

if (Test-SiteUp) {
  Say "The site is already running."
  if (-not $env:PERFUME_CI) { Start-Process "http://localhost:3000" }
  exit 0
}

# 1. Tools
if (-not (Test-Command "node")) { Fail "Node.js is not installed. Install Node.js 22 from https://nodejs.org" }
$nodeVersion = (node -v)
if ($nodeVersion -notmatch "^v22\.") { Warn "Node.js $nodeVersion found; this project expects version 22." }

# 2. Configuration (.env). Secrets are written to the file, never printed.
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Say "Created .env from .env.example"
}
$envText = [System.IO.File]::ReadAllText((Join-Path $Root ".env"))
$secretMatch = [regex]::Match($envText, '(?m)^BETTER_AUTH_SECRET=[ \t]*"?([^"\r\n]*)"?[ \t]*(?=\r?$)')
if (-not $secretMatch.Success -or $secretMatch.Groups[1].Value.Length -lt 32) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  $line = 'BETTER_AUTH_SECRET="' + $secret + '"'
  if ($secretMatch.Success) {
    $envText = $envText.Remove($secretMatch.Index, $secretMatch.Length).Insert($secretMatch.Index, $line)
  } else {
    $envText = $envText.TrimEnd() + "`r`n" + $line + "`r`n"
  }
  [System.IO.File]::WriteAllText((Join-Path $Root ".env"), $envText, (New-Object System.Text.UTF8Encoding $false))
  Say "Generated BETTER_AUTH_SECRET in .env"
}

# 3. Database
$mode = Get-DbMode
if (-not $mode) {
  Fail "No database found. Install Docker Desktop, or PostgreSQL 16 for Windows (see the setup guide)."
}
if ($mode -eq "docker") {
  Say "Database: Docker"
  if (-not (Test-DockerEngine)) {
    $desktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $desktop)) { Fail "Docker is not running. Open Docker Desktop and try again." }
    Say "Opening Docker Desktop and waiting for it (up to 3 minutes)..."
    Start-Process $desktop
    $deadline = (Get-Date).AddMinutes(3)
    while (-not (Test-DockerEngine)) {
      if ((Get-Date) -gt $deadline) { Fail "Docker Desktop did not start. Open it, wait for 'Engine running', and try again." }
      Start-Sleep -Seconds 3
    }
  }
  docker compose up -d --wait
  if ($LASTEXITCODE -ne 0) { Fail "Could not start the database container (is port 5432 used by another PostgreSQL?)." }
} else {
  $service = Get-PostgresService
  Say "Database: PostgreSQL installed on Windows ($($service.Name))"
  if ($service -and $service.Status -ne "Running") {
    Say "Starting the PostgreSQL service..."
    Start-Service -Name $service.Name -ErrorAction SilentlyContinue
    $service.Refresh()
    if ($service.Status -ne "Running") {
      Fail "Could not start PostgreSQL. Open 'Services', start '$($service.Name)', then try again (or run start.cmd as administrator)."
    }
  }
}
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Port 5432)) {
  if ((Get-Date) -gt $deadline) { Fail "The database is not answering on port 5432." }
  Start-Sleep -Seconds 2
}

# 4. Dependencies: only when missing or package-lock.json changed (e.g. after git pull).
$installed = Join-Path $Root "node_modules\.package-lock.json"
if (-not (Test-Path $installed) -or ((Get-Item "package-lock.json").LastWriteTime -gt (Get-Item $installed).LastWriteTime)) {
  Say "Installing dependencies (npm ci), this takes a few minutes..."
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { Fail "npm ci failed. Read the messages above." }
}

# A moved project folder leaves old absolute paths in the .next build cache: clear it once.
$nextDir = Join-Path $Root ".next"
$rootMarker = Join-Path $nextDir ".perfume-root"
if ((Test-Path $nextDir) -and (-not (Test-Path $rootMarker) -or (Get-Content $rootMarker -Raw).Trim() -ne $Root)) {
  Say "Clearing the old build cache (.next)..."
  Remove-Item -Recurse -Force $nextDir
}
New-Item -ItemType Directory -Force -Path $nextDir | Out-Null
Set-Content -Path $rootMarker -Value $Root -Encoding utf8

# 5. Migrations (applies only pending ones).
Say "Updating the database tables..."
npm.cmd run db:deploy
if ($LASTEXITCODE -ne 0) {
  if ($mode -eq "native") {
    Fail "Could not reach the database. Check that the 'perfume' user and the 'perfume_dev' database exist (guide step 6) and that DATABASE_URL in .env matches .env.example."
  }
  Fail "Could not update the database. Read the messages above."
}

# 6. Demo data: first run only. The seed keeps existing passwords if it runs again.
$seededMarker = Join-Path $Root "storage\.seeded"
if (-not (Test-Path $seededMarker)) {
  Say "Adding demo data (first run only)..."
  if ([regex]::IsMatch($envText, '(?m)^SEED_ADMIN_PASSWORD=[ \t]*(""|)[ \t]*(?=\r?$)') -and -not $env:SEED_ADMIN_PASSWORD) {
    Warn "SEED_ADMIN_PASSWORD is empty in .env: the demo password is generated and shown ONCE below. Write it down."
  }
  npm.cmd run db:seed
  if ($LASTEXITCODE -ne 0) { Fail "Adding demo data failed. Read the messages above." }
  New-Item -ItemType Directory -Force -Path (Join-Path $Root "storage") | Out-Null
  Set-Content -Path $seededMarker -Value (Get-Date -Format o) -Encoding ascii
}

# 7. Open the browser once the site answers, then run the server in this window.
if (-not $env:PERFUME_CI) {
  $opener = 'for ($i = 0; $i -lt 180; $i++) { try { Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3 | Out-Null; Start-Process "http://localhost:3000"; break } catch { Start-Sleep -Seconds 1 } }'
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($opener))
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @("-NoProfile", "-EncodedCommand", $encoded)
}
Write-Host ""
Say "Starting the site: http://localhost:3000  (login: http://localhost:3000/ar/login)"
Warn "Keep this window open. To stop the site, close this window or run stop.cmd."
Write-Host ""
npm.cmd run dev
