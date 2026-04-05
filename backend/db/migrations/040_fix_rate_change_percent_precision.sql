-- Migration 040: Fix rate_change_percent precision overflow
-- Description: Increase precision for rate_change_percent to handle large rate changes (e.g., TRY)

-- The rate_change_percent column was NUMERIC(8,4) which overflows when rates change by >10000%
-- For example, TRY changing from 0.02 to 38 = 190000% change
ALTER TABLE currency_update_logs 
ALTER COLUMN rate_change_percent TYPE NUMERIC(12, 4);

-- Also ensure old_rate and new_rate can handle all realistic rates
-- Already NUMERIC(12,6) which is sufficient

-- Rollback
-- ALTER TABLE currency_update_logs ALTER COLUMN rate_change_percent TYPE NUMERIC(8, 4);
