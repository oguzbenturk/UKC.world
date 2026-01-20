--
-- PostgreSQL database cluster dump
--

-- Started on 2025-10-10 08:46:45

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE plannivo;
ALTER ROLE plannivo WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:2Dz6R9sQBNjX0oD6jiua5w==$5ZA2Py0ltgcooWBGcDypHXTgnb0qcQuHx6L66CBdkgY=:hYDrCqfUutzrJfpmmK5SI+sqMxFM7mRhR5lzf4BazRc=';

--
-- User Configurations
--








--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.14
-- Dumped by pg_dump version 17.5

-- Started on 2025-10-10 08:46:46

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Completed on 2025-10-10 08:47:00

--
-- PostgreSQL database dump complete
--

--
-- Database "plannivo" dump
--

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.14
-- Dumped by pg_dump version 17.5

-- Started on 2025-10-10 08:47:00

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4647 (class 1262 OID 16384)
-- Name: plannivo; Type: DATABASE; Schema: -; Owner: plannivo
--

CREATE DATABASE plannivo WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE plannivo OWNER TO plannivo;

\connect plannivo

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 26020)
-- Name: public; Type: SCHEMA; Schema: -; Owner: plannivo
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO plannivo;

--
-- TOC entry 4648 (class 0 OID 0)
-- Dependencies: 7
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: plannivo
--

COMMENT ON SCHEMA public IS '';


--
-- TOC entry 2 (class 3079 OID 26022)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 4650 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 3 (class 3079 OID 26059)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 4651 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 361 (class 1255 OID 26070)
-- Name: calculate_final_amount(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.calculate_final_amount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
              -- For package payments, set amounts to zero
              IF NEW.payment_status = 'package' THEN
                NEW.amount = 0;
                NEW.final_amount = 0;
              -- If custom_price is set, use it for both amount and final_amount
              ELSIF NEW.custom_price IS NOT NULL THEN
                NEW.amount = NEW.custom_price;
                NEW.final_amount = NEW.custom_price;
              ELSE
                -- Calculate amount based on duration and instructor's hourly rate
                IF NEW.instructor_user_id IS NOT NULL AND NEW.duration IS NOT NULL THEN       
                  -- Get instructor's hourly rate
                  SELECT COALESCE(hourly_rate, 80) INTO NEW.amount
                  FROM users
                  WHERE id = NEW.instructor_user_id;
                  -- Multiply by duration to get total amount
                  NEW.amount = NEW.amount * NEW.duration;
                END IF;
                -- Calculate final amount from amount minus discounts
                NEW.final_amount = COALESCE(NEW.amount, 0) - COALESCE(NEW.discount_amount, 0);
              END IF;
              RETURN NEW;
            END;
            $$;


ALTER FUNCTION public.calculate_final_amount() OWNER TO plannivo;

--
-- TOC entry 362 (class 1255 OID 26071)
-- Name: check_booking_conflict(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.check_booking_conflict() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          -- Skip check for cancelled bookings
          IF NEW.status = 'cancelled' THEN
              RETURN NEW;
          END IF;
          
          -- Check for overlapping bookings (FIXED: now excludes soft-deleted bookings)
          IF EXISTS (
              SELECT 1 FROM bookings
              WHERE instructor_user_id = NEW.instructor_user_id
              AND date = NEW.date
              AND status != 'cancelled'
              AND deleted_at IS NULL  -- ADDED: Exclude soft-deleted bookings
              AND id != COALESCE(NEW.id, NULL::uuid)
              AND (
                  (start_hour < NEW.start_hour + NEW.duration AND start_hour + duration > NEW.start_hour)
              )
          ) THEN
              RAISE EXCEPTION 'Booking conflict: Instructor already has a booking during this time slot';
          END IF;
          
          RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.check_booking_conflict() OWNER TO plannivo;

--
-- TOC entry 371 (class 1255 OID 35993)
-- Name: notify_notification_event(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.notify_notification_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      payload JSON;
      target RECORD;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        target := NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        -- Skip updates that do not change anything meaningful
        IF ROW(NEW.*) IS NOT DISTINCT FROM ROW(OLD.*) THEN
          RETURN NEW;
        END IF;
        target := NEW;
      ELSE
        RETURN NEW;
      END IF;

      payload := json_build_object(
        'operation', TG_OP,
        'notification', row_to_json(target)
      );

      PERFORM pg_notify('notification_events', payload::text);
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.notify_notification_event() OWNER TO plannivo;

--
-- TOC entry 369 (class 1255 OID 27685)
-- Name: set_spare_parts_orders_updated_at(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.set_spare_parts_orders_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_spare_parts_orders_updated_at() OWNER TO plannivo;

--
-- TOC entry 372 (class 1255 OID 36013)
-- Name: set_user_consents_updated_at(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.set_user_consents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.set_user_consents_updated_at() OWNER TO plannivo;

--
-- TOC entry 370 (class 1255 OID 27689)
-- Name: sync_popup_config(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.sync_popup_config() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.sync_popup_config() OWNER TO plannivo;

--
-- TOC entry 363 (class 1255 OID 26072)
-- Name: update_booking_series_updated_at(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.update_booking_series_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_booking_series_updated_at() OWNER TO plannivo;

--
-- TOC entry 364 (class 1255 OID 26073)
-- Name: update_booking_timestamp(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.update_booking_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_booking_timestamp() OWNER TO plannivo;

--
-- TOC entry 365 (class 1255 OID 26074)
-- Name: update_customer_packages_updated_at(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.update_customer_packages_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_customer_packages_updated_at() OWNER TO plannivo;

--
-- TOC entry 366 (class 1255 OID 26075)
-- Name: update_products_updated_at(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.update_products_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_products_updated_at() OWNER TO plannivo;

--
-- TOC entry 367 (class 1255 OID 26076)
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp() OWNER TO plannivo;

--
-- TOC entry 368 (class 1255 OID 27527)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: plannivo
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO plannivo;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 216 (class 1259 OID 26077)
-- Name: accommodation_bookings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.accommodation_bookings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    unit_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    check_in_date date NOT NULL,
    check_out_date date NOT NULL,
    guests_count integer DEFAULT 1 NOT NULL,
    total_price numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'confirmed'::character varying NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_dates CHECK ((check_out_date > check_in_date))
);


ALTER TABLE public.accommodation_bookings OWNER TO plannivo;

--
-- TOC entry 217 (class 1259 OID 26088)
-- Name: accommodation_units; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.accommodation_units (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'Available'::character varying NOT NULL,
    capacity integer NOT NULL,
    price_per_night numeric(10,2) NOT NULL,
    description text,
    amenities jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.accommodation_units OWNER TO plannivo;

--
-- TOC entry 296 (class 1259 OID 27641)
-- Name: api_keys; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.api_keys (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    key_hash character varying(255) NOT NULL,
    user_id uuid,
    permissions jsonb DEFAULT '{}'::jsonb,
    last_used_at timestamp without time zone,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.api_keys OWNER TO plannivo;

--
-- TOC entry 4652 (class 0 OID 0)
-- Dependencies: 296
-- Name: TABLE api_keys; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.api_keys IS 'API keys for service-to-service authentication';


--
-- TOC entry 295 (class 1259 OID 27640)
-- Name: api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.api_keys_id_seq OWNER TO plannivo;

--
-- TOC entry 4653 (class 0 OID 0)
-- Dependencies: 295
-- Name: api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.api_keys_id_seq OWNED BY public.api_keys.id;


--
-- TOC entry 218 (class 1259 OID 26097)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    action character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address character varying(50),
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.audit_logs OWNER TO plannivo;

--
-- TOC entry 219 (class 1259 OID 26104)
-- Name: booking_custom_commissions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.booking_custom_commissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    booking_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    service_id uuid NOT NULL,
    commission_type character varying(20) NOT NULL,
    commission_value numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT booking_custom_commissions_commission_type_check CHECK (((commission_type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('fixed'::character varying)::text])))
);


ALTER TABLE public.booking_custom_commissions OWNER TO plannivo;

--
-- TOC entry 220 (class 1259 OID 26111)
-- Name: booking_equipment; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.booking_equipment (
    booking_id uuid NOT NULL,
    equipment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.booking_equipment OWNER TO plannivo;

--
-- TOC entry 221 (class 1259 OID 26115)
-- Name: booking_participants; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.booking_participants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    booking_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_primary boolean DEFAULT false,
    payment_status character varying(50) DEFAULT 'unpaid'::character varying,
    payment_amount numeric(10,2) DEFAULT 0.00,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer_package_id uuid,
    package_hours_used numeric(10,2) DEFAULT 0.00,
    cash_hours_used numeric(10,2) DEFAULT 0.00
);


ALTER TABLE public.booking_participants OWNER TO plannivo;

--
-- TOC entry 4654 (class 0 OID 0)
-- Dependencies: 221
-- Name: TABLE booking_participants; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.booking_participants IS 'Stores multiple participants for group bookings';


--
-- TOC entry 4655 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN booking_participants.is_primary; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_participants.is_primary IS 'Indicates the main participant/organizer of the booking';


--
-- TOC entry 4656 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN booking_participants.payment_status; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_participants.payment_status IS 'Individual payment status for this participant';


--
-- TOC entry 4657 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN booking_participants.payment_amount; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_participants.payment_amount IS 'Amount this participant needs to pay';


--
-- TOC entry 4658 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN booking_participants.package_hours_used; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_participants.package_hours_used IS 'Exact number of package hours consumed by this participant for the booking (supports partial consumption).';


--
-- TOC entry 4659 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN booking_participants.cash_hours_used; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_participants.cash_hours_used IS 'Exact number of non-package (cash) hours attributed to this participant for the booking.';


--
-- TOC entry 222 (class 1259 OID 26127)
-- Name: booking_series; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.booking_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    recurrence_type character varying(20) NOT NULL,
    recurrence_days integer[] NOT NULL,
    instructor_user_id uuid,
    service_id uuid,
    max_students integer DEFAULT 1,
    price_per_session numeric(10,2),
    total_price numeric(10,2),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT booking_series_max_students_check CHECK ((max_students > 0)),
    CONSTRAINT booking_series_recurrence_type_check CHECK (((recurrence_type)::text = ANY (ARRAY[('daily'::character varying)::text, ('weekly'::character varying)::text, ('custom'::character varying)::text]))),
    CONSTRAINT booking_series_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT chk_max_students_positive CHECK ((max_students > 0))
);


ALTER TABLE public.booking_series OWNER TO plannivo;

--
-- TOC entry 4660 (class 0 OID 0)
-- Dependencies: 222
-- Name: TABLE booking_series; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.booking_series IS 'Multi-day lesson packages with recurring schedules';


--
-- TOC entry 4661 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN booking_series.recurrence_days; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_series.recurrence_days IS 'Array of day numbers: 1=Monday, 2=Tuesday, ..., 7=Sunday';


--
-- TOC entry 4662 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN booking_series.max_students; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.booking_series.max_students IS 'Maximum number of students that can enroll in this series';


--
-- TOC entry 223 (class 1259 OID 26141)
-- Name: booking_series_customers; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.booking_series_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid,
    customer_user_id uuid,
    enrollment_date timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'active'::character varying,
    CONSTRAINT booking_series_students_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('dropped'::character varying)::text, ('completed'::character varying)::text])))
);


ALTER TABLE public.booking_series_customers OWNER TO plannivo;

--
-- TOC entry 4663 (class 0 OID 0)
-- Dependencies: 223
-- Name: TABLE booking_series_customers; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.booking_series_customers IS 'Students enrolled in multi-day lesson series';


--
-- TOC entry 224 (class 1259 OID 26148)
-- Name: bookings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.bookings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    date date NOT NULL,
    start_hour numeric(4,2),
    duration numeric(4,2) NOT NULL,
    student_user_id uuid,
    instructor_user_id uuid,
    status character varying(50) DEFAULT 'pending'::character varying,
    payment_status character varying(50) DEFAULT 'unpaid'::character varying NOT NULL,
    amount numeric(10,2) DEFAULT 0.00 NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0.00 NOT NULL,
    discount_amount numeric(10,2) DEFAULT 0.00 NOT NULL,
    final_amount numeric(10,2) DEFAULT 0.00 NOT NULL,
    location character varying(100) DEFAULT 'TBD'::character varying NOT NULL,
    weather_conditions text DEFAULT 'Good'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    feedback_rating integer,
    feedback_comments text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canceled_at timestamp with time zone,
    cancellation_reason text,
    service_id uuid,
    custom_price numeric(10,2) DEFAULT NULL::numeric,
    checkin_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    checkout_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    checkin_time timestamp with time zone,
    checkout_time timestamp with time zone,
    checkin_notes text DEFAULT ''::text NOT NULL,
    checkout_notes text DEFAULT ''::text NOT NULL,
    customer_user_id uuid,
    weather_suitable boolean DEFAULT true,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    deleted_at timestamp without time zone,
    deleted_by uuid,
    deletion_reason text,
    deletion_metadata jsonb,
    customer_package_id uuid,
    group_size integer DEFAULT 1,
    max_participants integer DEFAULT 10,
    CONSTRAINT check_amount_positive CHECK ((amount >= (0)::numeric)),
    CONSTRAINT check_booking_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('checked-in'::character varying)::text, ('checked-out'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT check_checkin_status CHECK (((checkin_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('checked-in'::character varying)::text, ('no-show'::character varying)::text]))),
    CONSTRAINT check_checkout_status CHECK (((checkout_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('checked-out'::character varying)::text, ('early-checkout'::character varying)::text]))),
    CONSTRAINT check_discount_amount_positive CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT check_discount_percent CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT check_duration_positive CHECK ((duration > (0)::numeric)),
    CONSTRAINT check_final_amount_positive CHECK ((final_amount >= (0)::numeric)),
    CONSTRAINT check_payment_status CHECK (((payment_status)::text = ANY (ARRAY[('unpaid'::character varying)::text, ('paid'::character varying)::text, ('refunded'::character varying)::text, ('partial'::character varying)::text, ('package'::character varying)::text, ('mixed'::character varying)::text, ('balance'::character varying)::text]))),
    CONSTRAINT chk_duration_positive CHECK ((duration > (0)::numeric)),
    CONSTRAINT chk_realistic_hours CHECK (((start_hour >= (6)::numeric) AND (start_hour <= (23)::numeric)))
);


ALTER TABLE public.bookings OWNER TO plannivo;

--
-- TOC entry 4664 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.payment_status; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.payment_status IS 'Payment status: unpaid, paid, refunded, partial';


--
-- TOC entry 4665 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.final_amount; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.final_amount IS 'Final amount after discounts or custom pricing';


--
-- TOC entry 4666 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.location; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.location IS 'Booking location, default TBD if not specified';


--
-- TOC entry 4667 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.weather_conditions; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.weather_conditions IS 'Weather conditions for the session, default Good';


--
-- TOC entry 4668 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.feedback_comments; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.feedback_comments IS 'Customer feedback comments, empty string if none';


--
-- TOC entry 4669 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.custom_price; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.custom_price IS 'Override price for special deals or packages';


--
-- TOC entry 4670 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.checkin_status; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.checkin_status IS 'Check-in status: pending, checked-in, no-show';


--
-- TOC entry 4671 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.checkout_status; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.checkout_status IS 'Check-out status: pending, checked-out, early-checkout';


--
-- TOC entry 4672 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.checkin_notes; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.checkin_notes IS 'Notes from check-in process, empty string if none';


--
-- TOC entry 4673 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.checkout_notes; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.checkout_notes IS 'Notes from check-out process, empty string if none';


--
-- TOC entry 4674 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.customer_user_id; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.customer_user_id IS 'References the customer (same as student_user_id for booking context)';


--
-- TOC entry 4675 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.customer_package_id; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.customer_package_id IS 'References the customer package used for this booking, null for non-package bookings';


--
-- TOC entry 4676 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.group_size; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.group_size IS 'Number of participants in this booking';


--
-- TOC entry 4677 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN bookings.max_participants; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.bookings.max_participants IS 'Maximum allowed participants for this booking type';


--
-- TOC entry 225 (class 1259 OID 26186)
-- Name: currency_settings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.currency_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    currency_code character varying(3) NOT NULL,
    currency_name character varying(50) NOT NULL,
    symbol character varying(5) NOT NULL,
    is_active boolean DEFAULT true,
    exchange_rate numeric(10,4) DEFAULT 1.0,
    base_currency boolean DEFAULT false,
    decimal_places integer DEFAULT 2,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.currency_settings OWNER TO plannivo;

--
-- TOC entry 226 (class 1259 OID 26196)
-- Name: customer_packages; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.customer_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    service_package_id uuid NOT NULL,
    purchase_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    purchase_price numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    package_name character varying(255) NOT NULL,
    lesson_service_name character varying(255),
    total_hours numeric(5,2) DEFAULT 0,
    used_hours numeric(5,2) DEFAULT 0,
    remaining_hours numeric(5,2) DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    expiry_date date,
    last_used_date date,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_hours_valid CHECK (((used_hours >= (0)::numeric) AND (remaining_hours >= (0)::numeric))),
    CONSTRAINT check_status_valid CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('expired'::character varying)::text, ('used_up'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE public.customer_packages OWNER TO plannivo;

--
-- TOC entry 227 (class 1259 OID 26212)
-- Name: deleted_booking_relations_backup; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.deleted_booking_relations_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    table_name character varying(255) NOT NULL,
    original_data jsonb NOT NULL,
    backed_up_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.deleted_booking_relations_backup OWNER TO plannivo;

--
-- TOC entry 228 (class 1259 OID 26219)
-- Name: deleted_bookings_backup; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.deleted_bookings_backup (
    id uuid NOT NULL,
    original_data jsonb NOT NULL,
    deleted_at timestamp without time zone NOT NULL,
    deleted_by uuid,
    deletion_reason text,
    deletion_metadata jsonb,
    backed_up_at timestamp without time zone DEFAULT now(),
    scheduled_hard_delete_at timestamp without time zone,
    hard_deleted_at timestamp without time zone
);


ALTER TABLE public.deleted_bookings_backup OWNER TO plannivo;

--
-- TOC entry 229 (class 1259 OID 26225)
-- Name: deleted_entities_backup; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.deleted_entities_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id uuid NOT NULL,
    original_data jsonb NOT NULL,
    deleted_at timestamp without time zone NOT NULL,
    deleted_by uuid,
    deletion_reason text,
    backed_up_at timestamp without time zone DEFAULT now(),
    scheduled_hard_delete_at timestamp without time zone,
    hard_deleted_at timestamp without time zone
);


ALTER TABLE public.deleted_entities_backup OWNER TO plannivo;

--
-- TOC entry 230 (class 1259 OID 26232)
-- Name: earnings_audit_log; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.earnings_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    operation_type character varying(50) NOT NULL,
    old_values jsonb,
    new_values jsonb,
    changed_by uuid,
    change_reason text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.earnings_audit_log OWNER TO plannivo;

--
-- TOC entry 231 (class 1259 OID 26239)
-- Name: equipment; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.equipment (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    size character varying(50),
    brand character varying(50),
    model character varying(50),
    serial_number character varying(100),
    purchase_date date,
    purchase_price numeric(10,2),
    condition character varying(50) DEFAULT 'Good'::character varying,
    availability character varying(50) DEFAULT 'Available'::character varying,
    maintenance_history jsonb,
    last_serviced_date date,
    location character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.equipment OWNER TO plannivo;

--
-- TOC entry 232 (class 1259 OID 26249)
-- Name: feedback; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    student_id uuid,
    instructor_id uuid,
    rating integer NOT NULL,
    comment text,
    skill_level character varying(20),
    progress_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT feedback_skill_level_check CHECK (((skill_level)::text = ANY (ARRAY[('beginner'::character varying)::text, ('intermediate'::character varying)::text, ('advanced'::character varying)::text])))
);


ALTER TABLE public.feedback OWNER TO plannivo;

--
-- TOC entry 233 (class 1259 OID 26259)
-- Name: financial_events; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.financial_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EUR'::character varying,
    description text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid
);


ALTER TABLE public.financial_events OWNER TO plannivo;

--
-- TOC entry 274 (class 1259 OID 27202)
-- Name: financial_settings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.financial_settings (
    id integer NOT NULL,
    tax_rate_pct numeric(5,2) DEFAULT 0 NOT NULL,
    insurance_rate_pct numeric(5,2) DEFAULT 0 NOT NULL,
    equipment_rate_pct numeric(5,2) DEFAULT 0 NOT NULL,
    payment_method_fees jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accrual_tax_rate_pct numeric(5,2) DEFAULT 0 NOT NULL,
    accrual_insurance_rate_pct numeric(5,2) DEFAULT 0 NOT NULL,
    accrual_equipment_rate_pct numeric(5,2) DEFAULT 0 NOT NULL,
    accrual_payment_method_fees jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT chk_rates_range CHECK (((tax_rate_pct >= (0)::numeric) AND (tax_rate_pct <= (100)::numeric) AND (insurance_rate_pct >= (0)::numeric) AND (insurance_rate_pct <= (100)::numeric) AND (equipment_rate_pct >= (0)::numeric) AND (equipment_rate_pct <= (100)::numeric) AND (accrual_tax_rate_pct >= (0)::numeric) AND (accrual_tax_rate_pct <= (100)::numeric) AND (accrual_insurance_rate_pct >= (0)::numeric) AND (accrual_insurance_rate_pct <= (100)::numeric) AND (accrual_equipment_rate_pct >= (0)::numeric) AND (accrual_equipment_rate_pct <= (100)::numeric)))
);


ALTER TABLE public.financial_settings OWNER TO plannivo;

--
-- TOC entry 273 (class 1259 OID 27201)
-- Name: financial_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.financial_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.financial_settings_id_seq OWNER TO plannivo;

--
-- TOC entry 4678 (class 0 OID 0)
-- Dependencies: 273
-- Name: financial_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.financial_settings_id_seq OWNED BY public.financial_settings.id;


--
-- TOC entry 276 (class 1259 OID 27227)
-- Name: financial_settings_overrides; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.financial_settings_overrides (
    id integer NOT NULL,
    settings_id integer NOT NULL,
    scope_type character varying(50) NOT NULL,
    scope_value character varying(255) NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    precedence integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.financial_settings_overrides OWNER TO plannivo;

--
-- TOC entry 275 (class 1259 OID 27226)
-- Name: financial_settings_overrides_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.financial_settings_overrides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.financial_settings_overrides_id_seq OWNER TO plannivo;

--
-- TOC entry 4679 (class 0 OID 0)
-- Dependencies: 275
-- Name: financial_settings_overrides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.financial_settings_overrides_id_seq OWNED BY public.financial_settings_overrides.id;


--
-- TOC entry 234 (class 1259 OID 26267)
-- Name: instructor_commission_history; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_commission_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    old_commission_rate numeric(5,4),
    new_commission_rate numeric(5,4) NOT NULL,
    effective_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    changed_by uuid,
    reason text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.instructor_commission_history OWNER TO plannivo;

--
-- TOC entry 235 (class 1259 OID 26276)
-- Name: instructor_default_commissions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_default_commissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    instructor_id uuid NOT NULL,
    commission_type character varying(20) NOT NULL,
    commission_value numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT instructor_default_commissions_commission_type_check CHECK (((commission_type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('fixed'::character varying)::text])))
);


ALTER TABLE public.instructor_default_commissions OWNER TO plannivo;

--
-- TOC entry 236 (class 1259 OID 26283)
-- Name: instructor_earnings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_earnings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    instructor_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    base_rate numeric(10,2) NOT NULL,
    commission_rate numeric(5,2) NOT NULL,
    bonus numeric(10,2) DEFAULT 0,
    total_earnings numeric(10,2) NOT NULL,
    lesson_date date NOT NULL,
    lesson_duration numeric(4,2) NOT NULL,
    lesson_amount numeric(10,2) NOT NULL,
    payroll_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_lesson_amount_positive CHECK ((lesson_amount >= (0)::numeric)),
    CONSTRAINT check_total_earnings_positive CHECK ((total_earnings >= (0)::numeric))
);


ALTER TABLE public.instructor_earnings OWNER TO plannivo;

--
-- TOC entry 237 (class 1259 OID 26292)
-- Name: instructor_payroll; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_payroll (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    instructor_id uuid NOT NULL,
    period_start_date date NOT NULL,
    period_end_date date NOT NULL,
    base_salary numeric(10,2) DEFAULT 0,
    bonus numeric(10,2) DEFAULT 0,
    payment_date timestamp with time zone,
    payment_method character varying(50),
    reference_number character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.instructor_payroll OWNER TO plannivo;

--
-- TOC entry 238 (class 1259 OID 26303)
-- Name: instructor_rate_history; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_rate_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    old_rate numeric(10,2),
    new_rate numeric(10,2) NOT NULL,
    effective_date timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.instructor_rate_history OWNER TO plannivo;

--
-- TOC entry 301 (class 1259 OID 35928)
-- Name: instructor_ratings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    student_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    service_type character varying(32) DEFAULT 'lesson'::character varying NOT NULL,
    rating smallint NOT NULL,
    feedback_text text,
    is_anonymous boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instructor_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.instructor_ratings OWNER TO plannivo;

--
-- TOC entry 239 (class 1259 OID 26311)
-- Name: instructor_service_commissions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_service_commissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    instructor_id uuid NOT NULL,
    service_id uuid NOT NULL,
    commission_type character varying(20) NOT NULL,
    commission_value numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT instructor_service_commissions_commission_type_check CHECK (((commission_type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('fixed'::character varying)::text])))
);


ALTER TABLE public.instructor_service_commissions OWNER TO plannivo;

--
-- TOC entry 240 (class 1259 OID 26318)
-- Name: instructor_services; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_services (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    instructor_id uuid NOT NULL,
    service_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.instructor_services OWNER TO plannivo;

--
-- TOC entry 302 (class 1259 OID 35962)
-- Name: instructor_student_notes; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.instructor_student_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    student_id uuid NOT NULL,
    booking_id uuid,
    note_text text NOT NULL,
    visibility character varying(32) DEFAULT 'student_visible'::character varying NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.instructor_student_notes OWNER TO plannivo;

--
-- TOC entry 241 (class 1259 OID 26324)
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    weather_alerts boolean DEFAULT true,
    booking_updates boolean DEFAULT true,
    payment_notifications boolean DEFAULT true,
    general_announcements boolean DEFAULT true,
    email_notifications boolean DEFAULT true,
    push_notifications boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notification_settings OWNER TO plannivo;

--
-- TOC entry 242 (class 1259 OID 26335)
-- Name: notifications; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) DEFAULT 'general'::character varying,
    data jsonb,
    status character varying(20) DEFAULT 'sent'::character varying,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notifications OWNER TO plannivo;

--
-- TOC entry 243 (class 1259 OID 26344)
-- Name: package_hour_fixes; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.package_hour_fixes (
    id integer NOT NULL,
    customer_id uuid NOT NULL,
    package_id uuid NOT NULL,
    old_used_hours numeric(5,2),
    new_used_hours numeric(5,2),
    old_remaining_hours numeric(5,2),
    new_remaining_hours numeric(5,2),
    fixed_at timestamp without time zone DEFAULT now(),
    fix_reason text
);


ALTER TABLE public.package_hour_fixes OWNER TO plannivo;

--
-- TOC entry 244 (class 1259 OID 26350)
-- Name: package_hour_fixes_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.package_hour_fixes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.package_hour_fixes_id_seq OWNER TO plannivo;

--
-- TOC entry 4680 (class 0 OID 0)
-- Dependencies: 244
-- Name: package_hour_fixes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.package_hour_fixes_id_seq OWNED BY public.package_hour_fixes.id;


--
-- TOC entry 245 (class 1259 OID 26351)
-- Name: payment_intents; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_payment_intent_id character varying(255) NOT NULL,
    user_id uuid,
    booking_id uuid,
    amount integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    status character varying(50) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_intents OWNER TO plannivo;

--
-- TOC entry 246 (class 1259 OID 26360)
-- Name: services; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(100) NOT NULL,
    level character varying(100),
    service_type character varying(50) NOT NULL,
    duration numeric(5,2) NOT NULL,
    price numeric(10,2) NOT NULL,
    max_participants integer,
    start_time time without time zone,
    end_time time without time zone,
    includes text,
    image_url text,
    package_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    discipline_tag character varying(32),
    lesson_category_tag character varying(32),
    level_tag character varying(32),
    CONSTRAINT check_reasonable_duration CHECK (((((category)::text = 'lesson'::text) AND ((duration >= 0.25) AND (duration <= 8.0))) OR (((category)::text = 'equipment rentals'::text) AND ((duration >= 0.5) AND (duration <= 24.0))) OR (((category)::text <> ALL (ARRAY[('lesson'::character varying)::text, ('equipment rentals'::character varying)::text])) AND (duration > (0)::numeric))))
);


ALTER TABLE public.services OWNER TO plannivo;

--
-- TOC entry 247 (class 1259 OID 26370)
-- Name: users; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    date_of_birth date,
    phone character varying(50),
    address text,
    city character varying(100),
    country character varying(100),
    postal_code character varying(20),
    preferred_currency character varying(3) DEFAULT 'EUR'::character varying,
    bio text,
    profile_image_url character varying(255),
    role_id uuid,
    level character varying(50),
    notes text,
    package_hours integer DEFAULT 0,
    remaining_hours numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    skill_level character varying(20) DEFAULT 'beginner'::character varying,
    balance numeric DEFAULT 0,
    total_spent numeric DEFAULT 0,
    last_payment_date timestamp with time zone,
    account_status character varying(50) DEFAULT 'active'::character varying,
    two_factor_secret character varying(32),
    two_factor_enabled boolean DEFAULT false,
    two_factor_backup_codes text[],
    account_locked boolean DEFAULT false,
    account_locked_at timestamp without time zone,
    failed_login_attempts integer DEFAULT 0,
    last_failed_login_at timestamp without time zone,
    account_expired_at timestamp without time zone,
    password_changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login_at timestamp without time zone,
    last_login_ip inet,
    hourly_rate numeric(10,2) DEFAULT 80.00,
    age smallint,
    weight numeric(6,2),
    CONSTRAINT users_skill_level_check CHECK (((skill_level)::text = ANY (ARRAY[('beginner'::character varying)::text, ('intermediate'::character varying)::text, ('advanced'::character varying)::text])))
);


ALTER TABLE public.users OWNER TO plannivo;

--
-- TOC entry 4681 (class 0 OID 0)
-- Dependencies: 247
-- Name: COLUMN users.age; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.users.age IS 'Stored age in years when provided by staff (optional)';


--
-- TOC entry 4682 (class 0 OID 0)
-- Dependencies: 247
-- Name: COLUMN users.weight; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.users.weight IS 'Customer weight in kilograms (optional)';


--
-- TOC entry 248 (class 1259 OID 26391)
-- Name: performance_overview; Type: VIEW; Schema: public; Owner: plannivo
--

CREATE VIEW public.performance_overview AS
 SELECT 'bookings'::text AS table_name,
    count(*) AS total_rows,
    count(*) FILTER (WHERE (bookings.date >= CURRENT_DATE)) AS future_rows
   FROM public.bookings
UNION ALL
 SELECT 'users'::text AS table_name,
    count(*) AS total_rows,
    count(*) FILTER (WHERE ((users.account_status)::text = 'active'::text)) AS future_rows
   FROM public.users
UNION ALL
 SELECT 'services'::text AS table_name,
    count(*) AS total_rows,
    count(*) AS future_rows
   FROM public.services;


ALTER VIEW public.performance_overview OWNER TO plannivo;

--
-- TOC entry 288 (class 1259 OID 27423)
-- Name: popup_analytics; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_analytics (
    id integer NOT NULL,
    popup_id integer,
    date_recorded date DEFAULT CURRENT_DATE,
    total_views integer DEFAULT 0,
    unique_viewers integer DEFAULT 0,
    total_dismissals integer DEFAULT 0,
    primary_button_clicks integer DEFAULT 0,
    secondary_button_clicks integer DEFAULT 0,
    form_submissions integer DEFAULT 0,
    social_clicks integer DEFAULT 0,
    link_clicks integer DEFAULT 0,
    avg_display_time_seconds double precision DEFAULT 0,
    avg_load_time_ms double precision DEFAULT 0,
    bounce_rate double precision DEFAULT 0,
    completion_rate double precision DEFAULT 0,
    ab_test_group character varying(10),
    conversion_rate double precision DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_analytics OWNER TO plannivo;

--
-- TOC entry 287 (class 1259 OID 27422)
-- Name: popup_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_analytics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_analytics_id_seq OWNER TO plannivo;

--
-- TOC entry 4683 (class 0 OID 0)
-- Dependencies: 287
-- Name: popup_analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_analytics_id_seq OWNED BY public.popup_analytics.id;


--
-- TOC entry 280 (class 1259 OID 27325)
-- Name: popup_configurations; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_configurations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    title character varying(500) NOT NULL,
    subtitle character varying(500),
    body_text text,
    is_active boolean DEFAULT false,
    popup_type character varying(50) DEFAULT 'welcome'::character varying,
    priority integer DEFAULT 1,
    modal_size character varying(20) DEFAULT 'medium'::character varying,
    layout_template character varying(50) DEFAULT 'centered'::character varying,
    animation_type character varying(30) DEFAULT 'fade'::character varying,
    color_theme character varying(30) DEFAULT 'default'::character varying,
    background_type character varying(20) DEFAULT 'color'::character varying,
    background_value text,
    border_radius integer DEFAULT 8,
    has_shadow boolean DEFAULT true,
    is_multi_step boolean DEFAULT false,
    column_layout integer DEFAULT 1,
    image_position character varying(20) DEFAULT 'top'::character varying,
    text_alignment character varying(20) DEFAULT 'center'::character varying,
    custom_css text,
    display_delay integer DEFAULT 0,
    auto_close_delay integer DEFAULT 0,
    max_displays_per_user integer DEFAULT 1,
    cooldown_period integer DEFAULT 0,
    ab_test_group character varying(10),
    ab_test_weight integer DEFAULT 100,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    updated_by uuid,
    config jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.popup_configurations OWNER TO plannivo;

--
-- TOC entry 279 (class 1259 OID 27324)
-- Name: popup_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_configurations_id_seq OWNER TO plannivo;

--
-- TOC entry 4684 (class 0 OID 0)
-- Dependencies: 279
-- Name: popup_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_configurations_id_seq OWNED BY public.popup_configurations.id;


--
-- TOC entry 282 (class 1259 OID 27365)
-- Name: popup_content_blocks; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_content_blocks (
    id integer NOT NULL,
    popup_id integer,
    block_type character varying(50) NOT NULL,
    content_data jsonb NOT NULL,
    display_order integer DEFAULT 0,
    step_number integer DEFAULT 1,
    is_active boolean DEFAULT true,
    mobile_settings jsonb,
    tablet_settings jsonb,
    desktop_settings jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_content_blocks OWNER TO plannivo;

--
-- TOC entry 281 (class 1259 OID 27364)
-- Name: popup_content_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_content_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_content_blocks_id_seq OWNER TO plannivo;

--
-- TOC entry 4685 (class 0 OID 0)
-- Dependencies: 281
-- Name: popup_content_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_content_blocks_id_seq OWNED BY public.popup_content_blocks.id;


--
-- TOC entry 292 (class 1259 OID 27476)
-- Name: popup_media_assets; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_media_assets (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    original_filename character varying(255) NOT NULL,
    file_type character varying(50) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size integer NOT NULL,
    file_path text NOT NULL,
    thumbnail_path text,
    alt_text character varying(500),
    description text,
    tags text[],
    is_active boolean DEFAULT true,
    uploaded_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_media_assets OWNER TO plannivo;

--
-- TOC entry 291 (class 1259 OID 27475)
-- Name: popup_media_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_media_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_media_assets_id_seq OWNER TO plannivo;

--
-- TOC entry 4686 (class 0 OID 0)
-- Dependencies: 291
-- Name: popup_media_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_media_assets_id_seq OWNED BY public.popup_media_assets.id;


--
-- TOC entry 284 (class 1259 OID 27383)
-- Name: popup_targeting_rules; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_targeting_rules (
    id integer NOT NULL,
    popup_id integer,
    rule_type character varying(50) NOT NULL,
    rule_condition character varying(100) NOT NULL,
    rule_value text NOT NULL,
    rule_operator character varying(10) DEFAULT 'AND'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_targeting_rules OWNER TO plannivo;

--
-- TOC entry 283 (class 1259 OID 27382)
-- Name: popup_targeting_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_targeting_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_targeting_rules_id_seq OWNER TO plannivo;

--
-- TOC entry 4687 (class 0 OID 0)
-- Dependencies: 283
-- Name: popup_targeting_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_targeting_rules_id_seq OWNED BY public.popup_targeting_rules.id;


--
-- TOC entry 294 (class 1259 OID 27492)
-- Name: popup_templates; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_templates (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    template_type character varying(50) NOT NULL,
    thumbnail_url text,
    default_config jsonb NOT NULL,
    default_content_blocks jsonb NOT NULL,
    default_targeting_rules jsonb,
    is_system_template boolean DEFAULT false,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_templates OWNER TO plannivo;

--
-- TOC entry 293 (class 1259 OID 27491)
-- Name: popup_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_templates_id_seq OWNER TO plannivo;

--
-- TOC entry 4688 (class 0 OID 0)
-- Dependencies: 293
-- Name: popup_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_templates_id_seq OWNED BY public.popup_templates.id;


--
-- TOC entry 286 (class 1259 OID 27400)
-- Name: popup_user_interactions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.popup_user_interactions (
    id integer NOT NULL,
    popup_id integer,
    user_id uuid,
    interaction_type character varying(50) NOT NULL,
    interaction_data jsonb,
    step_number integer DEFAULT 1,
    session_id character varying(100),
    ip_address inet,
    user_agent text,
    page_url text,
    referrer text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_user_interactions OWNER TO plannivo;

--
-- TOC entry 285 (class 1259 OID 27399)
-- Name: popup_user_interactions_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.popup_user_interactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_user_interactions_id_seq OWNER TO plannivo;

--
-- TOC entry 4689 (class 0 OID 0)
-- Dependencies: 285
-- Name: popup_user_interactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.popup_user_interactions_id_seq OWNED BY public.popup_user_interactions.id;


--
-- TOC entry 249 (class 1259 OID 26396)
-- Name: products; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    sku character varying(100),
    category character varying(100) NOT NULL,
    brand character varying(100),
    price numeric(10,2) NOT NULL,
    cost_price numeric(10,2),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    stock_quantity integer DEFAULT 0,
    min_stock_level integer DEFAULT 0,
    weight numeric(8,3),
    dimensions jsonb,
    image_url text,
    images jsonb,
    status character varying(20) DEFAULT 'active'::character varying,
    is_featured boolean DEFAULT false,
    tags jsonb,
    supplier_info jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cost_price_positive CHECK (((cost_price IS NULL) OR (cost_price >= (0)::numeric))),
    CONSTRAINT chk_price_positive CHECK ((price >= (0)::numeric)),
    CONSTRAINT chk_stock_quantity CHECK ((stock_quantity >= 0))
);


ALTER TABLE public.products OWNER TO plannivo;

--
-- TOC entry 4690 (class 0 OID 0)
-- Dependencies: 249
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.products IS 'Retail products for sale (equipment, gear, accessories)';


--
-- TOC entry 4691 (class 0 OID 0)
-- Dependencies: 249
-- Name: COLUMN products.sku; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.products.sku IS 'Stock Keeping Unit - unique product identifier';


--
-- TOC entry 4692 (class 0 OID 0)
-- Dependencies: 249
-- Name: COLUMN products.cost_price; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.products.cost_price IS 'Purchase/manufacturing cost for profit calculation';


--
-- TOC entry 4693 (class 0 OID 0)
-- Dependencies: 249
-- Name: COLUMN products.stock_quantity; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.products.stock_quantity IS 'Current inventory level';


--
-- TOC entry 4694 (class 0 OID 0)
-- Dependencies: 249
-- Name: COLUMN products.min_stock_level; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON COLUMN public.products.min_stock_level IS 'Minimum stock before reorder alert';


--
-- TOC entry 250 (class 1259 OID 26412)
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    endpoint text NOT NULL,
    p256dh_key text NOT NULL,
    auth_key text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.push_subscriptions OWNER TO plannivo;

--
-- TOC entry 300 (class 1259 OID 35901)
-- Name: recommended_products; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.recommended_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    recommended_for_role character varying(32) DEFAULT 'student'::character varying NOT NULL,
    priority smallint DEFAULT 5 NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recommended_products_priority_check CHECK (((priority >= 1) AND (priority <= 10)))
);


ALTER TABLE public.recommended_products OWNER TO plannivo;

--
-- TOC entry 251 (class 1259 OID 26420)
-- Name: refunds; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_refund_id character varying(255) NOT NULL,
    payment_intent_id uuid,
    amount integer NOT NULL,
    reason text,
    status character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.refunds OWNER TO plannivo;

--
-- TOC entry 252 (class 1259 OID 26427)
-- Name: rentals; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.rentals (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_price numeric(10,2) DEFAULT 0,
    payment_status character varying(50) DEFAULT 'unpaid'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    equipment_ids jsonb,
    rental_date date,
    equipment_details jsonb,
    CONSTRAINT rentals_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('completed'::character varying)::text])))
);


ALTER TABLE public.rentals OWNER TO plannivo;

--
-- TOC entry 253 (class 1259 OID 26439)
-- Name: rental_details; Type: VIEW; Schema: public; Owner: plannivo
--

CREATE VIEW public.rental_details AS
 SELECT r.id,
    r.user_id,
    r.start_date,
    r.end_date,
    r.status,
    r.total_price,
    r.payment_status,
    r.notes,
    r.equipment_ids,
    r.rental_date,
    r.equipment_details,
    r.created_at,
    r.updated_at,
    u.name AS customer_name,
    u.email AS customer_email,
    u.first_name,
    u.last_name,
    COALESCE(u.name, (concat(u.first_name, ' ', u.last_name))::character varying, u.email, 'Customer'::character varying) AS display_name
   FROM (public.rentals r
     JOIN public.users u ON ((r.user_id = u.id)));


ALTER VIEW public.rental_details OWNER TO plannivo;

--
-- TOC entry 4695 (class 0 OID 0)
-- Dependencies: 253
-- Name: VIEW rental_details; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON VIEW public.rental_details IS 'Rentals with customer information from users table join';


--
-- TOC entry 254 (class 1259 OID 26444)
-- Name: rental_equipment; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.rental_equipment (
    rental_id uuid NOT NULL,
    equipment_id uuid NOT NULL,
    daily_rate numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.rental_equipment OWNER TO plannivo;

--
-- TOC entry 278 (class 1259 OID 27254)
-- Name: revenue_items; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.revenue_items (
    id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    service_type character varying(50),
    service_id integer,
    category_id integer,
    fulfillment_date date NOT NULL,
    currency character varying(10) DEFAULT 'EUR'::character varying NOT NULL,
    exchange_rate numeric(12,6),
    gross_amount numeric(12,2) DEFAULT 0 NOT NULL,
    commission_amount numeric(12,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    insurance_amount numeric(12,2) DEFAULT 0 NOT NULL,
    equipment_amount numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method character varying(50),
    payment_fee_pct numeric(5,2),
    payment_fee_fixed numeric(12,2),
    payment_fee_amount numeric(12,2) DEFAULT 0 NOT NULL,
    custom_costs jsonb DEFAULT '{}'::jsonb NOT NULL,
    net_amount numeric(12,2) DEFAULT 0 NOT NULL,
    settings_version_id integer,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.revenue_items OWNER TO plannivo;

--
-- TOC entry 277 (class 1259 OID 27253)
-- Name: revenue_items_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.revenue_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.revenue_items_id_seq OWNER TO plannivo;

--
-- TOC entry 4696 (class 0 OID 0)
-- Dependencies: 277
-- Name: revenue_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.revenue_items_id_seq OWNED BY public.revenue_items.id;


--
-- TOC entry 255 (class 1259 OID 26448)
-- Name: roles; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    permissions jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.roles OWNER TO plannivo;

--
-- TOC entry 272 (class 1259 OID 27189)
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    migration_name character varying(255),
    executed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    filename text,
    checksum text,
    applied_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.schema_migrations OWNER TO plannivo;

--
-- TOC entry 271 (class 1259 OID 27188)
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schema_migrations_id_seq OWNER TO plannivo;

--
-- TOC entry 4697 (class 0 OID 0)
-- Dependencies: 271
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- TOC entry 256 (class 1259 OID 26456)
-- Name: security_audit; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.security_audit (
    id integer NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id character varying(100),
    ip_address inet,
    user_agent text,
    success boolean DEFAULT true,
    details jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.security_audit OWNER TO plannivo;

--
-- TOC entry 4698 (class 0 OID 0)
-- Dependencies: 256
-- Name: TABLE security_audit; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.security_audit IS 'Audit trail for security-sensitive operations';


--
-- TOC entry 257 (class 1259 OID 26463)
-- Name: security_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.security_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.security_audit_id_seq OWNER TO plannivo;

--
-- TOC entry 4699 (class 0 OID 0)
-- Dependencies: 257
-- Name: security_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.security_audit_id_seq OWNED BY public.security_audit.id;


--
-- TOC entry 258 (class 1259 OID 26464)
-- Name: service_categories; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.service_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    type character varying(50) DEFAULT 'lessons'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.service_categories OWNER TO plannivo;

--
-- TOC entry 259 (class 1259 OID 26473)
-- Name: service_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.service_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.service_categories_id_seq OWNER TO plannivo;

--
-- TOC entry 4700 (class 0 OID 0)
-- Dependencies: 259
-- Name: service_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.service_categories_id_seq OWNED BY public.service_categories.id;


--
-- TOC entry 260 (class 1259 OID 26474)
-- Name: service_packages; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.service_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(10,2) NOT NULL,
    sessions_count integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    total_hours numeric(5,2),
    lesson_type_id uuid,
    lesson_service_name character varying(255),
    discipline_tag character varying(32),
    lesson_category_tag character varying(32),
    level_tag character varying(32)
);


ALTER TABLE public.service_packages OWNER TO plannivo;

--
-- TOC entry 261 (class 1259 OID 26483)
-- Name: settings; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.settings (
    key character varying(100) NOT NULL,
    value jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.settings OWNER TO plannivo;

--
-- TOC entry 262 (class 1259 OID 26490)
-- Name: skill_levels; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.skill_levels (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    order_index integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.skill_levels OWNER TO plannivo;

--
-- TOC entry 263 (class 1259 OID 26498)
-- Name: skills; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.skills (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    skill_level_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.skills OWNER TO plannivo;

--
-- TOC entry 298 (class 1259 OID 27669)
-- Name: spare_parts_orders; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.spare_parts_orders (
    id integer NOT NULL,
    part_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    supplier text,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_by integer,
    ordered_at timestamp with time zone,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT spare_parts_orders_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT spare_parts_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ordered'::text, 'received'::text, 'cancelled'::text])))
);


ALTER TABLE public.spare_parts_orders OWNER TO plannivo;

--
-- TOC entry 297 (class 1259 OID 27668)
-- Name: spare_parts_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.spare_parts_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.spare_parts_orders_id_seq OWNER TO plannivo;

--
-- TOC entry 4701 (class 0 OID 0)
-- Dependencies: 297
-- Name: spare_parts_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.spare_parts_orders_id_seq OWNED BY public.spare_parts_orders.id;


--
-- TOC entry 264 (class 1259 OID 26506)
-- Name: student_accounts; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.student_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    balance numeric(10,2) DEFAULT 0,
    total_spent numeric(10,2) DEFAULT 0,
    last_payment_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.student_accounts OWNER TO plannivo;

--
-- TOC entry 265 (class 1259 OID 26514)
-- Name: student_achievements; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.student_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    achievement_type character varying(50) NOT NULL,
    title character varying(100) NOT NULL,
    description text,
    earned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.student_achievements OWNER TO plannivo;

--
-- TOC entry 266 (class 1259 OID 26521)
-- Name: student_progress; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.student_progress (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    student_id uuid,
    skill_id uuid,
    instructor_id uuid,
    date_achieved date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.student_progress OWNER TO plannivo;

--
-- TOC entry 299 (class 1259 OID 35880)
-- Name: student_support_requests; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.student_support_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    channel character varying(32) DEFAULT 'portal'::character varying NOT NULL,
    priority character varying(16) DEFAULT 'normal'::character varying NOT NULL,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


ALTER TABLE public.student_support_requests OWNER TO plannivo;

--
-- TOC entry 267 (class 1259 OID 26529)
-- Name: transactions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    type character varying(50) NOT NULL,
    description text,
    payment_method character varying(50),
    reference_number character varying(100),
    booking_id uuid,
    transaction_date timestamp with time zone DEFAULT now(),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    exchange_rate numeric(10,4) DEFAULT 1.0,
    entity_type character varying(50),
    status character varying(50) DEFAULT 'completed'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    rental_id uuid
);


ALTER TABLE public.transactions OWNER TO plannivo;

--
-- TOC entry 303 (class 1259 OID 35995)
-- Name: user_consents; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.user_consents (
    user_id uuid NOT NULL,
    terms_version text NOT NULL,
    terms_accepted_at timestamp with time zone,
    marketing_email_opt_in boolean DEFAULT false NOT NULL,
    marketing_sms_opt_in boolean DEFAULT false NOT NULL,
    marketing_whatsapp_opt_in boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_consents OWNER TO plannivo;

--
-- TOC entry 290 (class 1259 OID 27453)
-- Name: user_popup_preferences; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.user_popup_preferences (
    id integer NOT NULL,
    user_id uuid,
    popups_enabled boolean DEFAULT true,
    welcome_popups_enabled boolean DEFAULT true,
    feature_popups_enabled boolean DEFAULT true,
    promotional_popups_enabled boolean DEFAULT true,
    max_popups_per_day integer DEFAULT 3,
    max_popups_per_week integer DEFAULT 10,
    email_on_popup_feedback boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_popup_preferences OWNER TO plannivo;

--
-- TOC entry 289 (class 1259 OID 27452)
-- Name: user_popup_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.user_popup_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_popup_preferences_id_seq OWNER TO plannivo;

--
-- TOC entry 4702 (class 0 OID 0)
-- Dependencies: 289
-- Name: user_popup_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.user_popup_preferences_id_seq OWNED BY public.user_popup_preferences.id;


--
-- TOC entry 268 (class 1259 OID 26541)
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: plannivo
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    user_id integer,
    token_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    revoked_at timestamp without time zone,
    ip_address inet,
    user_agent text,
    is_active boolean DEFAULT true
);


ALTER TABLE public.user_sessions OWNER TO plannivo;

--
-- TOC entry 4703 (class 0 OID 0)
-- Dependencies: 268
-- Name: TABLE user_sessions; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON TABLE public.user_sessions IS 'Active user sessions for JWT token management';


--
-- TOC entry 269 (class 1259 OID 26548)
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: plannivo
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_sessions_id_seq OWNER TO plannivo;

--
-- TOC entry 4704 (class 0 OID 0)
-- Dependencies: 269
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: plannivo
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- TOC entry 270 (class 1259 OID 26549)
-- Name: v_booking_details; Type: VIEW; Schema: public; Owner: plannivo
--

CREATE VIEW public.v_booking_details AS
 SELECT b.id,
    b.date,
    b.start_hour,
    b.duration,
    b.student_user_id,
    b.instructor_user_id,
    b.status,
    b.payment_status,
    b.amount,
    b.discount_percent,
    b.discount_amount,
    b.final_amount,
    b.location,
    b.weather_conditions,
    b.notes,
    b.feedback_rating,
    b.feedback_comments,
    b.created_at,
    b.updated_at,
    b.canceled_at,
    b.cancellation_reason,
    b.service_id,
    b.custom_price,
    b.checkin_status,
    b.checkout_status,
    b.checkin_time,
    b.checkout_time,
    b.checkin_notes,
    b.checkout_notes,
    b.customer_user_id,
    b.weather_suitable,
    b.currency,
    b.deleted_at,
    b.deleted_by,
    b.deletion_reason,
    b.deletion_metadata,
    b.customer_package_id,
    b.group_size,
    b.max_participants,
    s.name AS service_name,
    s.price AS service_price,
    s.category AS service_category,
    i.name AS instructor_name,
    COALESCE(participant_summary.participant_count, (1)::bigint) AS actual_participant_count,
    COALESCE(participant_summary.participant_names, ARRAY[student.name]) AS participant_names,
    COALESCE(participant_summary.primary_participant_id, b.student_user_id) AS primary_participant_id,
    COALESCE(participant_summary.primary_participant_name, student.name) AS primary_participant_name
   FROM ((((public.bookings b
     LEFT JOIN public.services s ON ((b.service_id = s.id)))
     LEFT JOIN public.users i ON ((b.instructor_user_id = i.id)))
     LEFT JOIN public.users student ON ((b.student_user_id = student.id)))
     LEFT JOIN ( SELECT bp.booking_id,
            count(bp.user_id) AS participant_count,
            array_agg(u.name ORDER BY bp.is_primary DESC, u.name) AS participant_names,
            ( SELECT bp2.user_id
                   FROM public.booking_participants bp2
                  WHERE ((bp2.booking_id = bp.booking_id) AND (bp2.is_primary = true))
                 LIMIT 1) AS primary_participant_id,
            ( SELECT u2.name
                   FROM (public.booking_participants bp2
                     JOIN public.users u2 ON ((bp2.user_id = u2.id)))
                  WHERE ((bp2.booking_id = bp.booking_id) AND (bp2.is_primary = true))
                 LIMIT 1) AS primary_participant_name
           FROM (public.booking_participants bp
             JOIN public.users u ON ((bp.user_id = u.id)))
          GROUP BY bp.booking_id) participant_summary ON ((b.id = participant_summary.booking_id)))
  WHERE (b.deleted_at IS NULL);


ALTER VIEW public.v_booking_details OWNER TO plannivo;

--
-- TOC entry 3932 (class 2604 OID 27644)
-- Name: api_keys id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.api_keys ALTER COLUMN id SET DEFAULT nextval('public.api_keys_id_seq'::regclass);


--
-- TOC entry 3830 (class 2604 OID 27205)
-- Name: financial_settings id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings ALTER COLUMN id SET DEFAULT nextval('public.financial_settings_id_seq'::regclass);


--
-- TOC entry 3843 (class 2604 OID 27230)
-- Name: financial_settings_overrides id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings_overrides ALTER COLUMN id SET DEFAULT nextval('public.financial_settings_overrides_id_seq'::regclass);


--
-- TOC entry 3739 (class 2604 OID 26554)
-- Name: package_hour_fixes id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.package_hour_fixes ALTER COLUMN id SET DEFAULT nextval('public.package_hour_fixes_id_seq'::regclass);


--
-- TOC entry 3897 (class 2604 OID 27426)
-- Name: popup_analytics id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_analytics ALTER COLUMN id SET DEFAULT nextval('public.popup_analytics_id_seq'::regclass);


--
-- TOC entry 3862 (class 2604 OID 27328)
-- Name: popup_configurations id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_configurations ALTER COLUMN id SET DEFAULT nextval('public.popup_configurations_id_seq'::regclass);


--
-- TOC entry 3885 (class 2604 OID 27368)
-- Name: popup_content_blocks id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_content_blocks ALTER COLUMN id SET DEFAULT nextval('public.popup_content_blocks_id_seq'::regclass);


--
-- TOC entry 3924 (class 2604 OID 27479)
-- Name: popup_media_assets id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_media_assets ALTER COLUMN id SET DEFAULT nextval('public.popup_media_assets_id_seq'::regclass);


--
-- TOC entry 3890 (class 2604 OID 27386)
-- Name: popup_targeting_rules id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_targeting_rules ALTER COLUMN id SET DEFAULT nextval('public.popup_targeting_rules_id_seq'::regclass);


--
-- TOC entry 3927 (class 2604 OID 27495)
-- Name: popup_templates id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_templates ALTER COLUMN id SET DEFAULT nextval('public.popup_templates_id_seq'::regclass);


--
-- TOC entry 3894 (class 2604 OID 27403)
-- Name: popup_user_interactions id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_user_interactions ALTER COLUMN id SET DEFAULT nextval('public.popup_user_interactions_id_seq'::regclass);


--
-- TOC entry 3849 (class 2604 OID 27257)
-- Name: revenue_items id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.revenue_items ALTER COLUMN id SET DEFAULT nextval('public.revenue_items_id_seq'::regclass);


--
-- TOC entry 3827 (class 2604 OID 27192)
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- TOC entry 3787 (class 2604 OID 26555)
-- Name: security_audit id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.security_audit ALTER COLUMN id SET DEFAULT nextval('public.security_audit_id_seq'::regclass);


--
-- TOC entry 3790 (class 2604 OID 26556)
-- Name: service_categories id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.service_categories ALTER COLUMN id SET DEFAULT nextval('public.service_categories_id_seq'::regclass);


--
-- TOC entry 3937 (class 2604 OID 27672)
-- Name: spare_parts_orders id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.spare_parts_orders ALTER COLUMN id SET DEFAULT nextval('public.spare_parts_orders_id_seq'::regclass);


--
-- TOC entry 3914 (class 2604 OID 27456)
-- Name: user_popup_preferences id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_popup_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_popup_preferences_id_seq'::regclass);


--
-- TOC entry 3824 (class 2604 OID 26557)
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- TOC entry 4011 (class 2606 OID 26559)
-- Name: accommodation_bookings accommodation_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.accommodation_bookings
    ADD CONSTRAINT accommodation_bookings_pkey PRIMARY KEY (id);


--
-- TOC entry 4016 (class 2606 OID 26561)
-- Name: accommodation_units accommodation_units_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.accommodation_units
    ADD CONSTRAINT accommodation_units_pkey PRIMARY KEY (id);


--
-- TOC entry 4346 (class 2606 OID 27652)
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- TOC entry 4019 (class 2606 OID 26563)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4024 (class 2606 OID 26565)
-- Name: booking_custom_commissions booking_custom_commissions_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_custom_commissions
    ADD CONSTRAINT booking_custom_commissions_booking_id_key UNIQUE (booking_id);


--
-- TOC entry 4026 (class 2606 OID 26567)
-- Name: booking_custom_commissions booking_custom_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_custom_commissions
    ADD CONSTRAINT booking_custom_commissions_pkey PRIMARY KEY (id);


--
-- TOC entry 4031 (class 2606 OID 26569)
-- Name: booking_equipment booking_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_equipment
    ADD CONSTRAINT booking_equipment_pkey PRIMARY KEY (booking_id, equipment_id);


--
-- TOC entry 4034 (class 2606 OID 26571)
-- Name: booking_participants booking_participants_booking_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_booking_id_user_id_key UNIQUE (booking_id, user_id);


--
-- TOC entry 4036 (class 2606 OID 26573)
-- Name: booking_participants booking_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_pkey PRIMARY KEY (id);


--
-- TOC entry 4042 (class 2606 OID 26575)
-- Name: booking_series booking_series_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series
    ADD CONSTRAINT booking_series_pkey PRIMARY KEY (id);


--
-- TOC entry 4047 (class 2606 OID 26577)
-- Name: booking_series_customers booking_series_students_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series_customers
    ADD CONSTRAINT booking_series_students_pkey PRIMARY KEY (id);


--
-- TOC entry 4049 (class 2606 OID 26579)
-- Name: booking_series_customers booking_series_students_series_id_student_user_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series_customers
    ADD CONSTRAINT booking_series_students_series_id_student_user_id_key UNIQUE (series_id, customer_user_id);


--
-- TOC entry 4053 (class 2606 OID 26581)
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- TOC entry 4083 (class 2606 OID 26583)
-- Name: currency_settings currency_settings_currency_code_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.currency_settings
    ADD CONSTRAINT currency_settings_currency_code_key UNIQUE (currency_code);


--
-- TOC entry 4085 (class 2606 OID 26585)
-- Name: currency_settings currency_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.currency_settings
    ADD CONSTRAINT currency_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4088 (class 2606 OID 26587)
-- Name: customer_packages customer_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.customer_packages
    ADD CONSTRAINT customer_packages_pkey PRIMARY KEY (id);


--
-- TOC entry 4093 (class 2606 OID 26589)
-- Name: deleted_booking_relations_backup deleted_booking_relations_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.deleted_booking_relations_backup
    ADD CONSTRAINT deleted_booking_relations_backup_pkey PRIMARY KEY (id);


--
-- TOC entry 4096 (class 2606 OID 26591)
-- Name: deleted_bookings_backup deleted_bookings_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.deleted_bookings_backup
    ADD CONSTRAINT deleted_bookings_backup_pkey PRIMARY KEY (id);


--
-- TOC entry 4100 (class 2606 OID 26593)
-- Name: deleted_entities_backup deleted_entities_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.deleted_entities_backup
    ADD CONSTRAINT deleted_entities_backup_pkey PRIMARY KEY (id);


--
-- TOC entry 4104 (class 2606 OID 26595)
-- Name: earnings_audit_log earnings_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.earnings_audit_log
    ADD CONSTRAINT earnings_audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 4109 (class 2606 OID 26597)
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);


--
-- TOC entry 4113 (class 2606 OID 26599)
-- Name: feedback feedback_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_booking_id_key UNIQUE (booking_id);


--
-- TOC entry 4115 (class 2606 OID 26601)
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- TOC entry 4121 (class 2606 OID 26603)
-- Name: financial_events financial_events_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_events
    ADD CONSTRAINT financial_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4295 (class 2606 OID 27239)
-- Name: financial_settings_overrides financial_settings_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings_overrides
    ADD CONSTRAINT financial_settings_overrides_pkey PRIMARY KEY (id);


--
-- TOC entry 4291 (class 2606 OID 27218)
-- Name: financial_settings financial_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings
    ADD CONSTRAINT financial_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4130 (class 2606 OID 26605)
-- Name: instructor_commission_history instructor_commission_history_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_commission_history
    ADD CONSTRAINT instructor_commission_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4133 (class 2606 OID 26607)
-- Name: instructor_default_commissions instructor_default_commissions_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_default_commissions
    ADD CONSTRAINT instructor_default_commissions_instructor_id_key UNIQUE (instructor_id);


--
-- TOC entry 4135 (class 2606 OID 26609)
-- Name: instructor_default_commissions instructor_default_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_default_commissions
    ADD CONSTRAINT instructor_default_commissions_pkey PRIMARY KEY (id);


--
-- TOC entry 4140 (class 2606 OID 26611)
-- Name: instructor_earnings instructor_earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_earnings
    ADD CONSTRAINT instructor_earnings_pkey PRIMARY KEY (id);


--
-- TOC entry 4145 (class 2606 OID 26613)
-- Name: instructor_payroll instructor_payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_payroll
    ADD CONSTRAINT instructor_payroll_pkey PRIMARY KEY (id);


--
-- TOC entry 4149 (class 2606 OID 26615)
-- Name: instructor_rate_history instructor_rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_rate_history
    ADD CONSTRAINT instructor_rate_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4365 (class 2606 OID 35943)
-- Name: instructor_ratings instructor_ratings_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_ratings
    ADD CONSTRAINT instructor_ratings_booking_id_key UNIQUE (booking_id);


--
-- TOC entry 4367 (class 2606 OID 35941)
-- Name: instructor_ratings instructor_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_ratings
    ADD CONSTRAINT instructor_ratings_pkey PRIMARY KEY (id);


--
-- TOC entry 4153 (class 2606 OID 26617)
-- Name: instructor_service_commissions instructor_service_commissions_instructor_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_service_commissions
    ADD CONSTRAINT instructor_service_commissions_instructor_id_service_id_key UNIQUE (instructor_id, service_id);


--
-- TOC entry 4155 (class 2606 OID 26619)
-- Name: instructor_service_commissions instructor_service_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_service_commissions
    ADD CONSTRAINT instructor_service_commissions_pkey PRIMARY KEY (id);


--
-- TOC entry 4159 (class 2606 OID 26621)
-- Name: instructor_services instructor_services_instructor_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_services
    ADD CONSTRAINT instructor_services_instructor_id_service_id_key UNIQUE (instructor_id, service_id);


--
-- TOC entry 4161 (class 2606 OID 26623)
-- Name: instructor_services instructor_services_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_services
    ADD CONSTRAINT instructor_services_pkey PRIMARY KEY (id);


--
-- TOC entry 4372 (class 2606 OID 35974)
-- Name: instructor_student_notes instructor_student_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_student_notes
    ADD CONSTRAINT instructor_student_notes_pkey PRIMARY KEY (id);


--
-- TOC entry 4163 (class 2606 OID 26625)
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4165 (class 2606 OID 26627)
-- Name: notification_settings notification_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_key UNIQUE (user_id);


--
-- TOC entry 4171 (class 2606 OID 26629)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 4173 (class 2606 OID 26631)
-- Name: package_hour_fixes package_hour_fixes_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.package_hour_fixes
    ADD CONSTRAINT package_hour_fixes_pkey PRIMARY KEY (id);


--
-- TOC entry 4179 (class 2606 OID 26633)
-- Name: payment_intents payment_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);


--
-- TOC entry 4181 (class 2606 OID 26635)
-- Name: payment_intents payment_intents_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- TOC entry 4329 (class 2606 OID 27444)
-- Name: popup_analytics popup_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_analytics
    ADD CONSTRAINT popup_analytics_pkey PRIMARY KEY (id);


--
-- TOC entry 4331 (class 2606 OID 27446)
-- Name: popup_analytics popup_analytics_popup_id_date_recorded_ab_test_group_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_analytics
    ADD CONSTRAINT popup_analytics_popup_id_date_recorded_ab_test_group_key UNIQUE (popup_id, date_recorded, ab_test_group);


--
-- TOC entry 4309 (class 2606 OID 27353)
-- Name: popup_configurations popup_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_configurations
    ADD CONSTRAINT popup_configurations_pkey PRIMARY KEY (id);


--
-- TOC entry 4313 (class 2606 OID 27376)
-- Name: popup_content_blocks popup_content_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_content_blocks
    ADD CONSTRAINT popup_content_blocks_pkey PRIMARY KEY (id);


--
-- TOC entry 4340 (class 2606 OID 27485)
-- Name: popup_media_assets popup_media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_media_assets
    ADD CONSTRAINT popup_media_assets_pkey PRIMARY KEY (id);


--
-- TOC entry 4317 (class 2606 OID 27393)
-- Name: popup_targeting_rules popup_targeting_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_targeting_rules
    ADD CONSTRAINT popup_targeting_rules_pkey PRIMARY KEY (id);


--
-- TOC entry 4344 (class 2606 OID 27503)
-- Name: popup_templates popup_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_templates
    ADD CONSTRAINT popup_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 4323 (class 2606 OID 27409)
-- Name: popup_user_interactions popup_user_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_user_interactions
    ADD CONSTRAINT popup_user_interactions_pkey PRIMARY KEY (id);


--
-- TOC entry 4325 (class 2606 OID 27411)
-- Name: popup_user_interactions popup_user_interactions_popup_id_user_id_interaction_type_s_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_user_interactions
    ADD CONSTRAINT popup_user_interactions_popup_id_user_id_interaction_type_s_key UNIQUE (popup_id, user_id, interaction_type, step_number);


--
-- TOC entry 4209 (class 2606 OID 26637)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- TOC entry 4211 (class 2606 OID 26639)
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- TOC entry 4214 (class 2606 OID 26641)
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- TOC entry 4216 (class 2606 OID 26643)
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);


--
-- TOC entry 4360 (class 2606 OID 35915)
-- Name: recommended_products recommended_products_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.recommended_products
    ADD CONSTRAINT recommended_products_pkey PRIMARY KEY (id);


--
-- TOC entry 4218 (class 2606 OID 26645)
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- TOC entry 4220 (class 2606 OID 26647)
-- Name: refunds refunds_stripe_refund_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_stripe_refund_id_key UNIQUE (stripe_refund_id);


--
-- TOC entry 4228 (class 2606 OID 26649)
-- Name: rental_equipment rental_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT rental_equipment_pkey PRIMARY KEY (rental_id, equipment_id);


--
-- TOC entry 4226 (class 2606 OID 26651)
-- Name: rentals rentals_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT rentals_pkey PRIMARY KEY (id);


--
-- TOC entry 4302 (class 2606 OID 27273)
-- Name: revenue_items revenue_items_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.revenue_items
    ADD CONSTRAINT revenue_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4230 (class 2606 OID 26653)
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- TOC entry 4232 (class 2606 OID 26655)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 4287 (class 2606 OID 27197)
-- Name: schema_migrations schema_migrations_migration_name_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_migration_name_key UNIQUE (migration_name);


--
-- TOC entry 4289 (class 2606 OID 27195)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4239 (class 2606 OID 26657)
-- Name: security_audit security_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.security_audit
    ADD CONSTRAINT security_audit_pkey PRIMARY KEY (id);


--
-- TOC entry 4241 (class 2606 OID 26659)
-- Name: service_categories service_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_name_key UNIQUE (name);


--
-- TOC entry 4243 (class 2606 OID 26661)
-- Name: service_categories service_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4248 (class 2606 OID 26663)
-- Name: service_packages service_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.service_packages
    ADD CONSTRAINT service_packages_pkey PRIMARY KEY (id);


--
-- TOC entry 4189 (class 2606 OID 26665)
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- TOC entry 4250 (class 2606 OID 26667)
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- TOC entry 4252 (class 2606 OID 26669)
-- Name: skill_levels skill_levels_name_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.skill_levels
    ADD CONSTRAINT skill_levels_name_key UNIQUE (name);


--
-- TOC entry 4254 (class 2606 OID 26671)
-- Name: skill_levels skill_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.skill_levels
    ADD CONSTRAINT skill_levels_pkey PRIMARY KEY (id);


--
-- TOC entry 4256 (class 2606 OID 26673)
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- TOC entry 4351 (class 2606 OID 27682)
-- Name: spare_parts_orders spare_parts_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.spare_parts_orders
    ADD CONSTRAINT spare_parts_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4258 (class 2606 OID 26675)
-- Name: student_accounts student_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_pkey PRIMARY KEY (id);


--
-- TOC entry 4260 (class 2606 OID 26677)
-- Name: student_accounts student_accounts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_user_id_key UNIQUE (user_id);


--
-- TOC entry 4264 (class 2606 OID 26679)
-- Name: student_achievements student_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_achievements
    ADD CONSTRAINT student_achievements_pkey PRIMARY KEY (id);


--
-- TOC entry 4266 (class 2606 OID 26681)
-- Name: student_achievements student_achievements_student_id_achievement_type_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_achievements
    ADD CONSTRAINT student_achievements_student_id_achievement_type_key UNIQUE (student_id, achievement_type);


--
-- TOC entry 4268 (class 2606 OID 26683)
-- Name: student_progress student_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_progress
    ADD CONSTRAINT student_progress_pkey PRIMARY KEY (id);


--
-- TOC entry 4356 (class 2606 OID 35893)
-- Name: student_support_requests student_support_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_support_requests
    ADD CONSTRAINT student_support_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 4277 (class 2606 OID 26685)
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- TOC entry 4375 (class 2606 OID 36006)
-- Name: user_consents user_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4334 (class 2606 OID 27467)
-- Name: user_popup_preferences user_popup_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_popup_preferences
    ADD CONSTRAINT user_popup_preferences_pkey PRIMARY KEY (id);


--
-- TOC entry 4336 (class 2606 OID 27469)
-- Name: user_popup_preferences user_popup_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_popup_preferences
    ADD CONSTRAINT user_popup_preferences_user_id_key UNIQUE (user_id);


--
-- TOC entry 4282 (class 2606 OID 26687)
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 4284 (class 2606 OID 26689)
-- Name: user_sessions user_sessions_token_id_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_id_key UNIQUE (token_id);


--
-- TOC entry 4199 (class 2606 OID 26691)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4201 (class 2606 OID 26693)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4012 (class 1259 OID 26694)
-- Name: idx_accommodation_availability; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_accommodation_availability ON public.accommodation_bookings USING btree (unit_id, check_in_date, check_out_date, status) WHERE ((status)::text <> 'cancelled'::text);


--
-- TOC entry 4013 (class 1259 OID 26695)
-- Name: idx_accommodation_bookings_dates; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_accommodation_bookings_dates ON public.accommodation_bookings USING btree (check_in_date, check_out_date);


--
-- TOC entry 4014 (class 1259 OID 26696)
-- Name: idx_accommodation_bookings_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_accommodation_bookings_status ON public.accommodation_bookings USING btree (status);


--
-- TOC entry 4017 (class 1259 OID 26697)
-- Name: idx_accommodation_units_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_accommodation_units_status ON public.accommodation_units USING btree (status);


--
-- TOC entry 4261 (class 1259 OID 26698)
-- Name: idx_achievements_earned_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_achievements_earned_at ON public.student_achievements USING btree (earned_at);


--
-- TOC entry 4262 (class 1259 OID 26699)
-- Name: idx_achievements_student_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_achievements_student_id ON public.student_achievements USING btree (student_id);


--
-- TOC entry 4347 (class 1259 OID 27663)
-- Name: idx_api_keys_hash; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_api_keys_hash ON public.api_keys USING btree (key_hash) WHERE (is_active = true);


--
-- TOC entry 4348 (class 1259 OID 27664)
-- Name: idx_api_keys_user; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_api_keys_user ON public.api_keys USING btree (user_id, is_active);


--
-- TOC entry 4020 (class 1259 OID 26700)
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- TOC entry 4021 (class 1259 OID 26701)
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- TOC entry 4022 (class 1259 OID 26702)
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- TOC entry 4027 (class 1259 OID 26703)
-- Name: idx_booking_custom_commissions_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_custom_commissions_booking_id ON public.booking_custom_commissions USING btree (booking_id);


--
-- TOC entry 4028 (class 1259 OID 26704)
-- Name: idx_booking_custom_commissions_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_custom_commissions_instructor_id ON public.booking_custom_commissions USING btree (instructor_id);


--
-- TOC entry 4029 (class 1259 OID 26705)
-- Name: idx_booking_custom_commissions_service_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_custom_commissions_service_id ON public.booking_custom_commissions USING btree (service_id);


--
-- TOC entry 4032 (class 1259 OID 26706)
-- Name: idx_booking_equipment_lookup; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_equipment_lookup ON public.booking_equipment USING btree (booking_id, equipment_id);


--
-- TOC entry 4037 (class 1259 OID 26707)
-- Name: idx_booking_participants_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_participants_booking_id ON public.booking_participants USING btree (booking_id);


--
-- TOC entry 4038 (class 1259 OID 26708)
-- Name: idx_booking_participants_customer_package_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_participants_customer_package_id ON public.booking_participants USING btree (customer_package_id);


--
-- TOC entry 4039 (class 1259 OID 26709)
-- Name: idx_booking_participants_primary; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_participants_primary ON public.booking_participants USING btree (booking_id, is_primary);


--
-- TOC entry 4040 (class 1259 OID 26710)
-- Name: idx_booking_participants_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_participants_user_id ON public.booking_participants USING btree (user_id);


--
-- TOC entry 4043 (class 1259 OID 26711)
-- Name: idx_booking_series_dates; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_series_dates ON public.booking_series USING btree (start_date, end_date);


--
-- TOC entry 4044 (class 1259 OID 26712)
-- Name: idx_booking_series_instructor; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_series_instructor ON public.booking_series USING btree (instructor_user_id);


--
-- TOC entry 4045 (class 1259 OID 26713)
-- Name: idx_booking_series_service; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_series_service ON public.booking_series USING btree (service_id);


--
-- TOC entry 4050 (class 1259 OID 26714)
-- Name: idx_booking_series_students_series; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_series_students_series ON public.booking_series_customers USING btree (series_id);


--
-- TOC entry 4051 (class 1259 OID 26715)
-- Name: idx_booking_series_students_student; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_booking_series_students_student ON public.booking_series_customers USING btree (customer_user_id);


--
-- TOC entry 4054 (class 1259 OID 27535)
-- Name: idx_bookings_active_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_active_date ON public.bookings USING btree (date, start_hour) WHERE ((status)::text = ANY ((ARRAY['confirmed'::character varying, 'pending'::character varying])::text[]));


--
-- TOC entry 4055 (class 1259 OID 26716)
-- Name: idx_bookings_amount_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_amount_date ON public.bookings USING btree (final_amount, date) WHERE (final_amount > (0)::numeric);


--
-- TOC entry 4056 (class 1259 OID 26717)
-- Name: idx_bookings_availability_check; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_availability_check ON public.bookings USING btree (instructor_user_id, date, start_hour, duration, status) WHERE ((status)::text <> 'cancelled'::text);


--
-- TOC entry 4057 (class 1259 OID 26718)
-- Name: idx_bookings_calendar_perf; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_calendar_perf ON public.bookings USING btree (date, start_hour, instructor_user_id, status) WHERE ((status)::text = ANY (ARRAY[('confirmed'::character varying)::text, ('pending'::character varying)::text]));


--
-- TOC entry 4058 (class 1259 OID 26719)
-- Name: idx_bookings_checkin_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_checkin_status ON public.bookings USING btree (checkin_status);


--
-- TOC entry 4059 (class 1259 OID 26720)
-- Name: idx_bookings_checkin_time; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_checkin_time ON public.bookings USING btree (checkin_time);


--
-- TOC entry 4060 (class 1259 OID 26721)
-- Name: idx_bookings_checkout_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_checkout_status ON public.bookings USING btree (checkout_status);


--
-- TOC entry 4061 (class 1259 OID 26722)
-- Name: idx_bookings_checkout_time; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_checkout_time ON public.bookings USING btree (checkout_time);


--
-- TOC entry 4062 (class 1259 OID 26723)
-- Name: idx_bookings_complete_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_complete_status ON public.bookings USING btree (date, status, checkin_status, checkout_status);


--
-- TOC entry 4063 (class 1259 OID 26724)
-- Name: idx_bookings_currency; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_currency ON public.bookings USING btree (currency);


--
-- TOC entry 4064 (class 1259 OID 26725)
-- Name: idx_bookings_custom_price; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_custom_price ON public.bookings USING btree (custom_price) WHERE (custom_price IS NOT NULL);


--
-- TOC entry 4065 (class 1259 OID 26726)
-- Name: idx_bookings_customer_package_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_customer_package_id ON public.bookings USING btree (customer_package_id);


--
-- TOC entry 4066 (class 1259 OID 26727)
-- Name: idx_bookings_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_date ON public.bookings USING btree (date);


--
-- TOC entry 4067 (class 1259 OID 27534)
-- Name: idx_bookings_date_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_date_status ON public.bookings USING btree (date, status) WHERE ((status)::text <> 'cancelled'::text);


--
-- TOC entry 4068 (class 1259 OID 26728)
-- Name: idx_bookings_deleted_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_deleted_at ON public.bookings USING btree (deleted_at);


--
-- TOC entry 4069 (class 1259 OID 26729)
-- Name: idx_bookings_instructor; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_instructor ON public.bookings USING btree (instructor_user_id);


--
-- TOC entry 4070 (class 1259 OID 26730)
-- Name: idx_bookings_instructor_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_instructor_date ON public.bookings USING btree (instructor_user_id, date);


--
-- TOC entry 4705 (class 0 OID 0)
-- Dependencies: 4070
-- Name: INDEX idx_bookings_instructor_date; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON INDEX public.idx_bookings_instructor_date IS 'Optimizes instructor schedule queries';


--
-- TOC entry 4071 (class 1259 OID 26731)
-- Name: idx_bookings_instructor_fk; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_instructor_fk ON public.bookings USING btree (instructor_user_id);


--
-- TOC entry 4072 (class 1259 OID 26732)
-- Name: idx_bookings_instructor_schedule; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_instructor_schedule ON public.bookings USING btree (instructor_user_id, date, start_hour);


--
-- TOC entry 4073 (class 1259 OID 26733)
-- Name: idx_bookings_no_overlap; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE UNIQUE INDEX idx_bookings_no_overlap ON public.bookings USING btree (instructor_user_id, date, start_hour, duration) WHERE (((status)::text <> 'cancelled'::text) AND (deleted_at IS NULL));


--
-- TOC entry 4074 (class 1259 OID 26734)
-- Name: idx_bookings_service; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_service ON public.bookings USING btree (service_id, date);


--
-- TOC entry 4075 (class 1259 OID 26735)
-- Name: idx_bookings_service_fk; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_service_fk ON public.bookings USING btree (service_id);


--
-- TOC entry 4076 (class 1259 OID 26736)
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- TOC entry 4077 (class 1259 OID 26737)
-- Name: idx_bookings_status_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_status_date ON public.bookings USING btree (status, date);


--
-- TOC entry 4078 (class 1259 OID 26738)
-- Name: idx_bookings_status_deleted; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_status_deleted ON public.bookings USING btree (status, deleted_at);


--
-- TOC entry 4079 (class 1259 OID 26739)
-- Name: idx_bookings_student; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_student ON public.bookings USING btree (student_user_id);


--
-- TOC entry 4080 (class 1259 OID 26740)
-- Name: idx_bookings_student_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_student_date ON public.bookings USING btree (student_user_id, date);


--
-- TOC entry 4706 (class 0 OID 0)
-- Dependencies: 4080
-- Name: INDEX idx_bookings_student_date; Type: COMMENT; Schema: public; Owner: plannivo
--

COMMENT ON INDEX public.idx_bookings_student_date IS 'Optimizes student booking history queries';


--
-- TOC entry 4081 (class 1259 OID 26741)
-- Name: idx_bookings_student_fk; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_bookings_student_fk ON public.bookings USING btree (student_user_id);


--
-- TOC entry 4086 (class 1259 OID 26742)
-- Name: idx_currency_settings_active; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_currency_settings_active ON public.currency_settings USING btree (is_active);


--
-- TOC entry 4089 (class 1259 OID 26743)
-- Name: idx_customer_packages_customer_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_customer_packages_customer_id ON public.customer_packages USING btree (customer_id);


--
-- TOC entry 4090 (class 1259 OID 26744)
-- Name: idx_customer_packages_expiry; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_customer_packages_expiry ON public.customer_packages USING btree (expiry_date);


--
-- TOC entry 4091 (class 1259 OID 26745)
-- Name: idx_customer_packages_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_customer_packages_status ON public.customer_packages USING btree (status);


--
-- TOC entry 4097 (class 1259 OID 26746)
-- Name: idx_deleted_bookings_backup_deleted_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_deleted_bookings_backup_deleted_at ON public.deleted_bookings_backup USING btree (deleted_at);


--
-- TOC entry 4098 (class 1259 OID 26747)
-- Name: idx_deleted_bookings_backup_scheduled_delete; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_deleted_bookings_backup_scheduled_delete ON public.deleted_bookings_backup USING btree (scheduled_hard_delete_at);


--
-- TOC entry 4101 (class 1259 OID 26748)
-- Name: idx_deleted_entities_scheduled_delete; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_deleted_entities_scheduled_delete ON public.deleted_entities_backup USING btree (scheduled_hard_delete_at);


--
-- TOC entry 4102 (class 1259 OID 26749)
-- Name: idx_deleted_entities_type_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_deleted_entities_type_id ON public.deleted_entities_backup USING btree (entity_type, entity_id);


--
-- TOC entry 4094 (class 1259 OID 26750)
-- Name: idx_deleted_relations_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_deleted_relations_booking_id ON public.deleted_booking_relations_backup USING btree (booking_id);


--
-- TOC entry 4105 (class 1259 OID 26751)
-- Name: idx_earnings_audit_log_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_earnings_audit_log_booking_id ON public.earnings_audit_log USING btree (booking_id);


--
-- TOC entry 4106 (class 1259 OID 26752)
-- Name: idx_earnings_audit_log_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_earnings_audit_log_created_at ON public.earnings_audit_log USING btree (created_at);


--
-- TOC entry 4107 (class 1259 OID 26753)
-- Name: idx_earnings_audit_log_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_earnings_audit_log_instructor_id ON public.earnings_audit_log USING btree (instructor_id);


--
-- TOC entry 4136 (class 1259 OID 26754)
-- Name: idx_earnings_booking; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_earnings_booking ON public.instructor_earnings USING btree (booking_id);


--
-- TOC entry 4137 (class 1259 OID 26755)
-- Name: idx_earnings_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_earnings_date ON public.instructor_earnings USING btree (lesson_date);


--
-- TOC entry 4138 (class 1259 OID 26756)
-- Name: idx_earnings_instructor; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_earnings_instructor ON public.instructor_earnings USING btree (instructor_id);


--
-- TOC entry 4110 (class 1259 OID 26757)
-- Name: idx_equipment_availability; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_equipment_availability ON public.equipment USING btree (availability);


--
-- TOC entry 4111 (class 1259 OID 26758)
-- Name: idx_equipment_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_equipment_type ON public.equipment USING btree (type);


--
-- TOC entry 4116 (class 1259 OID 26759)
-- Name: idx_feedback_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_feedback_booking_id ON public.feedback USING btree (booking_id);


--
-- TOC entry 4117 (class 1259 OID 26760)
-- Name: idx_feedback_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at);


--
-- TOC entry 4118 (class 1259 OID 26761)
-- Name: idx_feedback_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_feedback_instructor_id ON public.feedback USING btree (instructor_id);


--
-- TOC entry 4119 (class 1259 OID 26762)
-- Name: idx_feedback_student_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_feedback_student_id ON public.feedback USING btree (student_id);


--
-- TOC entry 4122 (class 1259 OID 26763)
-- Name: idx_financial_events_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_financial_events_created_at ON public.financial_events USING btree (created_at);


--
-- TOC entry 4123 (class 1259 OID 26764)
-- Name: idx_financial_events_entity; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_financial_events_entity ON public.financial_events USING btree (entity_type, entity_id);


--
-- TOC entry 4124 (class 1259 OID 26765)
-- Name: idx_financial_events_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_financial_events_type ON public.financial_events USING btree (event_type);


--
-- TOC entry 4125 (class 1259 OID 26766)
-- Name: idx_financial_events_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_financial_events_user_id ON public.financial_events USING btree (user_id);


--
-- TOC entry 4292 (class 1259 OID 27225)
-- Name: idx_financial_settings_active; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_financial_settings_active ON public.financial_settings USING btree (active);


--
-- TOC entry 4293 (class 1259 OID 27224)
-- Name: idx_financial_settings_effective_from; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_financial_settings_effective_from ON public.financial_settings USING btree (effective_from DESC);


--
-- TOC entry 4296 (class 1259 OID 27252)
-- Name: idx_fs_overrides_active; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_fs_overrides_active ON public.financial_settings_overrides USING btree (active);


--
-- TOC entry 4297 (class 1259 OID 27250)
-- Name: idx_fs_overrides_scope; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_fs_overrides_scope ON public.financial_settings_overrides USING btree (scope_type, scope_value);


--
-- TOC entry 4298 (class 1259 OID 27251)
-- Name: idx_fs_overrides_settings; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_fs_overrides_settings ON public.financial_settings_overrides USING btree (settings_id);


--
-- TOC entry 4126 (class 1259 OID 26767)
-- Name: idx_instructor_commission_history_active; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_commission_history_active ON public.instructor_commission_history USING btree (is_active) WHERE (is_active = true);


--
-- TOC entry 4127 (class 1259 OID 26768)
-- Name: idx_instructor_commission_history_effective_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_commission_history_effective_date ON public.instructor_commission_history USING btree (effective_date);


--
-- TOC entry 4128 (class 1259 OID 26769)
-- Name: idx_instructor_commission_history_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_commission_history_instructor_id ON public.instructor_commission_history USING btree (instructor_id);


--
-- TOC entry 4131 (class 1259 OID 26770)
-- Name: idx_instructor_default_commissions_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_default_commissions_instructor_id ON public.instructor_default_commissions USING btree (instructor_id);


--
-- TOC entry 4146 (class 1259 OID 26771)
-- Name: idx_instructor_rate_history_effective_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_rate_history_effective_date ON public.instructor_rate_history USING btree (effective_date);


--
-- TOC entry 4147 (class 1259 OID 26772)
-- Name: idx_instructor_rate_history_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_rate_history_instructor_id ON public.instructor_rate_history USING btree (instructor_id);


--
-- TOC entry 4361 (class 1259 OID 35961)
-- Name: idx_instructor_ratings_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_ratings_created_at ON public.instructor_ratings USING btree (created_at DESC);


--
-- TOC entry 4362 (class 1259 OID 35959)
-- Name: idx_instructor_ratings_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_ratings_instructor_id ON public.instructor_ratings USING btree (instructor_id);


--
-- TOC entry 4363 (class 1259 OID 35960)
-- Name: idx_instructor_ratings_student_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_ratings_student_id ON public.instructor_ratings USING btree (student_id);


--
-- TOC entry 4150 (class 1259 OID 26773)
-- Name: idx_instructor_service_commissions_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_service_commissions_instructor_id ON public.instructor_service_commissions USING btree (instructor_id);


--
-- TOC entry 4151 (class 1259 OID 26774)
-- Name: idx_instructor_service_commissions_service_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_service_commissions_service_id ON public.instructor_service_commissions USING btree (service_id);


--
-- TOC entry 4156 (class 1259 OID 26775)
-- Name: idx_instructor_services_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_services_instructor_id ON public.instructor_services USING btree (instructor_id);


--
-- TOC entry 4157 (class 1259 OID 26776)
-- Name: idx_instructor_services_service_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_services_service_id ON public.instructor_services USING btree (service_id);


--
-- TOC entry 4368 (class 1259 OID 35992)
-- Name: idx_instructor_student_notes_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_student_notes_booking_id ON public.instructor_student_notes USING btree (booking_id);


--
-- TOC entry 4369 (class 1259 OID 35991)
-- Name: idx_instructor_student_notes_instructor_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_student_notes_instructor_id ON public.instructor_student_notes USING btree (instructor_id);


--
-- TOC entry 4370 (class 1259 OID 35990)
-- Name: idx_instructor_student_notes_student_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_instructor_student_notes_student_id ON public.instructor_student_notes USING btree (student_id);


--
-- TOC entry 4166 (class 1259 OID 26777)
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at);


--
-- TOC entry 4167 (class 1259 OID 26778)
-- Name: idx_notifications_read_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (read_at);


--
-- TOC entry 4168 (class 1259 OID 26779)
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- TOC entry 4169 (class 1259 OID 26780)
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- TOC entry 4174 (class 1259 OID 26781)
-- Name: idx_payment_intents_booking_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payment_intents_booking_id ON public.payment_intents USING btree (booking_id);


--
-- TOC entry 4175 (class 1259 OID 26782)
-- Name: idx_payment_intents_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payment_intents_created_at ON public.payment_intents USING btree (created_at);


--
-- TOC entry 4176 (class 1259 OID 26783)
-- Name: idx_payment_intents_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payment_intents_status ON public.payment_intents USING btree (status);


--
-- TOC entry 4177 (class 1259 OID 26784)
-- Name: idx_payment_intents_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payment_intents_user_id ON public.payment_intents USING btree (user_id);


--
-- TOC entry 4141 (class 1259 OID 26785)
-- Name: idx_payroll_instructor; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payroll_instructor ON public.instructor_payroll USING btree (instructor_id);


--
-- TOC entry 4142 (class 1259 OID 26786)
-- Name: idx_payroll_period; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payroll_period ON public.instructor_payroll USING btree (period_start_date, period_end_date);


--
-- TOC entry 4143 (class 1259 OID 26787)
-- Name: idx_payroll_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_payroll_status ON public.instructor_payroll USING btree (status);


--
-- TOC entry 4326 (class 1259 OID 27521)
-- Name: idx_popup_analytics_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_analytics_date ON public.popup_analytics USING btree (date_recorded);


--
-- TOC entry 4327 (class 1259 OID 27520)
-- Name: idx_popup_analytics_popup_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_analytics_popup_id ON public.popup_analytics USING btree (popup_id);


--
-- TOC entry 4304 (class 1259 OID 27509)
-- Name: idx_popup_configurations_active; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_configurations_active ON public.popup_configurations USING btree (is_active);


--
-- TOC entry 4305 (class 1259 OID 27688)
-- Name: idx_popup_configurations_config; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_configurations_config ON public.popup_configurations USING gin (config);


--
-- TOC entry 4306 (class 1259 OID 27511)
-- Name: idx_popup_configurations_priority; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_configurations_priority ON public.popup_configurations USING btree (priority DESC);


--
-- TOC entry 4307 (class 1259 OID 27510)
-- Name: idx_popup_configurations_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_configurations_type ON public.popup_configurations USING btree (popup_type);


--
-- TOC entry 4310 (class 1259 OID 27513)
-- Name: idx_popup_content_blocks_order; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_content_blocks_order ON public.popup_content_blocks USING btree (popup_id, step_number, display_order);


--
-- TOC entry 4311 (class 1259 OID 27512)
-- Name: idx_popup_content_blocks_popup_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_content_blocks_popup_id ON public.popup_content_blocks USING btree (popup_id);


--
-- TOC entry 4337 (class 1259 OID 27524)
-- Name: idx_popup_media_assets_active; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_media_assets_active ON public.popup_media_assets USING btree (is_active);


--
-- TOC entry 4338 (class 1259 OID 27523)
-- Name: idx_popup_media_assets_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_media_assets_type ON public.popup_media_assets USING btree (file_type);


--
-- TOC entry 4314 (class 1259 OID 27514)
-- Name: idx_popup_targeting_rules_popup_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_targeting_rules_popup_id ON public.popup_targeting_rules USING btree (popup_id);


--
-- TOC entry 4315 (class 1259 OID 27515)
-- Name: idx_popup_targeting_rules_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_targeting_rules_type ON public.popup_targeting_rules USING btree (rule_type);


--
-- TOC entry 4341 (class 1259 OID 27526)
-- Name: idx_popup_templates_system; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_templates_system ON public.popup_templates USING btree (is_system_template);


--
-- TOC entry 4342 (class 1259 OID 27525)
-- Name: idx_popup_templates_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_templates_type ON public.popup_templates USING btree (template_type);


--
-- TOC entry 4318 (class 1259 OID 27519)
-- Name: idx_popup_user_interactions_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_user_interactions_created_at ON public.popup_user_interactions USING btree (created_at);


--
-- TOC entry 4319 (class 1259 OID 27516)
-- Name: idx_popup_user_interactions_popup_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_user_interactions_popup_id ON public.popup_user_interactions USING btree (popup_id);


--
-- TOC entry 4320 (class 1259 OID 27518)
-- Name: idx_popup_user_interactions_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_user_interactions_type ON public.popup_user_interactions USING btree (interaction_type);


--
-- TOC entry 4321 (class 1259 OID 27517)
-- Name: idx_popup_user_interactions_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_popup_user_interactions_user_id ON public.popup_user_interactions USING btree (user_id);


--
-- TOC entry 4202 (class 1259 OID 26788)
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_products_category ON public.products USING btree (category);


--
-- TOC entry 4203 (class 1259 OID 26789)
-- Name: idx_products_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_products_created_at ON public.products USING btree (created_at);


--
-- TOC entry 4204 (class 1259 OID 26790)
-- Name: idx_products_search; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_products_search ON public.products USING gin (to_tsvector('english'::regconfig, (((((name)::text || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || (COALESCE(brand, ''::character varying))::text)));


--
-- TOC entry 4205 (class 1259 OID 26791)
-- Name: idx_products_sku; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_products_sku ON public.products USING btree (sku);


--
-- TOC entry 4206 (class 1259 OID 26792)
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- TOC entry 4207 (class 1259 OID 26793)
-- Name: idx_products_stock; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_products_stock ON public.products USING btree (stock_quantity);


--
-- TOC entry 4212 (class 1259 OID 26794)
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);


--
-- TOC entry 4357 (class 1259 OID 35927)
-- Name: idx_recommended_products_priority; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_recommended_products_priority ON public.recommended_products USING btree (priority DESC, created_at DESC);


--
-- TOC entry 4358 (class 1259 OID 35926)
-- Name: idx_recommended_products_unique_role; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE UNIQUE INDEX idx_recommended_products_unique_role ON public.recommended_products USING btree (product_id, recommended_for_role);


--
-- TOC entry 4221 (class 1259 OID 26795)
-- Name: idx_rentals_equipment_ids; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_rentals_equipment_ids ON public.rentals USING gin (equipment_ids);


--
-- TOC entry 4222 (class 1259 OID 26796)
-- Name: idx_rentals_rental_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_rentals_rental_date ON public.rentals USING btree (rental_date);


--
-- TOC entry 4223 (class 1259 OID 26797)
-- Name: idx_rentals_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_rentals_status ON public.rentals USING btree (status);


--
-- TOC entry 4224 (class 1259 OID 26798)
-- Name: idx_rentals_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_rentals_user_id ON public.rentals USING btree (user_id);


--
-- TOC entry 4299 (class 1259 OID 27280)
-- Name: idx_revenue_items_fulfillment_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_revenue_items_fulfillment_date ON public.revenue_items USING btree (fulfillment_date);


--
-- TOC entry 4300 (class 1259 OID 27281)
-- Name: idx_revenue_items_service; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_revenue_items_service ON public.revenue_items USING btree (service_type, service_id);


--
-- TOC entry 4233 (class 1259 OID 27199)
-- Name: idx_security_audit_action; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_security_audit_action ON public.security_audit USING btree (action);


--
-- TOC entry 4234 (class 1259 OID 27200)
-- Name: idx_security_audit_created_at; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_security_audit_created_at ON public.security_audit USING btree (created_at);


--
-- TOC entry 4235 (class 1259 OID 27659)
-- Name: idx_security_audit_resource; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_security_audit_resource ON public.security_audit USING btree (resource_type, resource_id);


--
-- TOC entry 4236 (class 1259 OID 27658)
-- Name: idx_security_audit_user_action; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_security_audit_user_action ON public.security_audit USING btree (user_id, action, created_at);


--
-- TOC entry 4237 (class 1259 OID 27198)
-- Name: idx_security_audit_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_security_audit_user_id ON public.security_audit USING btree (user_id);


--
-- TOC entry 4244 (class 1259 OID 27285)
-- Name: idx_service_packages_discipline_tag; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_service_packages_discipline_tag ON public.service_packages USING btree (discipline_tag);


--
-- TOC entry 4245 (class 1259 OID 27286)
-- Name: idx_service_packages_lesson_category_tag; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_service_packages_lesson_category_tag ON public.service_packages USING btree (lesson_category_tag);


--
-- TOC entry 4246 (class 1259 OID 27287)
-- Name: idx_service_packages_level_tag; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_service_packages_level_tag ON public.service_packages USING btree (level_tag);


--
-- TOC entry 4182 (class 1259 OID 26799)
-- Name: idx_services_category_level; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_services_category_level ON public.services USING btree (category, level);


--
-- TOC entry 4183 (class 1259 OID 26800)
-- Name: idx_services_currency; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_services_currency ON public.services USING btree (currency);


--
-- TOC entry 4184 (class 1259 OID 27282)
-- Name: idx_services_discipline_tag; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_services_discipline_tag ON public.services USING btree (discipline_tag);


--
-- TOC entry 4185 (class 1259 OID 27283)
-- Name: idx_services_lesson_category_tag; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_services_lesson_category_tag ON public.services USING btree (lesson_category_tag);


--
-- TOC entry 4186 (class 1259 OID 27284)
-- Name: idx_services_level_tag; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_services_level_tag ON public.services USING btree (level_tag);


--
-- TOC entry 4187 (class 1259 OID 26801)
-- Name: idx_services_type_duration; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_services_type_duration ON public.services USING btree (service_type, duration);


--
-- TOC entry 4353 (class 1259 OID 35900)
-- Name: idx_student_support_requests_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_student_support_requests_status ON public.student_support_requests USING btree (status);


--
-- TOC entry 4354 (class 1259 OID 35899)
-- Name: idx_student_support_requests_student_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_student_support_requests_student_id ON public.student_support_requests USING btree (student_id);


--
-- TOC entry 4269 (class 1259 OID 26802)
-- Name: idx_transactions_booking; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_booking ON public.transactions USING btree (booking_id);


--
-- TOC entry 4270 (class 1259 OID 26803)
-- Name: idx_transactions_rental; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_rental ON public.transactions USING btree (rental_id);


--
-- TOC entry 4271 (class 1259 OID 27548)
-- Name: idx_transactions_status_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_status_date ON public.transactions USING btree (status, transaction_date) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]));


--
-- TOC entry 4272 (class 1259 OID 26804)
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);


--
-- TOC entry 4273 (class 1259 OID 27547)
-- Name: idx_transactions_type_status_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_type_status_date ON public.transactions USING btree (type, status, transaction_date);


--
-- TOC entry 4274 (class 1259 OID 26805)
-- Name: idx_transactions_user; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);


--
-- TOC entry 4275 (class 1259 OID 27546)
-- Name: idx_transactions_user_date; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_transactions_user_date ON public.transactions USING btree (user_id, transaction_date);


--
-- TOC entry 4373 (class 1259 OID 36012)
-- Name: idx_user_consents_terms_version; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_user_consents_terms_version ON public.user_consents USING btree (terms_version);


--
-- TOC entry 4332 (class 1259 OID 27522)
-- Name: idx_user_popup_preferences_user_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_user_popup_preferences_user_id ON public.user_popup_preferences USING btree (user_id);


--
-- TOC entry 4278 (class 1259 OID 27662)
-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at) WHERE (is_active = true);


--
-- TOC entry 4279 (class 1259 OID 27661)
-- Name: idx_user_sessions_token; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_user_sessions_token ON public.user_sessions USING btree (token_id) WHERE (is_active = true);


--
-- TOC entry 4280 (class 1259 OID 27660)
-- Name: idx_user_sessions_user; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id, is_active);


--
-- TOC entry 4190 (class 1259 OID 26806)
-- Name: idx_users_account_status; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_account_status ON public.users USING btree (account_locked, account_expired_at);


--
-- TOC entry 4191 (class 1259 OID 26807)
-- Name: idx_users_active_role; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_active_role ON public.users USING btree (account_status, role_id) WHERE ((account_status)::text = 'active'::text);


--
-- TOC entry 4192 (class 1259 OID 26808)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 4193 (class 1259 OID 26809)
-- Name: idx_users_failed_logins; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_failed_logins ON public.users USING btree (failed_login_attempts, last_failed_login_at);


--
-- TOC entry 4194 (class 1259 OID 26810)
-- Name: idx_users_hourly_rate; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_hourly_rate ON public.users USING btree (hourly_rate) WHERE (hourly_rate IS NOT NULL);


--
-- TOC entry 4195 (class 1259 OID 26811)
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_role ON public.users USING btree (role_id);


--
-- TOC entry 4196 (class 1259 OID 26812)
-- Name: idx_users_role_id; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);


--
-- TOC entry 4197 (class 1259 OID 26813)
-- Name: idx_users_two_factor; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX idx_users_two_factor ON public.users USING btree (two_factor_enabled) WHERE (two_factor_enabled = true);


--
-- TOC entry 4285 (class 1259 OID 27545)
-- Name: schema_migrations_filename_idx; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE UNIQUE INDEX schema_migrations_filename_idx ON public.schema_migrations USING btree (filename);


--
-- TOC entry 4349 (class 1259 OID 27684)
-- Name: spare_parts_orders_created_at_idx; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX spare_parts_orders_created_at_idx ON public.spare_parts_orders USING btree (created_at DESC);


--
-- TOC entry 4352 (class 1259 OID 27683)
-- Name: spare_parts_orders_status_idx; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE INDEX spare_parts_orders_status_idx ON public.spare_parts_orders USING btree (status);


--
-- TOC entry 4303 (class 1259 OID 27279)
-- Name: ux_revenue_items_entity; Type: INDEX; Schema: public; Owner: plannivo
--

CREATE UNIQUE INDEX ux_revenue_items_entity ON public.revenue_items USING btree (entity_type, entity_id);


--
-- TOC entry 4477 (class 2620 OID 35994)
-- Name: notifications notifications_notify_trigger; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER notifications_notify_trigger AFTER INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notify_notification_event();


--
-- TOC entry 4490 (class 2620 OID 35879)
-- Name: popup_configurations sync_popup_config_trigger; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER sync_popup_config_trigger BEFORE INSERT OR UPDATE ON public.popup_configurations FOR EACH ROW EXECUTE FUNCTION public.sync_popup_config();


--
-- TOC entry 4495 (class 2620 OID 27686)
-- Name: spare_parts_orders trg_spare_parts_orders_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER trg_spare_parts_orders_updated_at BEFORE UPDATE ON public.spare_parts_orders FOR EACH ROW EXECUTE FUNCTION public.set_spare_parts_orders_updated_at();


--
-- TOC entry 4480 (class 2620 OID 26814)
-- Name: products trigger_products_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER trigger_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_products_updated_at();


--
-- TOC entry 4494 (class 2620 OID 27665)
-- Name: api_keys update_api_keys_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4472 (class 2620 OID 26815)
-- Name: booking_series update_booking_series_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_booking_series_updated_at BEFORE UPDATE ON public.booking_series FOR EACH ROW EXECUTE FUNCTION public.update_booking_series_updated_at();


--
-- TOC entry 4473 (class 2620 OID 26816)
-- Name: customer_packages update_customer_packages_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_customer_packages_updated_at BEFORE UPDATE ON public.customer_packages FOR EACH ROW EXECUTE FUNCTION public.update_customer_packages_updated_at();


--
-- TOC entry 4474 (class 2620 OID 26817)
-- Name: equipment update_equipment_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_equipment_timestamp BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4475 (class 2620 OID 26818)
-- Name: instructor_earnings update_instructor_earnings_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_instructor_earnings_timestamp BEFORE UPDATE ON public.instructor_earnings FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4476 (class 2620 OID 26819)
-- Name: instructor_payroll update_instructor_payroll_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_instructor_payroll_timestamp BEFORE UPDATE ON public.instructor_payroll FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4492 (class 2620 OID 27529)
-- Name: popup_analytics update_popup_analytics_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_popup_analytics_updated_at BEFORE UPDATE ON public.popup_analytics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4491 (class 2620 OID 27528)
-- Name: popup_configurations update_popup_configurations_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_popup_configurations_updated_at BEFORE UPDATE ON public.popup_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4481 (class 2620 OID 26820)
-- Name: rentals update_rentals_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_rentals_timestamp BEFORE UPDATE ON public.rentals FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4482 (class 2620 OID 26821)
-- Name: roles update_roles_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_roles_timestamp BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4483 (class 2620 OID 26822)
-- Name: service_packages update_service_packages_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_service_packages_timestamp BEFORE UPDATE ON public.service_packages FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4478 (class 2620 OID 26823)
-- Name: services update_services_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_services_timestamp BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4484 (class 2620 OID 26824)
-- Name: settings update_settings_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_settings_timestamp BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4485 (class 2620 OID 26825)
-- Name: skill_levels update_skill_levels_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_skill_levels_timestamp BEFORE UPDATE ON public.skill_levels FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4486 (class 2620 OID 26826)
-- Name: skills update_skills_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_skills_timestamp BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4487 (class 2620 OID 26827)
-- Name: student_accounts update_student_accounts_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_student_accounts_timestamp BEFORE UPDATE ON public.student_accounts FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4488 (class 2620 OID 26828)
-- Name: student_progress update_student_progress_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_student_progress_timestamp BEFORE UPDATE ON public.student_progress FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4489 (class 2620 OID 26829)
-- Name: transactions update_transactions_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_transactions_timestamp BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4493 (class 2620 OID 27530)
-- Name: user_popup_preferences update_user_popup_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_user_popup_preferences_updated_at BEFORE UPDATE ON public.user_popup_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4479 (class 2620 OID 26830)
-- Name: users update_users_timestamp; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- TOC entry 4496 (class 2620 OID 36025)
-- Name: user_consents user_consents_set_updated_at; Type: TRIGGER; Schema: public; Owner: plannivo
--

CREATE TRIGGER user_consents_set_updated_at BEFORE UPDATE ON public.user_consents FOR EACH ROW EXECUTE FUNCTION public.set_user_consents_updated_at();


--
-- TOC entry 4376 (class 2606 OID 26831)
-- Name: accommodation_bookings accommodation_bookings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.accommodation_bookings
    ADD CONSTRAINT accommodation_bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 4377 (class 2606 OID 26836)
-- Name: accommodation_bookings accommodation_bookings_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.accommodation_bookings
    ADD CONSTRAINT accommodation_bookings_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.users(id);


--
-- TOC entry 4378 (class 2606 OID 26841)
-- Name: accommodation_bookings accommodation_bookings_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.accommodation_bookings
    ADD CONSTRAINT accommodation_bookings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.accommodation_units(id);


--
-- TOC entry 4379 (class 2606 OID 26846)
-- Name: accommodation_bookings accommodation_bookings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.accommodation_bookings
    ADD CONSTRAINT accommodation_bookings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 4461 (class 2606 OID 27653)
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4380 (class 2606 OID 26851)
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4381 (class 2606 OID 26856)
-- Name: booking_custom_commissions booking_custom_commissions_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_custom_commissions
    ADD CONSTRAINT booking_custom_commissions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- TOC entry 4382 (class 2606 OID 26861)
-- Name: booking_custom_commissions booking_custom_commissions_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_custom_commissions
    ADD CONSTRAINT booking_custom_commissions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4383 (class 2606 OID 26866)
-- Name: booking_custom_commissions booking_custom_commissions_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_custom_commissions
    ADD CONSTRAINT booking_custom_commissions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- TOC entry 4384 (class 2606 OID 26871)
-- Name: booking_equipment booking_equipment_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_equipment
    ADD CONSTRAINT booking_equipment_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- TOC entry 4385 (class 2606 OID 26876)
-- Name: booking_equipment booking_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_equipment
    ADD CONSTRAINT booking_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- TOC entry 4386 (class 2606 OID 26881)
-- Name: booking_participants booking_participants_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- TOC entry 4387 (class 2606 OID 26886)
-- Name: booking_participants booking_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4388 (class 2606 OID 26891)
-- Name: booking_series booking_series_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series
    ADD CONSTRAINT booking_series_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 4389 (class 2606 OID 26896)
-- Name: booking_series booking_series_instructor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series
    ADD CONSTRAINT booking_series_instructor_user_id_fkey FOREIGN KEY (instructor_user_id) REFERENCES public.users(id);


--
-- TOC entry 4390 (class 2606 OID 26901)
-- Name: booking_series booking_series_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series
    ADD CONSTRAINT booking_series_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- TOC entry 4391 (class 2606 OID 26906)
-- Name: booking_series_customers booking_series_students_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series_customers
    ADD CONSTRAINT booking_series_students_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.booking_series(id) ON DELETE CASCADE;


--
-- TOC entry 4392 (class 2606 OID 26911)
-- Name: booking_series_customers booking_series_students_student_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.booking_series_customers
    ADD CONSTRAINT booking_series_students_student_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES public.users(id);


--
-- TOC entry 4393 (class 2606 OID 26916)
-- Name: bookings bookings_customer_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_package_id_fkey FOREIGN KEY (customer_package_id) REFERENCES public.customer_packages(id);


--
-- TOC entry 4394 (class 2606 OID 26921)
-- Name: bookings bookings_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- TOC entry 4395 (class 2606 OID 26926)
-- Name: bookings bookings_instructor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_instructor_user_id_fkey FOREIGN KEY (instructor_user_id) REFERENCES public.users(id);


--
-- TOC entry 4396 (class 2606 OID 26931)
-- Name: bookings bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- TOC entry 4397 (class 2606 OID 26936)
-- Name: bookings bookings_student_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(id);


--
-- TOC entry 4400 (class 2606 OID 26941)
-- Name: customer_packages customer_packages_service_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.customer_packages
    ADD CONSTRAINT customer_packages_service_package_id_fkey FOREIGN KEY (service_package_id) REFERENCES public.service_packages(id);


--
-- TOC entry 4401 (class 2606 OID 26946)
-- Name: earnings_audit_log earnings_audit_log_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.earnings_audit_log
    ADD CONSTRAINT earnings_audit_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- TOC entry 4402 (class 2606 OID 26951)
-- Name: earnings_audit_log earnings_audit_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.earnings_audit_log
    ADD CONSTRAINT earnings_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- TOC entry 4403 (class 2606 OID 26956)
-- Name: earnings_audit_log earnings_audit_log_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.earnings_audit_log
    ADD CONSTRAINT earnings_audit_log_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- TOC entry 4404 (class 2606 OID 26961)
-- Name: feedback feedback_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- TOC entry 4405 (class 2606 OID 26966)
-- Name: feedback feedback_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4406 (class 2606 OID 26971)
-- Name: feedback feedback_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4407 (class 2606 OID 26976)
-- Name: financial_events financial_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_events
    ADD CONSTRAINT financial_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 4408 (class 2606 OID 26981)
-- Name: financial_events financial_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_events
    ADD CONSTRAINT financial_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4447 (class 2606 OID 27219)
-- Name: financial_settings financial_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings
    ADD CONSTRAINT financial_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4448 (class 2606 OID 27245)
-- Name: financial_settings_overrides financial_settings_overrides_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings_overrides
    ADD CONSTRAINT financial_settings_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4449 (class 2606 OID 27240)
-- Name: financial_settings_overrides financial_settings_overrides_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.financial_settings_overrides
    ADD CONSTRAINT financial_settings_overrides_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES public.financial_settings(id) ON DELETE CASCADE;


--
-- TOC entry 4398 (class 2606 OID 26986)
-- Name: bookings fk_bookings_currency; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_currency FOREIGN KEY (currency) REFERENCES public.currency_settings(currency_code);


--
-- TOC entry 4399 (class 2606 OID 26991)
-- Name: bookings fk_bookings_customer; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_user_id) REFERENCES public.users(id);


--
-- TOC entry 4437 (class 2606 OID 26996)
-- Name: service_packages fk_packages_currency; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.service_packages
    ADD CONSTRAINT fk_packages_currency FOREIGN KEY (currency) REFERENCES public.currency_settings(currency_code);


--
-- TOC entry 4429 (class 2606 OID 27001)
-- Name: products fk_products_created_by; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 4430 (class 2606 OID 27006)
-- Name: products fk_products_currency; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_currency FOREIGN KEY (currency) REFERENCES public.currency_settings(currency_code);


--
-- TOC entry 4431 (class 2606 OID 27011)
-- Name: products fk_products_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 4426 (class 2606 OID 27016)
-- Name: services fk_services_currency; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT fk_services_currency FOREIGN KEY (currency) REFERENCES public.currency_settings(currency_code);


--
-- TOC entry 4409 (class 2606 OID 27021)
-- Name: instructor_commission_history instructor_commission_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_commission_history
    ADD CONSTRAINT instructor_commission_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- TOC entry 4410 (class 2606 OID 27026)
-- Name: instructor_commission_history instructor_commission_history_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_commission_history
    ADD CONSTRAINT instructor_commission_history_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4411 (class 2606 OID 27031)
-- Name: instructor_default_commissions instructor_default_commissions_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_default_commissions
    ADD CONSTRAINT instructor_default_commissions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4412 (class 2606 OID 27036)
-- Name: instructor_earnings instructor_earnings_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_earnings
    ADD CONSTRAINT instructor_earnings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- TOC entry 4413 (class 2606 OID 27041)
-- Name: instructor_earnings instructor_earnings_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_earnings
    ADD CONSTRAINT instructor_earnings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- TOC entry 4414 (class 2606 OID 27046)
-- Name: instructor_earnings instructor_earnings_payroll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_earnings
    ADD CONSTRAINT instructor_earnings_payroll_id_fkey FOREIGN KEY (payroll_id) REFERENCES public.instructor_payroll(id);


--
-- TOC entry 4415 (class 2606 OID 27051)
-- Name: instructor_payroll instructor_payroll_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_payroll
    ADD CONSTRAINT instructor_payroll_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- TOC entry 4416 (class 2606 OID 27056)
-- Name: instructor_rate_history instructor_rate_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_rate_history
    ADD CONSTRAINT instructor_rate_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- TOC entry 4417 (class 2606 OID 27061)
-- Name: instructor_rate_history instructor_rate_history_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_rate_history
    ADD CONSTRAINT instructor_rate_history_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4465 (class 2606 OID 35944)
-- Name: instructor_ratings instructor_ratings_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_ratings
    ADD CONSTRAINT instructor_ratings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- TOC entry 4466 (class 2606 OID 35954)
-- Name: instructor_ratings instructor_ratings_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_ratings
    ADD CONSTRAINT instructor_ratings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4467 (class 2606 OID 35949)
-- Name: instructor_ratings instructor_ratings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_ratings
    ADD CONSTRAINT instructor_ratings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4418 (class 2606 OID 27066)
-- Name: instructor_service_commissions instructor_service_commissions_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_service_commissions
    ADD CONSTRAINT instructor_service_commissions_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4419 (class 2606 OID 27071)
-- Name: instructor_service_commissions instructor_service_commissions_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_service_commissions
    ADD CONSTRAINT instructor_service_commissions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- TOC entry 4420 (class 2606 OID 27076)
-- Name: instructor_services instructor_services_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_services
    ADD CONSTRAINT instructor_services_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4421 (class 2606 OID 27081)
-- Name: instructor_services instructor_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_services
    ADD CONSTRAINT instructor_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- TOC entry 4468 (class 2606 OID 35985)
-- Name: instructor_student_notes instructor_student_notes_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_student_notes
    ADD CONSTRAINT instructor_student_notes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- TOC entry 4469 (class 2606 OID 35975)
-- Name: instructor_student_notes instructor_student_notes_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_student_notes
    ADD CONSTRAINT instructor_student_notes_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4470 (class 2606 OID 35980)
-- Name: instructor_student_notes instructor_student_notes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.instructor_student_notes
    ADD CONSTRAINT instructor_student_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4422 (class 2606 OID 27086)
-- Name: notification_settings notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4423 (class 2606 OID 27091)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4424 (class 2606 OID 27096)
-- Name: payment_intents payment_intents_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- TOC entry 4425 (class 2606 OID 27101)
-- Name: payment_intents payment_intents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4457 (class 2606 OID 27447)
-- Name: popup_analytics popup_analytics_popup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_analytics
    ADD CONSTRAINT popup_analytics_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES public.popup_configurations(id) ON DELETE CASCADE;


--
-- TOC entry 4451 (class 2606 OID 27354)
-- Name: popup_configurations popup_configurations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_configurations
    ADD CONSTRAINT popup_configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 4452 (class 2606 OID 27359)
-- Name: popup_configurations popup_configurations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_configurations
    ADD CONSTRAINT popup_configurations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- TOC entry 4453 (class 2606 OID 27377)
-- Name: popup_content_blocks popup_content_blocks_popup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_content_blocks
    ADD CONSTRAINT popup_content_blocks_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES public.popup_configurations(id) ON DELETE CASCADE;


--
-- TOC entry 4459 (class 2606 OID 27486)
-- Name: popup_media_assets popup_media_assets_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_media_assets
    ADD CONSTRAINT popup_media_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- TOC entry 4454 (class 2606 OID 27394)
-- Name: popup_targeting_rules popup_targeting_rules_popup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_targeting_rules
    ADD CONSTRAINT popup_targeting_rules_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES public.popup_configurations(id) ON DELETE CASCADE;


--
-- TOC entry 4460 (class 2606 OID 27504)
-- Name: popup_templates popup_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_templates
    ADD CONSTRAINT popup_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 4455 (class 2606 OID 27412)
-- Name: popup_user_interactions popup_user_interactions_popup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_user_interactions
    ADD CONSTRAINT popup_user_interactions_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES public.popup_configurations(id) ON DELETE CASCADE;


--
-- TOC entry 4456 (class 2606 OID 27417)
-- Name: popup_user_interactions popup_user_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.popup_user_interactions
    ADD CONSTRAINT popup_user_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4432 (class 2606 OID 27106)
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4463 (class 2606 OID 35921)
-- Name: recommended_products recommended_products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.recommended_products
    ADD CONSTRAINT recommended_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4464 (class 2606 OID 35916)
-- Name: recommended_products recommended_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.recommended_products
    ADD CONSTRAINT recommended_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 4433 (class 2606 OID 27111)
-- Name: refunds refunds_payment_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE CASCADE;


--
-- TOC entry 4435 (class 2606 OID 27116)
-- Name: rental_equipment rental_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT rental_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- TOC entry 4436 (class 2606 OID 27121)
-- Name: rental_equipment rental_equipment_rental_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.rental_equipment
    ADD CONSTRAINT rental_equipment_rental_id_fkey FOREIGN KEY (rental_id) REFERENCES public.rentals(id) ON DELETE CASCADE;


--
-- TOC entry 4434 (class 2606 OID 27126)
-- Name: rentals rentals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT rentals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4450 (class 2606 OID 27274)
-- Name: revenue_items revenue_items_settings_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.revenue_items
    ADD CONSTRAINT revenue_items_settings_version_id_fkey FOREIGN KEY (settings_version_id) REFERENCES public.financial_settings(id);


--
-- TOC entry 4427 (class 2606 OID 27131)
-- Name: services services_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.service_packages(id);


--
-- TOC entry 4438 (class 2606 OID 27136)
-- Name: skills skills_skill_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_skill_level_id_fkey FOREIGN KEY (skill_level_id) REFERENCES public.skill_levels(id);


--
-- TOC entry 4439 (class 2606 OID 27141)
-- Name: student_accounts student_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_accounts
    ADD CONSTRAINT student_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4440 (class 2606 OID 27146)
-- Name: student_achievements student_achievements_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_achievements
    ADD CONSTRAINT student_achievements_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4441 (class 2606 OID 27151)
-- Name: student_progress student_progress_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_progress
    ADD CONSTRAINT student_progress_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- TOC entry 4442 (class 2606 OID 27156)
-- Name: student_progress student_progress_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_progress
    ADD CONSTRAINT student_progress_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id);


--
-- TOC entry 4443 (class 2606 OID 27161)
-- Name: student_progress student_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_progress
    ADD CONSTRAINT student_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- TOC entry 4462 (class 2606 OID 35894)
-- Name: student_support_requests student_support_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.student_support_requests
    ADD CONSTRAINT student_support_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4444 (class 2606 OID 27166)
-- Name: transactions transactions_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- TOC entry 4445 (class 2606 OID 27171)
-- Name: transactions transactions_rental_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_rental_id_fkey FOREIGN KEY (rental_id) REFERENCES public.rentals(id);


--
-- TOC entry 4446 (class 2606 OID 27176)
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4471 (class 2606 OID 36007)
-- Name: user_consents user_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4458 (class 2606 OID 27470)
-- Name: user_popup_preferences user_popup_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.user_popup_preferences
    ADD CONSTRAINT user_popup_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4428 (class 2606 OID 27181)
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: plannivo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- TOC entry 4649 (class 0 OID 0)
-- Dependencies: 7
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: plannivo
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


-- Completed on 2025-10-10 08:47:18

--
-- PostgreSQL database dump complete
--

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.14
-- Dumped by pg_dump version 17.5

-- Started on 2025-10-10 08:47:18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Completed on 2025-10-10 08:47:28

--
-- PostgreSQL database dump complete
--

-- Completed on 2025-10-10 08:47:28

--
-- PostgreSQL database cluster dump complete
--

