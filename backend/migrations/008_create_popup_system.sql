-- Migration 008: Create comprehensive popup system
-- This migration creates all tables needed for the popup system

-- Main popup configurations table
CREATE TABLE popup_configurations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    subtitle VARCHAR(500),
    body_text TEXT,
    is_active BOOLEAN DEFAULT false,
    popup_type VARCHAR(50) DEFAULT 'welcome', -- welcome, feature, promotional, onboarding, feedback, newsletter, tutorial, social
    priority INTEGER DEFAULT 1, -- Higher number = higher priority
    
    -- Layout and design settings
    modal_size VARCHAR(20) DEFAULT 'medium', -- small, medium, large, fullscreen
    layout_template VARCHAR(50) DEFAULT 'centered', -- centered, split-screen, card-based
    animation_type VARCHAR(30) DEFAULT 'fade', -- fade, slide, zoom, bounce
    color_theme VARCHAR(30) DEFAULT 'default',
    background_type VARCHAR(20) DEFAULT 'color', -- color, gradient, image
    background_value TEXT, -- hex color, gradient definition, or image URL
    border_radius INTEGER DEFAULT 8,
    has_shadow BOOLEAN DEFAULT true,
    
    -- Content layout
    is_multi_step BOOLEAN DEFAULT false,
    column_layout INTEGER DEFAULT 1, -- 1, 2, 3 columns
    image_position VARCHAR(20) DEFAULT 'top', -- left, right, top, background
    text_alignment VARCHAR(20) DEFAULT 'center', -- left, center, right
    custom_css TEXT,
    
    -- Timing and frequency
    display_delay INTEGER DEFAULT 0, -- seconds after trigger
    auto_close_delay INTEGER DEFAULT 0, -- 0 = manual close only
    max_displays_per_user INTEGER DEFAULT 1,
    cooldown_period INTEGER DEFAULT 0, -- days between displays
    
    -- A/B Testing
    ab_test_group VARCHAR(10), -- A, B, C, etc.
    ab_test_weight INTEGER DEFAULT 100, -- percentage
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Content blocks for flexible popup content
CREATE TABLE popup_content_blocks (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER REFERENCES popup_configurations(id) ON DELETE CASCADE,
    block_type VARCHAR(50) NOT NULL, -- text, image, video, button, form, social_links, spacer
    content_data JSONB NOT NULL, -- Flexible content storage
    display_order INTEGER DEFAULT 0,
    step_number INTEGER DEFAULT 1, -- For multi-step popups
    is_active BOOLEAN DEFAULT true,
    
    -- Responsive settings
    mobile_settings JSONB,
    tablet_settings JSONB,
    desktop_settings JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Targeting rules for who sees which popups
CREATE TABLE popup_targeting_rules (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER REFERENCES popup_configurations(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL, -- user_role, login_count, registration_date, page_route, time_based, feature_access
    rule_condition VARCHAR(100) NOT NULL, -- equals, greater_than, less_than, contains, between
    rule_value TEXT NOT NULL, -- The value to compare against
    rule_operator VARCHAR(10) DEFAULT 'AND', -- AND, OR for combining rules
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track user interactions with popups
CREATE TABLE popup_user_interactions (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER REFERENCES popup_configurations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL, -- viewed, dismissed, clicked_primary, clicked_secondary, completed_form
    interaction_data JSONB, -- Additional data like which button was clicked, form values, etc.
    step_number INTEGER DEFAULT 1, -- For multi-step popups
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    page_url TEXT,
    referrer TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate views
    UNIQUE(popup_id, user_id, interaction_type, step_number)
);

-- Analytics and performance metrics
CREATE TABLE popup_analytics (
    id SERIAL PRIMARY KEY,
    popup_id INTEGER REFERENCES popup_configurations(id) ON DELETE CASCADE,
    date_recorded DATE DEFAULT CURRENT_DATE,
    
    -- Display metrics
    total_views INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    total_dismissals INTEGER DEFAULT 0,
    
    -- Interaction metrics
    primary_button_clicks INTEGER DEFAULT 0,
    secondary_button_clicks INTEGER DEFAULT 0,
    form_submissions INTEGER DEFAULT 0,
    social_clicks INTEGER DEFAULT 0,
    link_clicks INTEGER DEFAULT 0,
    
    -- Performance metrics
    avg_display_time_seconds FLOAT DEFAULT 0,
    avg_load_time_ms FLOAT DEFAULT 0,
    bounce_rate FLOAT DEFAULT 0, -- Percentage who closed immediately
    completion_rate FLOAT DEFAULT 0, -- For multi-step popups
    
    -- A/B Testing metrics
    ab_test_group VARCHAR(10),
    conversion_rate FLOAT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one record per popup per day per A/B group
    UNIQUE(popup_id, date_recorded, ab_test_group)
);

-- User popup preferences
CREATE TABLE user_popup_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Global preferences
    popups_enabled BOOLEAN DEFAULT true,
    welcome_popups_enabled BOOLEAN DEFAULT true,
    feature_popups_enabled BOOLEAN DEFAULT true,
    promotional_popups_enabled BOOLEAN DEFAULT true,
    
    -- Frequency preferences
    max_popups_per_day INTEGER DEFAULT 3,
    max_popups_per_week INTEGER DEFAULT 10,
    
    -- Notification preferences
    email_on_popup_feedback BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media assets for popups
CREATE TABLE popup_media_assets (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- image, video, audio
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    alt_text VARCHAR(500),
    description TEXT,
    tags TEXT[], -- For easy searching
    is_active BOOLEAN DEFAULT true,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Popup templates for quick setup
CREATE TABLE popup_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) NOT NULL, -- welcome, feature, promotional, etc.
    thumbnail_url TEXT,
    
    -- Template configuration (same structure as popup_configurations)
    default_config JSONB NOT NULL,
    default_content_blocks JSONB NOT NULL,
    default_targeting_rules JSONB,
    
    is_system_template BOOLEAN DEFAULT false, -- Built-in vs user-created
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_popup_configurations_active ON popup_configurations(is_active);
CREATE INDEX idx_popup_configurations_type ON popup_configurations(popup_type);
CREATE INDEX idx_popup_configurations_priority ON popup_configurations(priority DESC);

CREATE INDEX idx_popup_content_blocks_popup_id ON popup_content_blocks(popup_id);
CREATE INDEX idx_popup_content_blocks_order ON popup_content_blocks(popup_id, step_number, display_order);

CREATE INDEX idx_popup_targeting_rules_popup_id ON popup_targeting_rules(popup_id);
CREATE INDEX idx_popup_targeting_rules_type ON popup_targeting_rules(rule_type);

CREATE INDEX idx_popup_user_interactions_popup_id ON popup_user_interactions(popup_id);
CREATE INDEX idx_popup_user_interactions_user_id ON popup_user_interactions(user_id);
CREATE INDEX idx_popup_user_interactions_type ON popup_user_interactions(interaction_type);
CREATE INDEX idx_popup_user_interactions_created_at ON popup_user_interactions(created_at);

CREATE INDEX idx_popup_analytics_popup_id ON popup_analytics(popup_id);
CREATE INDEX idx_popup_analytics_date ON popup_analytics(date_recorded);

CREATE INDEX idx_user_popup_preferences_user_id ON user_popup_preferences(user_id);

CREATE INDEX idx_popup_media_assets_type ON popup_media_assets(file_type);
CREATE INDEX idx_popup_media_assets_active ON popup_media_assets(is_active);

CREATE INDEX idx_popup_templates_type ON popup_templates(template_type);
CREATE INDEX idx_popup_templates_system ON popup_templates(is_system_template);

-- Add some default templates
INSERT INTO popup_templates (name, description, template_type, default_config, default_content_blocks, is_system_template) VALUES
(
    'Welcome Popup',
    'Simple welcome message for new users',
    'welcome',
    '{"modal_size": "medium", "layout_template": "centered", "animation_type": "fade", "color_theme": "primary"}',
    '[
        {"block_type": "text", "content_data": {"text": "<h2>Welcome to Our Platform!</h2><p>We''re excited to have you here.</p>"}, "display_order": 1},
        {"block_type": "button", "content_data": {"text": "Get Started", "style": "primary", "action": "close"}, "display_order": 2}
    ]',
    true
),
(
    'Feature Announcement',
    'Highlight new features and updates',
    'feature',
    '{"modal_size": "large", "layout_template": "split-screen", "animation_type": "slide", "color_theme": "success"}',
    '[
        {"block_type": "image", "content_data": {"src": "/images/feature-preview.jpg", "alt": "New Feature"}, "display_order": 1},
        {"block_type": "text", "content_data": {"text": "<h2>Exciting New Feature!</h2><p>Check out our latest enhancement.</p>"}, "display_order": 2},
        {"block_type": "button", "content_data": {"text": "Try It Now", "style": "primary", "action": "link", "url": "/features/new"}, "display_order": 3}
    ]',
    true
),
(
    'Newsletter Signup',
    'Collect email subscriptions',
    'newsletter',
    '{"modal_size": "small", "layout_template": "card-based", "animation_type": "zoom", "color_theme": "info"}',
    '[
        {"block_type": "text", "content_data": {"text": "<h3>Stay Updated</h3><p>Get the latest news and updates.</p>"}, "display_order": 1},
        {"block_type": "form", "content_data": {"fields": [{"type": "email", "name": "email", "placeholder": "Enter your email", "required": true}]}, "display_order": 2},
        {"block_type": "button", "content_data": {"text": "Subscribe", "style": "primary", "action": "submit"}, "display_order": 3}
    ]',
    true
);

-- Add function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_popup_configurations_updated_at BEFORE UPDATE ON popup_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_popup_analytics_updated_at BEFORE UPDATE ON popup_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_popup_preferences_updated_at BEFORE UPDATE ON user_popup_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
