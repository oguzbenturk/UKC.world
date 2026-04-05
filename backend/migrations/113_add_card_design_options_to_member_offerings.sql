-- Migration: Add card design options to member_offerings
-- Description: Adds card_style, button_text, and gradient_color for more customization

-- Add card_style column (image_background, gradient, simple)
ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS card_style VARCHAR(50) DEFAULT 'simple';

-- Add button_text column for custom CTA text
ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS button_text VARCHAR(100) DEFAULT 'Choose Plan';

-- Add gradient_color for gradient style cards (second color)
ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS gradient_color VARCHAR(50);

-- Add text_color for cards with dark backgrounds
ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS text_color VARCHAR(20) DEFAULT 'dark';

-- Update existing records to set card_style based on current settings
UPDATE member_offerings 
SET card_style = CASE 
  WHEN image_url IS NOT NULL AND use_image_background = TRUE THEN 'image_background'
  WHEN highlighted = TRUE THEN 'gradient'
  ELSE 'simple'
END
WHERE card_style IS NULL OR card_style = 'simple';
