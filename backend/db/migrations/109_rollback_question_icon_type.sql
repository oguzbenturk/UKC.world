-- Migration: Rollback question icon type
-- Description: Remove question_icon_type column and related index

-- Drop the index
DROP INDEX IF EXISTS idx_campaigns_question_icon;

-- Remove the column
ALTER TABLE marketing_campaigns 
  DROP COLUMN IF EXISTS question_icon_type;
