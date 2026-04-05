DROP TABLE IF EXISTS "public"."accommodation_bookings";
-- Table Definition
CREATE TABLE "public"."accommodation_bookings" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "unit_id" uuid NOT NULL,
    "guest_id" uuid NOT NULL,
    "check_in_date" date NOT NULL,
    "check_out_date" date NOT NULL,
    "guests_count" int4 NOT NULL DEFAULT 1,
    "total_price" numeric(10,2) NOT NULL,
    "status" varchar(50) NOT NULL DEFAULT 'confirmed'::character varying,
    "notes" text,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "accommodation_bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
    CONSTRAINT "accommodation_bookings_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "accommodation_bookings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."accommodation_units"("id"),
    CONSTRAINT "accommodation_bookings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_accommodation_availability ON public.accommodation_bookings USING btree (unit_id, check_in_date, check_out_date, status) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_accommodation_bookings_dates ON public.accommodation_bookings USING btree (check_in_date, check_out_date);
CREATE INDEX idx_accommodation_bookings_status ON public.accommodation_bookings USING btree (status);

DROP TABLE IF EXISTS "public"."accommodation_units";
-- Table Definition
CREATE TABLE "public"."accommodation_units" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(255) NOT NULL,
    "type" varchar(50) NOT NULL,
    "status" varchar(50) NOT NULL DEFAULT 'Available'::character varying,
    "capacity" int4 NOT NULL,
    "price_per_night" numeric(10,2) NOT NULL,
    "description" text,
    "amenities" jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_accommodation_units_status ON public.accommodation_units USING btree (status);

DROP TABLE IF EXISTS "public"."audit_logs";
-- Table Definition
CREATE TABLE "public"."audit_logs" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid,
    "action" varchar(50) NOT NULL,
    "entity_type" varchar(50) NOT NULL,
    "entity_id" uuid,
    "old_values" jsonb,
    "new_values" jsonb,
    "ip_address" varchar(50),
    "user_agent" text,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);

DROP TABLE IF EXISTS "public"."booking_custom_commissions";
-- Table Definition
CREATE TABLE "public"."booking_custom_commissions" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "booking_id" uuid NOT NULL,
    "instructor_id" uuid NOT NULL,
    "service_id" uuid NOT NULL,
    "commission_type" varchar(20) NOT NULL,
    "commission_value" numeric(10,2) NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "booking_custom_commissions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE,
    CONSTRAINT "booking_custom_commissions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "booking_custom_commissions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE,
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX booking_custom_commissions_booking_id_key ON public.booking_custom_commissions USING btree (booking_id);
CREATE INDEX idx_booking_custom_commissions_booking_id ON public.booking_custom_commissions USING btree (booking_id);
CREATE INDEX idx_booking_custom_commissions_instructor_id ON public.booking_custom_commissions USING btree (instructor_id);
CREATE INDEX idx_booking_custom_commissions_service_id ON public.booking_custom_commissions USING btree (service_id);

DROP TABLE IF EXISTS "public"."booking_equipment";
-- Table Definition
CREATE TABLE "public"."booking_equipment" (
    "booking_id" uuid NOT NULL,
    "equipment_id" uuid NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "booking_equipment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE,
    CONSTRAINT "booking_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE,
    PRIMARY KEY ("booking_id","equipment_id")
);


-- Indices
CREATE INDEX idx_booking_equipment_lookup ON public.booking_equipment USING btree (booking_id, equipment_id);

DROP TABLE IF EXISTS "public"."booking_series";
-- Table Definition
CREATE TABLE "public"."booking_series" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "description" text,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "recurrence_type" varchar(20) NOT NULL,
    "recurrence_days" _int4 NOT NULL,
    "instructor_user_id" uuid,
    "service_id" uuid,
    "max_students" int4 DEFAULT 1,
    "price_per_session" numeric(10,2),
    "total_price" numeric(10,2),
    "status" varchar(20) DEFAULT 'active'::character varying,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "created_by" uuid,
    CONSTRAINT "booking_series_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
    CONSTRAINT "booking_series_instructor_user_id_fkey" FOREIGN KEY ("instructor_user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "booking_series_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id"),
    PRIMARY KEY ("id")
);

-- Column Comments
COMMENT ON COLUMN "public"."booking_series"."recurrence_days" IS 'Array of day numbers: 1=Monday, 2=Tuesday, ..., 7=Sunday';
COMMENT ON COLUMN "public"."booking_series"."max_students" IS 'Maximum number of students that can enroll in this series';


-- Comments
COMMENT ON TABLE "public"."booking_series" IS 'Multi-day lesson packages with recurring schedules';


-- Indices
CREATE INDEX idx_booking_series_instructor ON public.booking_series USING btree (instructor_user_id);
CREATE INDEX idx_booking_series_service ON public.booking_series USING btree (service_id);
CREATE INDEX idx_booking_series_dates ON public.booking_series USING btree (start_date, end_date);

DROP TABLE IF EXISTS "public"."booking_series_customers";
-- Table Definition
CREATE TABLE "public"."booking_series_customers" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "series_id" uuid,
    "customer_user_id" uuid,
    "enrollment_date" timestamptz DEFAULT now(),
    "status" varchar(20) DEFAULT 'active'::character varying,
    CONSTRAINT "booking_series_students_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE CASCADE,
    CONSTRAINT "booking_series_students_student_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);


-- Comments
COMMENT ON TABLE "public"."booking_series_customers" IS 'Students enrolled in multi-day lesson series';


-- Indices
CREATE UNIQUE INDEX booking_series_students_pkey ON public.booking_series_customers USING btree (id);
CREATE UNIQUE INDEX booking_series_students_series_id_student_user_id_key ON public.booking_series_customers USING btree (series_id, customer_user_id);
CREATE INDEX idx_booking_series_students_series ON public.booking_series_customers USING btree (series_id);
CREATE INDEX idx_booking_series_students_student ON public.booking_series_customers USING btree (customer_user_id);

DROP TABLE IF EXISTS "public"."bookings";
-- Table Definition
CREATE TABLE "public"."bookings" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "date" date NOT NULL,
    "start_hour" numeric(4,2),
    "duration" numeric(4,2) NOT NULL,
    "student_user_id" uuid,
    "instructor_user_id" uuid,
    "status" varchar(50) DEFAULT 'pending'::character varying,
    "payment_status" varchar(50) DEFAULT 'unpaid'::character varying,
    "amount" numeric(10,2) DEFAULT 0,
    "discount_percent" numeric(5,2) DEFAULT 0,
    "discount_amount" numeric(10,2) DEFAULT 0,
    "final_amount" numeric(10,2) DEFAULT 0,
    "location" varchar(100),
    "weather_conditions" text,
    "notes" text,
    "feedback_rating" int4,
    "feedback_comments" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "canceled_at" timestamptz,
    "cancellation_reason" text,
    "service_id" uuid,
    "custom_price" numeric(10,2) DEFAULT NULL::numeric,
    "checkin_status" varchar(20) DEFAULT 'pending'::character varying,
    "checkout_status" varchar(20) DEFAULT 'pending'::character varying,
    "checkin_time" timestamptz,
    "checkout_time" timestamptz,
    "checkin_notes" text,
    "checkout_notes" text,
    "customer_user_id" uuid,
    CONSTRAINT "fk_bookings_customer" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "bookings_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "bookings_instructor_user_id_fkey" FOREIGN KEY ("instructor_user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_bookings_checkin_status ON public.bookings USING btree (checkin_status);
CREATE INDEX idx_bookings_checkout_status ON public.bookings USING btree (checkout_status);
CREATE INDEX idx_bookings_checkin_time ON public.bookings USING btree (checkin_time);
CREATE INDEX idx_bookings_checkout_time ON public.bookings USING btree (checkout_time);
CREATE INDEX idx_bookings_availability_check ON public.bookings USING btree (instructor_user_id, date, start_hour, duration, status) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_bookings_student_date ON public.bookings USING btree (student_user_id, date);
CREATE INDEX idx_bookings_instructor_schedule ON public.bookings USING btree (instructor_user_id, date, start_hour);
CREATE INDEX idx_bookings_status_date ON public.bookings USING btree (status, date);
CREATE INDEX idx_bookings_service ON public.bookings USING btree (service_id, date);
CREATE UNIQUE INDEX idx_bookings_no_overlap ON public.bookings USING btree (instructor_user_id, date, start_hour, duration) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_bookings_student_fk ON public.bookings USING btree (student_user_id);
CREATE INDEX idx_bookings_instructor_fk ON public.bookings USING btree (instructor_user_id);
CREATE INDEX idx_bookings_service_fk ON public.bookings USING btree (service_id);
CREATE INDEX idx_bookings_date ON public.bookings USING btree (date);
CREATE INDEX idx_bookings_student ON public.bookings USING btree (student_user_id);
CREATE INDEX idx_bookings_instructor ON public.bookings USING btree (instructor_user_id);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_custom_price ON public.bookings USING btree (custom_price) WHERE (custom_price IS NOT NULL);

DROP TABLE IF EXISTS "public"."equipment";
-- Table Definition
CREATE TABLE "public"."equipment" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(100) NOT NULL,
    "type" varchar(50) NOT NULL,
    "size" varchar(50),
    "brand" varchar(50),
    "model" varchar(50),
    "serial_number" varchar(100),
    "purchase_date" date,
    "purchase_price" numeric(10,2),
    "condition" varchar(50) DEFAULT 'Good'::character varying,
    "availability" varchar(50) DEFAULT 'Available'::character varying,
    "maintenance_history" jsonb,
    "last_serviced_date" date,
    "location" varchar(100),
    "notes" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_equipment_type ON public.equipment USING btree (type);
CREATE INDEX idx_equipment_availability ON public.equipment USING btree (availability);

DROP TABLE IF EXISTS "public"."instructor_default_commissions";
-- Table Definition
CREATE TABLE "public"."instructor_default_commissions" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "instructor_id" uuid NOT NULL,
    "commission_type" varchar(20) NOT NULL,
    "commission_value" numeric(10,2) NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "instructor_default_commissions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX instructor_default_commissions_instructor_id_key ON public.instructor_default_commissions USING btree (instructor_id);
CREATE INDEX idx_instructor_default_commissions_instructor_id ON public.instructor_default_commissions USING btree (instructor_id);

DROP TABLE IF EXISTS "public"."instructor_earnings";
-- Table Definition
CREATE TABLE "public"."instructor_earnings" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "instructor_id" uuid NOT NULL,
    "booking_id" uuid NOT NULL,
    "base_rate" numeric(10,2) NOT NULL,
    "commission_rate" numeric(5,2) NOT NULL,
    "bonus" numeric(10,2) DEFAULT 0,
    "total_earnings" numeric(10,2) NOT NULL,
    "lesson_date" date NOT NULL,
    "lesson_duration" numeric(4,2) NOT NULL,
    "lesson_amount" numeric(10,2) NOT NULL,
    "payroll_id" uuid,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "instructor_earnings_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "instructor_earnings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id"),
    CONSTRAINT "instructor_earnings_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "public"."instructor_payroll"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_earnings_instructor ON public.instructor_earnings USING btree (instructor_id);
CREATE INDEX idx_earnings_booking ON public.instructor_earnings USING btree (booking_id);
CREATE INDEX idx_earnings_date ON public.instructor_earnings USING btree (lesson_date);

DROP TABLE IF EXISTS "public"."instructor_payroll";
-- Table Definition
CREATE TABLE "public"."instructor_payroll" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "instructor_id" uuid NOT NULL,
    "period_start_date" date NOT NULL,
    "period_end_date" date NOT NULL,
    "base_salary" numeric(10,2) DEFAULT 0,
    "bonus" numeric(10,2) DEFAULT 0,
    "payment_date" timestamptz,
    "payment_method" varchar(50),
    "reference_number" varchar(100),
    "status" varchar(50) DEFAULT 'pending'::character varying,
    "notes" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "instructor_payroll_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_payroll_instructor ON public.instructor_payroll USING btree (instructor_id);
CREATE INDEX idx_payroll_period ON public.instructor_payroll USING btree (period_start_date, period_end_date);
CREATE INDEX idx_payroll_status ON public.instructor_payroll USING btree (status);

DROP TABLE IF EXISTS "public"."instructor_service_commissions";
-- Table Definition
CREATE TABLE "public"."instructor_service_commissions" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "instructor_id" uuid NOT NULL,
    "service_id" uuid NOT NULL,
    "commission_type" varchar(20) NOT NULL,
    "commission_value" numeric(10,2) NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "instructor_service_commissions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "instructor_service_commissions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE,
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX instructor_service_commissions_instructor_id_service_id_key ON public.instructor_service_commissions USING btree (instructor_id, service_id);
CREATE INDEX idx_instructor_service_commissions_instructor_id ON public.instructor_service_commissions USING btree (instructor_id);
CREATE INDEX idx_instructor_service_commissions_service_id ON public.instructor_service_commissions USING btree (service_id);

DROP TABLE IF EXISTS "public"."instructor_services";
-- Table Definition
CREATE TABLE "public"."instructor_services" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "instructor_id" uuid NOT NULL,
    "service_id" uuid NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "instructor_services_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "instructor_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE,
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX instructor_services_instructor_id_service_id_key ON public.instructor_services USING btree (instructor_id, service_id);
CREATE INDEX idx_instructor_services_instructor_id ON public.instructor_services USING btree (instructor_id);
CREATE INDEX idx_instructor_services_service_id ON public.instructor_services USING btree (service_id);

DROP TABLE IF EXISTS "public"."rental_equipment";
-- Table Definition
CREATE TABLE "public"."rental_equipment" (
    "rental_id" uuid NOT NULL,
    "equipment_id" uuid NOT NULL,
    "daily_rate" numeric(10,2) NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "rental_equipment_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE,
    CONSTRAINT "rental_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE,
    PRIMARY KEY ("rental_id","equipment_id")
);

DROP TABLE IF EXISTS "public"."rentals";
-- Table Definition
CREATE TABLE "public"."rentals" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid,
    "start_date" timestamptz NOT NULL,
    "end_date" timestamptz NOT NULL,
    "status" varchar(50) DEFAULT 'pending'::character varying,
    "total_price" numeric(10,2) DEFAULT 0,
    "payment_status" varchar(50) DEFAULT 'unpaid'::character varying,
    "notes" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "rentals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."roles";
-- Table Definition
CREATE TABLE "public"."roles" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(50) NOT NULL,
    "description" text,
    "permissions" jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

DROP TABLE IF EXISTS "public"."service_categories";
-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS service_categories_id_seq;

-- Table Definition
CREATE TABLE "public"."service_categories" (
    "id" int4 NOT NULL DEFAULT nextval('service_categories_id_seq'::regclass),
    "name" varchar(100) NOT NULL,
    "description" text,
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX service_categories_name_key ON public.service_categories USING btree (name);

DROP TABLE IF EXISTS "public"."service_packages";
-- Table Definition
CREATE TABLE "public"."service_packages" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "sessions_count" int4 NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."services";
-- Table Definition
CREATE TABLE "public"."services" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "description" text,
    "category" varchar(100) NOT NULL,
    "level" varchar(100),
    "service_type" varchar(50) NOT NULL,
    "duration" numeric(4,2) NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "max_participants" int4,
    "start_time" time,
    "end_time" time,
    "includes" text,
    "image_url" text,
    "package_id" uuid,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "services_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."service_packages"("id"),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."settings";
-- Table Definition
CREATE TABLE "public"."settings" (
    "key" varchar(100) NOT NULL,
    "value" jsonb NOT NULL,
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("key")
);

DROP TABLE IF EXISTS "public"."skill_levels";
-- Table Definition
CREATE TABLE "public"."skill_levels" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(50) NOT NULL,
    "description" text,
    "order_index" int4,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX skill_levels_name_key ON public.skill_levels USING btree (name);

DROP TABLE IF EXISTS "public"."skills";
-- Table Definition
CREATE TABLE "public"."skills" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(100) NOT NULL,
    "description" text,
    "skill_level_id" uuid,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "skills_skill_level_id_fkey" FOREIGN KEY ("skill_level_id") REFERENCES "public"."skill_levels"("id"),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."student_accounts";
-- Table Definition
CREATE TABLE "public"."student_accounts" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "balance" numeric(10,2) DEFAULT 0,
    "total_spent" numeric(10,2) DEFAULT 0,
    "last_payment_date" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "student_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE UNIQUE INDEX student_accounts_user_id_key ON public.student_accounts USING btree (user_id);

DROP TABLE IF EXISTS "public"."student_progress";
-- Table Definition
CREATE TABLE "public"."student_progress" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "student_id" uuid,
    "skill_id" uuid,
    "instructor_id" uuid,
    "date_achieved" date NOT NULL,
    "notes" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "student_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "student_progress_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id"),
    CONSTRAINT "student_progress_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."transactions";
-- Table Definition
CREATE TABLE "public"."transactions" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" uuid NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "type" varchar(50) NOT NULL,
    "description" text,
    "payment_method" varchar(50),
    "reference_number" varchar(100),
    "booking_id" uuid,
    "transaction_date" timestamptz DEFAULT now(),
    "currency" varchar(3) DEFAULT 'EUR'::character varying,
    "exchange_rate" numeric(10,4) DEFAULT 1.0,
    "entity_type" varchar(50),
    "status" varchar(50) DEFAULT 'completed'::character varying,
    "created_by" uuid,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);
CREATE INDEX idx_transactions_booking ON public.transactions USING btree (booking_id);
CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);

DROP TABLE IF EXISTS "public"."users";
-- Table Definition
CREATE TABLE "public"."users" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(100) NOT NULL,
    "email" varchar(255) NOT NULL,
    "password_hash" varchar(255) NOT NULL,
    "first_name" varchar(50),
    "last_name" varchar(50),
    "date_of_birth" date,
    "age" int2,
    "phone" varchar(50),
    "address" text,
    "city" varchar(100),
    "country" varchar(100),
    "postal_code" varchar(20),
    "preferred_currency" varchar(3) DEFAULT 'EUR'::character varying,
    "bio" text,
    "profile_image_url" varchar(255),
    "role_id" uuid,
    "level" varchar(50),
    "notes" text,
    "package_hours" int4 DEFAULT 0,
    "remaining_hours" numeric(10,2) DEFAULT 0,
    "weight" numeric(6,2),
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "last_login" timestamptz,
    CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id"),
    PRIMARY KEY ("id")
);


-- Indices
CREATE INDEX idx_users_role ON public.users USING btree (role_id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);

INSERT INTO "public"."accommodation_bookings" ("id", "unit_id", "guest_id", "check_in_date", "check_out_date", "guests_count", "total_price", "status", "notes", "created_by", "updated_by", "created_at", "updated_at") VALUES
('3c962472-6e7d-4e8b-ad5c-4cb792ea3eb7', '0a26826d-2560-4c88-a471-9477d33b2d55', 'd22f1ef5-2e84-4f16-b8f6-d461131c3f44', '2025-05-18', '2025-05-22', 2, 1000.00, 'confirmed', 'Special request for early check-in', NULL, NULL, '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00'),
('86f3daa2-b5bd-4033-8add-ea9fb3cd3e56', '858f93be-ef00-4ba5-b23b-04fc3c563346', '7838b055-151b-4be1-a625-3483d6d835ef', '2025-05-20', '2025-05-25', 1, 600.00, 'pending', 'First-time guest', NULL, NULL, '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00');
INSERT INTO "public"."accommodation_units" ("id", "name", "type", "status", "capacity", "price_per_night", "description", "amenities", "created_at", "updated_at") VALUES
('0482de75-92e1-4890-9992-4cfa1c38de30', 'Beachside Bungalow A', 'Bungalow', 'Available', 2, 120.00, 'Cozy bungalow with direct beach access', '{"ac": true, "tv": true, "wifi": true, "kitchen": false}', '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00'),
('0a26826d-2560-4c88-a471-9477d33b2d55', 'Ocean View Suite', 'Suite', 'Available', 4, 250.00, 'Luxurious suite with panoramic ocean views', '{"ac": true, "tv": true, "wifi": true, "balcony": true, "kitchen": true}', '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00'),
('bbde7db8-7fca-4677-955f-358252d668a1', 'Garden Cabin B', 'Cabin', 'Maintenance', 3, 90.00, 'Rustic cabin surrounded by tropical garden', '{"ac": false, "tv": false, "wifi": true, "kitchen": true}', '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00'),
('858f93be-ef00-4ba5-b23b-04fc3c563346', 'Beachside Bungalow B', 'Bungalow', 'Available', 2, 120.00, 'Cozy bungalow with direct beach access', '{"ac": true, "tv": true, "wifi": true, "kitchen": false}', '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00'),
('55f8dd92-b472-4a83-92da-87ab8b513f7f', 'Family Apartment', 'Apartment', 'Available', 5, 300.00, 'Spacious apartment perfect for families', '{"ac": true, "tv": true, "wifi": true, "washer": true, "kitchen": true}', '2025-05-22 19:13:14.087718+00', '2025-05-22 19:13:14.087718+00');














INSERT INTO "public"."roles" ("id", "name", "description", "permissions", "created_at", "updated_at") VALUES
('0a0e2e51-7bc5-404a-8f3f-9fd9e9567dd8', 'admin', 'System administrator with full access', NULL, '2025-05-21 18:30:06.642941+00', '2025-05-21 18:30:06.665566+00'),
('92db575a-a159-4a33-8dff-b88bb3cc9d0a', 'manager', 'School manager with access to all business operations', NULL, '2025-05-21 18:30:06.675788+00', '2025-05-21 18:30:06.689237+00'),
('494e7fcc-cfe5-4041-8b14-be16c27d3c88', 'instructor', 'Kitesurfing instructor', NULL, '2025-05-21 18:30:06.698838+00', '2025-05-21 18:30:06.712454+00'),
('2152544a-92e4-4c29-abae-f37444fd2362', 'student', 'Kitesurfing student', NULL, '2025-05-21 18:30:06.720803+00', '2025-05-21 18:30:06.731498+00'),
('bf0b8799-386b-46af-825f-34e25bc7efd0', 'freelancer', 'Freelance instructor', NULL, '2025-05-21 18:30:06.739832+00', '2025-05-21 18:30:06.749728+00');
INSERT INTO "public"."service_categories" ("id", "name", "description") VALUES
(1, 'kitesurfing', 'Kitesurfing lessons and packages'),
(2, 'windsurfing', 'Windsurfing lessons and activities'),
(3, 'sailing', 'Sailing lessons and activities'),
(4, 'paddleboarding', 'Paddleboarding sessions');
INSERT INTO "public"."service_packages" ("id", "name", "price", "sessions_count", "created_at", "updated_at") VALUES
('456deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', 'Beginner Kitesurfing Package', 400.00, 5, '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645'),
('789deb70-10a3-4b5c-8e0f-7d4bd8b4c1e1', 'Advanced Rider Package', 600.00, 4, '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645');
INSERT INTO "public"."services" ("id", "name", "description", "category", "level", "service_type", "duration", "price", "max_participants", "start_time", "end_time", "includes", "image_url", "package_id", "created_at", "updated_at") VALUES
('123deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', 'Basic Kitesurfing Lesson', 'Perfect for beginners to learn the basics of kitesurfing', 'kitesurfing', 'beginner', 'group', 2.00, 100.00, 6, NULL, NULL, NULL, NULL, NULL, '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645'),
('234deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', 'Private Kitesurfing Lesson', 'One-on-one instruction for faster progress', 'kitesurfing', 'all-levels', 'private', 1.50, 150.00, 1, NULL, NULL, NULL, NULL, NULL, '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645'),
('345deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', 'Advanced Kitesurfing Techniques', 'Learn jumps, tricks and advanced riding', 'kitesurfing', 'advanced', 'semi-private', 2.00, 120.00, 3, NULL, NULL, NULL, NULL, NULL, '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645'),
('456deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', 'Beginner Package Lesson', 'Part of the beginner package', 'kitesurfing', 'beginner', 'group', 2.00, 100.00, 6, NULL, NULL, NULL, NULL, '456deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645'),
('567deb70-10a3-4b5c-8e0f-7d4bd8b4c1e0', 'Advanced Package Session', 'Part of the advanced package', 'kitesurfing', 'advanced', 'semi-private', 2.00, 180.00, 3, NULL, NULL, NULL, NULL, '789deb70-10a3-4b5c-8e0f-7d4bd8b4c1e1', '2025-05-21 16:37:02.290645', '2025-05-21 16:37:02.290645');
INSERT INTO "public"."settings" ("key", "value", "description", "created_at", "updated_at") VALUES
('business_info', '{"city": "Sunny Beach", "name": "Plannivo", "email": "info@plannivo.com", "phone": "+34 123 456 789", "address": "Beach Road 123", "country": "Spain", "website": "https://plannivo.com"}', 'Business contact information', '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('tax_rates', '{"reduced": 10, "standard": 21}', 'Tax rates used for invoicing', '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('currencies', '{"default": "EUR", "supported": ["EUR", "USD", "GBP"]}', 'Supported currencies', '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('lesson_hours', '{"end": 18, "start": 8}', 'Operating hours for lessons', '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('business_hours', '{"end": 21, "start": 9, "slotInterval": 0.5, "standardHours": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"]}', 'Business hours configuration including standard time slots', '2025-05-26 15:20:39.694509+00', '2025-05-26 15:20:39.694509+00');
INSERT INTO "public"."skill_levels" ("id", "name", "description", "order_index", "created_at", "updated_at") VALUES
('9be45647-2e7b-4398-a6c7-458561b5789b', 'Beginner', 'New to kitesurfing', 1, '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('ea8a9b45-7030-4057-be23-ab175bf479e5', 'Intermediate', 'Can ride upwind and perform basic transitions', 2, '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('d55591e2-df76-4e92-b32a-3f43b36edae5', 'Advanced', 'Can perform jumps and basic tricks', 3, '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00'),
('c9fac8d4-4996-41ac-b520-21a6027e569c', 'Expert', 'Advanced tricks and riding in all conditions', 4, '2025-05-21 16:37:02.290645+00', '2025-05-21 16:37:02.290645+00');

INSERT INTO "public"."student_accounts" ("id", "user_id", "balance", "total_spent", "last_payment_date", "created_at", "updated_at") VALUES
('af77e176-bb16-42ff-893e-0aabcc3e683d', '8da7bb59-e5da-4e7f-b076-4d0a53983ce0', 0.00, 0.00, '2025-05-25 20:56:38.567706+00', '2025-05-25 20:56:38.567706+00', '2025-05-25 20:56:38.567706+00'),
('44764ec1-dcd6-4d34-9b2c-2fba42bbd218', '7091b225-0ed8-49ed-a810-cc534a5b2fc5', 190.00, 850.00, '2025-05-25 20:56:59.838254+00', '2025-05-25 20:42:30.385251+00', '2025-05-25 20:56:59.838254+00'),
('b3c4f043-39f4-4df4-ac95-e060c6518da3', '3f9c0f7c-aa5d-47c3-8182-c2b88fa03017', 0.00, 0.00, '2025-05-26 12:30:16.183386+00', '2025-05-26 12:30:16.183386+00', '2025-05-26 12:30:16.183386+00'),
('9881f87b-dfcb-48b7-84f4-51c9cfcdff02', '0208475e-4a8d-4918-a9cb-f1d5ff99d8db', 0.00, 0.00, '2025-05-26 12:41:19.006287+00', '2025-05-26 12:41:19.006287+00', '2025-05-26 12:41:19.006287+00'),
('404e145f-b424-46e9-a623-9f7c56cba242', '8d16595b-6d10-44a6-88aa-ce2923bab222', 0.00, 0.00, '2025-05-26 12:47:30.96648+00', '2025-05-26 12:47:30.96648+00', '2025-05-26 12:47:30.96648+00'),
('5b1f882b-b6ff-487a-b714-d33cf507e2a4', '0abe9149-3f01-4d9d-bc7b-00133e26070f', 0.00, 0.00, '2025-05-26 12:56:14.748014+00', '2025-05-26 12:56:14.748014+00', '2025-05-26 12:56:14.748014+00'),
('75faafed-cf05-484f-ad20-19b280a89340', '9e34f6ff-ede5-4e25-874d-79de3b2ecbdb', 0.00, 0.00, '2025-05-26 13:13:22.402187+00', '2025-05-26 13:13:22.402187+00', '2025-05-26 13:13:22.402187+00'),
('05377d2a-6b2c-4157-bf18-6ef9cd7205d0', '7b36f647-a7a5-4446-9334-bfc12b5ff8a9', 0.00, 0.00, '2025-05-26 14:00:17.735914+00', '2025-05-26 14:00:17.735914+00', '2025-05-26 14:00:17.735914+00');

INSERT INTO "public"."transactions" ("id", "user_id", "amount", "type", "description", "payment_method", "reference_number", "booking_id", "transaction_date", "currency", "exchange_rate", "entity_type", "status", "created_by", "created_at", "updated_at") VALUES
('3600b682-e9aa-42f7-ae21-6947d547b402', '7091b225-0ed8-49ed-a810-cc534a5b2fc5', 500.00, 'payment', 'credit', 'cash', '', NULL, '2025-05-25 20:45:14.582382+00', 'EUR', 1.0000, NULL, 'completed', '8a4b0fc3-03e9-446b-b7a5-dbf6a8ffd03c', '2025-05-25 20:45:14.582382+00', '2025-05-25 20:45:14.582382+00'),
('51e4cb32-28ae-4eb7-8be0-4eb4c36b2439', '7091b225-0ed8-49ed-a810-cc534a5b2fc5', 330.00, 'service_payment', 'Manual charge', NULL, NULL, NULL, '2025-05-25 20:45:32.064464+00', 'EUR', 1.0000, 'lesson', 'completed', '8a4b0fc3-03e9-446b-b7a5-dbf6a8ffd03c', '2025-05-25 20:45:32.064464+00', '2025-05-25 20:45:32.064464+00'),
('71d25b80-1281-4eab-ac48-0952563adddf', '7091b225-0ed8-49ed-a810-cc534a5b2fc5', -330.00, 'payment', 'Manual charge', NULL, NULL, NULL, '2025-05-25 20:56:29.724144+00', 'EUR', 1.0000, NULL, 'completed', '8a4b0fc3-03e9-446b-b7a5-dbf6a8ffd03c', '2025-05-25 20:56:29.724144+00', '2025-05-25 20:56:29.724144+00'),
('fccf6c69-6460-415e-aa5c-6852d12f71f4', '7091b225-0ed8-49ed-a810-cc534a5b2fc5', 350.00, 'payment', 'Manual charge', 'cash', '', NULL, '2025-05-25 20:56:59.838254+00', 'EUR', 1.0000, NULL, 'completed', '8a4b0fc3-03e9-446b-b7a5-dbf6a8ffd03c', '2025-05-25 20:56:59.838254+00', '2025-05-25 20:56:59.838254+00');
INSERT INTO "public"."users" ("id", "name", "email", "password_hash", "first_name", "last_name", "date_of_birth", "phone", "address", "city", "country", "postal_code", "preferred_currency", "bio", "profile_image_url", "role_id", "level", "notes", "package_hours", "remaining_hours", "created_at", "updated_at", "last_login") VALUES
('d22f1ef5-2e84-4f16-b8f6-d461131c3f44', 'Emma Johnson', 'emma.johnson@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Emma', 'Johnson', '1992-05-14', '+44 7700 900123', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/11.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Has some windsurfing experience, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('7838b055-151b-4be1-a625-3483d6d835ef', 'Liam Smith', 'liam.smith@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Liam', 'Smith', '1988-07-23', '+44 7700 900125', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/22.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Has completed basic course last year, looking to improve upwind riding.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('c9fb32ec-5510-46c6-9a99-282dcf6c87d3', 'Olivia Brown', 'olivia.brown@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Olivia', 'Brown', '1995-03-04', '+44 7700 900127', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/33.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Athletic background, quick learner, no water sports experience.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('efda083f-a8e4-4bcf-98b3-e0b65d2953be', 'Noah Taylor', 'noah.taylor@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Noah', 'Taylor', '1990-11-18', '+44 7700 900129', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/44.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Experienced kiter, looking to perfect jumps and tricks.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('8d16595b-6d10-44a6-88aa-ce2923bab222', 'Ava Wilson', 'ava.wilson@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Ava', 'Wilson', '1993-09-29', '+44 7700 900131', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/55.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Has own equipment, needs help with water starts.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('85307f0b-ed1b-4564-815c-2f8fd9111a0f', 'Ethan Martin', 'ethan.martin@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Ethan', 'Martin', '1986-01-07', '+44 7700 900133', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/66.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Surfer transitioning to kitesurfing, good water confidence.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('dec25096-9e43-4269-8387-b99abb549c27', 'Isabella Anderson', 'isabella.anderson@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Isabella', 'Anderson', '1997-08-12', '+44 7700 900135', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/77.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Started last summer, comfortable with basic riding, wants to improve.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('204dafc5-05c2-48be-aecd-c7942004e578', 'Lucas Thompson', 'lucas.thompson@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Lucas', 'Thompson', '1991-06-20', '+44 7700 900137', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/88.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Competes in regional events, working on complex tricks.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('87e6958d-01df-46e4-a397-5d69872605c1', 'Mia White', 'mia.white@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Mia', 'White', '1994-04-03', '+44 7700 900139', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/99.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'No previous water sports experience, cautious in water.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('3a8e81fe-bf9f-4927-9fb7-505bf7b043c4', 'Staff Manager', 'staff@kitesurfpro.com', '$2b$10$gH0lig8z7GVES29Ub/YtAuURQOrvTy4tnys2MAeSUB43Hsaqpny/q', 'Staff', 'Manager', NULL, '+1234567890', '123 Main St', 'Surf City', 'Spain', '12345', 'EUR', 'Staff member with management privileges', NULL, '92db575a-a159-4a33-8dff-b88bb3cc9d0a', 'Expert', NULL, 0, 0.00, '2025-05-21 18:30:06.82476+00', '2025-05-21 18:30:06.82476+00', NULL),
('113fffda-2b00-43c7-9f22-26c8f46df4cb', 'Mason Harris', 'mason.harris@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Mason', 'Harris', '1989-12-09', '+44 7700 900141', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/1.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Kited for 2 years, owns equipment, needs technique refinement.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('5100e7f8-0652-4b11-a6c4-da909e6c479d', 'Sophie Clark', 'sophie.clark@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Sophie', 'Clark', '1996-02-27', '+44 7700 900143', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/2.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Gymnastics background, good fitness level, first time kiting.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('768d5ba7-2581-4585-8d2e-5de11b9e70fa', 'Jacob Lewis', 'jacob.lewis@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Jacob', 'Lewis', '1987-10-15', '+44 7700 900145', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/3.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Kiting for 7 years, wants to improve wave riding skills.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('01ce76a4-1c7a-40be-b6fe-4126bbf83a89', 'Charlotte Lee', 'charlotte.lee@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Charlotte', 'Lee', '1995-07-22', '+44 7700 900147', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/4.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Comfortable with water starts, working on upwind riding.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('a7a94180-4086-4c2a-8eb8-28fc44ae68ab', 'Jack Walker', 'jack.walker@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Jack', 'Walker', '1993-05-01', '+44 7700 900149', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/5.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Snowboarder, first time trying kitesurfing, good balance.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('8da7bb59-e5da-4e7f-b076-4d0a53983ce0', 'Amelia Hall', 'amelia.hall@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Amelia', 'Hall', '1990-08-16', '+44 7700 900151', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/6.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Has taken lessons before, needs help with transitions.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('2132e522-2798-4c28-aca2-fc0b8c48742d', 'Daniel Allen', 'daniel.allen@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Daniel', 'Allen', '1988-03-19', '+44 7700 900153', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/7.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Experienced kiter, looking to try different equipment.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('10c0610b-d81e-4b9b-ac9b-487f7caa1861', 'Ella Young', 'ella.young@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Ella', 'Young', '1996-11-28', '+44 7700 900155', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/8.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Swimmer and surfer, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('cb7303ff-9ad9-49e1-a9bf-fd4cddf05e24', 'Matthew King', 'matthew.king@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Matthew', 'King', '1992-01-14', '+44 7700 900157', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/9.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Second season kiting, working on jumps.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('8a4b0fc3-03e9-446b-b7a5-dbf6a8ffd03c', 'Admin User', 'admin@kitesurfpro.com', '$2b$10$xB9CDxp.P/D.rKUYZYKrtOzssqYEzgCfrhufUnQSFCXNnbjqW1BeG', 'Admin', 'User', NULL, NULL, NULL, NULL, NULL, NULL, 'EUR', 'System administrator with full access to all features', NULL, '0a0e2e51-7bc5-404a-8f3f-9fd9e9567dd8', NULL, NULL, 0, 0.00, '2025-05-21 16:38:56.942267+00', '2025-05-21 22:18:49.73595+00', NULL),
('31ebdbeb-dc72-4fea-8bdb-5c7f21a85bea', 'Sofia Wright', 'sofia.wright@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Sofia', 'Wright', '1995-06-09', '+44 7700 900159', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/10.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'First time water sports, enthusiastic learner.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('46eb6f40-5c08-4861-a6e8-b62943216a7a', 'Leo Scott', 'leo.scott@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Leo', 'Scott', '1987-09-25', '+44 7700 900161', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/11.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Kitesurfing for 6 years, interested in foiling.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('4d40359b-e964-4015-b278-08026cf8294b', 'Grace Green', 'grace.green@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Grace', 'Green', '1994-12-07', '+44 7700 900163', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/12.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Third season, comfortable with basic jumps.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('54be94ef-24d2-4eea-8c5f-5cc761f979d3', 'Ryan Adams', 'ryan.adams@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Ryan', 'Adams', '1991-04-18', '+44 7700 900165', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/13.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Wakeboarding background, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('b3a25d19-3c65-475f-903f-d39b284c649e', 'Chloe Baker', 'chloe.baker@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Chloe', 'Baker', '1993-02-23', '+44 7700 900167', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/14.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Has own equipment, needs help with advanced transitions.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('2741526f-2f9e-4a0a-9ec0-622f0f33a35b', 'Logan Gonzalez', 'logan.gonzalez@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Logan', 'Gonzalez', '1989-07-31', '+44 7700 900169', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/15.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Experienced kiter, competes internationally.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('dd7e9840-0447-4030-b9f3-c5c62d650fb1', 'Lily Nelson', 'lily.nelson@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Lily', 'Nelson', '1996-05-12', '+44 7700 900171', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/16.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'No water sports experience, eager to learn.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('7091b225-0ed8-49ed-a810-cc534a5b2fc5', 'Aiden Carter', 'aiden.carter@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Aiden', 'Carter', '1988-08-05', '+44 7700 900173', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/17.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Started last year, looking to improve technique.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('1b95084f-f165-4027-b954-bc06771ecce5', 'Zoe Mitchell', 'zoe.mitchell@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Zoe', 'Mitchell', '1992-11-19', '+44 7700 900175', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/18.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Swimming and tennis background, first time kiting.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('dc9885f2-bb8d-4260-bc08-d2309cea804e', 'Nathan Perez', 'nathan.perez@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Nathan', 'Perez', '1990-03-27', '+44 7700 900177', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/19.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Kiting for 8 years, focusing on freestyle tricks.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('3d03bbe7-5d36-4361-9834-5674c43b0986', 'Stella Roberts', 'stella.roberts@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Stella', 'Roberts', '1994-06-14', '+44 7700 900179', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/20.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Second season, comfortable with basic riding and jumps.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('367d82c9-e0fd-45fa-83df-010b632cc821', 'Owen Turner', 'owen.turner@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Owen', 'Turner', '1989-09-08', '+44 7700 900181', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/21.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Sailing background, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('3f9c0f7c-aa5d-47c3-8182-c2b88fa03017', 'Aria Phillips', 'aria.phillips@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Aria', 'Phillips', '1995-12-02', '+44 7700 900183', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/22.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Started 2 years ago, working on jumps.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('0208475e-4a8d-4918-a9cb-f1d5ff99d8db', 'Elijah Campbell', 'elijah.campbell@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Elijah', 'Campbell', '1986-04-21', '+44 7700 900185', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/23.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Teaches kitesurfing occasionally, focusing on wave riding.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('17ae881f-05d1-4b7d-952a-fe9ea0702b6f', 'Scarlett Parker', 'scarlett.parker@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Scarlett', 'Parker', '1993-07-16', '+44 7700 900187', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/24.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Yoga instructor, good flexibility, first time kiting.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('e7c3a6c3-4c93-4827-89e7-67ae0a443176', 'Gabriel Evans', 'gabriel.evans@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Gabriel', 'Evans', '1991-10-29', '+44 7700 900189', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/25.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Has kited for 3 seasons, working on riding in waves.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('91de34cb-32b9-4c57-a7dc-0de8d464051e', 'Aurora Edwards', 'aurora.edwards@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Aurora', 'Edwards', '1994-01-25', '+44 7700 900191', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/26.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Photographer, wants to capture kitesurfing images eventually.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('104840c6-672b-474c-b6d9-388898ed8bb1', 'Henry Collins', 'henry.collins@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Henry', 'Collins', '1987-05-13', '+44 7700 900193', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/27.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Kiting for 6 years, working on complex jumps.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('4e44c4d8-f289-463e-b9e2-eb6b49364207', 'Hazel Stewart', 'hazel.stewart@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Hazel', 'Stewart', '1996-08-07', '+44 7700 900195', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/28.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Third season, comfortable with most conditions.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('237dfbab-38d7-453d-83cf-85dc26c68485', 'Sebastian Sanchez', 'sebastian.sanchez@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Sebastian', 'Sanchez', '1992-03-31', '+44 7700 900197', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/29.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Rock climber, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('0abe9149-3f01-4d9d-bc7b-00133e26070f', 'Luna Morris', 'luna.morris@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Luna', 'Morris', '1990-06-25', '+44 7700 900199', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/30.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Second season, working on jumping technique.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('9d2f719b-60d6-4bc4-8105-cf85df3d88f8', 'Jayden Rogers', 'jayden.rogers@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Jayden', 'Rogers', '1988-11-10', '+44 7700 900201', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/31.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Former windsurfing champion, transition to kitesurfing 4 years ago.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('d8087f46-ffe3-4c0c-be1b-d818e56a8ce9', 'Violet Reed', 'violet.reed@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Violet', 'Reed', '1995-02-04', '+44 7700 900203', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/32.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Dancer, good balance, first time water sports.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('b38c4cec-9dd5-46b7-8988-048de3e6cc79', 'Max Cook', 'max.cook@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Max', 'Cook', '1993-05-19', '+44 7700 900205', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/33.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Started last year, progressing quickly.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('ff008f71-fafd-474a-a6d4-3d5db2dbb00e', 'Audrey Morgan', 'audrey.morgan@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Audrey', 'Morgan', '1990-08-14', '+44 7700 900207', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/34.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Paddle boarder, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('31c16580-9172-4796-9b15-6006b21f9392', 'David Bell', 'david.bell@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'David', 'Bell', '1986-12-28', '+44 7700 900209', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/35.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'advanced', 'Kitesurfing for 10 years, expert in all conditions.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('9e325d45-95fd-4c82-9d04-ab5f0c06c124', 'Claire Murphy', 'claire.murphy@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Claire', 'Murphy', '1994-03-23', '+44 7700 900211', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/36.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Third season, owns equipment, working on advanced techniques.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('9e34f6ff-ede5-4e25-874d-79de3b2ecbdb', 'Isaac Bailey', 'isaac.bailey@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Isaac', 'Bailey', '1989-06-08', '+44 7700 900213', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/men/37.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'beginner', 'Mountain biker, first time kitesurfing.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('7b36f647-a7a5-4446-9334-bfc12b5ff8a9', 'Anna Rivera', 'anna.rivera@example.com', '$2b$10$.J5d8Y/3lKytGWedoAxf4emm/ZiNCIYIJWFD4GeDZ5YIr..P/gFce', 'Anna', 'Rivera', '1992-09-17', '+44 7700 900215', NULL, NULL, NULL, NULL, 'EUR', NULL, 'https://randomuser.me/api/portraits/women/38.jpg', '2152544a-92e4-4c29-abae-f37444fd2362', 'intermediate', 'Second season, progressing to jumps.', 0, 0.00, '2025-05-22 17:39:44.047712+00', '2025-05-22 17:39:44.047712+00', NULL),
('c023e4b5-983d-4e40-b64b-a930d900db03', 'Oguzhan Bentürk', 'admin1@kitesurfpro.com', '$2b$10$lPN.kgutIve.k6S0arRwcOMaizYpD8QYMmJIdigps0Dbt4nvkD7BC', 'Oguzhan', 'Bentürk', '2025-05-23', '05305156489', 'sahilevleri mah palmiye sok no 16', 'izmir', 'Türkiye', '35335', 'EUR', NULL, NULL, '494e7fcc-cfe5-4041-8b14-be16c27d3c88', 'Beginner', NULL, 0, 0.00, '2025-05-22 22:45:31.743185+00', '2025-05-22 22:45:31.743185+00', NULL),
('1cfe1e5c-1d77-4170-9fd0-aca8f8948820', 'zeliha yilmaz', 'zeliha@kitesurfpro.com', '$2b$10$rrCfpDCPPjxwGoYo4Si4Ae.na6pVLLY25ZCTxXrB7SXRAlK1od34G', 'zeliha', 'yilmaz', '2025-05-23', '55555555555', 'kuşcular izmir urla', 'izmir', 'Türkiye', '355555', 'EUR', NULL, NULL, '494e7fcc-cfe5-4041-8b14-be16c27d3c88', 'Expert', NULL, 0, 0.00, '2025-05-23 08:59:07.779154+00', '2025-05-23 08:59:07.779154+00', NULL),
('373002b5-8898-4df3-bd9a-682663b8be50', 'Ufuk Gurbuz', 'ufuk@kitesurfpro.com', '$2b$10$wxwTka2IC1yOVztlCVGeMu6qqnt55923BSwUeVivlLB83wcvMkhUu', 'Ufuk', 'Gurbuz', NULL, '555555555555', NULL, NULL, NULL, NULL, 'USD', NULL, NULL, '494e7fcc-cfe5-4041-8b14-be16c27d3c88', NULL, NULL, 0, 0.00, '2025-05-23 10:54:33.98205+00', '2025-05-23 10:54:33.98205+00', NULL),
('f1ee6bcf-5bee-41c7-b343-88ff0cefef66', 'Siyabend Şanlı', 'siyabend@kitesurfpro.com', '$2b$10$mMKZXsgwuLzJDgjRJX5Ht.yPjNrSbDfAgLzKyx5BwV9ZgGLbJjSxO', 'Siyabend', 'Şanlı', '2025-05-23', '55555555555', 'sahilevleri mah palmiye sok no 16', 'izmir', 'Türkiye', '35335', 'EUR', NULL, NULL, '494e7fcc-cfe5-4041-8b14-be16c27d3c88', 'Beginner', NULL, 0, 0.00, '2025-05-23 11:28:24.968818+00', '2025-05-23 11:28:24.968818+00', NULL),
('89726846-d18a-4233-baee-1966e467e40b', 'Baris temiz', 'baristemiz@kitesurfpro.com', '$2b$10$lmDF8ZsDGDwU2ykqs9I4eeSc4PzwxtDGUMjlyXpvGLCF6OVWMRo76', 'Baris', 'temiz', '2025-05-23', '5555555555555555', 'Gülbahçe Mah. Karapınar Cad. no 45 daire 4', 'Urla', 'Türkiye', '35050', 'EUR', NULL, NULL, '494e7fcc-cfe5-4041-8b14-be16c27d3c88', 'Expert', NULL, 0, 0.00, '2025-05-23 11:28:52.70055+00', '2025-05-23 11:28:52.70055+00', NULL),
('393ae80d-bb5d-4695-8ebb-4f67e8b7010c', 'Oguzhan Bentürk', 'admin123745@kitesurfpro.com', '$2b$10$Nc05H0QbOPVgyRMHSZIZEuleI80FptEFFDY76C9PQiwCOjF0Dv5FK', 'Oguzhan', 'Bentürk', '2025-06-03', '05305156489', 'sahilevleri mah palmiye sok no 16', 'izmir', 'Spain', '35335', 'EUR', NULL, NULL, '2152544a-92e4-4c29-abae-f37444fd2362', 'Beginner', NULL, 0, 0.00, '2025-06-03 20:19:13.670435+00', '2025-06-03 20:19:13.670435+00', NULL),
('bbd3c1fb-873e-4848-9cb6-c582105d639a', 'Pİerre Aygun', 'pierre.yenicirak@outlook.com', '$2b$10$tOX5saPhTFwUVtgaUYSz8Oiy9RIC72u3rJWBuFYFNw2Kyo8EDCr6u', 'Pİerre', 'Aygun', '2025-06-04', '5555555555555', 'dfsdfsdfsd', 'fsdfsdf', 'sdfsdfsdf', '35050', 'EUR', NULL, NULL, '494e7fcc-cfe5-4041-8b14-be16c27d3c88', 'Beginner', NULL, 0, 0.00, '2025-06-03 21:06:43.390435+00', '2025-06-03 21:06:43.390435+00', NULL);
