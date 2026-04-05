-- Migration: Create quick links system for shareable booking URLs
-- Created: 2026-01-17

-- Quick links table - stores shareable booking links
CREATE TABLE IF NOT EXISTS quick_links (
    id SERIAL PRIMARY KEY,
    link_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    service_type VARCHAR(50) NOT NULL, -- 'accommodation', 'lesson', 'rental', 'shop'
    service_id INTEGER, -- Optional: specific service/package ID
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER, -- NULL = unlimited
    use_count INTEGER DEFAULT 0,
    require_payment BOOLEAN DEFAULT false,
    custom_fields JSONB DEFAULT '{}', -- Additional form fields to collect
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Quick link registrations - tracks who registered via quick links
CREATE TABLE IF NOT EXISTS quick_link_registrations (
    id SERIAL PRIMARY KEY,
    quick_link_id INTEGER NOT NULL REFERENCES quick_links(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    additional_data JSONB DEFAULT '{}', -- Custom field responses
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled'
    user_id UUID REFERENCES users(id), -- If registered user created or linked later
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quick_links_code ON quick_links(link_code);
CREATE INDEX IF NOT EXISTS idx_quick_links_active ON quick_links(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quick_links_created_by ON quick_links(created_by);
CREATE INDEX IF NOT EXISTS idx_quick_link_registrations_link_id ON quick_link_registrations(quick_link_id);
CREATE INDEX IF NOT EXISTS idx_quick_link_registrations_email ON quick_link_registrations(email);
CREATE INDEX IF NOT EXISTS idx_quick_link_registrations_status ON quick_link_registrations(status);
