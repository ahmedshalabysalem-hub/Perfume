# Stops the Perfume development server and, when the database runs in Docker, the database
# container (data is kept). A PostgreSQL installed on Windows keeps running as a service.

. (Join-Path $PSScriptRoot "common.ps1")

Say "Perfume site - stopping"

$targets = @()
$targets += Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Root\node_modules\next*" } |
  Select-Object -ExpandProperty ProcessId
$targets += Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess
$targets = $targets | Where-Object { $_ -and $_ -ne 0 } | Sort-Object -Unique

if ($targets) {
  foreach ($id in $targets) { taskkill.exe /PID $id /T /F *> $null }
  Say "Site stopped."
} else {
  Say "The site was not running."
}

$mode = Get-DbMode
if ($mode -eq "docker" -and (Test-DockerEngine)) {
  docker compose stop
  Say "Database container stopped (your data is kept)."
} elseif ($mode -eq "native") {
  Say "PostgreSQL keeps running as a Windows service; nothing to stop."
}
