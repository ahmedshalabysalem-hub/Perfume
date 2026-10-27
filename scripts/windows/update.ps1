# Updates the Perfume site on Windows: stops it, downloads the latest code (git pull), then starts
# it again. start.ps1 installs changed dependencies, prepares the database client, applies new
# migrations and refreshes the demo data (existing data and passwords are kept).
# Usage: double-click scripts\windows\update.cmd. Local changes are never discarded.

. (Join-Path $PSScriptRoot "common.ps1")

Say "Perfume site - updating"

if (-not (Test-Command "git")) { Fail "Git is not installed. Install it from https://git-scm.com and try again." }

$changes = git status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { Fail "This folder is not a git copy of the project. Download it with git clone first." }
if ($changes) {
  Write-Host ($changes -join "`n")
  Fail "Files of the project were changed on this computer (listed above). Nothing was updated, so your changes are safe. Ask for help before updating."
}

if (Test-SiteUp) {
  Say "Stopping the running site first..."
  & (Join-Path $PSScriptRoot "stop.ps1")
}

$branch = git rev-parse --abbrev-ref HEAD
Say "Downloading the latest code (branch $branch)..."
git pull --ff-only
if ($LASTEXITCODE -ne 0) { Fail "Could not download the update (no internet, or the branch has changes of its own). Nothing was changed." }

$env:PERFUME_RESEED = "1"
& (Join-Path $PSScriptRoot "start.ps1")
exit $LASTEXITCODE
