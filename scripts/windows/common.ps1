# Shared helpers for start.ps1 and stop.ps1 (Windows PowerShell 5.1+).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI.

$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

function Say([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Warn([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }
function Fail([string]$Text) {
  Write-Host ""
  Write-Host "ERROR: $Text" -ForegroundColor Red
  exit 1
}

function Test-Command([string]$Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Test-DockerEngine {
  if (-not (Test-Command "docker")) { return $false }
  docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

function Test-ComposeContainer {
  docker compose ps -a -q 2> $null | Where-Object { $_ } | Select-Object -First 1
}

function Get-PostgresService {
  Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
}

# Which database the site uses: "docker" (docker-compose.yml) or "native" (PostgreSQL installed
# on Windows). PERFUME_DB=docker|native overrides the detection.
function Get-DbMode {
  if ($env:PERFUME_DB -in @("docker", "native")) { return $env:PERFUME_DB }
  if ((Test-DockerEngine) -and (Test-ComposeContainer)) { return "docker" }
  if (Get-PostgresService) { return "native" }
  if (Test-Command "docker") { return "docker" }
  return $null
}

function Test-Port([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect("127.0.0.1", $Port); return $true } catch { return $false } finally { $client.Close() }
}

function Test-SiteUp {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3
    return ($response.StatusCode -eq 200)
  } catch { return $false }
}
