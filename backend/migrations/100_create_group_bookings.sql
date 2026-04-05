-- Migration: Create group bookings system
-- Created: 2026-01-08
-- Description: Tables for group lesson bookings with invitation system

-- Group bookings master table
CREATE TABLE IF NOT EXISTS group_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  organizer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  instructor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Group details
  title VARCHAR(255),
  description TEXT,
  max_participants INT DEFAULT 6 NOT NULL,
  min_participants INT DEFAULT 2 NOT NULL,
  price_per_person DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  
  -- Scheduling
  scheduled_date DATE,
  start_time TIME,
  end_time TIME,
  duration_hours DECIMAL(4,2),
  
  -- Payment model
  payment_model VARCHAR(50) DEFAULT 'individual' NOT NULL,
  -- individual: Each participant pays for themselves
  -- organizer_pays: Organizer pays for all participants
  total_amount DECIMAL(10,2), -- For organizer_pays model
  organizer_paid BOOLEAN DEFAULT FALSE,
  organizer_paid_at TIMESTAMP,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  -- pending: Created, waiting for participants
  -- open: Accepting participants
  -- full: Max participants reached
  -- confirmed: All paid, ready for lesson
  -- in_progress: Lesson happening
  -- completed: Lesson done
  -- cancelled: Cancelled by organizer or admin
  
  -- Deadlines
  registration_deadline TIMESTAMP,
  payment_deadline TIMESTAMP,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Group booking participants
CREATE TABLE IF NOT EXISTS group_booking_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_booking_id UUID REFERENCES group_bookings(id) ON DELETE CASCADE NOT NULL,
  
  -- Participant info (either user_id or email for pending invites)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(50),
  
  -- Invitation tracking
  invitation_token VARCHAR(255) UNIQUE,
  invitation_sent_at TIMESTAMP,
  invitation_expires_at TIMESTAMP,
  invited_by UUID REFERENCES users(id),
  
  -- Participation status
  status VARCHAR(50) DEFAULT 'invited' NOT NULL,
  -- invited: Invitation sent, waiting for response
  -- accepted: Accepted but not paid
  -- paid: Paid and confirmed
  -- declined: Declined the invitation
  -- cancelled: Cancelled after accepting
  -- no_show: Did not attend
  
  -- Payment tracking
  payment_status VARCHAR(50) DEFAULT 'pending',
  -- pending: Not paid
  -- processing: Payment in progress
  -- paid: Payment completed
  -- refunded: Payment refunded
  -- failed: Payment failed
  
  payment_method VARCHAR(50), -- wallet, external, cash
  amount_due DECIMAL(10,2),
  amount_paid DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'EUR',
  paid_at TIMESTAMP,
  payment_reference VARCHAR(255),
  
  -- Package usage (if paying with package hours)
  customer_package_id UUID REFERENCES customer_packages(id),
  package_hours_used DECIMAL(4,2),
  
  -- Role in group
  is_organizer BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one user per group booking
  UNIQUE(group_booking_id, email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_bookings_organizer ON group_bookings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_group_bookings_status ON group_bookings(status);
CREATE INDEX IF NOT EXISTS idx_group_bookings_scheduled_date ON group_bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_group_booking_participants_user ON group_booking_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_group_booking_participants_email ON group_booking_participants(email);
CREATE INDEX IF NOT EXISTS idx_group_booking_participants_token ON group_booking_participants(invitation_token);
CREATE INDEX IF NOT EXISTS idx_group_booking_participants_status ON group_booking_participants(status);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_group_booking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_bookings_updated_at ON group_bookings;
CREATE TRIGGER group_bookings_updated_at
  BEFORE UPDATE ON group_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_group_booking_timestamp();

DROP TRIGGER IF EXISTS group_booking_participants_updated_at ON group_booking_participants;
CREATE TRIGGER group_booking_participants_updated_at
  BEFORE UPDATE ON group_booking_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_group_booking_timestamp();
