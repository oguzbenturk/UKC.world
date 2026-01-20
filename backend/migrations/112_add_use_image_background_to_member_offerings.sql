-- Migration: Add use_image_background column to member_offerings
-- Purpose: Control whether image should be used as background or inline display

ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS use_image_background BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN member_offerings.use_image_background IS 'If true, image is used as card background. If false, image is displayed inline with default card design.';
