-- Migration: Add config column to popup_configurations table
-- This adds the missing config JSONB column expected by the popup service

ALTER TABLE popup_configurations 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Populate the config column with existing configuration data
UPDATE popup_configurations SET config = jsonb_build_object(
    'modal_size', modal_size,
    'layout_template', layout_template,
    'animation_type', animation_type,
    'color_theme', color_theme,
    'background_type', background_type,
    'background_value', background_value,
    'border_radius', border_radius,
    'has_shadow', has_shadow,
    'is_multi_step', is_multi_step,
    'column_layout', column_layout,
    'image_position', image_position,
    'text_alignment', text_alignment,
    'custom_css', custom_css,
    'display_delay', display_delay,
    'auto_close_delay', auto_close_delay,
    'max_displays_per_user', max_displays_per_user,
    'cooldown_period', cooldown_period,
    'ab_test_group', ab_test_group,
    'ab_test_weight', ab_test_weight
) WHERE config IS NULL OR config = '{}';

-- Create an index on the config column for performance
CREATE INDEX IF NOT EXISTS idx_popup_configurations_config ON popup_configurations USING GIN (config);

-- Create a trigger to automatically update the config column when the related columns change
CREATE OR REPLACE FUNCTION sync_popup_config()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the config JSONB column with current values
    NEW.config = jsonb_build_object(
        'modal_size', NEW.modal_size,
        'layout_template', NEW.layout_template,
        'animation_type', NEW.animation_type,
        'color_theme', NEW.color_theme,
        'background_type', NEW.background_type,
        'background_value', NEW.background_value,
        'border_radius', NEW.border_radius,
        'has_shadow', NEW.has_shadow,
        'is_multi_step', NEW.is_multi_step,
        'column_layout', NEW.column_layout,
        'image_position', NEW.image_position,
        'text_alignment', NEW.text_alignment,
        'custom_css', NEW.custom_css,
        'display_delay', NEW.display_delay,
        'auto_close_delay', NEW.auto_close_delay,
        'max_displays_per_user', NEW.max_displays_per_user,
        'cooldown_period', NEW.cooldown_period,
        'ab_test_group', NEW.ab_test_group,
        'ab_test_weight', NEW.ab_test_weight
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove existing trigger if present so we can recreate safely
DROP TRIGGER IF EXISTS sync_popup_config_trigger ON popup_configurations;

-- Create trigger to sync config on INSERT and UPDATE
CREATE TRIGGER sync_popup_config_trigger
    BEFORE INSERT OR UPDATE ON popup_configurations
    FOR EACH ROW
    EXECUTE FUNCTION sync_popup_config();
