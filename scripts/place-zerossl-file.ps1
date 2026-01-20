# Usage: pwsh ./scripts/place-zerossl-file.ps1 -FileName "<NAME>.txt" -Content "<provided text>"
param(
  [Parameter(Mandatory=$true)][string]$FileName,
  [Parameter(Mandatory=$true)][string]$Content
)

$localDir = Join-Path -Path (Resolve-Path ".").Path -ChildPath ".ssl-temp/pki-validation"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$target = Join-Path -Path $localDir -ChildPath $FileName
Set-Content -Path $target -Value $Content -NoNewline
Write-Host "Wrote ZeroSSL validation file: $target"
