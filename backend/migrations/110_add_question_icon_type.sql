-- Migration 110: Add question icon type to marketing campaigns
-- Adds ability to select different icon types for question campaigns

-- Add question_icon_type column
ALTER TABLE marketing_campaigns
ADD COLUMN IF NOT EXISTS question_icon_type VARCHAR(50) DEFAULT 'question';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_question_icon_type
ON marketing_campaigns(question_icon_type)
WHERE type = 'question';

-- Add comment
COMMENT ON COLUMN marketing_campaigns.question_icon_type IS 'Icon type for question campaigns (question, info, bulb, heart, star, trophy, gift, rocket, fire, bell)';
