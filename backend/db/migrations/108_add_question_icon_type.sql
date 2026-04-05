-- Migration: Add icon type to question campaigns
-- Description: Add question_icon_type column to allow customizable icons

ALTER TABLE marketing_campaigns 
  ADD COLUMN IF NOT EXISTS question_icon_type VARCHAR(100) DEFAULT 'QuestionCircleOutlined';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_question_icon ON marketing_campaigns(question_icon_type) WHERE type = 'question';
