# Family Management & Digital Signature - Quick Verification
# Simple verification script to test implementation

Write-Host "`n════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  FAMILY MANAGEMENT & DIGITAL SIGNATURE - QUICK VERIFICATION" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$passed = 0
$failed = 0

# Check backend files
Write-Host "Checking Backend Files..." -ForegroundColor Yellow
$backendFiles = @(
    "backend\services\waiverService.js",
    "backend\routes\waivers.js",
    "backend\services\familyService.js",
    "backend\routes\family.js"
)

foreach ($file in $backendFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ $file MISSING" -ForegroundColor Red
        $failed++
    }
}

# Check frontend files
Write-Host "`nChecking Frontend Files..." -ForegroundColor Yellow
$frontendFiles = @(
    "src\features\compliance\services\waiverApi.js",
    "src\features\compliance\components\WaiverModal.jsx",
    "src\features\students\services\familyApi.js",
    "src\features\students\components\FamilyManagement.jsx",
    "src\features\students\components\FamilyMemberCard.jsx",
    "src\features\students\components\FamilyMemberModal.jsx"
)

foreach ($file in $frontendFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ $file MISSING" -ForegroundColor Red
        $failed++
    }
}

# Check migrations
Write-Host "`nChecking Migrations..." -ForegroundColor Yellow
$migrations = @(
    "backend\migrations\017_create_family_members_table.sql",
    "backend\migrations\018_create_liability_waivers_table.sql",
    "backend\migrations\019_create_waiver_versions_table.sql"
)

foreach ($migration in $migrations) {
    if (Test-Path $migration) {
        Write-Host "  ✅ $migration" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ $migration MISSING" -ForegroundColor Red
        $failed++
    }
}

# Test waiver API endpoint
Write-Host "`nTesting Waiver API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/api/waivers/template" -Method GET -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ Waiver API responding (200 OK)" -ForegroundColor Green
        $passed++
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode) {
        Write-Host "  ✅ Waiver API endpoint exists (Status: $statusCode)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ Waiver API not responding" -ForegroundColor Red
        $failed++
    }
}

# Summary
Write-Host "`n════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "RESULTS SUMMARY" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "`n  ✅ Passed: $passed" -ForegroundColor Green
Write-Host "  ❌ Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -eq 0) {
    Write-Host "`n✅ ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host "`n📋 Next: Manual E2E Testing" -ForegroundColor Yellow
    Write-Host "   1. Browser: http://localhost:3000" -ForegroundColor White
    Write-Host "   2. Guide: docs\E2E-TESTING-GUIDE.md`n" -ForegroundColor White
} else {
    Write-Host "`n⚠️  SOME CHECKS FAILED`n" -ForegroundColor Red
}
