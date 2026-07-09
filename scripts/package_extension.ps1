# Build a browser-downloadable zip of the extension (manifest at zip root).
# Usage: pwsh scripts/package_extension.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ext = Join-Path $root "extension"
$manifest = Get-Content (Join-Path $ext "manifest.json") -Raw | ConvertFrom-Json
$ver = $manifest.version
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Path $dist -Force | Out-Null

$stage = Join-Path $env:TEMP "flow-fixer-ext-$ver"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item -Path (Join-Path $ext "*") -Destination $stage -Recurse

$named = Join-Path $dist "flow-fixer-extension-v$ver.zip"
$latest = Join-Path $dist "flow-fixer-extension.zip"
foreach ($z in @($named, $latest)) {
  if (Test-Path $z) { Remove-Item $z -Force }
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $named -Force
Copy-Item $named $latest -Force
Remove-Item $stage -Recurse -Force

Write-Host "Wrote $named"
Write-Host "Wrote $latest (stable name for release URL)"
Get-Item $named, $latest | Format-Table Name, Length
