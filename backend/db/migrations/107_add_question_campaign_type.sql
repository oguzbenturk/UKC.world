-- Migration: Add question campaign type
-- Description: Add 'question' to marketing_campaigns type check constraint and add question-specific columns

-- Drop the old check constraint
ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_type_check;

-- Add the new check constraint with 'question' included
ALTER TABLE marketing_campaigns ADD CONSTRAINT marketing_campaigns_type_check 
  CHECK (type IN ('email', 'popup', 'sms', 'whatsapp', 'question'));

-- Add question-specific columns
ALTER TABLE marketing_campaigns 
  ADD COLUMN IF NOT EXISTS question_text TEXT,
  ADD COLUMN IF NOT EXISTS question_subtitle TEXT,
  ADD COLUMN IF NOT EXISTS question_bg_image VARCHAR(500),
  ADD COLUMN IF NOT EXISTS question_bg_color VARCHAR(50) DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS question_text_color VARCHAR(50) DEFAULT '#111827',
  ADD COLUMN IF NOT EXISTS question_answers JSONB DEFAULT '[]';

-- Create index for question campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_question ON marketing_campaigns(type) WHERE type = 'question';
