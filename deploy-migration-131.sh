#!/bin/bash
# Deploy and run migration 131 on production

echo "Deploying migration 131 to production..."

# Copy migration files to production
scp backend/migrations/131_populate_legal_documents.sql root@plannivo.com:/root/UKC.world/backend/migrations/
scp backend/run-migration-131.mjs root@plannivo.com:/root/UKC.world/backend/

# Run migration on production
ssh root@plannivo.com "cd /root/UKC.world/backend && NODE_ENV=production node run-migration-131.mjs"

echo "Migration 131 completed!"
