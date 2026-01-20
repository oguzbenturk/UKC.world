# sync-uploads-to-production.ps1
# Syncs locally uploaded files to production server

param(
    [string]$ServerHost = "",
    [string]$ServerUser = "",
    [string]$ServerPath = "/var/www/plannivo/backend/uploads"
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Upload Sync to Production" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if parameters are provided
if ([string]::IsNullOrEmpty($ServerHost) -or [string]::IsNullOrEmpty($ServerUser)) {
    Write-Host "ERROR: Server details required!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\sync-uploads-to-production.ps1 -ServerHost 'your-server.com' -ServerUser 'username'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or edit the script to set default values for ServerHost and ServerUser" -ForegroundColor Yellow
    exit 1
}

# Check if uploads directory exists
$uploadsPath = ".\backend\uploads"
if (-not (Test-Path $uploadsPath)) {
    Write-Host "ERROR: Uploads directory not found: $uploadsPath" -ForegroundColor Red
    exit 1
}

Write-Host "Source: $uploadsPath" -ForegroundColor Green
Write-Host "Target: ${ServerUser}@${ServerHost}:${ServerPath}" -ForegroundColor Green
Write-Host ""

# Check if scp is available
try {
    $scpCheck = Get-Command scp -ErrorAction Stop
    Write-Host "✓ SCP found" -ForegroundColor Green
} catch {
    Write-Host "ERROR: SCP not found. Please install OpenSSH or use Git Bash" -ForegroundColor Red
    Write-Host "Windows 10/11: Settings > Apps > Optional Features > Add OpenSSH Client" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Syncing files..." -ForegroundColor Cyan

# Use SCP to copy files recursively
$scpCommand = "scp -r `"$uploadsPath\*`" ${ServerUser}@${ServerHost}:${ServerPath}/"

Write-Host "Running: $scpCommand" -ForegroundColor Gray
Invoke-Expression $scpCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Files synced successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "✗ Sync failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
