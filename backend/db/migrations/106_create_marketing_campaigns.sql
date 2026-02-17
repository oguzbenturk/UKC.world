-- Migration: Create marketing_campaigns table
-- Description: Store email, popup, SMS, WhatsApp marketing campaigns

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'popup', 'sms', 'whatsapp')),
  template_type VARCHAR(100),
  audience VARCHAR(100) NOT NULL,
  
  -- Email specific
  email_subject VARCHAR(500),
  email_content TEXT,
  email_html TEXT,
  
  -- Popup specific
  popup_title VARCHAR(255),
  popup_message TEXT,
  popup_button_text VARCHAR(100),
  popup_button_url VARCHAR(500),
  popup_image_url VARCHAR(500),
  popup_style JSONB DEFAULT '{}',
  
  -- SMS/WhatsApp specific
  sms_content TEXT,
  whatsapp_content TEXT,
  whatsapp_media_url VARCHAR(500),
  
  -- Campaign settings
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'active', 'paused', 'completed')),
  schedule_date TIMESTAMPTZ,
  send_immediately BOOLEAN DEFAULT false,
  
  -- Analytics
  sent_count INT DEFAULT 0,
  opened_count INT DEFAULT 0,
  clicked_count INT DEFAULT 0,
  converted_count INT DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_campaigns_type ON marketing_campaigns(type);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX idx_campaigns_created_by ON marketing_campaigns(created_by);
CREATE INDEX idx_campaigns_schedule ON marketing_campaigns(schedule_date) WHERE status = 'scheduled';
