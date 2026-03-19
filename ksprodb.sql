-- ========================================
-- TABLE: accommodation_bookings
-- ========================================
CREATE TABLE accommodation_bookings (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL,
  guest_id UUID NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  guests_count INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC NOT NULL,
  status CHARACTER VARYING(50) NOT NULL DEFAULT 'confirmed'::character varying,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  payment_status CHARACTER VARYING(50) DEFAULT 'unpaid'::character varying,
  wallet_transaction_id UUID,
  payment_amount NUMERIC DEFAULT 0,
  payment_method CHARACTER VARYING(50) DEFAULT 'wallet'::character varying
);

ALTER TABLE accommodation_bookings ADD PRIMARY KEY (id);
ALTER TABLE accommodation_bookings ADD CONSTRAINT accommodation_bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE accommodation_bookings ADD CONSTRAINT accommodation_bookings_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES users(id);
ALTER TABLE accommodation_bookings ADD CONSTRAINT accommodation_bookings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES accommodation_units(id);
ALTER TABLE accommodation_bookings ADD CONSTRAINT accommodation_bookings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
CREATE INDEX idx_accommodation_availability ON public.accommodation_bookings USING btree (unit_id, check_in_date, check_out_date, status) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_accommodation_bookings_dates ON public.accommodation_bookings USING btree (check_in_date, check_out_date);
CREATE INDEX idx_accommodation_bookings_status ON public.accommodation_bookings USING btree (status);

-- ========================================
-- TABLE: accommodation_units
-- ========================================
CREATE TABLE accommodation_units (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name CHARACTER VARYING(255) NOT NULL,
  type CHARACTER VARYING(50) NOT NULL,
  status CHARACTER VARYING(50) NOT NULL DEFAULT 'Available'::character varying,
  capacity INTEGER NOT NULL,
  price_per_night NUMERIC NOT NULL,
  description TEXT,
  amenities JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  category CHARACTER VARYING(50) NOT NULL DEFAULT 'own'::character varying
);

ALTER TABLE accommodation_units ADD PRIMARY KEY (id);
CREATE INDEX idx_accommodation_units_status ON public.accommodation_units USING btree (status);

-- ========================================
-- TABLE: api_keys
-- ========================================
CREATE TABLE api_keys (
  id INTEGER NOT NULL DEFAULT nextval('api_keys_id_seq'::regclass),
  name CHARACTER VARYING(100) NOT NULL,
  key_hash CHARACTER VARYING(255) NOT NULL,
  user_id UUID,
  permissions JSONB DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMP WITHOUT TIME ZONE,
  expires_at TIMESTAMP WITHOUT TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE api_keys ADD PRIMARY KEY (id);
ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_api_keys_hash ON public.api_keys USING btree (key_hash) WHERE (is_active = true);
CREATE INDEX idx_api_keys_user ON public.api_keys USING btree (user_id, is_active);

-- ========================================
-- TABLE: archive_legacy_transactions
-- ========================================
CREATE TABLE archive_legacy_transactions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID,
  amount NUMERIC,
  type CHARACTER VARYING(50),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE archive_legacy_transactions ADD PRIMARY KEY (id);
CREATE INDEX idx_archive_legacy_transactions_archived_at ON public.archive_legacy_transactions USING btree (archived_at);
CREATE INDEX idx_archive_legacy_transactions_user_id ON public.archive_legacy_transactions USING btree (user_id);

-- ========================================
-- TABLE: archive_student_accounts
-- ========================================
CREATE TABLE archive_student_accounts (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID,
  balance NUMERIC,
  total_spent NUMERIC,
  last_payment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE archive_student_accounts ADD PRIMARY KEY (id);
CREATE INDEX idx_archive_student_accounts_archived_at ON public.archive_student_accounts USING btree (archived_at);

-- ========================================
-- TABLE: audit_logs
-- ========================================
CREATE TABLE audit_logs (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID,
  action CHARACTER VARYING(50) NOT NULL,
  entity_type CHARACTER VARYING(50) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address CHARACTER VARYING(50),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  event_type CHARACTER VARYING(100),
  resource_type CHARACTER VARYING(50),
  resource_id UUID,
  actor_user_id UUID,
  target_user_id UUID,
  family_member_id UUID,
  waiver_id UUID,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  retain_until TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + '7 years'::interval)
);

ALTER TABLE audit_logs ADD PRIMARY KEY (id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_family_member_id_fkey FOREIGN KEY (family_member_id) REFERENCES family_members(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_waiver_id_fkey FOREIGN KEY (waiver_id) REFERENCES liability_waivers(id);
CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs USING btree (event_type);
CREATE INDEX idx_audit_logs_family_member ON public.audit_logs USING btree (family_member_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);
CREATE INDEX idx_audit_logs_retain_until ON public.audit_logs USING btree (retain_until);
CREATE INDEX idx_audit_logs_target ON public.audit_logs USING btree (target_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_waiver ON public.audit_logs USING btree (waiver_id, created_at DESC);
CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);

-- ========================================
-- TABLE: booking_custom_commissions
-- ========================================
CREATE TABLE booking_custom_commissions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL,
  instructor_id UUID NOT NULL,
  service_id UUID NOT NULL,
  commission_type CHARACTER VARYING(20) NOT NULL,
  commission_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE booking_custom_commissions ADD PRIMARY KEY (id);
ALTER TABLE booking_custom_commissions ADD CONSTRAINT booking_custom_commissions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE booking_custom_commissions ADD CONSTRAINT booking_custom_commissions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE booking_custom_commissions ADD CONSTRAINT booking_custom_commissions_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE booking_custom_commissions ADD CONSTRAINT booking_custom_commissions_booking_id_key UNIQUE (booking_id);
CREATE UNIQUE INDEX booking_custom_commissions_booking_id_key ON public.booking_custom_commissions USING btree (booking_id);
CREATE INDEX idx_booking_custom_commissions_booking ON public.booking_custom_commissions USING btree (booking_id);
CREATE INDEX idx_booking_custom_commissions_booking_id ON public.booking_custom_commissions USING btree (booking_id);
CREATE INDEX idx_booking_custom_commissions_instructor_id ON public.booking_custom_commissions USING btree (instructor_id);
CREATE INDEX idx_booking_custom_commissions_service_id ON public.booking_custom_commissions USING btree (service_id);

-- ========================================
-- TABLE: booking_equipment
-- ========================================
CREATE TABLE booking_equipment (
  booking_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE booking_equipment ADD PRIMARY KEY (booking_id, equipment_id);
ALTER TABLE booking_equipment ADD CONSTRAINT booking_equipment_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE booking_equipment ADD CONSTRAINT booking_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id);
CREATE INDEX idx_booking_equipment_lookup ON public.booking_equipment USING btree (booking_id, equipment_id);

-- ========================================
-- TABLE: booking_participants
-- ========================================
CREATE TABLE booking_participants (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL,
  user_id UUID NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  payment_status CHARACTER VARYING(50) DEFAULT 'unpaid'::character varying,
  payment_amount NUMERIC DEFAULT 0.00,
  notes TEXT DEFAULT ''::text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  customer_package_id UUID,
  package_hours_used NUMERIC DEFAULT 0.00,
  cash_hours_used NUMERIC DEFAULT 0.00,
  created_by UUID
);

ALTER TABLE booking_participants ADD PRIMARY KEY (id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_booking_id_user_id_key UNIQUE (booking_id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_booking_id_user_id_key UNIQUE (booking_id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_booking_id_user_id_key UNIQUE (user_id);
ALTER TABLE booking_participants ADD CONSTRAINT booking_participants_booking_id_user_id_key UNIQUE (user_id);
CREATE UNIQUE INDEX booking_participants_booking_id_user_id_key ON public.booking_participants USING btree (booking_id, user_id);
CREATE INDEX booking_participants_created_by_idx ON public.booking_participants USING btree (created_by);
CREATE INDEX idx_booking_participants_booking ON public.booking_participants USING btree (booking_id);
CREATE INDEX idx_booking_participants_booking_id ON public.booking_participants USING btree (booking_id);
CREATE INDEX idx_booking_participants_customer_package_id ON public.booking_participants USING btree (customer_package_id);
CREATE INDEX idx_booking_participants_primary ON public.booking_participants USING btree (booking_id, is_primary);
CREATE INDEX idx_booking_participants_user ON public.booking_participants USING btree (user_id);
CREATE INDEX idx_booking_participants_user_id ON public.booking_participants USING btree (user_id);

-- ========================================
-- TABLE: booking_reschedule_notifications
-- ========================================
CREATE TABLE booking_reschedule_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  student_user_id UUID NOT NULL,
  changed_by UUID NOT NULL,
  old_date DATE,
  new_date DATE,
  old_start_hour NUMERIC,
  new_start_hour NUMERIC,
  old_instructor_id UUID,
  new_instructor_id UUID,
  service_name TEXT,
  old_instructor_name TEXT,
  new_instructor_name TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE booking_reschedule_notifications ADD PRIMARY KEY (id);
ALTER TABLE booking_reschedule_notifications ADD CONSTRAINT booking_reschedule_notifications_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE booking_reschedule_notifications ADD CONSTRAINT booking_reschedule_notifications_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE booking_reschedule_notifications ADD CONSTRAINT booking_reschedule_notifications_new_instructor_id_fkey FOREIGN KEY (new_instructor_id) REFERENCES users(id);
ALTER TABLE booking_reschedule_notifications ADD CONSTRAINT booking_reschedule_notifications_old_instructor_id_fkey FOREIGN KEY (old_instructor_id) REFERENCES users(id);
ALTER TABLE booking_reschedule_notifications ADD CONSTRAINT booking_reschedule_notifications_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id);
CREATE INDEX idx_reschedule_notif_booking ON public.booking_reschedule_notifications USING btree (booking_id);
CREATE INDEX idx_reschedule_notif_student_pending ON public.booking_reschedule_notifications USING btree (student_user_id, status) WHERE (status = 'pending'::text);

-- ========================================
-- TABLE: booking_series
-- ========================================
CREATE TABLE booking_series (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  recurrence_type CHARACTER VARYING(20) NOT NULL,
  recurrence_days ARRAY NOT NULL,
  instructor_user_id UUID,
  service_id UUID,
  max_students INTEGER DEFAULT 1,
  price_per_session NUMERIC,
  total_price NUMERIC,
  status CHARACTER VARYING(20) DEFAULT 'active'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID
);

ALTER TABLE booking_series ADD PRIMARY KEY (id);
ALTER TABLE booking_series ADD CONSTRAINT booking_series_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE booking_series ADD CONSTRAINT booking_series_instructor_user_id_fkey FOREIGN KEY (instructor_user_id) REFERENCES users(id);
ALTER TABLE booking_series ADD CONSTRAINT booking_series_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
CREATE INDEX idx_booking_series_dates ON public.booking_series USING btree (start_date, end_date);
CREATE INDEX idx_booking_series_instructor ON public.booking_series USING btree (instructor_user_id);
CREATE INDEX idx_booking_series_service ON public.booking_series USING btree (service_id);

-- ========================================
-- TABLE: booking_series_customers
-- ========================================
CREATE TABLE booking_series_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  series_id UUID,
  customer_user_id UUID,
  enrollment_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status CHARACTER VARYING(20) DEFAULT 'active'::character varying,
  created_by UUID
);

ALTER TABLE booking_series_customers ADD PRIMARY KEY (id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_students_student_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES users(id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_students_series_id_fkey FOREIGN KEY (series_id) REFERENCES booking_series(id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_students_series_id_student_user_id_key UNIQUE (customer_user_id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_students_series_id_student_user_id_key UNIQUE (customer_user_id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_students_series_id_student_user_id_key UNIQUE (series_id);
ALTER TABLE booking_series_customers ADD CONSTRAINT booking_series_students_series_id_student_user_id_key UNIQUE (series_id);
CREATE INDEX booking_series_customers_created_by_idx ON public.booking_series_customers USING btree (created_by);
CREATE UNIQUE INDEX booking_series_students_series_id_student_user_id_key ON public.booking_series_customers USING btree (series_id, customer_user_id);
CREATE INDEX idx_booking_series_students_series ON public.booking_series_customers USING btree (series_id);
CREATE INDEX idx_booking_series_students_student ON public.booking_series_customers USING btree (customer_user_id);

-- ========================================
-- TABLE: bookings
-- ========================================
CREATE TABLE bookings (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  start_hour NUMERIC,
  duration NUMERIC NOT NULL,
  student_user_id UUID,
  instructor_user_id UUID,
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  payment_status CHARACTER VARYING(50) NOT NULL DEFAULT 'unpaid'::character varying,
  amount NUMERIC NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC NOT NULL DEFAULT 0.00,
  final_amount NUMERIC NOT NULL DEFAULT 0.00,
  location CHARACTER VARYING(100) NOT NULL DEFAULT 'TBD'::character varying,
  weather_conditions TEXT NOT NULL DEFAULT 'Good'::text,
  notes TEXT NOT NULL DEFAULT ''::text,
  feedback_rating INTEGER,
  feedback_comments TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  canceled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  service_id UUID,
  custom_price NUMERIC DEFAULT NULL::numeric,
  checkin_status CHARACTER VARYING(20) NOT NULL DEFAULT 'pending'::character varying,
  checkout_status CHARACTER VARYING(20) NOT NULL DEFAULT 'pending'::character varying,
  checkin_time TIMESTAMP WITH TIME ZONE,
  checkout_time TIMESTAMP WITH TIME ZONE,
  checkin_notes TEXT NOT NULL DEFAULT ''::text,
  checkout_notes TEXT NOT NULL DEFAULT ''::text,
  customer_user_id UUID,
  weather_suitable BOOLEAN DEFAULT true,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  deleted_by UUID,
  deletion_reason TEXT,
  deletion_metadata JSONB,
  customer_package_id UUID,
  group_size INTEGER DEFAULT 1,
  max_participants INTEGER DEFAULT 10,
  created_by UUID,
  updated_by UUID,
  family_member_id UUID,
  participant_type CHARACTER VARYING(20) DEFAULT 'self'::character varying,
  payment_method CHARACTER VARYING(50)
);

ALTER TABLE bookings ADD PRIMARY KEY (id);
ALTER TABLE bookings ADD CONSTRAINT bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_currency FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE bookings ADD CONSTRAINT bookings_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES customer_packages(id);
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_user_id) REFERENCES users(id);
ALTER TABLE bookings ADD CONSTRAINT bookings_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE bookings ADD CONSTRAINT bookings_family_member_id_fkey FOREIGN KEY (family_member_id) REFERENCES family_members(id);
ALTER TABLE bookings ADD CONSTRAINT bookings_instructor_user_id_fkey FOREIGN KEY (instructor_user_id) REFERENCES users(id);
ALTER TABLE bookings ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE bookings ADD CONSTRAINT bookings_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id);
ALTER TABLE bookings ADD CONSTRAINT bookings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
CREATE INDEX bookings_created_by_idx ON public.bookings USING btree (created_by);
CREATE INDEX idx_bookings_active_date ON public.bookings USING btree (date, start_hour) WHERE ((status)::text = ANY ((ARRAY['confirmed'::character varying, 'pending'::character varying])::text[]));
CREATE INDEX idx_bookings_amount_date ON public.bookings USING btree (final_amount, date) WHERE (final_amount > (0)::numeric);
CREATE INDEX idx_bookings_availability_check ON public.bookings USING btree (instructor_user_id, date, start_hour, duration, status) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_bookings_calendar_perf ON public.bookings USING btree (date, start_hour, instructor_user_id, status) WHERE ((status)::text = ANY (ARRAY[('confirmed'::character varying)::text, ('pending'::character varying)::text]));
CREATE INDEX idx_bookings_checkin_status ON public.bookings USING btree (checkin_status);
CREATE INDEX idx_bookings_checkin_time ON public.bookings USING btree (checkin_time);
CREATE INDEX idx_bookings_checkout_status ON public.bookings USING btree (checkout_status);
CREATE INDEX idx_bookings_checkout_time ON public.bookings USING btree (checkout_time);
CREATE INDEX idx_bookings_complete_status ON public.bookings USING btree (date, status, checkin_status, checkout_status);
CREATE INDEX idx_bookings_created_by ON public.bookings USING btree (created_by);
CREATE INDEX idx_bookings_currency ON public.bookings USING btree (currency);
CREATE INDEX idx_bookings_custom_price ON public.bookings USING btree (custom_price) WHERE (custom_price IS NOT NULL);
CREATE INDEX idx_bookings_customer_package_id ON public.bookings USING btree (customer_package_id);
CREATE INDEX idx_bookings_date ON public.bookings USING btree (date);
CREATE INDEX idx_bookings_date_active ON public.bookings USING btree (date) WHERE (deleted_at IS NULL);
CREATE INDEX idx_bookings_date_instructor ON public.bookings USING btree (date, instructor_user_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_bookings_date_status ON public.bookings USING btree (date, status) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_bookings_deleted_at ON public.bookings USING btree (deleted_at);
CREATE INDEX idx_bookings_family_member ON public.bookings USING btree (family_member_id);
CREATE INDEX idx_bookings_instructor ON public.bookings USING btree (instructor_user_id);
CREATE INDEX idx_bookings_instructor_date ON public.bookings USING btree (instructor_user_id, date);
CREATE INDEX idx_bookings_instructor_fk ON public.bookings USING btree (instructor_user_id);
CREATE INDEX idx_bookings_instructor_schedule ON public.bookings USING btree (instructor_user_id, date, start_hour);
CREATE UNIQUE INDEX idx_bookings_no_overlap ON public.bookings USING btree (instructor_user_id, date, start_hour, duration) WHERE (((status)::text <> 'cancelled'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_bookings_payment_method ON public.bookings USING btree (payment_method);
CREATE INDEX idx_bookings_payment_status ON public.bookings USING btree (payment_status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_bookings_service ON public.bookings USING btree (service_id, date);
CREATE INDEX idx_bookings_service_fk ON public.bookings USING btree (service_id);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_status_date ON public.bookings USING btree (status, date);
CREATE INDEX idx_bookings_status_deleted ON public.bookings USING btree (status, deleted_at);
CREATE INDEX idx_bookings_student ON public.bookings USING btree (student_user_id);
CREATE INDEX idx_bookings_student_date ON public.bookings USING btree (student_user_id, date);
CREATE INDEX idx_bookings_student_fk ON public.bookings USING btree (student_user_id);
CREATE INDEX idx_bookings_student_pending ON public.bookings USING btree (student_user_id) WHERE (((payment_status)::text = 'pending'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_bookings_updated_by ON public.bookings USING btree (updated_by);

-- ========================================
-- TABLE: business_expenses
-- ========================================
CREATE TABLE business_expenses (
  id INTEGER NOT NULL DEFAULT nextval('business_expenses_id_seq'::regclass),
  amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  category CHARACTER VARYING(100) NOT NULL,
  subcategory CHARACTER VARYING(100),
  description TEXT NOT NULL,
  vendor CHARACTER VARYING(255),
  receipt_url CHARACTER VARYING(500),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method CHARACTER VARYING(50),
  reference_number CHARACTER VARYING(100),
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency CHARACTER VARYING(20),
  notes TEXT,
  created_by UUID NOT NULL,
  approved_by UUID,
  status CHARACTER VARYING(20) DEFAULT 'approved'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE business_expenses ADD PRIMARY KEY (id);
ALTER TABLE business_expenses ADD CONSTRAINT business_expenses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE business_expenses ADD CONSTRAINT business_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_business_expenses_category ON public.business_expenses USING btree (category);
CREATE INDEX idx_business_expenses_created_by ON public.business_expenses USING btree (created_by);
CREATE INDEX idx_business_expenses_deleted_at ON public.business_expenses USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_business_expenses_expense_date ON public.business_expenses USING btree (expense_date DESC);
CREATE INDEX idx_business_expenses_status ON public.business_expenses USING btree (status);

-- ========================================
-- TABLE: conversation_participants
-- ========================================
CREATE TABLE conversation_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role_in_conversation CHARACTER VARYING(20) DEFAULT 'member'::character varying,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_read_at TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE conversation_participants ADD PRIMARY KEY (id);
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id);
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id);
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (user_id);
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (user_id);
CREATE UNIQUE INDEX conversation_participants_conversation_id_user_id_key ON public.conversation_participants USING btree (conversation_id, user_id);
CREATE INDEX idx_conversation_participants_conversation ON public.conversation_participants USING btree (conversation_id);
CREATE INDEX idx_conversation_participants_last_read ON public.conversation_participants USING btree (last_read_at);
CREATE INDEX idx_conversation_participants_user ON public.conversation_participants USING btree (user_id);

-- ========================================
-- TABLE: conversations
-- ========================================
CREATE TABLE conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  type CHARACTER VARYING(20) NOT NULL,
  name CHARACTER VARYING(255),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE conversations ADD PRIMARY KEY (id);
ALTER TABLE conversations ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_conversations_created_at ON public.conversations USING btree (created_at DESC);
CREATE INDEX idx_conversations_created_by ON public.conversations USING btree (created_by);
CREATE INDEX idx_conversations_type ON public.conversations USING btree (type);

-- ========================================
-- TABLE: currency_settings
-- ========================================
CREATE TABLE currency_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  currency_code CHARACTER VARYING(3) NOT NULL,
  currency_name CHARACTER VARYING(50) NOT NULL,
  symbol CHARACTER VARYING(5) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  exchange_rate NUMERIC DEFAULT 1.0,
  base_currency BOOLEAN DEFAULT false,
  decimal_places INTEGER DEFAULT 2,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  auto_update_enabled BOOLEAN DEFAULT false,
  update_frequency_hours INTEGER DEFAULT 6,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  last_update_status CHARACTER VARYING(20) DEFAULT 'manual'::character varying,
  last_update_source CHARACTER VARYING(50),
  rate_margin_percent NUMERIC DEFAULT 0.0
);

ALTER TABLE currency_settings ADD PRIMARY KEY (id);
ALTER TABLE currency_settings ADD CONSTRAINT currency_settings_currency_code_key UNIQUE (currency_code);
CREATE UNIQUE INDEX currency_settings_currency_code_key ON public.currency_settings USING btree (currency_code);
CREATE INDEX idx_currency_settings_active ON public.currency_settings USING btree (is_active);
CREATE INDEX idx_currency_settings_auto_update ON public.currency_settings USING btree (auto_update_enabled, last_updated_at);

-- ========================================
-- TABLE: currency_update_logs
-- ========================================
CREATE TABLE currency_update_logs (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  currency_code CHARACTER VARYING(3) NOT NULL,
  old_rate NUMERIC,
  new_rate NUMERIC NOT NULL,
  rate_change_percent NUMERIC,
  source CHARACTER VARYING(50) NOT NULL,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'success'::character varying,
  error_message TEXT,
  triggered_by CHARACTER VARYING(50),
  triggered_by_user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE currency_update_logs ADD PRIMARY KEY (id);
ALTER TABLE currency_update_logs ADD CONSTRAINT currency_update_logs_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES users(id);
CREATE INDEX idx_currency_update_logs_currency_date ON public.currency_update_logs USING btree (currency_code, created_at DESC);
CREATE INDEX idx_currency_update_logs_source ON public.currency_update_logs USING btree (source);
CREATE INDEX idx_currency_update_logs_status ON public.currency_update_logs USING btree (status, created_at DESC);

-- ========================================
-- TABLE: customer_packages
-- ========================================
CREATE TABLE customer_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  service_package_id UUID NOT NULL,
  purchase_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  purchase_price NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  package_name CHARACTER VARYING(255) NOT NULL,
  lesson_service_name CHARACTER VARYING(255),
  total_hours NUMERIC DEFAULT 0,
  used_hours NUMERIC DEFAULT 0,
  remaining_hours NUMERIC DEFAULT 0,
  status CHARACTER VARYING(20) DEFAULT 'active'::character varying,
  expiry_date DATE,
  last_used_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  check_in_date DATE,
  check_out_date DATE,
  rental_days_total INTEGER DEFAULT 0,
  rental_days_used INTEGER DEFAULT 0,
  rental_days_remaining INTEGER DEFAULT 0,
  accommodation_nights_total INTEGER DEFAULT 0,
  accommodation_nights_used INTEGER DEFAULT 0,
  accommodation_nights_remaining INTEGER DEFAULT 0,
  package_type CHARACTER VARYING(32) DEFAULT 'lesson'::character varying,
  includes_lessons BOOLEAN DEFAULT true,
  includes_rental BOOLEAN DEFAULT false,
  includes_accommodation BOOLEAN DEFAULT false,
  rental_service_id UUID,
  accommodation_unit_id UUID,
  rental_service_name CHARACTER VARYING(255),
  accommodation_unit_name CHARACTER VARYING(255),
  gateway_transaction_id CHARACTER VARYING(512)
);

ALTER TABLE customer_packages ADD PRIMARY KEY (id);
ALTER TABLE customer_packages ADD CONSTRAINT customer_packages_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE customer_packages ADD CONSTRAINT customer_packages_service_package_id_fkey FOREIGN KEY (service_package_id) REFERENCES service_packages(id);
CREATE INDEX customer_packages_created_by_idx ON public.customer_packages USING btree (created_by);
CREATE INDEX idx_customer_packages_check_in ON public.customer_packages USING btree (check_in_date) WHERE (check_in_date IS NOT NULL);
CREATE INDEX idx_customer_packages_check_out ON public.customer_packages USING btree (check_out_date) WHERE (check_out_date IS NOT NULL);
CREATE INDEX idx_customer_packages_customer_id ON public.customer_packages USING btree (customer_id);
CREATE INDEX idx_customer_packages_expiry ON public.customer_packages USING btree (expiry_date);
CREATE INDEX idx_customer_packages_gateway_tx ON public.customer_packages USING btree (gateway_transaction_id) WHERE (gateway_transaction_id IS NOT NULL);
CREATE INDEX idx_customer_packages_includes ON public.customer_packages USING btree (includes_lessons, includes_rental, includes_accommodation);
CREATE INDEX idx_customer_packages_includes_rental ON public.customer_packages USING btree (includes_rental) WHERE (includes_rental = true);
CREATE INDEX idx_customer_packages_package_type ON public.customer_packages USING btree (package_type);
CREATE INDEX idx_customer_packages_rental_service ON public.customer_packages USING btree (rental_service_id) WHERE (rental_service_id IS NOT NULL);
CREATE INDEX idx_customer_packages_status ON public.customer_packages USING btree (status);
CREATE INDEX idx_customer_packages_type ON public.customer_packages USING btree (package_type);

-- ========================================
-- TABLE: deleted_booking_relations_backup
-- ========================================
CREATE TABLE deleted_booking_relations_backup (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  table_name CHARACTER VARYING(255) NOT NULL,
  original_data JSONB NOT NULL,
  backed_up_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE deleted_booking_relations_backup ADD PRIMARY KEY (id);
CREATE INDEX idx_deleted_relations_booking_id ON public.deleted_booking_relations_backup USING btree (booking_id);

-- ========================================
-- TABLE: deleted_bookings_backup
-- ========================================
CREATE TABLE deleted_bookings_backup (
  id UUID NOT NULL,
  original_data JSONB NOT NULL,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  deleted_by UUID,
  deletion_reason TEXT,
  deletion_metadata JSONB,
  backed_up_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  scheduled_hard_delete_at TIMESTAMP WITHOUT TIME ZONE,
  hard_deleted_at TIMESTAMP WITHOUT TIME ZONE
);

ALTER TABLE deleted_bookings_backup ADD PRIMARY KEY (id);
CREATE INDEX idx_deleted_bookings_backup_deleted_at ON public.deleted_bookings_backup USING btree (deleted_at);
CREATE INDEX idx_deleted_bookings_backup_scheduled_delete ON public.deleted_bookings_backup USING btree (scheduled_hard_delete_at);

-- ========================================
-- TABLE: deleted_entities_backup
-- ========================================
CREATE TABLE deleted_entities_backup (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  entity_type CHARACTER VARYING(100) NOT NULL,
  entity_id UUID NOT NULL,
  original_data JSONB NOT NULL,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  deleted_by UUID,
  deletion_reason TEXT,
  backed_up_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  scheduled_hard_delete_at TIMESTAMP WITHOUT TIME ZONE,
  hard_deleted_at TIMESTAMP WITHOUT TIME ZONE
);

ALTER TABLE deleted_entities_backup ADD PRIMARY KEY (id);
CREATE INDEX idx_deleted_entities_scheduled_delete ON public.deleted_entities_backup USING btree (scheduled_hard_delete_at);
CREATE INDEX idx_deleted_entities_type_id ON public.deleted_entities_backup USING btree (entity_type, entity_id);

-- ========================================
-- TABLE: earnings_audit_log
-- ========================================
CREATE TABLE earnings_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  booking_id UUID NOT NULL,
  operation_type CHARACTER VARYING(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE earnings_audit_log ADD PRIMARY KEY (id);
ALTER TABLE earnings_audit_log ADD CONSTRAINT earnings_audit_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE earnings_audit_log ADD CONSTRAINT earnings_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE earnings_audit_log ADD CONSTRAINT earnings_audit_log_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
CREATE INDEX idx_earnings_audit_log_booking_id ON public.earnings_audit_log USING btree (booking_id);
CREATE INDEX idx_earnings_audit_log_created_at ON public.earnings_audit_log USING btree (created_at);
CREATE INDEX idx_earnings_audit_log_instructor_id ON public.earnings_audit_log USING btree (instructor_id);

-- ========================================
-- TABLE: equipment
-- ========================================
CREATE TABLE equipment (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name CHARACTER VARYING(100) NOT NULL,
  type CHARACTER VARYING(50) NOT NULL,
  size CHARACTER VARYING(50),
  brand CHARACTER VARYING(50),
  model CHARACTER VARYING(50),
  serial_number CHARACTER VARYING(100),
  purchase_date DATE,
  purchase_price NUMERIC,
  condition CHARACTER VARYING(50) DEFAULT 'Good'::character varying,
  availability CHARACTER VARYING(50) DEFAULT 'Available'::character varying,
  maintenance_history JSONB,
  last_serviced_date DATE,
  location CHARACTER VARYING(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  image_url CHARACTER VARYING(500)
);

ALTER TABLE equipment ADD PRIMARY KEY (id);
CREATE INDEX idx_equipment_availability ON public.equipment USING btree (availability);
CREATE INDEX idx_equipment_type ON public.equipment USING btree (type);

-- ========================================
-- TABLE: event_registrations
-- ========================================
CREATE TABLE event_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status CHARACTER VARYING(16) NOT NULL DEFAULT 'registered'::character varying,
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE event_registrations ADD PRIMARY KEY (id);
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id);
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_event_id_user_id_key UNIQUE (event_id);
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_event_id_user_id_key UNIQUE (event_id);
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_event_id_user_id_key UNIQUE (user_id);
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_event_id_user_id_key UNIQUE (user_id);
CREATE UNIQUE INDEX event_registrations_event_id_user_id_key ON public.event_registrations USING btree (event_id, user_id);
CREATE INDEX idx_event_registrations_event ON public.event_registrations USING btree (event_id);
CREATE INDEX idx_event_registrations_event_id ON public.event_registrations USING btree (event_id);
CREATE INDEX idx_event_registrations_status ON public.event_registrations USING btree (status);
CREATE INDEX idx_event_registrations_user_id ON public.event_registrations USING btree (user_id);

-- ========================================
-- TABLE: events
-- ========================================
CREATE TABLE events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_type CHARACTER VARYING(32) NOT NULL DEFAULT 'other'::character varying,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE,
  location TEXT,
  description TEXT,
  status CHARACTER VARYING(16) NOT NULL DEFAULT 'scheduled'::character varying,
  capacity INTEGER,
  price NUMERIC,
  currency CHARACTER VARYING(8),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  image_url TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE events ADD PRIMARY KEY (id);
ALTER TABLE events ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_events_deleted_at ON public.events USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_events_event_type ON public.events USING btree (event_type);
CREATE INDEX idx_events_start_at ON public.events USING btree (start_at);
CREATE INDEX idx_events_status ON public.events USING btree (status);

-- ========================================
-- TABLE: family_members
-- ========================================
CREATE TABLE family_members (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  parent_user_id UUID NOT NULL,
  full_name CHARACTER VARYING(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  relationship CHARACTER VARYING(50) NOT NULL,
  gender CHARACTER VARYING(50),
  medical_notes TEXT,
  emergency_contact CHARACTER VARYING(50),
  photo_url CHARACTER VARYING(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

ALTER TABLE family_members ADD PRIMARY KEY (id);
ALTER TABLE family_members ADD CONSTRAINT family_members_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id);
CREATE INDEX idx_family_members_active ON public.family_members USING btree (is_active);
CREATE INDEX idx_family_members_deleted ON public.family_members USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_family_members_parent ON public.family_members USING btree (parent_user_id);

-- ========================================
-- TABLE: feedback
-- ========================================
CREATE TABLE feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  booking_id UUID,
  student_id UUID,
  instructor_id UUID,
  rating INTEGER NOT NULL,
  comment TEXT,
  skill_level CHARACTER VARYING(20),
  progress_notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE feedback ADD PRIMARY KEY (id);
ALTER TABLE feedback ADD CONSTRAINT feedback_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE feedback ADD CONSTRAINT feedback_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE feedback ADD CONSTRAINT feedback_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
ALTER TABLE feedback ADD CONSTRAINT feedback_booking_id_key UNIQUE (booking_id);
CREATE UNIQUE INDEX feedback_booking_id_key ON public.feedback USING btree (booking_id);
CREATE INDEX idx_feedback_booking_id ON public.feedback USING btree (booking_id);
CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at);
CREATE INDEX idx_feedback_instructor_id ON public.feedback USING btree (instructor_id);
CREATE INDEX idx_feedback_student_id ON public.feedback USING btree (student_id);

-- ========================================
-- TABLE: financial_events
-- ========================================
CREATE TABLE financial_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type CHARACTER VARYING(50) NOT NULL,
  entity_type CHARACTER VARYING(50) NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

ALTER TABLE financial_events ADD PRIMARY KEY (id);
ALTER TABLE financial_events ADD CONSTRAINT financial_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE financial_events ADD CONSTRAINT financial_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_financial_events_created_at ON public.financial_events USING btree (created_at);
CREATE INDEX idx_financial_events_entity ON public.financial_events USING btree (entity_type, entity_id);
CREATE INDEX idx_financial_events_type ON public.financial_events USING btree (event_type);
CREATE INDEX idx_financial_events_user_id ON public.financial_events USING btree (user_id);

-- ========================================
-- TABLE: financial_settings
-- ========================================
CREATE TABLE financial_settings (
  id INTEGER NOT NULL DEFAULT nextval('financial_settings_id_seq'::regclass),
  tax_rate_pct NUMERIC NOT NULL DEFAULT 0,
  insurance_rate_pct NUMERIC NOT NULL DEFAULT 0,
  equipment_rate_pct NUMERIC NOT NULL DEFAULT 0,
  payment_method_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  effective_to TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accrual_tax_rate_pct NUMERIC NOT NULL DEFAULT 0,
  accrual_insurance_rate_pct NUMERIC NOT NULL DEFAULT 0,
  accrual_equipment_rate_pct NUMERIC NOT NULL DEFAULT 0,
  accrual_payment_method_fees JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE financial_settings ADD PRIMARY KEY (id);
ALTER TABLE financial_settings ADD CONSTRAINT financial_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_financial_settings_active ON public.financial_settings USING btree (active);
CREATE INDEX idx_financial_settings_effective_from ON public.financial_settings USING btree (effective_from DESC);

-- ========================================
-- TABLE: financial_settings_overrides
-- ========================================
CREATE TABLE financial_settings_overrides (
  id INTEGER NOT NULL DEFAULT nextval('financial_settings_overrides_id_seq'::regclass),
  settings_id INTEGER NOT NULL,
  scope_type CHARACTER VARYING(50) NOT NULL,
  scope_value CHARACTER VARYING(255) NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  precedence INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE financial_settings_overrides ADD PRIMARY KEY (id);
ALTER TABLE financial_settings_overrides ADD CONSTRAINT financial_settings_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE financial_settings_overrides ADD CONSTRAINT financial_settings_overrides_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES financial_settings(id);
CREATE INDEX idx_fs_overrides_active ON public.financial_settings_overrides USING btree (active);
CREATE INDEX idx_fs_overrides_scope ON public.financial_settings_overrides USING btree (scope_type, scope_value);
CREATE INDEX idx_fs_overrides_settings ON public.financial_settings_overrides USING btree (settings_id);

-- ========================================
-- TABLE: form_analytics_events
-- ========================================
CREATE TABLE form_analytics_events (
  id INTEGER NOT NULL DEFAULT nextval('form_analytics_events_id_seq'::regclass),
  form_template_id INTEGER NOT NULL,
  quick_link_id INTEGER,
  event_type CHARACTER VARYING(50) NOT NULL,
  session_id CHARACTER VARYING(100),
  user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address CHARACTER VARYING(45),
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE form_analytics_events ADD PRIMARY KEY (id);
ALTER TABLE form_analytics_events ADD CONSTRAINT form_analytics_events_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id);
ALTER TABLE form_analytics_events ADD CONSTRAINT form_analytics_events_quick_link_id_fkey FOREIGN KEY (quick_link_id) REFERENCES quick_links(id);
ALTER TABLE form_analytics_events ADD CONSTRAINT form_analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_form_analytics_created_at ON public.form_analytics_events USING btree (created_at);
CREATE INDEX idx_form_analytics_event_type ON public.form_analytics_events USING btree (event_type);
CREATE INDEX idx_form_analytics_form_id ON public.form_analytics_events USING btree (form_template_id);
CREATE INDEX idx_form_analytics_quick_link ON public.form_analytics_events USING btree (quick_link_id);
CREATE INDEX idx_form_analytics_session ON public.form_analytics_events USING btree (session_id);

-- ========================================
-- TABLE: form_email_logs
-- ========================================
CREATE TABLE form_email_logs (
  id INTEGER NOT NULL DEFAULT nextval('form_email_logs_id_seq'::regclass),
  notification_id INTEGER,
  form_submission_id INTEGER,
  recipient_email CHARACTER VARYING(255) NOT NULL,
  subject TEXT NOT NULL,
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  error_message TEXT,
  sent_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE form_email_logs ADD PRIMARY KEY (id);
ALTER TABLE form_email_logs ADD CONSTRAINT form_email_logs_form_submission_id_fkey FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id);
ALTER TABLE form_email_logs ADD CONSTRAINT form_email_logs_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES form_email_notifications(id);
CREATE INDEX idx_form_email_logs_status ON public.form_email_logs USING btree (status);
CREATE INDEX idx_form_email_logs_submission ON public.form_email_logs USING btree (form_submission_id);

-- ========================================
-- TABLE: form_email_notifications
-- ========================================
CREATE TABLE form_email_notifications (
  id INTEGER NOT NULL DEFAULT nextval('form_email_notifications_id_seq'::regclass),
  form_template_id INTEGER NOT NULL,
  notification_type CHARACTER VARYING(50) NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  recipient_type CHARACTER VARYING(50) NOT NULL DEFAULT 'submitter'::character varying,
  recipient_emails ARRAY,
  recipient_field_name CHARACTER VARYING(100),
  cc_emails ARRAY,
  bcc_emails ARRAY,
  reply_to CHARACTER VARYING(255),
  trigger_status CHARACTER VARYING(50),
  trigger_delay_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  include_submission_data BOOLEAN DEFAULT true,
  include_confirmation_number BOOLEAN DEFAULT true,
  available_variables JSONB DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE form_email_notifications ADD PRIMARY KEY (id);
ALTER TABLE form_email_notifications ADD CONSTRAINT form_email_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE form_email_notifications ADD CONSTRAINT form_email_notifications_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id);
CREATE INDEX idx_form_email_notifications_active ON public.form_email_notifications USING btree (is_active);
CREATE INDEX idx_form_email_notifications_form_id ON public.form_email_notifications USING btree (form_template_id);
CREATE INDEX idx_form_email_notifications_type ON public.form_email_notifications USING btree (notification_type);

-- ========================================
-- TABLE: form_fields
-- ========================================
CREATE TABLE form_fields (
  id INTEGER NOT NULL DEFAULT nextval('form_fields_id_seq'::regclass),
  form_step_id INTEGER NOT NULL,
  field_type CHARACTER VARYING(50) NOT NULL,
  field_name CHARACTER VARYING(100) NOT NULL,
  field_label CHARACTER VARYING(255) NOT NULL,
  placeholder_text CHARACTER VARYING(255),
  help_text TEXT,
  default_value TEXT,
  is_required BOOLEAN DEFAULT false,
  is_readonly BOOLEAN DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  width CHARACTER VARYING(20) DEFAULT 'full'::character varying,
  validation_rules JSONB DEFAULT '{}'::jsonb,
  options JSONB DEFAULT '[]'::jsonb,
  conditional_logic JSONB DEFAULT '{}'::jsonb,
  integration_mapping CHARACTER VARYING(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE form_fields ADD PRIMARY KEY (id);
ALTER TABLE form_fields ADD CONSTRAINT form_fields_form_step_id_fkey FOREIGN KEY (form_step_id) REFERENCES form_steps(id);
CREATE INDEX idx_form_fields_name ON public.form_fields USING btree (field_name);
CREATE INDEX idx_form_fields_order ON public.form_fields USING btree (form_step_id, order_index);
CREATE INDEX idx_form_fields_step_id ON public.form_fields USING btree (form_step_id);
CREATE INDEX idx_form_fields_type ON public.form_fields USING btree (field_type);

-- ========================================
-- TABLE: form_quick_action_tokens
-- ========================================
CREATE TABLE form_quick_action_tokens (
  id INTEGER NOT NULL DEFAULT nextval('form_quick_action_tokens_id_seq'::regclass),
  form_submission_id INTEGER NOT NULL,
  token CHARACTER VARYING(64) NOT NULL,
  action CHARACTER VARYING(20) NOT NULL,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  used_at TIMESTAMP WITHOUT TIME ZONE,
  used_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE form_quick_action_tokens ADD PRIMARY KEY (id);
ALTER TABLE form_quick_action_tokens ADD CONSTRAINT form_quick_action_tokens_form_submission_id_fkey FOREIGN KEY (form_submission_id) REFERENCES form_submissions(id);
ALTER TABLE form_quick_action_tokens ADD CONSTRAINT form_quick_action_tokens_used_by_fkey FOREIGN KEY (used_by) REFERENCES users(id);
ALTER TABLE form_quick_action_tokens ADD CONSTRAINT form_quick_action_tokens_token_key UNIQUE (token);
CREATE UNIQUE INDEX form_quick_action_tokens_token_key ON public.form_quick_action_tokens USING btree (token);
CREATE INDEX idx_form_quick_action_tokens_expires ON public.form_quick_action_tokens USING btree (expires_at) WHERE (used_at IS NULL);
CREATE INDEX idx_form_quick_action_tokens_submission ON public.form_quick_action_tokens USING btree (form_submission_id);
CREATE INDEX idx_form_quick_action_tokens_token ON public.form_quick_action_tokens USING btree (token) WHERE (used_at IS NULL);
CREATE UNIQUE INDEX idx_form_quick_action_tokens_unique_admin_actions ON public.form_quick_action_tokens USING btree (form_submission_id, action) WHERE ((action)::text = ANY ((ARRAY['approve'::character varying, 'reject'::character varying])::text[]));

-- ========================================
-- TABLE: form_steps
-- ========================================
CREATE TABLE form_steps (
  id INTEGER NOT NULL DEFAULT nextval('form_steps_id_seq'::regclass),
  form_template_id INTEGER NOT NULL,
  title CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  show_progress BOOLEAN DEFAULT true,
  completion_message TEXT,
  skip_logic JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE form_steps ADD PRIMARY KEY (id);
ALTER TABLE form_steps ADD CONSTRAINT form_steps_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id);
CREATE INDEX idx_form_steps_order ON public.form_steps USING btree (form_template_id, order_index);
CREATE INDEX idx_form_steps_template_id ON public.form_steps USING btree (form_template_id);

-- ========================================
-- TABLE: form_submissions
-- ========================================
CREATE TABLE form_submissions (
  id INTEGER NOT NULL DEFAULT nextval('form_submissions_id_seq'::regclass),
  quick_link_id INTEGER,
  form_template_id INTEGER NOT NULL,
  session_id CHARACTER VARYING(100),
  status CHARACTER VARYING(50) DEFAULT 'submitted'::character varying,
  submission_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  user_id UUID,
  submitted_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE form_submissions ADD PRIMARY KEY (id);
ALTER TABLE form_submissions ADD CONSTRAINT form_submissions_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id);
ALTER TABLE form_submissions ADD CONSTRAINT form_submissions_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES users(id);
ALTER TABLE form_submissions ADD CONSTRAINT form_submissions_quick_link_id_fkey FOREIGN KEY (quick_link_id) REFERENCES quick_links(id);
ALTER TABLE form_submissions ADD CONSTRAINT form_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_form_submissions_data ON public.form_submissions USING gin (submission_data);
CREATE INDEX idx_form_submissions_quick_link ON public.form_submissions USING btree (quick_link_id);
CREATE INDEX idx_form_submissions_session ON public.form_submissions USING btree (session_id);
CREATE INDEX idx_form_submissions_status ON public.form_submissions USING btree (status);
CREATE INDEX idx_form_submissions_submitted_at ON public.form_submissions USING btree (submitted_at DESC);
CREATE INDEX idx_form_submissions_template ON public.form_submissions USING btree (form_template_id);
CREATE INDEX idx_form_submissions_user ON public.form_submissions USING btree (user_id);

-- ========================================
-- TABLE: form_template_versions
-- ========================================
CREATE TABLE form_template_versions (
  id INTEGER NOT NULL DEFAULT nextval('form_template_versions_id_seq'::regclass),
  form_template_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  version_label CHARACTER VARYING(100),
  snapshot_data JSONB NOT NULL,
  change_summary TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE form_template_versions ADD PRIMARY KEY (id);
ALTER TABLE form_template_versions ADD CONSTRAINT form_template_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE form_template_versions ADD CONSTRAINT form_template_versions_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id);
ALTER TABLE form_template_versions ADD CONSTRAINT unique_version_per_template UNIQUE (form_template_id);
ALTER TABLE form_template_versions ADD CONSTRAINT unique_version_per_template UNIQUE (form_template_id);
ALTER TABLE form_template_versions ADD CONSTRAINT unique_version_per_template UNIQUE (version_number);
ALTER TABLE form_template_versions ADD CONSTRAINT unique_version_per_template UNIQUE (version_number);
CREATE INDEX idx_form_template_versions_created ON public.form_template_versions USING btree (created_at DESC);
CREATE INDEX idx_form_template_versions_template ON public.form_template_versions USING btree (form_template_id);
CREATE UNIQUE INDEX unique_version_per_template ON public.form_template_versions USING btree (form_template_id, version_number);

-- ========================================
-- TABLE: form_templates
-- ========================================
CREATE TABLE form_templates (
  id INTEGER NOT NULL DEFAULT nextval('form_templates_id_seq'::regclass),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  category CHARACTER VARYING(50) DEFAULT 'registration'::character varying,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  theme_config JSONB DEFAULT '{}'::jsonb,
  settings JSONB DEFAULT '{"redirect_url": null, "allow_anonymous": true, "require_captcha": false, "show_progress_bar": true, "allow_save_progress": true, "confirmation_message": "Thank you for your submission!"}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  current_version INTEGER DEFAULT 1,
  published_version INTEGER,
  last_published_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE form_templates ADD PRIMARY KEY (id);
ALTER TABLE form_templates ADD CONSTRAINT form_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_form_templates_active ON public.form_templates USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_form_templates_category ON public.form_templates USING btree (category);
CREATE INDEX idx_form_templates_created_by ON public.form_templates USING btree (created_by);
CREATE INDEX idx_form_templates_deleted_at ON public.form_templates USING btree (deleted_at) WHERE (deleted_at IS NULL);

-- ========================================
-- TABLE: group_booking_participants
-- ========================================
CREATE TABLE group_booking_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  group_booking_id UUID NOT NULL,
  user_id UUID,
  email CHARACTER VARYING(255) NOT NULL,
  full_name CHARACTER VARYING(255),
  phone CHARACTER VARYING(50),
  invitation_token CHARACTER VARYING(255),
  invitation_sent_at TIMESTAMP WITHOUT TIME ZONE,
  invitation_expires_at TIMESTAMP WITHOUT TIME ZONE,
  invited_by UUID,
  status CHARACTER VARYING(50) NOT NULL DEFAULT 'invited'::character varying,
  payment_status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  payment_method CHARACTER VARYING(50),
  amount_due NUMERIC,
  amount_paid NUMERIC DEFAULT 0,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  paid_at TIMESTAMP WITHOUT TIME ZONE,
  payment_reference CHARACTER VARYING(255),
  customer_package_id UUID,
  package_hours_used NUMERIC,
  is_organizer BOOLEAN DEFAULT false,
  decline_reason TEXT,
  accepted_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE group_booking_participants ADD PRIMARY KEY (id);
ALTER TABLE group_booking_participants ADD CONSTRAINT group_booking_participants_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES customer_packages(id);
ALTER TABLE group_booking_participants ADD CONSTRAINT group_booking_participants_group_booking_id_fkey FOREIGN KEY (group_booking_id) REFERENCES group_bookings(id);
ALTER TABLE group_booking_participants ADD CONSTRAINT group_booking_participants_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id);
ALTER TABLE group_booking_participants ADD CONSTRAINT group_booking_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE group_booking_participants ADD CONSTRAINT group_booking_participants_invitation_token_key UNIQUE (invitation_token);
CREATE UNIQUE INDEX group_booking_participants_invitation_token_key ON public.group_booking_participants USING btree (invitation_token);
CREATE INDEX idx_group_participants_booking ON public.group_booking_participants USING btree (group_booking_id);
CREATE INDEX idx_group_participants_status ON public.group_booking_participants USING btree (status);
CREATE INDEX idx_group_participants_token ON public.group_booking_participants USING btree (invitation_token);
CREATE INDEX idx_group_participants_user ON public.group_booking_participants USING btree (user_id);

-- ========================================
-- TABLE: group_bookings
-- ========================================
CREATE TABLE group_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  booking_id UUID,
  organizer_id UUID,
  service_id UUID,
  instructor_id UUID,
  title CHARACTER VARYING(255),
  description TEXT,
  max_participants INTEGER NOT NULL DEFAULT 6,
  min_participants INTEGER NOT NULL DEFAULT 2,
  price_per_person NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  scheduled_date DATE,
  start_time TIME WITHOUT TIME ZONE,
  end_time TIME WITHOUT TIME ZONE,
  duration_hours NUMERIC,
  payment_model CHARACTER VARYING(50) NOT NULL DEFAULT 'individual'::character varying,
  total_amount NUMERIC,
  organizer_paid BOOLEAN DEFAULT false,
  organizer_paid_at TIMESTAMP WITHOUT TIME ZONE,
  status CHARACTER VARYING(50) NOT NULL DEFAULT 'pending'::character varying,
  registration_deadline TIMESTAMP WITHOUT TIME ZONE,
  payment_deadline TIMESTAMP WITHOUT TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  created_by UUID
);

ALTER TABLE group_bookings ADD PRIMARY KEY (id);
ALTER TABLE group_bookings ADD CONSTRAINT group_bookings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE group_bookings ADD CONSTRAINT group_bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE group_bookings ADD CONSTRAINT group_bookings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE group_bookings ADD CONSTRAINT group_bookings_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES users(id);
ALTER TABLE group_bookings ADD CONSTRAINT group_bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
CREATE INDEX idx_group_bookings_instructor ON public.group_bookings USING btree (instructor_id);
CREATE INDEX idx_group_bookings_organizer ON public.group_bookings USING btree (organizer_id);
CREATE INDEX idx_group_bookings_scheduled_date ON public.group_bookings USING btree (scheduled_date);
CREATE INDEX idx_group_bookings_service ON public.group_bookings USING btree (service_id);
CREATE INDEX idx_group_bookings_status ON public.group_bookings USING btree (status);

-- ========================================
-- TABLE: group_lesson_requests
-- ========================================
CREATE TABLE group_lesson_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_id UUID NOT NULL,
  preferred_date_start DATE NOT NULL,
  preferred_date_end DATE,
  preferred_time_of_day CHARACTER VARYING(20) DEFAULT 'any'::character varying,
  preferred_duration_hours NUMERIC DEFAULT 1.0,
  skill_level CHARACTER VARYING(20) DEFAULT 'beginner'::character varying,
  notes TEXT,
  status CHARACTER VARYING(20) DEFAULT 'pending'::character varying,
  matched_group_booking_id UUID,
  matched_at TIMESTAMP WITH TIME ZONE,
  matched_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE group_lesson_requests ADD PRIMARY KEY (id);
ALTER TABLE group_lesson_requests ADD CONSTRAINT group_lesson_requests_matched_by_fkey FOREIGN KEY (matched_by) REFERENCES users(id);
ALTER TABLE group_lesson_requests ADD CONSTRAINT group_lesson_requests_matched_group_booking_id_fkey FOREIGN KEY (matched_group_booking_id) REFERENCES group_bookings(id);
ALTER TABLE group_lesson_requests ADD CONSTRAINT group_lesson_requests_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE group_lesson_requests ADD CONSTRAINT group_lesson_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_group_lesson_requests_preferred_date ON public.group_lesson_requests USING btree (preferred_date_start, preferred_date_end) WHERE (((status)::text = 'pending'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_group_lesson_requests_service_id ON public.group_lesson_requests USING btree (service_id);
CREATE INDEX idx_group_lesson_requests_skill_level ON public.group_lesson_requests USING btree (skill_level) WHERE (((status)::text = 'pending'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_group_lesson_requests_status ON public.group_lesson_requests USING btree (status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_group_lesson_requests_user_id ON public.group_lesson_requests USING btree (user_id);

-- ========================================
-- TABLE: instructor_category_rates
-- ========================================
CREATE TABLE instructor_category_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  lesson_category CHARACTER VARYING(32) NOT NULL,
  rate_type CHARACTER VARYING(20) NOT NULL DEFAULT 'fixed'::character varying,
  rate_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_category_rates ADD PRIMARY KEY (id);
ALTER TABLE instructor_category_rates ADD CONSTRAINT instructor_category_rates_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_category_rates ADD CONSTRAINT instructor_category_rates_instructor_id_lesson_category_key UNIQUE (instructor_id);
ALTER TABLE instructor_category_rates ADD CONSTRAINT instructor_category_rates_instructor_id_lesson_category_key UNIQUE (instructor_id);
ALTER TABLE instructor_category_rates ADD CONSTRAINT instructor_category_rates_instructor_id_lesson_category_key UNIQUE (lesson_category);
ALTER TABLE instructor_category_rates ADD CONSTRAINT instructor_category_rates_instructor_id_lesson_category_key UNIQUE (lesson_category);
CREATE INDEX idx_instructor_category_rates_category ON public.instructor_category_rates USING btree (lesson_category);
CREATE INDEX idx_instructor_category_rates_instructor ON public.instructor_category_rates USING btree (instructor_id);
CREATE UNIQUE INDEX instructor_category_rates_instructor_id_lesson_category_key ON public.instructor_category_rates USING btree (instructor_id, lesson_category);

-- ========================================
-- TABLE: instructor_commission_history
-- ========================================
CREATE TABLE instructor_commission_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  old_commission_rate NUMERIC,
  new_commission_rate NUMERIC NOT NULL,
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE,
  changed_by UUID,
  reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_commission_history ADD PRIMARY KEY (id);
ALTER TABLE instructor_commission_history ADD CONSTRAINT instructor_commission_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE instructor_commission_history ADD CONSTRAINT instructor_commission_history_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
CREATE INDEX idx_instructor_commission_history_active ON public.instructor_commission_history USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_instructor_commission_history_effective_date ON public.instructor_commission_history USING btree (effective_date);
CREATE INDEX idx_instructor_commission_history_instructor_id ON public.instructor_commission_history USING btree (instructor_id);

-- ========================================
-- TABLE: instructor_default_commissions
-- ========================================
CREATE TABLE instructor_default_commissions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL,
  commission_type CHARACTER VARYING(20) NOT NULL,
  commission_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_default_commissions ADD PRIMARY KEY (id);
ALTER TABLE instructor_default_commissions ADD CONSTRAINT instructor_default_commissions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_default_commissions ADD CONSTRAINT instructor_default_commissions_instructor_id_key UNIQUE (instructor_id);
CREATE INDEX idx_instructor_default_commissions_instructor ON public.instructor_default_commissions USING btree (instructor_id);
CREATE INDEX idx_instructor_default_commissions_instructor_id ON public.instructor_default_commissions USING btree (instructor_id);
CREATE UNIQUE INDEX instructor_default_commissions_instructor_id_key ON public.instructor_default_commissions USING btree (instructor_id);

-- ========================================
-- TABLE: instructor_earnings
-- ========================================
CREATE TABLE instructor_earnings (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL,
  booking_id UUID NOT NULL,
  base_rate NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL,
  bonus NUMERIC DEFAULT 0,
  total_earnings NUMERIC NOT NULL,
  lesson_date DATE NOT NULL,
  lesson_duration NUMERIC NOT NULL,
  lesson_amount NUMERIC NOT NULL,
  payroll_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying
);

ALTER TABLE instructor_earnings ADD PRIMARY KEY (id);
ALTER TABLE instructor_earnings ADD CONSTRAINT instructor_earnings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE instructor_earnings ADD CONSTRAINT instructor_earnings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_earnings ADD CONSTRAINT instructor_earnings_payroll_id_fkey FOREIGN KEY (payroll_id) REFERENCES instructor_payroll(id);
CREATE INDEX idx_earnings_booking ON public.instructor_earnings USING btree (booking_id);
CREATE INDEX idx_earnings_date ON public.instructor_earnings USING btree (lesson_date);
CREATE INDEX idx_earnings_instructor ON public.instructor_earnings USING btree (instructor_id);
CREATE INDEX idx_instructor_earnings_currency ON public.instructor_earnings USING btree (currency);

-- ========================================
-- TABLE: instructor_payroll
-- ========================================
CREATE TABLE instructor_payroll (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  base_salary NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  payment_date TIMESTAMP WITH TIME ZONE,
  payment_method CHARACTER VARYING(50),
  reference_number CHARACTER VARYING(100),
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_payroll ADD PRIMARY KEY (id);
ALTER TABLE instructor_payroll ADD CONSTRAINT instructor_payroll_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
CREATE INDEX idx_payroll_instructor ON public.instructor_payroll USING btree (instructor_id);
CREATE INDEX idx_payroll_period ON public.instructor_payroll USING btree (period_start_date, period_end_date);
CREATE INDEX idx_payroll_status ON public.instructor_payroll USING btree (status);

-- ========================================
-- TABLE: instructor_rate_history
-- ========================================
CREATE TABLE instructor_rate_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  old_rate NUMERIC,
  new_rate NUMERIC NOT NULL,
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_rate_history ADD PRIMARY KEY (id);
ALTER TABLE instructor_rate_history ADD CONSTRAINT instructor_rate_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE instructor_rate_history ADD CONSTRAINT instructor_rate_history_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
CREATE INDEX idx_instructor_rate_history_effective_date ON public.instructor_rate_history USING btree (effective_date);
CREATE INDEX idx_instructor_rate_history_instructor_id ON public.instructor_rate_history USING btree (instructor_id);

-- ========================================
-- TABLE: instructor_ratings
-- ========================================
CREATE TABLE instructor_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  booking_id UUID,
  student_id UUID NOT NULL,
  instructor_id UUID NOT NULL,
  service_type CHARACTER VARYING(32) NOT NULL DEFAULT 'lesson'::character varying,
  rating SMALLINT NOT NULL,
  feedback_text TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE instructor_ratings ADD PRIMARY KEY (id);
ALTER TABLE instructor_ratings ADD CONSTRAINT instructor_ratings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE instructor_ratings ADD CONSTRAINT instructor_ratings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_ratings ADD CONSTRAINT instructor_ratings_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
ALTER TABLE instructor_ratings ADD CONSTRAINT instructor_ratings_booking_id_key UNIQUE (booking_id);
CREATE INDEX idx_instructor_ratings_created_at ON public.instructor_ratings USING btree (created_at DESC);
CREATE INDEX idx_instructor_ratings_instructor_id ON public.instructor_ratings USING btree (instructor_id);
CREATE INDEX idx_instructor_ratings_student_id ON public.instructor_ratings USING btree (student_id);
CREATE UNIQUE INDEX instructor_ratings_booking_id_key ON public.instructor_ratings USING btree (booking_id);

-- ========================================
-- TABLE: instructor_service_commissions
-- ========================================
CREATE TABLE instructor_service_commissions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL,
  service_id UUID NOT NULL,
  commission_type CHARACTER VARYING(20) NOT NULL,
  commission_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_service_commissions ADD PRIMARY KEY (id);
ALTER TABLE instructor_service_commissions ADD CONSTRAINT instructor_service_commissions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_service_commissions ADD CONSTRAINT instructor_service_commissions_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE instructor_service_commissions ADD CONSTRAINT instructor_service_commissions_instructor_id_service_id_key UNIQUE (instructor_id);
ALTER TABLE instructor_service_commissions ADD CONSTRAINT instructor_service_commissions_instructor_id_service_id_key UNIQUE (instructor_id);
ALTER TABLE instructor_service_commissions ADD CONSTRAINT instructor_service_commissions_instructor_id_service_id_key UNIQUE (service_id);
ALTER TABLE instructor_service_commissions ADD CONSTRAINT instructor_service_commissions_instructor_id_service_id_key UNIQUE (service_id);
CREATE INDEX idx_instructor_service_commissions_instructor_id ON public.instructor_service_commissions USING btree (instructor_id);
CREATE INDEX idx_instructor_service_commissions_lookup ON public.instructor_service_commissions USING btree (instructor_id, service_id);
CREATE INDEX idx_instructor_service_commissions_service_id ON public.instructor_service_commissions USING btree (service_id);
CREATE UNIQUE INDEX instructor_service_commissions_instructor_id_service_id_key ON public.instructor_service_commissions USING btree (instructor_id, service_id);

-- ========================================
-- TABLE: instructor_services
-- ========================================
CREATE TABLE instructor_services (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL,
  service_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_services ADD PRIMARY KEY (id);
ALTER TABLE instructor_services ADD CONSTRAINT instructor_services_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_services ADD CONSTRAINT instructor_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE instructor_services ADD CONSTRAINT instructor_services_instructor_id_service_id_key UNIQUE (instructor_id);
ALTER TABLE instructor_services ADD CONSTRAINT instructor_services_instructor_id_service_id_key UNIQUE (instructor_id);
ALTER TABLE instructor_services ADD CONSTRAINT instructor_services_instructor_id_service_id_key UNIQUE (service_id);
ALTER TABLE instructor_services ADD CONSTRAINT instructor_services_instructor_id_service_id_key UNIQUE (service_id);
CREATE INDEX idx_instructor_services_instructor_id ON public.instructor_services USING btree (instructor_id);
CREATE INDEX idx_instructor_services_service_id ON public.instructor_services USING btree (service_id);
CREATE UNIQUE INDEX instructor_services_instructor_id_service_id_key ON public.instructor_services USING btree (instructor_id, service_id);

-- ========================================
-- TABLE: instructor_skills
-- ========================================
CREATE TABLE instructor_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  discipline_tag CHARACTER VARYING(32) NOT NULL,
  lesson_categories ARRAY NOT NULL DEFAULT '{}'::text[],
  max_level CHARACTER VARYING(32) NOT NULL DEFAULT 'beginner'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE instructor_skills ADD PRIMARY KEY (id);
ALTER TABLE instructor_skills ADD CONSTRAINT instructor_skills_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_skills ADD CONSTRAINT instructor_skills_instructor_id_discipline_tag_key UNIQUE (discipline_tag);
ALTER TABLE instructor_skills ADD CONSTRAINT instructor_skills_instructor_id_discipline_tag_key UNIQUE (discipline_tag);
ALTER TABLE instructor_skills ADD CONSTRAINT instructor_skills_instructor_id_discipline_tag_key UNIQUE (instructor_id);
ALTER TABLE instructor_skills ADD CONSTRAINT instructor_skills_instructor_id_discipline_tag_key UNIQUE (instructor_id);
CREATE INDEX idx_instructor_skills_discipline ON public.instructor_skills USING btree (discipline_tag);
CREATE INDEX idx_instructor_skills_instructor ON public.instructor_skills USING btree (instructor_id);
CREATE UNIQUE INDEX instructor_skills_instructor_id_discipline_tag_key ON public.instructor_skills USING btree (instructor_id, discipline_tag);

-- ========================================
-- TABLE: instructor_student_notes
-- ========================================
CREATE TABLE instructor_student_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL,
  student_id UUID NOT NULL,
  booking_id UUID,
  note_text TEXT NOT NULL,
  visibility CHARACTER VARYING(32) NOT NULL DEFAULT 'student_visible'::character varying,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE instructor_student_notes ADD PRIMARY KEY (id);
ALTER TABLE instructor_student_notes ADD CONSTRAINT instructor_student_notes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE instructor_student_notes ADD CONSTRAINT instructor_student_notes_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE instructor_student_notes ADD CONSTRAINT instructor_student_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
CREATE INDEX idx_instructor_student_notes_booking_id ON public.instructor_student_notes USING btree (booking_id);
CREATE INDEX idx_instructor_student_notes_instructor_id ON public.instructor_student_notes USING btree (instructor_id);
CREATE INDEX idx_instructor_student_notes_student_id ON public.instructor_student_notes USING btree (student_id);

-- ========================================
-- TABLE: legal_documents
-- ========================================
CREATE TABLE legal_documents (
  id INTEGER NOT NULL DEFAULT nextval('legal_documents_id_seq'::regclass),
  document_type CHARACTER VARYING(50) NOT NULL,
  version CHARACTER VARYING(50),
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE legal_documents ADD PRIMARY KEY (id);
CREATE INDEX idx_legal_documents_type_active ON public.legal_documents USING btree (document_type, is_active);

-- ========================================
-- TABLE: liability_waivers
-- ========================================
CREATE TABLE liability_waivers (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID,
  family_member_id UUID,
  signer_user_id UUID NOT NULL,
  waiver_version CHARACTER VARYING(20) NOT NULL,
  language_code CHARACTER VARYING(10) NOT NULL DEFAULT 'en'::character varying,
  signature_image_url CHARACTER VARYING(500) NOT NULL,
  signature_data TEXT NOT NULL,
  ip_address CHARACTER VARYING(45) NOT NULL,
  user_agent TEXT,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT true,
  photo_consent BOOLEAN DEFAULT false,
  signed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE liability_waivers ADD PRIMARY KEY (id);
ALTER TABLE liability_waivers ADD CONSTRAINT liability_waivers_family_member_id_fkey FOREIGN KEY (family_member_id) REFERENCES family_members(id);
ALTER TABLE liability_waivers ADD CONSTRAINT liability_waivers_signer_user_id_fkey FOREIGN KEY (signer_user_id) REFERENCES users(id);
ALTER TABLE liability_waivers ADD CONSTRAINT liability_waivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_waivers_family_member ON public.liability_waivers USING btree (family_member_id);
CREATE INDEX idx_waivers_signed_at ON public.liability_waivers USING btree (signed_at);
CREATE INDEX idx_waivers_signer ON public.liability_waivers USING btree (signer_user_id);
CREATE INDEX idx_waivers_user ON public.liability_waivers USING btree (user_id);
CREATE INDEX idx_waivers_version ON public.liability_waivers USING btree (waiver_version);

-- ========================================
-- TABLE: manager_commission_settings
-- ========================================
CREATE TABLE manager_commission_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL,
  commission_type CHARACTER VARYING(50) NOT NULL DEFAULT 'flat'::character varying,
  default_rate NUMERIC NOT NULL DEFAULT 10.00,
  booking_rate NUMERIC DEFAULT NULL::numeric,
  rental_rate NUMERIC DEFAULT NULL::numeric,
  accommodation_rate NUMERIC DEFAULT NULL::numeric,
  package_rate NUMERIC DEFAULT NULL::numeric,
  tier_settings JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  salary_type CHARACTER VARYING(30) DEFAULT 'commission'::character varying,
  fixed_salary_amount NUMERIC DEFAULT 0,
  per_lesson_amount NUMERIC DEFAULT 0,
  shop_rate NUMERIC,
  membership_rate NUMERIC
);

ALTER TABLE manager_commission_settings ADD PRIMARY KEY (id);
ALTER TABLE manager_commission_settings ADD CONSTRAINT manager_commission_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE manager_commission_settings ADD CONSTRAINT manager_commission_settings_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES users(id);
ALTER TABLE manager_commission_settings ADD CONSTRAINT unique_active_manager_setting UNIQUE (is_active);
ALTER TABLE manager_commission_settings ADD CONSTRAINT unique_active_manager_setting UNIQUE (is_active);
ALTER TABLE manager_commission_settings ADD CONSTRAINT unique_active_manager_setting UNIQUE (manager_user_id);
ALTER TABLE manager_commission_settings ADD CONSTRAINT unique_active_manager_setting UNIQUE (manager_user_id);
CREATE INDEX idx_manager_commission_settings_active ON public.manager_commission_settings USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_manager_commission_settings_manager ON public.manager_commission_settings USING btree (manager_user_id);
CREATE UNIQUE INDEX unique_active_manager_setting ON public.manager_commission_settings USING btree (manager_user_id, is_active);

-- ========================================
-- TABLE: manager_commissions
-- ========================================
CREATE TABLE manager_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL,
  source_type CHARACTER VARYING(50) NOT NULL,
  source_id TEXT NOT NULL,
  source_amount NUMERIC NOT NULL,
  source_currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  commission_rate NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  commission_currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  period_month CHARACTER VARYING(7) NOT NULL,
  status CHARACTER VARYING(50) NOT NULL DEFAULT 'pending'::character varying,
  source_date DATE NOT NULL,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  paid_at TIMESTAMP WITH TIME ZONE,
  payout_id UUID,
  payment_reference CHARACTER VARYING(255) DEFAULT NULL::character varying,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE manager_commissions ADD PRIMARY KEY (id);
ALTER TABLE manager_commissions ADD CONSTRAINT manager_commissions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE manager_commissions ADD CONSTRAINT manager_commissions_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES users(id);
ALTER TABLE manager_commissions ADD CONSTRAINT fk_manager_commissions_payout FOREIGN KEY (payout_id) REFERENCES manager_payouts(id);
CREATE INDEX idx_manager_commissions_manager ON public.manager_commissions USING btree (manager_user_id);
CREATE INDEX idx_manager_commissions_payout ON public.manager_commissions USING btree (payout_id) WHERE (payout_id IS NOT NULL);
CREATE INDEX idx_manager_commissions_period ON public.manager_commissions USING btree (period_month);
CREATE INDEX idx_manager_commissions_source ON public.manager_commissions USING btree (source_type, source_id);
CREATE INDEX idx_manager_commissions_source_date ON public.manager_commissions USING btree (source_date);
CREATE INDEX idx_manager_commissions_status ON public.manager_commissions USING btree (status);
CREATE UNIQUE INDEX idx_manager_commissions_unique_source ON public.manager_commissions USING btree (manager_user_id, source_type, source_id);

-- ========================================
-- TABLE: manager_payout_items
-- ========================================
CREATE TABLE manager_payout_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL,
  commission_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE manager_payout_items ADD PRIMARY KEY (id);
ALTER TABLE manager_payout_items ADD CONSTRAINT manager_payout_items_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES manager_commissions(id);
ALTER TABLE manager_payout_items ADD CONSTRAINT manager_payout_items_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES manager_payouts(id);
ALTER TABLE manager_payout_items ADD CONSTRAINT unique_payout_commission UNIQUE (commission_id);
ALTER TABLE manager_payout_items ADD CONSTRAINT unique_payout_commission UNIQUE (commission_id);
ALTER TABLE manager_payout_items ADD CONSTRAINT unique_payout_commission UNIQUE (payout_id);
ALTER TABLE manager_payout_items ADD CONSTRAINT unique_payout_commission UNIQUE (payout_id);
CREATE INDEX idx_manager_payout_items_commission ON public.manager_payout_items USING btree (commission_id);
CREATE INDEX idx_manager_payout_items_payout ON public.manager_payout_items USING btree (payout_id);
CREATE UNIQUE INDEX unique_payout_commission ON public.manager_payout_items USING btree (payout_id, commission_id);

-- ========================================
-- TABLE: manager_payouts
-- ========================================
CREATE TABLE manager_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_bookings_amount NUMERIC NOT NULL DEFAULT 0,
  total_rentals_amount NUMERIC NOT NULL DEFAULT 0,
  total_accommodation_amount NUMERIC NOT NULL DEFAULT 0,
  total_packages_amount NUMERIC NOT NULL DEFAULT 0,
  total_other_amount NUMERIC NOT NULL DEFAULT 0,
  gross_commission NUMERIC NOT NULL DEFAULT 0,
  deductions NUMERIC NOT NULL DEFAULT 0,
  net_commission NUMERIC NOT NULL DEFAULT 0,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  status CHARACTER VARYING(50) NOT NULL DEFAULT 'draft'::character varying,
  payment_method CHARACTER VARYING(50) DEFAULT NULL::character varying,
  payment_reference CHARACTER VARYING(255) DEFAULT NULL::character varying,
  payment_date DATE,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE manager_payouts ADD PRIMARY KEY (id);
ALTER TABLE manager_payouts ADD CONSTRAINT manager_payouts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE manager_payouts ADD CONSTRAINT manager_payouts_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES users(id);
ALTER TABLE manager_payouts ADD CONSTRAINT manager_payouts_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES users(id);
CREATE INDEX idx_manager_payouts_manager ON public.manager_payouts USING btree (manager_user_id);
CREATE INDEX idx_manager_payouts_period ON public.manager_payouts USING btree (period_start, period_end);
CREATE INDEX idx_manager_payouts_status ON public.manager_payouts USING btree (status);

-- ========================================
-- TABLE: manager_salary_records
-- ========================================
CREATE TABLE manager_salary_records (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL,
  period_month CHARACTER VARYING(7) NOT NULL,
  salary_type CHARACTER VARYING(30) NOT NULL,
  base_salary NUMERIC DEFAULT 0,
  lesson_count INTEGER DEFAULT 0,
  per_lesson_rate NUMERIC DEFAULT 0,
  lesson_earnings NUMERIC DEFAULT 0,
  commission_earnings NUMERIC DEFAULT 0,
  gross_amount NUMERIC DEFAULT 0,
  deductions NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  status CHARACTER VARYING(30) DEFAULT 'pending'::character varying,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE manager_salary_records ADD PRIMARY KEY (id);
ALTER TABLE manager_salary_records ADD CONSTRAINT manager_salary_records_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES users(id);
ALTER TABLE manager_salary_records ADD CONSTRAINT unique_manager_salary_period UNIQUE (manager_user_id);
ALTER TABLE manager_salary_records ADD CONSTRAINT unique_manager_salary_period UNIQUE (manager_user_id);
ALTER TABLE manager_salary_records ADD CONSTRAINT unique_manager_salary_period UNIQUE (period_month);
ALTER TABLE manager_salary_records ADD CONSTRAINT unique_manager_salary_period UNIQUE (period_month);
CREATE INDEX idx_manager_salary_records_manager ON public.manager_salary_records USING btree (manager_user_id);
CREATE INDEX idx_manager_salary_records_period ON public.manager_salary_records USING btree (period_month);
CREATE INDEX idx_manager_salary_records_status ON public.manager_salary_records USING btree (status);
CREATE UNIQUE INDEX unique_manager_salary_period ON public.manager_salary_records USING btree (manager_user_id, period_month);

-- ========================================
-- TABLE: marketing_campaigns
-- ========================================
CREATE TABLE marketing_campaigns (
  id INTEGER NOT NULL DEFAULT nextval('marketing_campaigns_id_seq'::regclass),
  name CHARACTER VARYING(255) NOT NULL,
  type CHARACTER VARYING(50) NOT NULL,
  template_type CHARACTER VARYING(100),
  audience CHARACTER VARYING(100) NOT NULL,
  email_subject CHARACTER VARYING(500),
  email_content TEXT,
  email_html TEXT,
  popup_title CHARACTER VARYING(255),
  popup_message TEXT,
  popup_button_text CHARACTER VARYING(100),
  popup_button_url CHARACTER VARYING(500),
  popup_image_url CHARACTER VARYING(500),
  popup_style JSONB DEFAULT '{}'::jsonb,
  sms_content TEXT,
  whatsapp_content TEXT,
  whatsapp_media_url CHARACTER VARYING(500),
  status CHARACTER VARYING(50) DEFAULT 'draft'::character varying,
  schedule_date TIMESTAMP WITH TIME ZONE,
  send_immediately BOOLEAN DEFAULT false,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  converted_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  question_text TEXT,
  question_subtitle TEXT,
  question_bg_image CHARACTER VARYING(500),
  question_bg_color CHARACTER VARYING(50) DEFAULT '#ffffff'::character varying,
  question_text_color CHARACTER VARYING(50) DEFAULT '#111827'::character varying,
  question_answers JSONB DEFAULT '[]'::jsonb,
  question_icon_type CHARACTER VARYING(50) DEFAULT 'question'::character varying
);

ALTER TABLE marketing_campaigns ADD PRIMARY KEY (id);
ALTER TABLE marketing_campaigns ADD CONSTRAINT marketing_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_campaigns_created_by ON public.marketing_campaigns USING btree (created_by);
CREATE INDEX idx_campaigns_question ON public.marketing_campaigns USING btree (type) WHERE ((type)::text = 'question'::text);
CREATE INDEX idx_campaigns_schedule ON public.marketing_campaigns USING btree (schedule_date) WHERE ((status)::text = 'scheduled'::text);
CREATE INDEX idx_campaigns_status ON public.marketing_campaigns USING btree (status);
CREATE INDEX idx_campaigns_type ON public.marketing_campaigns USING btree (type);
CREATE INDEX idx_marketing_campaigns_question_icon_type ON public.marketing_campaigns USING btree (question_icon_type) WHERE ((type)::text = 'question'::text);

-- ========================================
-- TABLE: member_offerings
-- ========================================
CREATE TABLE member_offerings (
  id INTEGER NOT NULL DEFAULT nextval('member_offerings_id_seq'::regclass),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  period CHARACTER VARYING(50) NOT NULL DEFAULT 'season'::character varying,
  features JSONB DEFAULT '[]'::jsonb,
  icon CHARACTER VARYING(50) DEFAULT 'star'::character varying,
  badge CHARACTER VARYING(100),
  badge_color CHARACTER VARYING(50) DEFAULT 'blue'::character varying,
  highlighted BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  duration_days INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  image_url CHARACTER VARYING(500),
  use_image_background BOOLEAN DEFAULT true,
  card_style CHARACTER VARYING(50) DEFAULT 'simple'::character varying,
  button_text CHARACTER VARYING(100) DEFAULT 'Choose Plan'::character varying,
  gradient_color CHARACTER VARYING(50),
  text_color CHARACTER VARYING(20) DEFAULT 'dark'::character varying,
  gradient_opacity INTEGER DEFAULT 70
);

ALTER TABLE member_offerings ADD PRIMARY KEY (id);
CREATE INDEX idx_member_offerings_active ON public.member_offerings USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_member_offerings_sort ON public.member_offerings USING btree (sort_order, id);

-- ========================================
-- TABLE: member_purchases
-- ========================================
CREATE TABLE member_purchases (
  id INTEGER NOT NULL DEFAULT nextval('member_purchases_id_seq'::regclass),
  user_id UUID NOT NULL,
  offering_id INTEGER NOT NULL,
  offering_name CHARACTER VARYING(255) NOT NULL,
  offering_price NUMERIC NOT NULL,
  offering_currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  status CHARACTER VARYING(50) DEFAULT 'active'::character varying,
  payment_method CHARACTER VARYING(50) DEFAULT 'cash'::character varying,
  payment_status CHARACTER VARYING(50) DEFAULT 'completed'::character varying,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE member_purchases ADD PRIMARY KEY (id);
ALTER TABLE member_purchases ADD CONSTRAINT member_purchases_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES member_offerings(id);
ALTER TABLE member_purchases ADD CONSTRAINT member_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_member_purchases_offering ON public.member_purchases USING btree (offering_id);
CREATE INDEX idx_member_purchases_status ON public.member_purchases USING btree (status);
CREATE INDEX idx_member_purchases_user ON public.member_purchases USING btree (user_id);

-- ========================================
-- TABLE: message_reactions
-- ========================================
CREATE TABLE message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji CHARACTER VARYING(10) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE message_reactions ADD PRIMARY KEY (id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (emoji);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (emoji);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (emoji);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (user_id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (user_id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (user_id);
CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);
CREATE INDEX idx_message_reactions_user ON public.message_reactions USING btree (user_id);
CREATE UNIQUE INDEX message_reactions_message_id_user_id_emoji_key ON public.message_reactions USING btree (message_id, user_id, emoji);

-- ========================================
-- TABLE: messages
-- ========================================
CREATE TABLE messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  message_type CHARACTER VARYING(20) NOT NULL DEFAULT 'text'::character varying,
  content TEXT,
  attachment_url TEXT,
  attachment_filename CHARACTER VARYING(255),
  attachment_size INTEGER,
  voice_duration INTEGER,
  voice_transcript TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by_expiration BOOLEAN DEFAULT false,
  search_vector TSVECTOR
);

ALTER TABLE messages ADD PRIMARY KEY (id);
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id, created_at DESC);
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);
CREATE INDEX idx_messages_deleted_at ON public.messages USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_messages_expiration_cleanup ON public.messages USING btree (created_at, deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_messages_search ON public.messages USING gin (search_vector);
CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);

-- ========================================
-- TABLE: notification_settings
-- ========================================
CREATE TABLE notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID,
  weather_alerts BOOLEAN DEFAULT true,
  booking_updates BOOLEAN DEFAULT true,
  payment_notifications BOOLEAN DEFAULT true,
  general_announcements BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  new_booking_alerts BOOLEAN DEFAULT true
);

ALTER TABLE notification_settings ADD PRIMARY KEY (id);
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_user_id_key UNIQUE (user_id);
CREATE UNIQUE INDEX notification_settings_user_id_key ON public.notification_settings USING btree (user_id);

-- ========================================
-- TABLE: notifications
-- ========================================
CREATE TABLE notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID,
  title CHARACTER VARYING(255) NOT NULL,
  message TEXT NOT NULL,
  type CHARACTER VARYING(50) DEFAULT 'general'::character varying,
  data JSONB,
  status CHARACTER VARYING(20) DEFAULT 'sent'::character varying,
  read_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT
);

ALTER TABLE notifications ADD PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE notifications ADD CONSTRAINT notifications_idempotency_key_unique UNIQUE (idempotency_key);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at);
CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (read_at);
CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE UNIQUE INDEX notifications_idempotency_key_unique ON public.notifications USING btree (idempotency_key);

-- ========================================
-- TABLE: package_hour_fixes
-- ========================================
CREATE TABLE package_hour_fixes (
  id INTEGER NOT NULL DEFAULT nextval('package_hour_fixes_id_seq'::regclass),
  customer_id UUID NOT NULL,
  package_id UUID NOT NULL,
  old_used_hours NUMERIC,
  new_used_hours NUMERIC,
  old_remaining_hours NUMERIC,
  new_remaining_hours NUMERIC,
  fixed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  fix_reason TEXT
);

ALTER TABLE package_hour_fixes ADD PRIMARY KEY (id);

-- ========================================
-- TABLE: package_prices
-- ========================================
CREATE TABLE package_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL,
  currency_code CHARACTER VARYING(3) NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE package_prices ADD PRIMARY KEY (id);
ALTER TABLE package_prices ADD CONSTRAINT package_prices_package_id_fkey FOREIGN KEY (package_id) REFERENCES service_packages(id);
ALTER TABLE package_prices ADD CONSTRAINT package_prices_package_id_currency_code_key UNIQUE (currency_code);
ALTER TABLE package_prices ADD CONSTRAINT package_prices_package_id_currency_code_key UNIQUE (currency_code);
ALTER TABLE package_prices ADD CONSTRAINT package_prices_package_id_currency_code_key UNIQUE (package_id);
ALTER TABLE package_prices ADD CONSTRAINT package_prices_package_id_currency_code_key UNIQUE (package_id);
CREATE INDEX idx_package_prices_currency ON public.package_prices USING btree (currency_code);
CREATE INDEX idx_package_prices_package_id ON public.package_prices USING btree (package_id);
CREATE UNIQUE INDEX package_prices_package_id_currency_code_key ON public.package_prices USING btree (package_id, currency_code);

-- ========================================
-- TABLE: password_reset_tokens
-- ========================================
CREATE TABLE password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash CHARACTER VARYING(64) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address CHARACTER VARYING(45),
  user_agent TEXT
);

ALTER TABLE password_reset_tokens ADD PRIMARY KEY (id);
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);
CREATE INDEX idx_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);
CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);

-- ========================================
-- TABLE: payment_gateway_webhook_events
-- ========================================
CREATE TABLE payment_gateway_webhook_events (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  provider CHARACTER VARYING(50) NOT NULL,
  event_type CHARACTER VARYING(120),
  status CHARACTER VARYING(50),
  external_id CHARACTER VARYING(200),
  transaction_id CHARACTER VARYING(200),
  deposit_id UUID,
  dedupe_key CHARACTER VARYING(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE payment_gateway_webhook_events ADD PRIMARY KEY (id);
ALTER TABLE payment_gateway_webhook_events ADD CONSTRAINT payment_gateway_webhook_events_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES wallet_deposit_requests(id);
ALTER TABLE payment_gateway_webhook_events ADD CONSTRAINT payment_gateway_webhook_events_dedupe_key_key UNIQUE (dedupe_key);
CREATE INDEX idx_payment_gateway_webhook_events_deposit ON public.payment_gateway_webhook_events USING btree (deposit_id);
CREATE INDEX idx_payment_gateway_webhook_events_provider ON public.payment_gateway_webhook_events USING btree (provider);
CREATE UNIQUE INDEX payment_gateway_webhook_events_dedupe_key_key ON public.payment_gateway_webhook_events USING btree (dedupe_key);

-- ========================================
-- TABLE: payment_intents
-- ========================================
CREATE TABLE payment_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  stripe_payment_intent_id CHARACTER VARYING(255) NOT NULL,
  user_id UUID,
  booking_id UUID,
  amount INTEGER NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'usd'::character varying,
  status CHARACTER VARYING(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

ALTER TABLE payment_intents ADD PRIMARY KEY (id);
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);
CREATE INDEX idx_payment_intents_booking_id ON public.payment_intents USING btree (booking_id);
CREATE INDEX idx_payment_intents_created_at ON public.payment_intents USING btree (created_at);
CREATE INDEX idx_payment_intents_status ON public.payment_intents USING btree (status);
CREATE INDEX idx_payment_intents_user_id ON public.payment_intents USING btree (user_id);
CREATE INDEX payment_intents_created_by_idx ON public.payment_intents USING btree (created_by);
CREATE UNIQUE INDEX payment_intents_stripe_payment_intent_id_key ON public.payment_intents USING btree (stripe_payment_intent_id);

-- ========================================
-- TABLE: popup_analytics
-- ========================================
CREATE TABLE popup_analytics (
  id INTEGER NOT NULL DEFAULT nextval('popup_analytics_id_seq'::regclass),
  popup_id INTEGER,
  date_recorded DATE DEFAULT CURRENT_DATE,
  total_views INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  total_dismissals INTEGER DEFAULT 0,
  primary_button_clicks INTEGER DEFAULT 0,
  secondary_button_clicks INTEGER DEFAULT 0,
  form_submissions INTEGER DEFAULT 0,
  social_clicks INTEGER DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  avg_display_time_seconds DOUBLE PRECISION DEFAULT 0,
  avg_load_time_ms DOUBLE PRECISION DEFAULT 0,
  bounce_rate DOUBLE PRECISION DEFAULT 0,
  completion_rate DOUBLE PRECISION DEFAULT 0,
  ab_test_group CHARACTER VARYING(10),
  conversion_rate DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE popup_analytics ADD PRIMARY KEY (id);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_configurations(id);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (ab_test_group);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (ab_test_group);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (ab_test_group);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (date_recorded);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (date_recorded);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (date_recorded);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (popup_id);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (popup_id);
ALTER TABLE popup_analytics ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (popup_id);
CREATE INDEX idx_popup_analytics_date ON public.popup_analytics USING btree (date_recorded);
CREATE INDEX idx_popup_analytics_popup_id ON public.popup_analytics USING btree (popup_id);
CREATE UNIQUE INDEX popup_analytics_popup_id_date_recorded_ab_test_group_key ON public.popup_analytics USING btree (popup_id, date_recorded, ab_test_group);

-- ========================================
-- TABLE: popup_configurations
-- ========================================
CREATE TABLE popup_configurations (
  id INTEGER NOT NULL DEFAULT nextval('popup_configurations_id_seq'::regclass),
  name CHARACTER VARYING(255) NOT NULL,
  title CHARACTER VARYING(500) NOT NULL,
  subtitle CHARACTER VARYING(500),
  body_text TEXT,
  is_active BOOLEAN DEFAULT false,
  popup_type CHARACTER VARYING(50) DEFAULT 'welcome'::character varying,
  priority INTEGER DEFAULT 1,
  modal_size CHARACTER VARYING(20) DEFAULT 'medium'::character varying,
  layout_template CHARACTER VARYING(50) DEFAULT 'centered'::character varying,
  animation_type CHARACTER VARYING(30) DEFAULT 'fade'::character varying,
  color_theme CHARACTER VARYING(30) DEFAULT 'default'::character varying,
  background_type CHARACTER VARYING(20) DEFAULT 'color'::character varying,
  background_value TEXT,
  border_radius INTEGER DEFAULT 8,
  has_shadow BOOLEAN DEFAULT true,
  is_multi_step BOOLEAN DEFAULT false,
  column_layout INTEGER DEFAULT 1,
  image_position CHARACTER VARYING(20) DEFAULT 'top'::character varying,
  text_alignment CHARACTER VARYING(20) DEFAULT 'center'::character varying,
  custom_css TEXT,
  display_delay INTEGER DEFAULT 0,
  auto_close_delay INTEGER DEFAULT 0,
  max_displays_per_user INTEGER DEFAULT 1,
  cooldown_period INTEGER DEFAULT 0,
  ab_test_group CHARACTER VARYING(10),
  ab_test_weight INTEGER DEFAULT 100,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  config JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE popup_configurations ADD PRIMARY KEY (id);
ALTER TABLE popup_configurations ADD CONSTRAINT popup_configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE popup_configurations ADD CONSTRAINT popup_configurations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
CREATE INDEX idx_popup_configurations_active ON public.popup_configurations USING btree (is_active);
CREATE INDEX idx_popup_configurations_config ON public.popup_configurations USING gin (config);
CREATE INDEX idx_popup_configurations_priority ON public.popup_configurations USING btree (priority DESC);
CREATE INDEX idx_popup_configurations_type ON public.popup_configurations USING btree (popup_type);

-- ========================================
-- TABLE: popup_content_blocks
-- ========================================
CREATE TABLE popup_content_blocks (
  id INTEGER NOT NULL DEFAULT nextval('popup_content_blocks_id_seq'::regclass),
  popup_id INTEGER,
  block_type CHARACTER VARYING(50) NOT NULL,
  content_data JSONB NOT NULL,
  display_order INTEGER DEFAULT 0,
  step_number INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  mobile_settings JSONB,
  tablet_settings JSONB,
  desktop_settings JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE popup_content_blocks ADD PRIMARY KEY (id);
ALTER TABLE popup_content_blocks ADD CONSTRAINT popup_content_blocks_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_configurations(id);
CREATE INDEX idx_popup_content_blocks_order ON public.popup_content_blocks USING btree (popup_id, step_number, display_order);
CREATE INDEX idx_popup_content_blocks_popup_id ON public.popup_content_blocks USING btree (popup_id);

-- ========================================
-- TABLE: popup_media_assets
-- ========================================
CREATE TABLE popup_media_assets (
  id INTEGER NOT NULL DEFAULT nextval('popup_media_assets_id_seq'::regclass),
  filename CHARACTER VARYING(255) NOT NULL,
  original_filename CHARACTER VARYING(255) NOT NULL,
  file_type CHARACTER VARYING(50) NOT NULL,
  mime_type CHARACTER VARYING(100) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  alt_text CHARACTER VARYING(500),
  description TEXT,
  tags ARRAY,
  is_active BOOLEAN DEFAULT true,
  uploaded_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE popup_media_assets ADD PRIMARY KEY (id);
ALTER TABLE popup_media_assets ADD CONSTRAINT popup_media_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
CREATE INDEX idx_popup_media_assets_active ON public.popup_media_assets USING btree (is_active);
CREATE INDEX idx_popup_media_assets_type ON public.popup_media_assets USING btree (file_type);

-- ========================================
-- TABLE: popup_targeting_rules
-- ========================================
CREATE TABLE popup_targeting_rules (
  id INTEGER NOT NULL DEFAULT nextval('popup_targeting_rules_id_seq'::regclass),
  popup_id INTEGER,
  rule_type CHARACTER VARYING(50) NOT NULL,
  rule_condition CHARACTER VARYING(100) NOT NULL,
  rule_value TEXT NOT NULL,
  rule_operator CHARACTER VARYING(10) DEFAULT 'AND'::character varying,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE popup_targeting_rules ADD PRIMARY KEY (id);
ALTER TABLE popup_targeting_rules ADD CONSTRAINT popup_targeting_rules_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_configurations(id);
CREATE INDEX idx_popup_targeting_rules_popup_id ON public.popup_targeting_rules USING btree (popup_id);
CREATE INDEX idx_popup_targeting_rules_type ON public.popup_targeting_rules USING btree (rule_type);

-- ========================================
-- TABLE: popup_templates
-- ========================================
CREATE TABLE popup_templates (
  id INTEGER NOT NULL DEFAULT nextval('popup_templates_id_seq'::regclass),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  template_type CHARACTER VARYING(50) NOT NULL,
  thumbnail_url TEXT,
  default_config JSONB NOT NULL,
  default_content_blocks JSONB NOT NULL,
  default_targeting_rules JSONB,
  is_system_template BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE popup_templates ADD PRIMARY KEY (id);
ALTER TABLE popup_templates ADD CONSTRAINT popup_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX idx_popup_templates_system ON public.popup_templates USING btree (is_system_template);
CREATE INDEX idx_popup_templates_type ON public.popup_templates USING btree (template_type);

-- ========================================
-- TABLE: popup_user_interactions
-- ========================================
CREATE TABLE popup_user_interactions (
  id INTEGER NOT NULL DEFAULT nextval('popup_user_interactions_id_seq'::regclass),
  popup_id INTEGER,
  user_id UUID,
  interaction_type CHARACTER VARYING(50) NOT NULL,
  interaction_data JSONB,
  step_number INTEGER DEFAULT 1,
  session_id CHARACTER VARYING(100),
  ip_address INET,
  user_agent TEXT,
  page_url TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

ALTER TABLE popup_user_interactions ADD PRIMARY KEY (id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES popup_configurations(id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (interaction_type);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (interaction_type);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (interaction_type);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (interaction_type);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (popup_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (popup_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (popup_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (popup_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (step_number);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (step_number);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (step_number);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (step_number);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (user_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (user_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (user_id);
ALTER TABLE popup_user_interactions ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (user_id);
CREATE INDEX idx_popup_user_interactions_created_at ON public.popup_user_interactions USING btree (created_at);
CREATE INDEX idx_popup_user_interactions_popup_id ON public.popup_user_interactions USING btree (popup_id);
CREATE INDEX idx_popup_user_interactions_type ON public.popup_user_interactions USING btree (interaction_type);
CREATE INDEX idx_popup_user_interactions_user_id ON public.popup_user_interactions USING btree (user_id);
CREATE INDEX popup_user_interactions_created_by_idx ON public.popup_user_interactions USING btree (created_by);
CREATE UNIQUE INDEX popup_user_interactions_popup_id_user_id_interaction_type_s_key ON public.popup_user_interactions USING btree (popup_id, user_id, interaction_type, step_number);

-- ========================================
-- TABLE: product_subcategories
-- ========================================
CREATE TABLE product_subcategories (
  id INTEGER NOT NULL DEFAULT nextval('product_subcategories_id_seq'::regclass),
  category CHARACTER VARYING(100) NOT NULL,
  subcategory CHARACTER VARYING(100) NOT NULL,
  display_name CHARACTER VARYING(150) NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  parent_subcategory CHARACTER VARYING(100)
);

ALTER TABLE product_subcategories ADD PRIMARY KEY (id);
ALTER TABLE product_subcategories ADD CONSTRAINT product_subcategories_category_subcategory_key UNIQUE (category);
ALTER TABLE product_subcategories ADD CONSTRAINT product_subcategories_category_subcategory_key UNIQUE (category);
ALTER TABLE product_subcategories ADD CONSTRAINT product_subcategories_category_subcategory_key UNIQUE (subcategory);
ALTER TABLE product_subcategories ADD CONSTRAINT product_subcategories_category_subcategory_key UNIQUE (subcategory);
CREATE INDEX idx_product_subcategories_category ON public.product_subcategories USING btree (category) WHERE (is_active = true);
CREATE INDEX idx_product_subcategories_parent ON public.product_subcategories USING btree (category, parent_subcategory);
CREATE UNIQUE INDEX product_subcategories_category_subcategory_key ON public.product_subcategories USING btree (category, subcategory);

-- ========================================
-- TABLE: products
-- ========================================
CREATE TABLE products (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  sku CHARACTER VARYING(100),
  category CHARACTER VARYING(100) NOT NULL,
  brand CHARACTER VARYING(100),
  price NUMERIC NOT NULL,
  cost_price NUMERIC,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  stock_quantity INTEGER DEFAULT 0,
  min_stock_level INTEGER DEFAULT 0,
  weight NUMERIC,
  dimensions JSONB,
  image_url TEXT,
  images JSONB,
  status CHARACTER VARYING(20) DEFAULT 'active'::character varying,
  is_featured BOOLEAN DEFAULT false,
  tags JSONB,
  supplier_info JSONB,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  variants JSONB,
  colors JSONB,
  gender CHARACTER VARYING(20),
  sizes JSONB,
  source_url TEXT,
  subcategory CHARACTER VARYING(100),
  description_detailed TEXT,
  low_stock_threshold INTEGER DEFAULT 5
);

ALTER TABLE products ADD PRIMARY KEY (id);
ALTER TABLE products ADD CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE products ADD CONSTRAINT fk_products_currency FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE products ADD CONSTRAINT fk_products_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
CREATE INDEX idx_products_active_shop ON public.products USING btree (status, is_featured DESC, created_at DESC) WHERE (((status)::text = 'active'::text) AND (stock_quantity > 0));
CREATE INDEX idx_products_category ON public.products USING btree (category);
CREATE INDEX idx_products_category_subcategory ON public.products USING btree (category, subcategory);
CREATE INDEX idx_products_colors ON public.products USING gin (colors);
CREATE INDEX idx_products_created_at ON public.products USING btree (created_at);
CREATE INDEX idx_products_description_search ON public.products USING gin (to_tsvector('english'::regconfig, ((COALESCE(description, ''::text) || ' '::text) || COALESCE(description_detailed, ''::text))));
CREATE INDEX idx_products_featured ON public.products USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX idx_products_gender ON public.products USING btree (gender);
CREATE INDEX idx_products_search ON public.products USING gin (to_tsvector('english'::regconfig, (((((name)::text || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || (COALESCE(brand, ''::character varying))::text)));
CREATE INDEX idx_products_sku ON public.products USING btree (sku);
CREATE INDEX idx_products_status ON public.products USING btree (status);
CREATE INDEX idx_products_status_category_created ON public.products USING btree (status, category, created_at DESC);
CREATE INDEX idx_products_stock ON public.products USING btree (stock_quantity);
CREATE INDEX idx_products_subcategory ON public.products USING btree (subcategory);
CREATE INDEX idx_products_variants ON public.products USING gin (variants);
CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku);

-- ========================================
-- TABLE: push_subscriptions
-- ========================================
CREATE TABLE push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE push_subscriptions ADD PRIMARY KEY (id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (endpoint);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (endpoint);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX push_subscriptions_user_id_endpoint_key ON public.push_subscriptions USING btree (user_id, endpoint);

-- ========================================
-- TABLE: quick_link_registrations
-- ========================================
CREATE TABLE quick_link_registrations (
  id INTEGER NOT NULL DEFAULT nextval('quick_link_registrations_id_seq'::regclass),
  quick_link_id INTEGER NOT NULL,
  first_name CHARACTER VARYING(100) NOT NULL,
  last_name CHARACTER VARYING(100) NOT NULL,
  email CHARACTER VARYING(255) NOT NULL,
  phone CHARACTER VARYING(50),
  additional_data JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE quick_link_registrations ADD PRIMARY KEY (id);
ALTER TABLE quick_link_registrations ADD CONSTRAINT quick_link_registrations_quick_link_id_fkey FOREIGN KEY (quick_link_id) REFERENCES quick_links(id);
ALTER TABLE quick_link_registrations ADD CONSTRAINT quick_link_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_quick_link_registrations_email ON public.quick_link_registrations USING btree (email);
CREATE INDEX idx_quick_link_registrations_link_id ON public.quick_link_registrations USING btree (quick_link_id);
CREATE INDEX idx_quick_link_registrations_status ON public.quick_link_registrations USING btree (status);

-- ========================================
-- TABLE: quick_links
-- ========================================
CREATE TABLE quick_links (
  id INTEGER NOT NULL DEFAULT nextval('quick_links_id_seq'::regclass),
  link_code CHARACTER VARYING(20) NOT NULL,
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  service_type CHARACTER VARYING(50),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  require_payment BOOLEAN DEFAULT false,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  link_type CHARACTER VARYING(50) DEFAULT 'service'::character varying,
  form_template_id INTEGER,
  auto_create_booking BOOLEAN DEFAULT false,
  notification_recipients ARRAY,
  service_id UUID
);

ALTER TABLE quick_links ADD PRIMARY KEY (id);
ALTER TABLE quick_links ADD CONSTRAINT quick_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE quick_links ADD CONSTRAINT quick_links_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES form_templates(id);
ALTER TABLE quick_links ADD CONSTRAINT quick_links_link_code_key UNIQUE (link_code);
CREATE INDEX idx_quick_links_active ON public.quick_links USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_quick_links_code ON public.quick_links USING btree (link_code);
CREATE INDEX idx_quick_links_created_by ON public.quick_links USING btree (created_by);
CREATE INDEX idx_quick_links_form_template ON public.quick_links USING btree (form_template_id);
CREATE UNIQUE INDEX quick_links_link_code_key ON public.quick_links USING btree (link_code);

-- ========================================
-- TABLE: recommended_products
-- ========================================
CREATE TABLE recommended_products (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  recommended_for_role CHARACTER VARYING(32) NOT NULL DEFAULT 'student'::character varying,
  priority SMALLINT NOT NULL DEFAULT 5,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE recommended_products ADD PRIMARY KEY (id);
ALTER TABLE recommended_products ADD CONSTRAINT recommended_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE recommended_products ADD CONSTRAINT recommended_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
CREATE INDEX idx_recommended_products_priority ON public.recommended_products USING btree (priority DESC, created_at DESC);
CREATE UNIQUE INDEX idx_recommended_products_unique_role ON public.recommended_products USING btree (product_id, recommended_for_role);

-- ========================================
-- TABLE: refunds
-- ========================================
CREATE TABLE refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  stripe_refund_id CHARACTER VARYING(255) NOT NULL,
  payment_intent_id UUID,
  amount INTEGER NOT NULL,
  reason TEXT,
  status CHARACTER VARYING(50) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

ALTER TABLE refunds ADD PRIMARY KEY (id);
ALTER TABLE refunds ADD CONSTRAINT refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE refunds ADD CONSTRAINT refunds_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id);
ALTER TABLE refunds ADD CONSTRAINT refunds_stripe_refund_id_key UNIQUE (stripe_refund_id);
CREATE INDEX refunds_created_by_idx ON public.refunds USING btree (created_by);
CREATE UNIQUE INDEX refunds_stripe_refund_id_key ON public.refunds USING btree (stripe_refund_id);

-- ========================================
-- TABLE: rental_equipment
-- ========================================
CREATE TABLE rental_equipment (
  rental_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  daily_rate NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID
);

ALTER TABLE rental_equipment ADD PRIMARY KEY (equipment_id, rental_id);
ALTER TABLE rental_equipment ADD CONSTRAINT rental_equipment_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE rental_equipment ADD CONSTRAINT rental_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES services(id);
ALTER TABLE rental_equipment ADD CONSTRAINT rental_equipment_rental_id_fkey FOREIGN KEY (rental_id) REFERENCES rentals(id);
CREATE INDEX rental_equipment_created_by_idx ON public.rental_equipment USING btree (created_by);

-- ========================================
-- TABLE: rentals
-- ========================================
CREATE TABLE rentals (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  total_price NUMERIC DEFAULT 0,
  payment_status CHARACTER VARYING(50) DEFAULT 'unpaid'::character varying,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  equipment_ids JSONB,
  rental_date DATE,
  equipment_details JSONB,
  created_by UUID,
  family_member_id UUID,
  participant_type CHARACTER VARYING(20) DEFAULT 'self'::character varying,
  customer_package_id UUID,
  rental_days_used INTEGER DEFAULT 1
);

ALTER TABLE rentals ADD PRIMARY KEY (id);
ALTER TABLE rentals ADD CONSTRAINT rentals_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE rentals ADD CONSTRAINT rentals_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES customer_packages(id);
ALTER TABLE rentals ADD CONSTRAINT rentals_family_member_id_fkey FOREIGN KEY (family_member_id) REFERENCES family_members(id);
ALTER TABLE rentals ADD CONSTRAINT rentals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_rentals_created ON public.rentals USING btree (created_at);
CREATE INDEX idx_rentals_customer_package_id ON public.rentals USING btree (customer_package_id) WHERE (customer_package_id IS NOT NULL);
CREATE INDEX idx_rentals_equipment_ids ON public.rentals USING gin (equipment_ids);
CREATE INDEX idx_rentals_family_member ON public.rentals USING btree (family_member_id);
CREATE INDEX idx_rentals_rental_date ON public.rentals USING btree (rental_date);
CREATE INDEX idx_rentals_status ON public.rentals USING btree (status);
CREATE INDEX idx_rentals_user_id ON public.rentals USING btree (user_id);
CREATE INDEX rentals_created_by_idx ON public.rentals USING btree (created_by);

-- ========================================
-- TABLE: repair_request_comments
-- ========================================
CREATE TABLE repair_request_comments (
  id INTEGER NOT NULL DEFAULT nextval('repair_request_comments_id_seq'::regclass),
  repair_request_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE repair_request_comments ADD PRIMARY KEY (id);
ALTER TABLE repair_request_comments ADD CONSTRAINT repair_request_comments_repair_request_id_fkey FOREIGN KEY (repair_request_id) REFERENCES repair_requests(id);
ALTER TABLE repair_request_comments ADD CONSTRAINT repair_request_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_repair_comments_created ON public.repair_request_comments USING btree (created_at DESC);
CREATE INDEX idx_repair_comments_request ON public.repair_request_comments USING btree (repair_request_id);
CREATE INDEX idx_repair_comments_user ON public.repair_request_comments USING btree (user_id);

-- ========================================
-- TABLE: repair_requests
-- ========================================
CREATE TABLE repair_requests (
  id INTEGER NOT NULL DEFAULT nextval('repair_requests_id_seq'::regclass),
  user_id UUID,
  equipment_type CHARACTER VARYING(255) NOT NULL,
  item_name CHARACTER VARYING(255) NOT NULL,
  description TEXT NOT NULL,
  photos JSONB DEFAULT '[]'::jsonb,
  priority CHARACTER VARYING(50) NOT NULL,
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  location CHARACTER VARYING(255),
  assigned_to UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  guest_name CHARACTER VARYING(255),
  guest_email CHARACTER VARYING(255),
  guest_phone CHARACTER VARYING(50),
  tracking_token CHARACTER VARYING(64)
);

ALTER TABLE repair_requests ADD PRIMARY KEY (id);
ALTER TABLE repair_requests ADD CONSTRAINT repair_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id);
ALTER TABLE repair_requests ADD CONSTRAINT repair_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE repair_requests ADD CONSTRAINT repair_requests_tracking_token_key UNIQUE (tracking_token);
CREATE INDEX idx_repair_requests_assigned ON public.repair_requests USING btree (assigned_to);
CREATE INDEX idx_repair_requests_guest_email ON public.repair_requests USING btree (guest_email);
CREATE INDEX idx_repair_requests_priority ON public.repair_requests USING btree (priority);
CREATE INDEX idx_repair_requests_status ON public.repair_requests USING btree (status);
CREATE INDEX idx_repair_requests_tracking_token ON public.repair_requests USING btree (tracking_token);
CREATE INDEX idx_repair_requests_user ON public.repair_requests USING btree (user_id);
CREATE UNIQUE INDEX repair_requests_tracking_token_key ON public.repair_requests USING btree (tracking_token);

-- ========================================
-- TABLE: revenue_items
-- ========================================
CREATE TABLE revenue_items (
  id INTEGER NOT NULL DEFAULT nextval('revenue_items_id_seq'::regclass),
  entity_type CHARACTER VARYING(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  service_type CHARACTER VARYING(50),
  service_id INTEGER,
  category_id INTEGER,
  fulfillment_date DATE NOT NULL,
  currency CHARACTER VARYING(10) NOT NULL DEFAULT 'EUR'::character varying,
  exchange_rate NUMERIC,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  insurance_amount NUMERIC NOT NULL DEFAULT 0,
  equipment_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method CHARACTER VARYING(50),
  payment_fee_pct NUMERIC,
  payment_fee_fixed NUMERIC,
  payment_fee_amount NUMERIC NOT NULL DEFAULT 0,
  custom_costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  settings_version_id INTEGER,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE revenue_items ADD PRIMARY KEY (id);
ALTER TABLE revenue_items ADD CONSTRAINT revenue_items_settings_version_id_fkey FOREIGN KEY (settings_version_id) REFERENCES financial_settings(id);
CREATE INDEX idx_revenue_items_fulfillment_date ON public.revenue_items USING btree (fulfillment_date);
CREATE INDEX idx_revenue_items_service ON public.revenue_items USING btree (service_type, service_id);
CREATE UNIQUE INDEX ux_revenue_items_entity ON public.revenue_items USING btree (entity_type, entity_id);

-- ========================================
-- TABLE: roles
-- ========================================
CREATE TABLE roles (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name CHARACTER VARYING(50) NOT NULL,
  description TEXT,
  permissions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE roles ADD PRIMARY KEY (id);
ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name);
CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

-- ========================================
-- TABLE: schema_migrations
-- ========================================
CREATE TABLE schema_migrations (
  id INTEGER NOT NULL DEFAULT nextval('schema_migrations_id_seq'::regclass),
  migration_name CHARACTER VARYING(255),
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  filename TEXT,
  checksum TEXT,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE schema_migrations ADD PRIMARY KEY (id);
ALTER TABLE schema_migrations ADD CONSTRAINT schema_migrations_migration_name_key UNIQUE (migration_name);
CREATE UNIQUE INDEX schema_migrations_filename_idx ON public.schema_migrations USING btree (filename);
CREATE UNIQUE INDEX schema_migrations_migration_name_key ON public.schema_migrations USING btree (migration_name);

-- ========================================
-- TABLE: security_audit
-- ========================================
CREATE TABLE security_audit (
  id INTEGER NOT NULL DEFAULT nextval('security_audit_id_seq'::regclass),
  user_id UUID,
  action CHARACTER VARYING(100) NOT NULL,
  resource_type CHARACTER VARYING(50),
  resource_id CHARACTER VARYING(100),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  details JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE security_audit ADD PRIMARY KEY (id);
CREATE INDEX idx_security_audit_action ON public.security_audit USING btree (action);
CREATE INDEX idx_security_audit_created_at ON public.security_audit USING btree (created_at);
CREATE INDEX idx_security_audit_resource ON public.security_audit USING btree (resource_type, resource_id);
CREATE INDEX idx_security_audit_user_action ON public.security_audit USING btree (user_id, action, created_at);
CREATE INDEX idx_security_audit_user_id ON public.security_audit USING btree (user_id);

-- ========================================
-- TABLE: service_categories
-- ========================================
CREATE TABLE service_categories (
  id INTEGER NOT NULL DEFAULT nextval('service_categories_id_seq'::regclass),
  name CHARACTER VARYING(100) NOT NULL,
  description TEXT,
  type CHARACTER VARYING(50) DEFAULT 'lessons'::character varying,
  status CHARACTER VARYING(20) DEFAULT 'active'::character varying,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

ALTER TABLE service_categories ADD PRIMARY KEY (id);
ALTER TABLE service_categories ADD CONSTRAINT service_categories_name_key UNIQUE (name);
CREATE UNIQUE INDEX service_categories_name_key ON public.service_categories USING btree (name);

-- ========================================
-- TABLE: service_packages
-- ========================================
CREATE TABLE service_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name CHARACTER VARYING(255) NOT NULL,
  price NUMERIC NOT NULL,
  sessions_count INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  total_hours NUMERIC,
  lesson_type_id UUID,
  lesson_service_name CHARACTER VARYING(255),
  discipline_tag CHARACTER VARYING(32),
  lesson_category_tag CHARACTER VARYING(32),
  level_tag CHARACTER VARYING(32),
  created_by UUID,
  package_type CHARACTER VARYING(32) DEFAULT 'lesson'::character varying,
  description TEXT,
  includes_accommodation BOOLEAN DEFAULT false,
  includes_rental BOOLEAN DEFAULT false,
  includes_lessons BOOLEAN DEFAULT true,
  accommodation_nights INTEGER DEFAULT 0,
  rental_days INTEGER DEFAULT 0,
  image_url TEXT,
  lesson_service_id UUID,
  equipment_id UUID,
  accommodation_unit_id UUID,
  rental_service_id UUID,
  equipment_name CHARACTER VARYING(255),
  accommodation_unit_name CHARACTER VARYING(255),
  rental_service_name CHARACTER VARYING(255),
  event_start_date TIMESTAMP WITH TIME ZONE,
  event_end_date TIMESTAMP WITH TIME ZONE,
  event_location TEXT,
  departure_location TEXT,
  destination_location TEXT,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  min_skill_level CHARACTER VARYING(50),
  min_age INTEGER,
  max_age INTEGER,
  itinerary JSONB,
  event_status CHARACTER VARYING(32) DEFAULT 'scheduled'::character varying,
  images JSONB DEFAULT '[]'::jsonb,
  package_hourly_rate NUMERIC,
  package_daily_rate NUMERIC,
  package_nightly_rate NUMERIC
);

ALTER TABLE service_packages ADD PRIMARY KEY (id);
ALTER TABLE service_packages ADD CONSTRAINT service_packages_accommodation_unit_id_fkey FOREIGN KEY (accommodation_unit_id) REFERENCES accommodation_units(id);
ALTER TABLE service_packages ADD CONSTRAINT service_packages_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE service_packages ADD CONSTRAINT fk_packages_currency FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE service_packages ADD CONSTRAINT service_packages_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id);
ALTER TABLE service_packages ADD CONSTRAINT service_packages_lesson_service_id_fkey FOREIGN KEY (lesson_service_id) REFERENCES services(id);
ALTER TABLE service_packages ADD CONSTRAINT service_packages_rental_service_id_fkey FOREIGN KEY (rental_service_id) REFERENCES services(id);
CREATE INDEX idx_service_packages_accommodation_unit_id ON public.service_packages USING btree (accommodation_unit_id);
CREATE INDEX idx_service_packages_discipline_tag ON public.service_packages USING btree (discipline_tag);
CREATE INDEX idx_service_packages_equipment_id ON public.service_packages USING btree (equipment_id);
CREATE INDEX idx_service_packages_event_dates ON public.service_packages USING btree (event_start_date, event_end_date) WHERE (event_start_date IS NOT NULL);
CREATE INDEX idx_service_packages_event_start_date ON public.service_packages USING btree (event_start_date) WHERE (event_start_date IS NOT NULL);
CREATE INDEX idx_service_packages_event_status ON public.service_packages USING btree (event_status);
CREATE INDEX idx_service_packages_includes ON public.service_packages USING btree (includes_lessons, includes_rental, includes_accommodation);
CREATE INDEX idx_service_packages_lesson_category_tag ON public.service_packages USING btree (lesson_category_tag);
CREATE INDEX idx_service_packages_lesson_service_id ON public.service_packages USING btree (lesson_service_id);
CREATE INDEX idx_service_packages_level_tag ON public.service_packages USING btree (level_tag);
CREATE INDEX idx_service_packages_package_type ON public.service_packages USING btree (package_type);
CREATE INDEX idx_service_packages_rental_service_id ON public.service_packages USING btree (rental_service_id);
CREATE INDEX service_packages_created_by_idx ON public.service_packages USING btree (created_by);

-- ========================================
-- TABLE: service_prices
-- ========================================
CREATE TABLE service_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL,
  currency_code CHARACTER VARYING(3) NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE service_prices ADD PRIMARY KEY (id);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_service_id_currency_code_key UNIQUE (currency_code);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_service_id_currency_code_key UNIQUE (currency_code);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_service_id_currency_code_key UNIQUE (service_id);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_service_id_currency_code_key UNIQUE (service_id);
CREATE INDEX idx_service_prices_currency ON public.service_prices USING btree (currency_code);
CREATE INDEX idx_service_prices_service_id ON public.service_prices USING btree (service_id);
CREATE UNIQUE INDEX service_prices_service_id_currency_code_key ON public.service_prices USING btree (service_id, currency_code);

-- ========================================
-- TABLE: service_revenue_ledger
-- ========================================
CREATE TABLE service_revenue_ledger (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  service_type TEXT NOT NULL,
  service_subtype TEXT,
  service_id UUID,
  customer_id UUID,
  amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  instructor_commission_amount NUMERIC NOT NULL DEFAULT 0,
  instructor_commission_type TEXT,
  instructor_commission_value NUMERIC,
  instructor_commission_source TEXT
);

ALTER TABLE service_revenue_ledger ADD PRIMARY KEY (id);
ALTER TABLE service_revenue_ledger ADD CONSTRAINT service_revenue_ledger_entity_type_entity_id_key UNIQUE (entity_id);
ALTER TABLE service_revenue_ledger ADD CONSTRAINT service_revenue_ledger_entity_type_entity_id_key UNIQUE (entity_id);
ALTER TABLE service_revenue_ledger ADD CONSTRAINT service_revenue_ledger_entity_type_entity_id_key UNIQUE (entity_type);
ALTER TABLE service_revenue_ledger ADD CONSTRAINT service_revenue_ledger_entity_type_entity_id_key UNIQUE (entity_type);
CREATE INDEX idx_service_revenue_ledger_range ON public.service_revenue_ledger USING btree (occurred_at);
CREATE INDEX idx_service_revenue_ledger_status ON public.service_revenue_ledger USING btree (status);
CREATE INDEX idx_service_revenue_ledger_type ON public.service_revenue_ledger USING btree (service_type);
CREATE UNIQUE INDEX service_revenue_ledger_entity_type_entity_id_key ON public.service_revenue_ledger USING btree (entity_type, entity_id);

-- ========================================
-- TABLE: services
-- ========================================
CREATE TABLE services (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  category CHARACTER VARYING(100) NOT NULL,
  level CHARACTER VARYING(100),
  service_type CHARACTER VARYING(50) NOT NULL,
  duration NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  max_participants INTEGER,
  start_time TIME WITHOUT TIME ZONE,
  end_time TIME WITHOUT TIME ZONE,
  includes TEXT,
  image_url TEXT,
  package_id UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  discipline_tag CHARACTER VARYING(32),
  lesson_category_tag CHARACTER VARYING(32),
  level_tag CHARACTER VARYING(32),
  created_by UUID,
  rental_segment CHARACTER VARYING(32)
);

ALTER TABLE services ADD PRIMARY KEY (id);
ALTER TABLE services ADD CONSTRAINT services_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE services ADD CONSTRAINT fk_services_currency FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE services ADD CONSTRAINT services_package_id_fkey FOREIGN KEY (package_id) REFERENCES service_packages(id);
CREATE INDEX idx_services_category_level ON public.services USING btree (category, level);
CREATE INDEX idx_services_currency ON public.services USING btree (currency);
CREATE INDEX idx_services_discipline_tag ON public.services USING btree (discipline_tag);
CREATE INDEX idx_services_lesson_category_tag ON public.services USING btree (lesson_category_tag);
CREATE INDEX idx_services_level_tag ON public.services USING btree (level_tag);
CREATE INDEX idx_services_type_duration ON public.services USING btree (service_type, duration);
CREATE INDEX services_created_by_idx ON public.services USING btree (created_by);

-- ========================================
-- TABLE: settings
-- ========================================
CREATE TABLE settings (
  key CHARACTER VARYING(100) NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE settings ADD PRIMARY KEY (key);

-- ========================================
-- TABLE: shop_order_items
-- ========================================
CREATE TABLE shop_order_items (
  id INTEGER NOT NULL DEFAULT nextval('shop_order_items_id_seq'::regclass),
  order_id INTEGER NOT NULL,
  product_id UUID,
  product_name CHARACTER VARYING(255) NOT NULL,
  product_image CHARACTER VARYING(500),
  brand CHARACTER VARYING(100),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  selected_size CHARACTER VARYING(50),
  selected_color CHARACTER VARYING(50),
  selected_variant JSONB,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE shop_order_items ADD PRIMARY KEY (id);
ALTER TABLE shop_order_items ADD CONSTRAINT shop_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES shop_orders(id);
ALTER TABLE shop_order_items ADD CONSTRAINT shop_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
CREATE INDEX idx_shop_order_items_order_id ON public.shop_order_items USING btree (order_id);
CREATE INDEX idx_shop_order_items_product_id ON public.shop_order_items USING btree (product_id);

-- ========================================
-- TABLE: shop_order_messages
-- ========================================
CREATE TABLE shop_order_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE shop_order_messages ADD PRIMARY KEY (id);
ALTER TABLE shop_order_messages ADD CONSTRAINT shop_order_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES shop_orders(id);
ALTER TABLE shop_order_messages ADD CONSTRAINT shop_order_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_shop_order_messages_order ON public.shop_order_messages USING btree (order_id, created_at);
CREATE INDEX idx_shop_order_messages_user ON public.shop_order_messages USING btree (user_id);

-- ========================================
-- TABLE: shop_order_status_history
-- ========================================
CREATE TABLE shop_order_status_history (
  id INTEGER NOT NULL DEFAULT nextval('shop_order_status_history_id_seq'::regclass),
  order_id INTEGER NOT NULL,
  previous_status CHARACTER VARYING(50),
  new_status CHARACTER VARYING(50) NOT NULL,
  changed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE shop_order_status_history ADD PRIMARY KEY (id);
ALTER TABLE shop_order_status_history ADD CONSTRAINT shop_order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE shop_order_status_history ADD CONSTRAINT shop_order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES shop_orders(id);
CREATE INDEX idx_shop_order_status_history_order_id ON public.shop_order_status_history USING btree (order_id);

-- ========================================
-- TABLE: shop_orders
-- ========================================
CREATE TABLE shop_orders (
  id INTEGER NOT NULL DEFAULT nextval('shop_orders_id_seq'::regclass),
  order_number CHARACTER VARYING(50) NOT NULL,
  user_id UUID NOT NULL,
  status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  payment_method CHARACTER VARYING(50) NOT NULL,
  payment_status CHARACTER VARYING(50) DEFAULT 'pending'::character varying,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  notes TEXT,
  shipping_address TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  shipped_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  voucher_id UUID,
  voucher_code CHARACTER VARYING(100),
  wallet_deduction_data JSONB,
  gateway_token TEXT
);

ALTER TABLE shop_orders ADD PRIMARY KEY (id);
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES voucher_codes(id);
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_order_number_key UNIQUE (order_number);
CREATE INDEX idx_shop_orders_created_at ON public.shop_orders USING btree (created_at DESC);
CREATE INDEX idx_shop_orders_gateway_token ON public.shop_orders USING btree (gateway_token) WHERE (gateway_token IS NOT NULL);
CREATE INDEX idx_shop_orders_order_number ON public.shop_orders USING btree (order_number);
CREATE INDEX idx_shop_orders_status ON public.shop_orders USING btree (status);
CREATE INDEX idx_shop_orders_user_id ON public.shop_orders USING btree (user_id);
CREATE INDEX idx_shop_orders_voucher_id ON public.shop_orders USING btree (voucher_id) WHERE (voucher_id IS NOT NULL);
CREATE UNIQUE INDEX shop_orders_order_number_key ON public.shop_orders USING btree (order_number);

-- ========================================
-- TABLE: skill_levels
-- ========================================
CREATE TABLE skill_levels (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name CHARACTER VARYING(50) NOT NULL,
  description TEXT,
  order_index INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE skill_levels ADD PRIMARY KEY (id);
ALTER TABLE skill_levels ADD CONSTRAINT skill_levels_name_key UNIQUE (name);
CREATE UNIQUE INDEX skill_levels_name_key ON public.skill_levels USING btree (name);

-- ========================================
-- TABLE: skills
-- ========================================
CREATE TABLE skills (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name CHARACTER VARYING(100) NOT NULL,
  description TEXT,
  skill_level_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE skills ADD PRIMARY KEY (id);
ALTER TABLE skills ADD CONSTRAINT skills_skill_level_id_fkey FOREIGN KEY (skill_level_id) REFERENCES skill_levels(id);

-- ========================================
-- TABLE: spare_parts_orders
-- ========================================
CREATE TABLE spare_parts_orders (
  id INTEGER NOT NULL DEFAULT nextval('spare_parts_orders_id_seq'::regclass),
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  notes TEXT,
  created_by_legacy_int INTEGER,
  ordered_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE spare_parts_orders ADD PRIMARY KEY (id);
ALTER TABLE spare_parts_orders ADD CONSTRAINT spare_parts_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
CREATE INDEX spare_parts_orders_created_at_idx ON public.spare_parts_orders USING btree (created_at DESC);
CREATE INDEX spare_parts_orders_created_by_idx ON public.spare_parts_orders USING btree (created_by);
CREATE INDEX spare_parts_orders_status_idx ON public.spare_parts_orders USING btree (status);

-- ========================================
-- TABLE: student_accounts
-- ========================================
CREATE TABLE student_accounts (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  balance NUMERIC DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  last_payment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID
);

ALTER TABLE student_accounts ADD PRIMARY KEY (id);
ALTER TABLE student_accounts ADD CONSTRAINT student_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE student_accounts ADD CONSTRAINT student_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE student_accounts ADD CONSTRAINT student_accounts_user_id_key UNIQUE (user_id);
CREATE INDEX student_accounts_created_by_idx ON public.student_accounts USING btree (created_by);
CREATE UNIQUE INDEX student_accounts_user_id_key ON public.student_accounts USING btree (user_id);

-- ========================================
-- TABLE: student_achievements
-- ========================================
CREATE TABLE student_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID,
  achievement_type CHARACTER VARYING(50) NOT NULL,
  title CHARACTER VARYING(100) NOT NULL,
  description TEXT,
  earned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE student_achievements ADD PRIMARY KEY (id);
ALTER TABLE student_achievements ADD CONSTRAINT student_achievements_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
ALTER TABLE student_achievements ADD CONSTRAINT student_achievements_student_id_achievement_type_key UNIQUE (achievement_type);
ALTER TABLE student_achievements ADD CONSTRAINT student_achievements_student_id_achievement_type_key UNIQUE (achievement_type);
ALTER TABLE student_achievements ADD CONSTRAINT student_achievements_student_id_achievement_type_key UNIQUE (student_id);
ALTER TABLE student_achievements ADD CONSTRAINT student_achievements_student_id_achievement_type_key UNIQUE (student_id);
CREATE INDEX idx_achievements_earned_at ON public.student_achievements USING btree (earned_at);
CREATE INDEX idx_achievements_student_id ON public.student_achievements USING btree (student_id);
CREATE UNIQUE INDEX student_achievements_student_id_achievement_type_key ON public.student_achievements USING btree (student_id, achievement_type);

-- ========================================
-- TABLE: student_progress
-- ========================================
CREATE TABLE student_progress (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  student_id UUID,
  skill_id UUID,
  instructor_id UUID,
  date_achieved DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE student_progress ADD PRIMARY KEY (id);
ALTER TABLE student_progress ADD CONSTRAINT student_progress_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES users(id);
ALTER TABLE student_progress ADD CONSTRAINT student_progress_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id);
ALTER TABLE student_progress ADD CONSTRAINT student_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);

-- ========================================
-- TABLE: student_support_requests
-- ========================================
CREATE TABLE student_support_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  channel CHARACTER VARYING(32) NOT NULL DEFAULT 'portal'::character varying,
  priority CHARACTER VARYING(16) NOT NULL DEFAULT 'normal'::character varying,
  status CHARACTER VARYING(16) NOT NULL DEFAULT 'open'::character varying,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE student_support_requests ADD PRIMARY KEY (id);
ALTER TABLE student_support_requests ADD CONSTRAINT student_support_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
CREATE INDEX idx_student_support_requests_status ON public.student_support_requests USING btree (status);
CREATE INDEX idx_student_support_requests_student_id ON public.student_support_requests USING btree (student_id);

-- ========================================
-- TABLE: transactions
-- ========================================
CREATE TABLE transactions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  type CHARACTER VARYING(50) NOT NULL,
  description TEXT,
  payment_method CHARACTER VARYING(50),
  reference_number CHARACTER VARYING(100),
  booking_id UUID,
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  exchange_rate NUMERIC DEFAULT 1.0,
  entity_type CHARACTER VARYING(50),
  status CHARACTER VARYING(50) DEFAULT 'completed'::character varying,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  rental_id UUID,
  original_amount NUMERIC,
  original_currency CHARACTER VARYING(3)
);

ALTER TABLE transactions ADD PRIMARY KEY (id);
ALTER TABLE transactions ADD CONSTRAINT transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_rental_id_fkey FOREIGN KEY (rental_id) REFERENCES rentals(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_transactions_booking ON public.transactions USING btree (booking_id);
CREATE INDEX idx_transactions_rental ON public.transactions USING btree (rental_id);
CREATE INDEX idx_transactions_status_date ON public.transactions USING btree (status, transaction_date) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]));
CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);
CREATE INDEX idx_transactions_type_status_date ON public.transactions USING btree (type, status, transaction_date);
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);
CREATE INDEX idx_transactions_user_date ON public.transactions USING btree (user_id, transaction_date);
CREATE INDEX transactions_created_by_idx ON public.transactions USING btree (created_by);

-- ========================================
-- TABLE: user_consents
-- ========================================
CREATE TABLE user_consents (
  user_id UUID NOT NULL,
  terms_version TEXT NOT NULL,
  terms_accepted_at TIMESTAMP WITH TIME ZONE,
  marketing_email_opt_in BOOLEAN NOT NULL DEFAULT false,
  marketing_sms_opt_in BOOLEAN NOT NULL DEFAULT false,
  marketing_whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE user_consents ADD PRIMARY KEY (user_id);
ALTER TABLE user_consents ADD CONSTRAINT user_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_user_consents_terms_version ON public.user_consents USING btree (terms_version);

-- ========================================
-- TABLE: user_popup_preferences
-- ========================================
CREATE TABLE user_popup_preferences (
  id INTEGER NOT NULL DEFAULT nextval('user_popup_preferences_id_seq'::regclass),
  user_id UUID,
  popups_enabled BOOLEAN DEFAULT true,
  welcome_popups_enabled BOOLEAN DEFAULT true,
  feature_popups_enabled BOOLEAN DEFAULT true,
  promotional_popups_enabled BOOLEAN DEFAULT true,
  max_popups_per_day INTEGER DEFAULT 3,
  max_popups_per_week INTEGER DEFAULT 10,
  email_on_popup_feedback BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE user_popup_preferences ADD PRIMARY KEY (id);
ALTER TABLE user_popup_preferences ADD CONSTRAINT user_popup_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_popup_preferences ADD CONSTRAINT user_popup_preferences_user_id_key UNIQUE (user_id);
CREATE INDEX idx_user_popup_preferences_user_id ON public.user_popup_preferences USING btree (user_id);
CREATE UNIQUE INDEX user_popup_preferences_user_id_key ON public.user_popup_preferences USING btree (user_id);

-- ========================================
-- TABLE: user_preferences
-- ========================================
CREATE TABLE user_preferences (
  id INTEGER NOT NULL DEFAULT nextval('user_preferences_id_seq'::regclass),
  user_id UUID NOT NULL,
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  push_notifications BOOLEAN DEFAULT true,
  language CHARACTER VARYING(10) DEFAULT 'en'::character varying,
  timezone CHARACTER VARYING(100) DEFAULT 'UTC'::character varying,
  preferred_currency CHARACTER VARYING(10) DEFAULT 'EUR'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE user_preferences ADD PRIMARY KEY (id);
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences USING btree (user_id);
CREATE UNIQUE INDEX user_preferences_user_id_key ON public.user_preferences USING btree (user_id);

-- ========================================
-- TABLE: user_relationships
-- ========================================
CREATE TABLE user_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'pending'::character varying,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  declined_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE user_relationships ADD PRIMARY KEY (id);
ALTER TABLE user_relationships ADD CONSTRAINT user_relationships_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES users(id);
ALTER TABLE user_relationships ADD CONSTRAINT user_relationships_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
ALTER TABLE user_relationships ADD CONSTRAINT unique_relationship UNIQUE (receiver_id);
ALTER TABLE user_relationships ADD CONSTRAINT unique_relationship UNIQUE (receiver_id);
ALTER TABLE user_relationships ADD CONSTRAINT unique_relationship UNIQUE (sender_id);
ALTER TABLE user_relationships ADD CONSTRAINT unique_relationship UNIQUE (sender_id);
CREATE INDEX idx_user_relationships_accepted ON public.user_relationships USING btree (status) WHERE ((status)::text = 'accepted'::text);
CREATE INDEX idx_user_relationships_friends_receiver ON public.user_relationships USING btree (receiver_id, sender_id) WHERE ((status)::text = 'accepted'::text);
CREATE INDEX idx_user_relationships_friends_sender ON public.user_relationships USING btree (sender_id, receiver_id) WHERE ((status)::text = 'accepted'::text);
CREATE INDEX idx_user_relationships_receiver ON public.user_relationships USING btree (receiver_id);
CREATE INDEX idx_user_relationships_sender ON public.user_relationships USING btree (sender_id);
CREATE UNIQUE INDEX unique_relationship ON public.user_relationships USING btree (sender_id, receiver_id);

-- ========================================
-- TABLE: user_sessions
-- ========================================
CREATE TABLE user_sessions (
  id INTEGER NOT NULL DEFAULT nextval('user_sessions_id_seq'::regclass),
  user_id INTEGER,
  token_id CHARACTER VARYING(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITHOUT TIME ZONE,
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE user_sessions ADD PRIMARY KEY (id);
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_token_id_key UNIQUE (token_id);
CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at) WHERE (is_active = true);
CREATE INDEX idx_user_sessions_token ON public.user_sessions USING btree (token_id) WHERE (is_active = true);
CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id, is_active);
CREATE UNIQUE INDEX user_sessions_token_id_key ON public.user_sessions USING btree (token_id);

-- ========================================
-- TABLE: user_tags
-- ========================================
CREATE TABLE user_tags (
  id INTEGER NOT NULL DEFAULT nextval('user_tags_id_seq'::regclass),
  user_id UUID NOT NULL,
  tag CHARACTER VARYING(50) NOT NULL,
  label CHARACTER VARYING(100),
  awarded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE user_tags ADD PRIMARY KEY (id);
ALTER TABLE user_tags ADD CONSTRAINT user_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_tags ADD CONSTRAINT user_tags_user_id_tag_key UNIQUE (tag);
ALTER TABLE user_tags ADD CONSTRAINT user_tags_user_id_tag_key UNIQUE (tag);
ALTER TABLE user_tags ADD CONSTRAINT user_tags_user_id_tag_key UNIQUE (user_id);
ALTER TABLE user_tags ADD CONSTRAINT user_tags_user_id_tag_key UNIQUE (user_id);
CREATE INDEX idx_user_tags_tag ON public.user_tags USING btree (tag);
CREATE INDEX idx_user_tags_user_id ON public.user_tags USING btree (user_id);
CREATE UNIQUE INDEX user_tags_user_id_tag_key ON public.user_tags USING btree (user_id, tag);

-- ========================================
-- TABLE: user_vouchers
-- ========================================
CREATE TABLE user_vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  voucher_code_id UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  assigned_by UUID,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  redemption_id UUID,
  notes TEXT
);

ALTER TABLE user_vouchers ADD PRIMARY KEY (id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES voucher_redemptions(id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_voucher_code_id_fkey FOREIGN KEY (voucher_code_id) REFERENCES voucher_codes(id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_user_id_voucher_code_id_key UNIQUE (user_id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_user_id_voucher_code_id_key UNIQUE (user_id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_user_id_voucher_code_id_key UNIQUE (voucher_code_id);
ALTER TABLE user_vouchers ADD CONSTRAINT user_vouchers_user_id_voucher_code_id_key UNIQUE (voucher_code_id);
CREATE INDEX idx_user_vouchers_user ON public.user_vouchers USING btree (user_id, is_used);
CREATE INDEX idx_user_vouchers_voucher ON public.user_vouchers USING btree (voucher_code_id);
CREATE UNIQUE INDEX user_vouchers_user_id_voucher_code_id_key ON public.user_vouchers USING btree (user_id, voucher_code_id);

-- ========================================
-- TABLE: users
-- ========================================
CREATE TABLE users (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  name CHARACTER VARYING(100) NOT NULL,
  email CHARACTER VARYING(255) NOT NULL,
  password_hash CHARACTER VARYING(255) NOT NULL,
  first_name CHARACTER VARYING(50),
  last_name CHARACTER VARYING(50),
  date_of_birth DATE,
  phone CHARACTER VARYING(50),
  address TEXT,
  city CHARACTER VARYING(100),
  country CHARACTER VARYING(100),
  postal_code CHARACTER VARYING(20),
  preferred_currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  bio TEXT,
  profile_image_url CHARACTER VARYING(255),
  role_id UUID,
  level CHARACTER VARYING(50),
  notes TEXT,
  package_hours INTEGER DEFAULT 0,
  remaining_hours NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_login TIMESTAMP WITH TIME ZONE,
  skill_level CHARACTER VARYING(20) DEFAULT 'beginner'::character varying,
  balance NUMERIC DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  last_payment_date TIMESTAMP WITH TIME ZONE,
  account_status CHARACTER VARYING(50) DEFAULT 'active'::character varying,
  two_factor_secret CHARACTER VARYING(32),
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_backup_codes ARRAY,
  account_locked BOOLEAN DEFAULT false,
  account_locked_at TIMESTAMP WITHOUT TIME ZONE,
  failed_login_attempts INTEGER DEFAULT 0,
  last_failed_login_at TIMESTAMP WITHOUT TIME ZONE,
  account_expired_at TIMESTAMP WITHOUT TIME ZONE,
  password_changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP WITHOUT TIME ZONE,
  last_login_ip INET,
  hourly_rate NUMERIC DEFAULT 80.00,
  age SMALLINT,
  weight NUMERIC,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID,
  original_email CHARACTER VARYING(255) DEFAULT NULL::character varying,
  registration_source CHARACTER VARYING(50),
  registration_complete BOOLEAN DEFAULT true,
  contact_preference CHARACTER VARYING(20),
  phone_country_code CHARACTER VARYING(10),
  zip_code CHARACTER VARYING(20),
  iyzico_card_user_key TEXT,
  status CHARACTER VARYING(20) DEFAULT 'active'::character varying,
  is_freelance BOOLEAN DEFAULT false
);

ALTER TABLE users ADD PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
CREATE INDEX idx_users_account_status ON public.users USING btree (account_locked, account_expired_at);
CREATE INDEX idx_users_active_role ON public.users USING btree (account_status, role_id) WHERE ((account_status)::text = 'active'::text);
CREATE INDEX idx_users_country ON public.users USING btree (country) WHERE ((country IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_email_trgm ON public.users USING gin (lower((email)::text) gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_users_email_unique_active ON public.users USING btree (email) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_failed_logins ON public.users USING btree (failed_login_attempts, last_failed_login_at);
CREATE INDEX idx_users_hourly_rate ON public.users USING btree (hourly_rate) WHERE (hourly_rate IS NOT NULL);
CREATE INDEX idx_users_name_trgm ON public.users USING gin (lower((((first_name)::text || ' '::text) || (last_name)::text)) gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_phone_trgm ON public.users USING gin (lower((phone)::text) gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_registration_complete ON public.users USING btree (registration_complete) WHERE (registration_complete = false);
CREATE INDEX idx_users_role ON public.users USING btree (role_id);
CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);
CREATE INDEX idx_users_role_id_desc ON public.users USING btree (role_id, id DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_users_two_factor ON public.users USING btree (two_factor_enabled) WHERE (two_factor_enabled = true);

-- ========================================
-- TABLE: voucher_campaigns
-- ========================================
CREATE TABLE voucher_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  budget_limit NUMERIC,
  total_spent NUMERIC DEFAULT 0,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE voucher_campaigns ADD PRIMARY KEY (id);
ALTER TABLE voucher_campaigns ADD CONSTRAINT voucher_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);

-- ========================================
-- TABLE: voucher_codes
-- ========================================
CREATE TABLE voucher_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  code CHARACTER VARYING(50) NOT NULL,
  name CHARACTER VARYING(255) NOT NULL,
  description TEXT,
  voucher_type CHARACTER VARYING(50) NOT NULL,
  discount_value NUMERIC NOT NULL,
  max_discount NUMERIC,
  min_purchase_amount NUMERIC DEFAULT 0,
  currency CHARACTER VARYING(3),
  applies_to CHARACTER VARYING(50) DEFAULT 'all'::character varying,
  applies_to_ids JSONB DEFAULT '[]'::jsonb,
  excludes_ids JSONB DEFAULT '[]'::jsonb,
  usage_type CHARACTER VARYING(50) DEFAULT 'single_per_user'::character varying,
  max_total_uses INTEGER,
  max_uses_per_user INTEGER DEFAULT 1,
  total_uses INTEGER DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  visibility CHARACTER VARYING(50) DEFAULT 'public'::character varying,
  requires_first_purchase BOOLEAN DEFAULT false,
  allowed_roles JSONB,
  allowed_user_ids JSONB,
  can_combine BOOLEAN DEFAULT false,
  campaign_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE voucher_codes ADD PRIMARY KEY (id);
ALTER TABLE voucher_codes ADD CONSTRAINT voucher_codes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES voucher_campaigns(id);
ALTER TABLE voucher_codes ADD CONSTRAINT voucher_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE voucher_codes ADD CONSTRAINT voucher_codes_code_key UNIQUE (code);
CREATE INDEX idx_voucher_codes_active ON public.voucher_codes USING btree (is_active, valid_from, valid_until) WHERE (is_active = true);
CREATE INDEX idx_voucher_codes_campaign ON public.voucher_codes USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);
CREATE UNIQUE INDEX idx_voucher_codes_code_lower ON public.voucher_codes USING btree (lower((code)::text));
CREATE UNIQUE INDEX voucher_codes_code_key ON public.voucher_codes USING btree (code);

-- ========================================
-- TABLE: voucher_redemptions
-- ========================================
CREATE TABLE voucher_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  voucher_code_id UUID NOT NULL,
  user_id UUID NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  applied_to_type CHARACTER VARYING(50) NOT NULL,
  applied_to_id UUID,
  original_amount NUMERIC NOT NULL,
  discount_amount NUMERIC NOT NULL,
  final_amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) DEFAULT 'EUR'::character varying,
  status CHARACTER VARYING(50) DEFAULT 'applied'::character varying,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE voucher_redemptions ADD PRIMARY KEY (id);
ALTER TABLE voucher_redemptions ADD CONSTRAINT voucher_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE voucher_redemptions ADD CONSTRAINT voucher_redemptions_voucher_code_id_fkey FOREIGN KEY (voucher_code_id) REFERENCES voucher_codes(id);
CREATE INDEX idx_voucher_redemptions_entity ON public.voucher_redemptions USING btree (applied_to_type, applied_to_id);
CREATE INDEX idx_voucher_redemptions_user ON public.voucher_redemptions USING btree (user_id, redeemed_at DESC);
CREATE INDEX idx_voucher_redemptions_voucher ON public.voucher_redemptions USING btree (voucher_code_id, status);

-- ========================================
-- TABLE: waiver_versions
-- ========================================
CREATE TABLE waiver_versions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  version_number CHARACTER VARYING(20) NOT NULL,
  language_code CHARACTER VARYING(10) NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  created_by UUID
);

ALTER TABLE waiver_versions ADD PRIMARY KEY (id);
ALTER TABLE waiver_versions ADD CONSTRAINT waiver_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE waiver_versions ADD CONSTRAINT waiver_versions_version_number_key UNIQUE (version_number);
CREATE INDEX idx_waiver_versions_active ON public.waiver_versions USING btree (is_active);
CREATE INDEX idx_waiver_versions_effective ON public.waiver_versions USING btree (effective_date);
CREATE INDEX idx_waiver_versions_language ON public.waiver_versions USING btree (language_code);
CREATE UNIQUE INDEX idx_waiver_versions_unique ON public.waiver_versions USING btree (version_number, language_code);
CREATE UNIQUE INDEX waiver_versions_version_number_key ON public.waiver_versions USING btree (version_number);

-- ========================================
-- TABLE: wallet_audit_logs
-- ========================================
CREATE TABLE wallet_audit_logs (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  wallet_user_id UUID NOT NULL,
  actor_user_id UUID,
  action CHARACTER VARYING(100) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE wallet_audit_logs ADD PRIMARY KEY (id);
ALTER TABLE wallet_audit_logs ADD CONSTRAINT wallet_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE wallet_audit_logs ADD CONSTRAINT wallet_audit_logs_wallet_user_id_fkey FOREIGN KEY (wallet_user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_audit_wallet ON public.wallet_audit_logs USING btree (wallet_user_id, created_at DESC);

-- ========================================
-- TABLE: wallet_balances
-- ========================================
CREATE TABLE wallet_balances (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  available_amount NUMERIC NOT NULL DEFAULT 0,
  pending_amount NUMERIC NOT NULL DEFAULT 0,
  non_withdrawable_amount NUMERIC NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE wallet_balances ADD PRIMARY KEY (id);
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_user_id_currency_key UNIQUE (currency);
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_user_id_currency_key UNIQUE (currency);
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_user_id_currency_key UNIQUE (user_id);
ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_user_id_currency_key UNIQUE (user_id);
CREATE INDEX idx_wallet_balances_user_currency ON public.wallet_balances USING btree (user_id, currency);
CREATE UNIQUE INDEX wallet_balances_user_id_currency_key ON public.wallet_balances USING btree (user_id, currency);

-- ========================================
-- TABLE: wallet_bank_accounts
-- ========================================
CREATE TABLE wallet_bank_accounts (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  scope_type CHARACTER VARYING(50) NOT NULL DEFAULT 'global'::character varying,
  scope_id UUID,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  bank_name CHARACTER VARYING(150),
  account_holder CHARACTER VARYING(150),
  account_number CHARACTER VARYING(50),
  iban CHARACTER VARYING(42),
  swift_code CHARACTER VARYING(20),
  routing_number CHARACTER VARYING(20),
  instructions TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verification_status CHARACTER VARYING(20) NOT NULL DEFAULT 'unverified'::character varying,
  verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT
);

ALTER TABLE wallet_bank_accounts ADD PRIMARY KEY (id);
ALTER TABLE wallet_bank_accounts ADD CONSTRAINT wallet_bank_accounts_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
CREATE INDEX idx_wallet_bank_accounts_currency ON public.wallet_bank_accounts USING btree (currency);
CREATE INDEX idx_wallet_bank_accounts_primary ON public.wallet_bank_accounts USING btree (scope_type, scope_id, currency, is_primary) WHERE (is_primary = true);
CREATE INDEX idx_wallet_bank_accounts_scope ON public.wallet_bank_accounts USING btree (scope_type, scope_id, is_active);
CREATE INDEX idx_wallet_bank_accounts_verification ON public.wallet_bank_accounts USING btree (verification_status);

-- ========================================
-- TABLE: wallet_deposit_requests
-- ========================================
CREATE TABLE wallet_deposit_requests (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  amount NUMERIC NOT NULL,
  method CHARACTER VARYING(50) NOT NULL,
  status CHARACTER VARYING(30) NOT NULL DEFAULT 'pending'::character varying,
  reference_code CHARACTER VARYING(100),
  proof_url TEXT,
  gateway CHARACTER VARYING(50),
  gateway_transaction_id CHARACTER VARYING(120),
  initiated_by UUID,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  bank_account_id UUID,
  bank_reference_code CHARACTER VARYING(120),
  payment_method_id UUID,
  verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE wallet_deposit_requests ADD PRIMARY KEY (id);
ALTER TABLE wallet_deposit_requests ADD CONSTRAINT wallet_deposit_requests_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES wallet_bank_accounts(id);
ALTER TABLE wallet_deposit_requests ADD CONSTRAINT wallet_deposit_requests_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE wallet_deposit_requests ADD CONSTRAINT wallet_deposit_requests_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES users(id);
ALTER TABLE wallet_deposit_requests ADD CONSTRAINT wallet_deposit_requests_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES wallet_payment_methods(id);
ALTER TABLE wallet_deposit_requests ADD CONSTRAINT wallet_deposit_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES users(id);
ALTER TABLE wallet_deposit_requests ADD CONSTRAINT wallet_deposit_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_deposit_requests_bank_account ON public.wallet_deposit_requests USING btree (bank_account_id);
CREATE INDEX idx_wallet_deposit_requests_payment_method ON public.wallet_deposit_requests USING btree (payment_method_id);
CREATE INDEX idx_wallet_deposit_requests_status ON public.wallet_deposit_requests USING btree (status);
CREATE INDEX idx_wallet_deposit_requests_user_status ON public.wallet_deposit_requests USING btree (user_id, status);

-- ========================================
-- TABLE: wallet_export_jobs
-- ========================================
CREATE TABLE wallet_export_jobs (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  scope_type CHARACTER VARYING(50) NOT NULL DEFAULT 'global'::character varying,
  scope_id UUID,
  requested_by UUID,
  export_type CHARACTER VARYING(50) NOT NULL,
  export_scope CHARACTER VARYING(50) NOT NULL DEFAULT 'all'::character varying,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'pending'::character varying,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  file_path TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT now(),
  tenant_key CHARACTER VARYING(150) DEFAULT 'global'::character varying,
  status_history JSONB DEFAULT '[]'::jsonb,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  last_status_change_at TIMESTAMP WITH TIME ZONE,
  retry_delay_seconds INTEGER DEFAULT 0
);

ALTER TABLE wallet_export_jobs ADD PRIMARY KEY (id);
ALTER TABLE wallet_export_jobs ADD CONSTRAINT wallet_export_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id);
CREATE INDEX idx_wallet_export_jobs_attempt_count ON public.wallet_export_jobs USING btree (attempt_count);
CREATE INDEX idx_wallet_export_jobs_next_retry ON public.wallet_export_jobs USING btree (next_retry_at) WHERE (next_retry_at IS NOT NULL);
CREATE INDEX idx_wallet_export_jobs_requested_at ON public.wallet_export_jobs USING btree (requested_at DESC);
CREATE INDEX idx_wallet_export_jobs_schedule ON public.wallet_export_jobs USING btree (scheduled_for);
CREATE INDEX idx_wallet_export_jobs_scope ON public.wallet_export_jobs USING btree (scope_type, scope_id);
CREATE INDEX idx_wallet_export_jobs_status ON public.wallet_export_jobs USING btree (status);
CREATE INDEX idx_wallet_export_jobs_tenant_status ON public.wallet_export_jobs USING btree (tenant_key, status);

-- ========================================
-- TABLE: wallet_kyc_documents
-- ========================================
CREATE TABLE wallet_kyc_documents (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  payment_method_id UUID,
  document_type CHARACTER VARYING(80) NOT NULL,
  status CHARACTER VARYING(30) NOT NULL DEFAULT 'pending'::character varying,
  file_url TEXT,
  storage_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by UUID,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE wallet_kyc_documents ADD PRIMARY KEY (id);
ALTER TABLE wallet_kyc_documents ADD CONSTRAINT wallet_kyc_documents_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES wallet_payment_methods(id);
ALTER TABLE wallet_kyc_documents ADD CONSTRAINT wallet_kyc_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE wallet_kyc_documents ADD CONSTRAINT wallet_kyc_documents_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id);
ALTER TABLE wallet_kyc_documents ADD CONSTRAINT wallet_kyc_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_kyc_documents_payment_method ON public.wallet_kyc_documents USING btree (payment_method_id);
CREATE INDEX idx_wallet_kyc_documents_status ON public.wallet_kyc_documents USING btree (status);
CREATE INDEX idx_wallet_kyc_documents_type ON public.wallet_kyc_documents USING btree (document_type);
CREATE INDEX idx_wallet_kyc_documents_user ON public.wallet_kyc_documents USING btree (user_id, status);

-- ========================================
-- TABLE: wallet_notification_delivery_logs
-- ========================================
CREATE TABLE wallet_notification_delivery_logs (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  actor_user_id UUID,
  event_id TEXT NOT NULL,
  channel CHARACTER VARYING(50) NOT NULL,
  status CHARACTER VARYING(32) NOT NULL,
  forced BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE wallet_notification_delivery_logs ADD PRIMARY KEY (id);
ALTER TABLE wallet_notification_delivery_logs ADD CONSTRAINT wallet_notification_delivery_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE wallet_notification_delivery_logs ADD CONSTRAINT wallet_notification_delivery_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_notification_delivery_channel ON public.wallet_notification_delivery_logs USING btree (channel);
CREATE INDEX idx_wallet_notification_delivery_event ON public.wallet_notification_delivery_logs USING btree (event_id);
CREATE INDEX idx_wallet_notification_delivery_user ON public.wallet_notification_delivery_logs USING btree (user_id, queued_at DESC);

-- ========================================
-- TABLE: wallet_notification_preferences
-- ========================================
CREATE TABLE wallet_notification_preferences (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  scope_type CHARACTER VARYING(50) NOT NULL DEFAULT 'user'::character varying,
  scope_id UUID,
  channel CHARACTER VARYING(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID,
  deletion_reason TEXT,
  restored_at TIMESTAMP WITH TIME ZONE,
  restored_by UUID,
  audit_metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE wallet_notification_preferences ADD PRIMARY KEY (id);
ALTER TABLE wallet_notification_preferences ADD CONSTRAINT wallet_notification_preferences_deleted_by_fk FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE wallet_notification_preferences ADD CONSTRAINT wallet_notification_preferences_restored_by_fk FOREIGN KEY (restored_by) REFERENCES users(id);
ALTER TABLE wallet_notification_preferences ADD CONSTRAINT wallet_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_notification_preferences_channel ON public.wallet_notification_preferences USING btree (channel) WHERE (channel IS NOT NULL);
CREATE INDEX idx_wallet_notification_preferences_deleted ON public.wallet_notification_preferences USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_wallet_notification_preferences_user ON public.wallet_notification_preferences USING btree (user_id);
CREATE UNIQUE INDEX uq_wallet_notification_preferences_default ON public.wallet_notification_preferences USING btree (user_id, channel) WHERE ((scope_id IS NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX uq_wallet_notification_preferences_scoped ON public.wallet_notification_preferences USING btree (user_id, scope_type, scope_id, channel) WHERE ((scope_id IS NOT NULL) AND (deleted_at IS NULL));

-- ========================================
-- TABLE: wallet_payment_methods
-- ========================================
CREATE TABLE wallet_payment_methods (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  type CHARACTER VARYING(30) NOT NULL,
  provider CHARACTER VARYING(50) NOT NULL,
  display_name CHARACTER VARYING(100),
  masked_identifier CHARACTER VARYING(100),
  external_id CHARACTER VARYING(100),
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'active'::character varying,
  verification_status CHARACTER VARYING(20) NOT NULL DEFAULT 'unverified'::character varying,
  verified_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_notes TEXT,
  last_verified_by UUID
);

ALTER TABLE wallet_payment_methods ADD PRIMARY KEY (id);
ALTER TABLE wallet_payment_methods ADD CONSTRAINT wallet_payment_methods_last_verified_by_fkey FOREIGN KEY (last_verified_by) REFERENCES users(id);
ALTER TABLE wallet_payment_methods ADD CONSTRAINT wallet_payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_payment_methods_provider ON public.wallet_payment_methods USING btree (provider);
CREATE INDEX idx_wallet_payment_methods_user ON public.wallet_payment_methods USING btree (user_id);
CREATE INDEX idx_wallet_payment_methods_verification ON public.wallet_payment_methods USING btree (verification_status);

-- ========================================
-- TABLE: wallet_promotions
-- ========================================
CREATE TABLE wallet_promotions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  code CHARACTER VARYING(50) NOT NULL,
  user_id UUID,
  amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  expires_at TIMESTAMP WITH TIME ZONE,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'active'::character varying,
  terms TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE wallet_promotions ADD PRIMARY KEY (id);
ALTER TABLE wallet_promotions ADD CONSTRAINT wallet_promotions_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE wallet_promotions ADD CONSTRAINT wallet_promotions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE wallet_promotions ADD CONSTRAINT wallet_promotions_code_currency_key UNIQUE (code);
ALTER TABLE wallet_promotions ADD CONSTRAINT wallet_promotions_code_currency_key UNIQUE (code);
ALTER TABLE wallet_promotions ADD CONSTRAINT wallet_promotions_code_currency_key UNIQUE (currency);
ALTER TABLE wallet_promotions ADD CONSTRAINT wallet_promotions_code_currency_key UNIQUE (currency);
CREATE INDEX idx_wallet_promotions_status ON public.wallet_promotions USING btree (status);
CREATE INDEX idx_wallet_promotions_user ON public.wallet_promotions USING btree (user_id);
CREATE UNIQUE INDEX wallet_promotions_code_currency_key ON public.wallet_promotions USING btree (code, currency);

-- ========================================
-- TABLE: wallet_settings
-- ========================================
CREATE TABLE wallet_settings (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  scope_type CHARACTER VARYING(50) NOT NULL DEFAULT 'global'::character varying,
  scope_id UUID,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  is_default BOOLEAN NOT NULL DEFAULT false,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  card_fee_percent NUMERIC NOT NULL DEFAULT 0,
  withdrawal_auto_approve_after_hours INTEGER DEFAULT 12,
  withdrawal_processing_time_days INTEGER DEFAULT 1,
  allow_mixed_payments BOOLEAN NOT NULL DEFAULT true,
  auto_use_wallet_first BOOLEAN NOT NULL DEFAULT true,
  require_kyc_for_withdrawals BOOLEAN NOT NULL DEFAULT true,
  enabled_gateways ARRAY NOT NULL DEFAULT ARRAY['stripe'::text, 'iyzico'::text, 'paytr'::text, 'binance_pay'::text],
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE wallet_settings ADD PRIMARY KEY (id);
ALTER TABLE wallet_settings ADD CONSTRAINT wallet_settings_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
CREATE INDEX idx_wallet_settings_default ON public.wallet_settings USING btree (is_default) WHERE (is_default = true);
CREATE UNIQUE INDEX idx_wallet_settings_scope ON public.wallet_settings USING btree (scope_type, scope_id, currency);

-- ========================================
-- TABLE: wallet_transactions
-- ========================================
CREATE TABLE wallet_transactions (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  balance_id UUID,
  transaction_type CHARACTER VARYING(50) NOT NULL,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'completed'::character varying,
  direction CHARACTER VARYING(10) NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  amount NUMERIC NOT NULL,
  available_delta NUMERIC NOT NULL DEFAULT 0,
  pending_delta NUMERIC NOT NULL DEFAULT 0,
  non_withdrawable_delta NUMERIC NOT NULL DEFAULT 0,
  balance_available_after NUMERIC,
  balance_pending_after NUMERIC,
  balance_non_withdrawable_after NUMERIC,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_entity_type CHARACTER VARYING(50),
  related_entity_id UUID,
  created_by UUID,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payment_method CHARACTER VARYING(50),
  reference_number CHARACTER VARYING(100),
  booking_id UUID,
  rental_id UUID,
  exchange_rate NUMERIC,
  entity_type CHARACTER VARYING(50),
  original_amount NUMERIC,
  original_currency CHARACTER VARYING(3),
  transaction_exchange_rate NUMERIC
);

ALTER TABLE wallet_transactions ADD PRIMARY KEY (id);
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_balance_id_fkey FOREIGN KEY (balance_id) REFERENCES wallet_balances(id);
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_transactions_booking ON public.wallet_transactions USING btree (booking_id);
CREATE INDEX idx_wallet_transactions_entity_type ON public.wallet_transactions USING btree (entity_type);
CREATE INDEX idx_wallet_transactions_original_currency ON public.wallet_transactions USING btree (original_currency) WHERE (original_currency IS NOT NULL);
CREATE INDEX idx_wallet_transactions_payment_method ON public.wallet_transactions USING btree (payment_method);
CREATE INDEX idx_wallet_transactions_reference_number ON public.wallet_transactions USING btree (reference_number);
CREATE INDEX idx_wallet_transactions_related ON public.wallet_transactions USING btree (related_entity_type, related_entity_id);
CREATE INDEX idx_wallet_transactions_rental ON public.wallet_transactions USING btree (rental_id);
CREATE INDEX idx_wallet_transactions_type ON public.wallet_transactions USING btree (transaction_type);
CREATE INDEX idx_wallet_transactions_user_created ON public.wallet_transactions USING btree (user_id, created_at DESC);
CREATE INDEX idx_wallet_transactions_user_date ON public.wallet_transactions USING btree (user_id, transaction_date DESC);

-- ========================================
-- TABLE: wallet_withdrawal_requests
-- ========================================
CREATE TABLE wallet_withdrawal_requests (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  payout_method_id UUID,
  amount NUMERIC NOT NULL,
  currency CHARACTER VARYING(3) NOT NULL DEFAULT 'EUR'::character varying,
  status CHARACTER VARYING(30) NOT NULL DEFAULT 'pending'::character varying,
  auto_approved BOOLEAN DEFAULT false,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  processed_by UUID,
  rejection_reason TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE wallet_withdrawal_requests ADD PRIMARY KEY (id);
ALTER TABLE wallet_withdrawal_requests ADD CONSTRAINT wallet_withdrawal_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE wallet_withdrawal_requests ADD CONSTRAINT wallet_withdrawal_requests_currency_fkey FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
ALTER TABLE wallet_withdrawal_requests ADD CONSTRAINT wallet_withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES users(id);
ALTER TABLE wallet_withdrawal_requests ADD CONSTRAINT wallet_withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_wallet_withdrawal_status ON public.wallet_withdrawal_requests USING btree (status);
CREATE INDEX idx_wallet_withdrawal_user_status ON public.wallet_withdrawal_requests USING btree (user_id, status);
