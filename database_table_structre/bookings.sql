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
    "payment_status" varchar(50) NOT NULL DEFAULT 'unpaid'::character varying,
    "amount" numeric(10,2) NOT NULL DEFAULT 0.00,
    "discount_percent" numeric(5,2) NOT NULL DEFAULT 0.00,
    "discount_amount" numeric(10,2) NOT NULL DEFAULT 0.00,
    "final_amount" numeric(10,2) NOT NULL DEFAULT 0.00,
    "location" varchar(100) NOT NULL DEFAULT 'TBD'::character varying,
    "weather_conditions" text NOT NULL DEFAULT 'Good'::text,
    "notes" text NOT NULL DEFAULT ''::text,
    "feedback_rating" int4,
    "feedback_comments" text NOT NULL DEFAULT ''::text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "canceled_at" timestamptz,
    "cancellation_reason" text,
    "service_id" uuid,
    "custom_price" numeric(10,2) DEFAULT NULL::numeric,
    "checkin_status" varchar(20) NOT NULL DEFAULT 'pending'::character varying,
    "checkout_status" varchar(20) NOT NULL DEFAULT 'pending'::character varying,
    "checkin_time" timestamptz,
    "checkout_time" timestamptz,
    "checkin_notes" text NOT NULL DEFAULT ''::text,
    "checkout_notes" text NOT NULL DEFAULT ''::text,
    "customer_user_id" uuid,
    "weather_suitable" bool DEFAULT true,
    "currency" varchar(3) DEFAULT 'EUR'::character varying,
    "deleted_at" timestamp,
    "deleted_by" uuid,
    "deletion_reason" text,
    "deletion_metadata" jsonb,
    "customer_package_id" uuid,
    "group_size" int4 DEFAULT 1,
    "max_participants" int4 DEFAULT 10,
    CONSTRAINT "bookings_customer_package_id_fkey" FOREIGN KEY ("customer_package_id") REFERENCES "public"."customer_packages"("id"),
    CONSTRAINT "bookings_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id"),
    CONSTRAINT "bookings_instructor_user_id_fkey" FOREIGN KEY ("instructor_user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id"),
    CONSTRAINT "bookings_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id"),
    CONSTRAINT "fk_bookings_currency" FOREIGN KEY ("currency") REFERENCES "public"."currency_settings"("currency_code"),
    CONSTRAINT "fk_bookings_customer" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id"),
    PRIMARY KEY ("id")
);

-- Column Comments
COMMENT ON COLUMN "public"."bookings"."payment_status" IS 'Payment status: unpaid, paid, refunded, partial';
COMMENT ON COLUMN "public"."bookings"."final_amount" IS 'Final amount after discounts or custom pricing';
COMMENT ON COLUMN "public"."bookings"."location" IS 'Booking location, default TBD if not specified';
COMMENT ON COLUMN "public"."bookings"."weather_conditions" IS 'Weather conditions for the session, default Good';
COMMENT ON COLUMN "public"."bookings"."feedback_comments" IS 'Customer feedback comments, empty string if none';
COMMENT ON COLUMN "public"."bookings"."custom_price" IS 'Override price for special deals or packages';
COMMENT ON COLUMN "public"."bookings"."checkin_status" IS 'Check-in status: pending, checked-in, no-show';
COMMENT ON COLUMN "public"."bookings"."checkout_status" IS 'Check-out status: pending, checked-out, early-checkout';
COMMENT ON COLUMN "public"."bookings"."checkin_notes" IS 'Notes from check-in process, empty string if none';
COMMENT ON COLUMN "public"."bookings"."checkout_notes" IS 'Notes from check-out process, empty string if none';
COMMENT ON COLUMN "public"."bookings"."customer_user_id" IS 'References the customer (same as student_user_id for booking context)';
COMMENT ON COLUMN "public"."bookings"."customer_package_id" IS 'References the customer package used for this booking, null for non-package bookings';
COMMENT ON COLUMN "public"."bookings"."group_size" IS 'Number of participants in this booking';
COMMENT ON COLUMN "public"."bookings"."max_participants" IS 'Maximum allowed participants for this booking type';


-- Indices
CREATE INDEX idx_bookings_amount_date ON public.bookings USING btree (final_amount, date) WHERE (final_amount > (0)::numeric);
CREATE INDEX idx_bookings_availability_check ON public.bookings USING btree (instructor_user_id, date, start_hour, duration, status) WHERE ((status)::text <> 'cancelled'::text);
CREATE INDEX idx_bookings_calendar_perf ON public.bookings USING btree (date, start_hour, instructor_user_id, status) WHERE ((status)::text = ANY (ARRAY[('confirmed'::character varying)::text, ('pending'::character varying)::text]));
CREATE INDEX idx_bookings_checkin_status ON public.bookings USING btree (checkin_status);
CREATE INDEX idx_bookings_checkin_time ON public.bookings USING btree (checkin_time);
CREATE INDEX idx_bookings_checkout_status ON public.bookings USING btree (checkout_status);
CREATE INDEX idx_bookings_checkout_time ON public.bookings USING btree (checkout_time);
CREATE INDEX idx_bookings_complete_status ON public.bookings USING btree (date, status, checkin_status, checkout_status);
CREATE INDEX idx_bookings_currency ON public.bookings USING btree (currency);
CREATE INDEX idx_bookings_custom_price ON public.bookings USING btree (custom_price) WHERE (custom_price IS NOT NULL);
CREATE INDEX idx_bookings_customer_package_id ON public.bookings USING btree (customer_package_id);
CREATE INDEX idx_bookings_date ON public.bookings USING btree (date);
CREATE INDEX idx_bookings_deleted_at ON public.bookings USING btree (deleted_at);
CREATE INDEX idx_bookings_instructor ON public.bookings USING btree (instructor_user_id);
CREATE INDEX idx_bookings_instructor_date ON public.bookings USING btree (instructor_user_id, date);
CREATE INDEX idx_bookings_instructor_fk ON public.bookings USING btree (instructor_user_id);
CREATE INDEX idx_bookings_instructor_schedule ON public.bookings USING btree (instructor_user_id, date, start_hour);
CREATE UNIQUE INDEX idx_bookings_no_overlap ON public.bookings USING btree (instructor_user_id, date, start_hour, duration) WHERE (((status)::text <> 'cancelled'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_bookings_service ON public.bookings USING btree (service_id, date);
CREATE INDEX idx_bookings_service_fk ON public.bookings USING btree (service_id);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_status_date ON public.bookings USING btree (status, date);
CREATE INDEX idx_bookings_status_deleted ON public.bookings USING btree (status, deleted_at);
CREATE INDEX idx_bookings_student ON public.bookings USING btree (student_user_id);
CREATE INDEX idx_bookings_student_date ON public.bookings USING btree (student_user_id, date);
CREATE INDEX idx_bookings_student_fk ON public.bookings USING btree (student_user_id);

INSERT INTO "public"."bookings" ("id", "date", "start_hour", "duration", "student_user_id", "instructor_user_id", "status", "payment_status", "amount", "discount_percent", "discount_amount", "final_amount", "location", "weather_conditions", "notes", "feedback_rating", "feedback_comments", "created_at", "updated_at", "canceled_at", "cancellation_reason", "service_id", "custom_price", "checkin_status", "checkout_status", "checkin_time", "checkout_time", "checkin_notes", "checkout_notes", "customer_user_id", "weather_suitable", "currency", "deleted_at", "deleted_by", "deletion_reason", "deletion_metadata", "customer_package_id", "group_size", "max_participants") VALUES
('30f992c1-6fd2-4fb6-8b01-a428a4fb5679', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 18:30:50.075642+00', '2025-08-19 18:45:56.90597+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 18:31:02.079+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 18:45:56.90597', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10);
INSERT INTO "public"."bookings" ("id", "date", "start_hour", "duration", "student_user_id", "instructor_user_id", "status", "payment_status", "amount", "discount_percent", "discount_amount", "final_amount", "location", "weather_conditions", "notes", "feedback_rating", "feedback_comments", "created_at", "updated_at", "canceled_at", "cancellation_reason", "service_id", "custom_price", "checkin_status", "checkout_status", "checkin_time", "checkout_time", "checkin_notes", "checkout_notes", "customer_user_id", "weather_suitable", "currency", "deleted_at", "deleted_by", "deletion_reason", "deletion_metadata", "customer_package_id", "group_size", "max_participants") VALUES
('87569d98-fff9-4ba6-9044-31575db9322e', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 18:46:13.496344+00', '2025-08-19 19:04:50.332811+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 18:46:22.683+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:04:50.332811', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10);
INSERT INTO "public"."bookings" ("id", "date", "start_hour", "duration", "student_user_id", "instructor_user_id", "status", "payment_status", "amount", "discount_percent", "discount_amount", "final_amount", "location", "weather_conditions", "notes", "feedback_rating", "feedback_comments", "created_at", "updated_at", "canceled_at", "cancellation_reason", "service_id", "custom_price", "checkin_status", "checkout_status", "checkin_time", "checkout_time", "checkin_notes", "checkout_notes", "customer_user_id", "weather_suitable", "currency", "deleted_at", "deleted_by", "deletion_reason", "deletion_metadata", "customer_package_id", "group_size", "max_participants") VALUES
('2a8508b7-d7bf-452d-a00e-66b2aa01fff2', '2025-08-19', 11.50, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'paid', 160.00, 0.00, 0.00, 160.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 18:36:53.424034+00', '2025-08-19 19:04:55.365628+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 18:45:54.373+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:04:55.365628', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, NULL, 1, 10);
INSERT INTO "public"."bookings" ("id", "date", "start_hour", "duration", "student_user_id", "instructor_user_id", "status", "payment_status", "amount", "discount_percent", "discount_amount", "final_amount", "location", "weather_conditions", "notes", "feedback_rating", "feedback_comments", "created_at", "updated_at", "canceled_at", "cancellation_reason", "service_id", "custom_price", "checkin_status", "checkout_status", "checkin_time", "checkout_time", "checkin_notes", "checkout_notes", "customer_user_id", "weather_suitable", "currency", "deleted_at", "deleted_by", "deletion_reason", "deletion_metadata", "customer_package_id", "group_size", "max_participants") VALUES
('2c313ac0-1c4f-4305-8404-59820e41cc01', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:28:38.220324+00', '2025-08-19 19:30:29.644986+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:28:49.515+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:30:29.644986', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('5da2f0f8-65e6-445d-98aa-a48ab39ecce1', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:05:11.391756+00', '2025-08-19 19:06:03.238765+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:05:19.115+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:06:03.238765', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('dd93d530-819d-4568-9d8a-37dc111f4c4e', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:06:21.060282+00', '2025-08-19 19:11:05.83112+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:06:28.35+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:11:05.83112', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('bc2b3a65-5d56-4ca7-a8e6-bf97c592a14e', '2025-08-19', 11.50, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:47:01.249446+00', '2025-08-19 19:49:22.608261+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:47:09.707+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:49:22.608261', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('974c50dd-644b-4fbf-8539-407551e3d91b', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:11:19.436119+00', '2025-08-19 19:17:39.696781+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:11:27.822+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:17:39.696781', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('6435ce77-96fc-4043-99a9-d65406c2dcc5', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'confirmed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:18:02.558545+00', '2025-08-19 19:21:18.513481+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'pending', NULL, NULL, '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:21:18.513481', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('de577c60-cd7e-4340-95f1-b33aa39a649c', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:22:41.036692+00', '2025-08-19 19:27:58.728278+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:23:41.161+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:27:58.728278', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('7278a7fc-11dd-487d-b32d-a3a40602ed7f', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:30:45.751903+00', '2025-08-19 19:33:56.817324+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:30:55.354+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:33:56.817324', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('9d93dc34-b87c-4f0f-afd8-c03c0c83b5ec', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:42:50.215519+00', '2025-08-19 19:52:33.771432+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:42:59.7+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', NULL, NULL, NULL, NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('72c31873-6a23-4f6f-8bc4-43b949f06f4d', '2025-08-19', 9.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:34:11.717275+00', '2025-08-19 19:42:30.27787+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-19 19:34:20.233+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:42:30.27787', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('ebfac1b3-62f0-4517-92f7-0adb9a972dbe', '2025-08-19', 14.00, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'confirmed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:45:49.711592+00', '2025-08-19 19:46:39.70913+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'pending', NULL, NULL, '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:46:39.70913', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('0653ee24-e8ff-4606-b7a1-0ac33f6a41bc', '2025-08-19', 11.50, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', 'fabe4f08-029e-4836-8d5d-bbe0d8806bc3', 'confirmed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-19 19:45:21.392888+00', '2025-08-19 19:46:44.792251+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'pending', NULL, NULL, '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', '2025-08-19 19:46:44.792251', '35f65221-3789-4536-b4b5-19e2adb49e9e', 'Administrative deletion', NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10),
('953d1c18-1b8a-4300-a828-0f63cdd6b30f', '2025-08-21', 9.50, 2.00, '00ce21b8-d345-43ac-9ae8-215e0755e15b', '4f3229ae-0fe0-4fe7-b2ea-778a4d606417', 'completed', 'package', 0.00, 0.00, 0.00, 0.00, 'TBD', 'Good', '', NULL, '', '2025-08-20 22:09:11.601138+00', '2025-08-20 22:10:08.720798+00', NULL, NULL, '65118e12-237d-4562-a909-cb291f2b61f8', NULL, 'pending', 'checked-out', NULL, '2025-08-20 22:10:08.978+00', '', '', '00ce21b8-d345-43ac-9ae8-215e0755e15b', 't', 'EUR', NULL, NULL, NULL, NULL, '4dc982df-d4a2-44d1-aa9a-5c8f6b9021a6', 1, 10);