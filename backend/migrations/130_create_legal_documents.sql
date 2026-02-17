-- Create legal_documents table
CREATE TABLE IF NOT EXISTS legal_documents (
  id SERIAL PRIMARY KEY,
  document_type VARCHAR(50) NOT NULL,
  version VARCHAR(50),
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_type_active ON legal_documents(document_type, is_active);

-- Insert default documents
INSERT INTO legal_documents (document_type, version, content, is_active) VALUES
('terms', '2025-10-01', '<h2>Terms of Service</h2><p>Welcome to Plannivo. By using our services, you agree to these terms.</p>', true),
('privacy', '2025-10-01', '<h2>Privacy Policy</h2><p>We respect your privacy and are committed to protecting your personal data.</p>', true),
('marketing', NULL, 'These toggles are optional. Opt in to receive updates and booking reminders through the channels you prefer.', true)
ON CONFLICT DO NOTHING;
