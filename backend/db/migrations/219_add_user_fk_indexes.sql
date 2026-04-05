-- Migration 219: Add indexes on FK columns referencing users table
-- These indexes speed up DELETE queries during hard user deletion.
-- Without them, each DELETE does a full table scan (~1.5-2.6s per table).

-- accommodation_bookings
CREATE INDEX IF NOT EXISTS idx_accommodation_bookings_guest_id ON accommodation_bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_bookings_created_by ON accommodation_bookings(created_by);

-- security_audit
CREATE INDEX IF NOT EXISTS idx_security_audit_user_id ON security_audit(user_id);

-- api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- voucher_redemptions
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user_id ON voucher_redemptions(user_id);

-- quick_link_registrations
CREATE INDEX IF NOT EXISTS idx_quick_link_registrations_user_id ON quick_link_registrations(user_id);

-- form_submissions
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON form_submissions(user_id);

-- manager_salary_records
CREATE INDEX IF NOT EXISTS idx_manager_salary_records_manager_user_id ON manager_salary_records(manager_user_id);

-- manager_commissions
CREATE INDEX IF NOT EXISTS idx_manager_commissions_manager_user_id ON manager_commissions(manager_user_id);

-- manager_payouts
CREATE INDEX IF NOT EXISTS idx_manager_payouts_manager_user_id ON manager_payouts(manager_user_id);

-- service_revenue_ledger
CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_customer_id ON service_revenue_ledger(customer_id);

-- feedback
CREATE INDEX IF NOT EXISTS idx_feedback_student_id ON feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_instructor_id ON feedback(instructor_id);

-- instructor_ratings
CREATE INDEX IF NOT EXISTS idx_instructor_ratings_student_id ON instructor_ratings(student_id);
CREATE INDEX IF NOT EXISTS idx_instructor_ratings_instructor_id ON instructor_ratings(instructor_id);

-- instructor_student_notes
CREATE INDEX IF NOT EXISTS idx_instructor_student_notes_student_id ON instructor_student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_instructor_student_notes_instructor_id ON instructor_student_notes(instructor_id);

-- payment_intents
CREATE INDEX IF NOT EXISTS idx_payment_intents_user_id ON payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_created_by ON payment_intents(created_by);

-- password_reset_tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- booking_reschedule_notifications
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_notifications_student_user_id ON booking_reschedule_notifications(student_user_id);
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_notifications_changed_by ON booking_reschedule_notifications(changed_by);

-- message_reactions
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

-- conversation_participants
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);

-- bank_transfer_receipts
CREATE INDEX IF NOT EXISTS idx_bank_transfer_receipts_user_id ON bank_transfer_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_receipts_reviewed_by ON bank_transfer_receipts(reviewed_by);

-- shop_order_status_history
CREATE INDEX IF NOT EXISTS idx_shop_order_status_history_changed_by ON shop_order_status_history(changed_by);
