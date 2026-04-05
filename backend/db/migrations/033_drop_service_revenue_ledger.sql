-- Migration: drop service revenue ledger
-- Purpose: remove the temporary ledger table now that expected revenue is computed live.

DROP TABLE IF EXISTS service_revenue_ledger;
