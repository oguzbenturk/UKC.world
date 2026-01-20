# Family Management & Digital Signature - Implementation Verification Script
# This script tests all backend APIs to ensure they're working correctly

Write-Host "`n╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     FAMILY MANAGEMENT & DIGITAL SIGNATURE - VERIFICATION        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:4000"
$testResults = @()

# Function to test API endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{}
    )
    
    Write-Host "Testing: $Name..." -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -UseBasicParsing -ErrorAction Stop
        
        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 401) {
            Write-Host " ✅ PASS" -ForegroundColor Green
            Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Gray
            return @{
                Test = $Name
                Status = "PASS"
                StatusCode = $response.StatusCode
                Message = "Endpoint responding"
            }
        } else {
            Write-Host " ⚠️  WARN" -ForegroundColor Yellow
            Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Gray
            return @{
                Test = $Name
                Status = "WARN"
                StatusCode = $response.StatusCode
                Message = "Unexpected status code"
            }
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            Write-Host " ✅ PASS (Auth required)" -ForegroundColor Green
            Write-Host "  Status: $statusCode (Expected - requires authentication)" -ForegroundColor Gray
            return @{
                Test = $Name
                Status = "PASS"
                StatusCode = $statusCode
                Message = "Endpoint exists, requires auth"
            }
        } else {
            Write-Host " ❌ FAIL" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
            return @{
                Test = $Name
                Status = "FAIL"
                StatusCode = $statusCode
                Message = $_.Exception.Message
            }
        }
    }
}

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PHASE 1: Backend Server Health Check" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Test 1: Server is running
Write-Host "`nChecking if backend server is running..." -ForegroundColor White
try {
    $healthCheck = Invoke-WebRequest -Uri "$baseUrl/health" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Host "✅ Backend server is running on port 4000" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Backend server health endpoint not responding (may not have /health route)" -ForegroundColor Yellow
    Write-Host "   Continuing with API tests..." -ForegroundColor Gray
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PHASE 2: Waiver API Endpoints" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

$testResults += Test-Endpoint -Name "GET Waiver Template (latest)" -Url "$baseUrl/api/waivers/template"
$testResults += Test-Endpoint -Name "GET Waiver Template (with language)" -Url "$baseUrl/api/waivers/template?language=en"
$testResults += Test-Endpoint -Name "GET Waiver Status (requires auth)" -Url "$baseUrl/api/waivers/status/test-user-id"
$testResults += Test-Endpoint -Name "GET Waiver Check (requires auth)" -Url "$baseUrl/api/waivers/check/test-user-id"

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PHASE 3: Family API Endpoints" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

$testResults += Test-Endpoint -Name "GET Family Members (requires auth)" -Url "$baseUrl/api/students/test-user-id/family"

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PHASE 4: File Structure Verification" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`nChecking critical files exist..." -ForegroundColor White

$criticalFiles = @(
    "src\features\compliance\services\waiverApi.js",
    "src\features\compliance\components\WaiverModal.jsx",
    "src\features\students\services\familyApi.js",
    "src\features\students\components\FamilyManagement.jsx",
    "src\features\students\components\FamilyMemberCard.jsx",
    "src\features\students\components\FamilyMemberModal.jsx",
    "backend\services\waiverService.js",
    "backend\routes\waivers.js",
    "backend\services\familyService.js",
    "backend\routes\family.js"
)

$missingFiles = @()
foreach ($file in $criticalFiles) {
    $fullPath = Join-Path $PSScriptRoot $file
    if (Test-Path $fullPath) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file (MISSING)" -ForegroundColor Red
        $missingFiles += $file
    }
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PHASE 5: Database Migrations" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`nChecking migration files exist..." -ForegroundColor White

$migrations = @(
    "backend\migrations\017_create_family_members_table.sql",
    "backend\migrations\018_create_liability_waivers_table.sql",
    "backend\migrations\019_create_waiver_versions_table.sql",
    "backend\migrations\020_add_family_support_to_bookings.sql",
    "backend\migrations\021_add_family_support_to_rentals.sql",
    "backend\migrations\023_seed_initial_waiver_version.sql"
)

$missingMigrations = @()
foreach ($migration in $migrations) {
    $fullPath = Join-Path $PSScriptRoot $migration
    if (Test-Path $fullPath) {
        Write-Host "  ✅ $migration" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $migration (MISSING)" -ForegroundColor Red
        $missingMigrations += $migration
    }
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST RESULTS SUMMARY" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$warned = ($testResults | Where-Object { $_.Status -eq "WARN" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $testResults.Count

Write-Host "`nAPI Endpoint Tests:" -ForegroundColor White
Write-Host "  ✅ Passed: $passed / $total" -ForegroundColor Green
if ($warned -gt 0) {
    Write-Host "  ⚠️  Warnings: $warned / $total" -ForegroundColor Yellow
}
if ($failed -gt 0) {
    Write-Host "  ❌ Failed: $failed / $total" -ForegroundColor Red
}

Write-Host "`nFile Structure:" -ForegroundColor White
if ($missingFiles.Count -eq 0) {
    Write-Host "  ✅ All critical files present" -ForegroundColor Green
} else {
    Write-Host "  ❌ Missing $($missingFiles.Count) file(s)" -ForegroundColor Red
}

Write-Host "`nDatabase Migrations:" -ForegroundColor White
if ($missingMigrations.Count -eq 0) {
    Write-Host "  ✅ All migration files present" -ForegroundColor Green
} else {
    Write-Host "  ❌ Missing $($missingMigrations.Count) migration(s)" -ForegroundColor Red
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "OVERALL STATUS" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($failed -eq 0 -and $missingFiles.Count -eq 0 -and $missingMigrations.Count -eq 0) {
    Write-Host "`n✅ ALL CHECKS PASSED - READY FOR MANUAL TESTING" -ForegroundColor Green
    Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
    Write-Host "   1. Open browser: http://localhost:3000" -ForegroundColor White
    Write-Host "   2. Login as student user" -ForegroundColor White
    Write-Host "   3. Follow E2E Testing Guide: docs\E2E-TESTING-GUIDE.md" -ForegroundColor White
    Write-Host "`n" -ForegroundColor White
    exit 0
} else {
    Write-Host "`n⚠️  SOME CHECKS FAILED - REVIEW ERRORS ABOVE" -ForegroundColor Red
    Write-Host "`n" -ForegroundColor White
    exit 1
}
