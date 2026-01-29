# Deploy and run migration 131 on production (PowerShell)

Write-Host "Deploying migration 131 to production..." -ForegroundColor Cyan

# Copy migration files to production using SCP
Write-Host "Copying migration files..." -ForegroundColor Yellow
scp backend/migrations/131_populate_legal_documents.sql root@plannivo.com:/root/UKC.world/backend/migrations/
scp backend/run-migration-131.mjs root@plannivo.com:/root/UKC.world/backend/

# Run migration on production via SSH
Write-Host "Running migration on production..." -ForegroundColor Yellow
ssh root@plannivo.com "cd /root/UKC.world/backend && docker compose -f ../docker-compose.production.yml exec -T backend node run-migration-131.mjs"

Write-Host "Migration 131 completed!" -ForegroundColor Green
