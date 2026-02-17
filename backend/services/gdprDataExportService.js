import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * GDPR Data Export Service
 * Article 15 - Right of Access
 * Provides complete user data export in machine-readable format
 */

class GdprDataExportService {
  /**
   * Export all personal data for a user
   * @param {string} userId - UUID of the user
   * @returns {Object} Complete user data package
   */
  async exportUserData(userId) {
    if (!userId) {
      throw new Error('User ID is required for data export');
    }

    logger.info('Starting GDPR data export', { userId });

    try {
      const dataPackage = {
        exportDate: new Date().toISOString(),
        exportType: 'GDPR Article 15 - Right of Access',
        userId,
        personalInformation: await this.getPersonalInformation(userId),
        consents: await this.getConsents(userId),
        bookings: await this.getBookings(userId),
        financialRecords: await this.getFinancialRecords(userId),
        communications: await this.getCommunications(userId),
        chatMessages: await this.getChatMessages(userId),
        ratings: await this.getRatings(userId),
        instructorData: await this.getInstructorData(userId),
        servicePackages: await this.getServicePackages(userId),
        accommodation: await this.getAccommodationRecords(userId),
        equipment: await this.getEquipmentRecords(userId),
        supportRequests: await this.getSupportRequests(userId),
        securityAudit: await this.getSecurityAuditLog(userId),
        metadata: {
          recordsIncluded: 0,
          dataRetentionPeriod: '7 years (financial records), 5 days (chat messages), 2 years (operational data)',
          rightsInformation: this.getRightsInformation()
        }
      };

      // Count total records
      dataPackage.metadata.recordsIncluded = this.countRecords(dataPackage);

      logger.info('GDPR data export completed', { 
        userId, 
        recordCount: dataPackage.metadata.recordsIncluded 
      });

      return dataPackage;
    } catch (error) {
      logger.error('GDPR data export failed', { userId, error: error.message });
      throw error;
    }
  }

  async getPersonalInformation(userId) {
    const { rows } = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.first_name,
        u.last_name,
        u.phone,
        u.profile_image_url,
        u.age,
        u.weight,
        u.created_at,
        u.updated_at,
        u.last_login_at,
        u.last_login_ip,
        u.two_factor_enabled,
        u.account_locked,
        u.account_locked_at,
        u.account_expired_at,
        u.failed_login_attempts,
        u.last_failed_login_at,
        r.name as role
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [userId]);

    return rows[0] || null;
  }

  async getConsents(userId) {
    const { rows } = await pool.query(`
      SELECT 
        terms_version,
        terms_accepted_at,
        marketing_email_opt_in,
        marketing_sms_opt_in,
        marketing_whatsapp_opt_in,
        created_at,
        updated_at
      FROM user_consents
      WHERE user_id = $1
    `, [userId]);

    return rows;
  }

  async getBookings(userId) {
    const { rows } = await pool.query(`
      SELECT 
        b.id,
        b.date as start_date,
        b.start_hour,
        b.duration,
        b.status,
        b.final_amount as total_price,
        b.currency,
        b.payment_status,
        b.notes,
        b.cancellation_reason,
        b.canceled_at,
        b.created_at,
        b.updated_at,
        s.name as service_name,
        i.name as instructor_name
      FROM bookings b
      LEFT JOIN services s ON s.id = b.service_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      WHERE b.student_user_id = $1 OR b.instructor_user_id = $1 OR b.customer_user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    return rows;
  }

  async getFinancialRecords(userId) {
    const transactions = await pool.query(`
      SELECT 
        id,
        transaction_date,
        amount,
        currency,
        payment_method,
        type as category,
        description,
        entity_type as reference_type,
        reference_number as reference_id,
        created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY transaction_date DESC
    `, [userId]);

    // Note: instructor_commissions table does not exist in this schema
    // Commission data may be stored differently or not applicable
    const commissions = { rows: [] };

    const balances = await pool.query(`
      SELECT 
        balance,
        preferred_currency as currency,
        updated_at as last_updated
      FROM users
      WHERE id = $1
    `, [userId]);

    return {
      transactions: transactions.rows,
      commissions: commissions.rows,
      balances: balances.rows
    };
  }

  async getCommunications(userId) {
    const notifications = await pool.query(`
      SELECT 
        id,
        type,
        title,
        message,
        status,
        read_at,
        data as metadata,
        created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    return {
      notifications: notifications.rows
    };
  }

  async getRatings(userId) {
    const given = await pool.query(`
      SELECT 
        id,
        booking_id,
        instructor_id,
        service_type,
        rating,
        feedback_text,
        is_anonymous,
        created_at
      FROM instructor_ratings
      WHERE student_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const received = await pool.query(`
      SELECT 
        id,
        booking_id,
        student_id,
        service_type,
        rating,
        feedback_text,
        is_anonymous,
        created_at
      FROM instructor_ratings
      WHERE instructor_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    return {
      ratingsGiven: given.rows,
      ratingsReceived: received.rows
    };
  }

  async getInstructorData(userId) {
    // Instructor profile data is stored in the users table
    const profile = await pool.query(`
      SELECT 
        id,
        bio,
        hourly_rate,
        skill_level,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
    `, [userId]);

    const services = await pool.query(`
      SELECT 
        service_id,
        created_at,
        updated_at
      FROM instructor_services
      WHERE instructor_id = $1
    `, [userId]);

    const notes = await pool.query(`
      SELECT 
        id,
        student_id,
        booking_id,
        note_text,
        visibility,
        is_pinned,
        created_at,
        updated_at
      FROM instructor_student_notes
      WHERE instructor_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    return {
      profile: profile.rows[0] || null,
      services: services.rows,
      studentNotes: notes.rows
    };
  }

  async getServicePackages(userId) {
    const { rows } = await pool.query(`
      SELECT 
        id,
        service_package_id as package_id,
        total_hours,
        used_hours,
        remaining_hours,
        purchase_date as purchased_at,
        expiry_date as expires_at,
        status,
        package_name,
        lesson_service_name,
        purchase_price as price,
        currency
      FROM customer_packages
      WHERE customer_id = $1
      ORDER BY purchase_date DESC
    `, [userId]);

    return rows;
  }

  async getAccommodationRecords(userId) {
    const { rows } = await pool.query(`
      SELECT 
        id,
        check_in_date,
        check_out_date,
        guests_count,
        total_price,
        status,
        notes as special_requests,
        created_at
      FROM accommodation_bookings
      WHERE guest_id = $1
      ORDER BY check_in_date DESC
    `, [userId]);

    return rows;
  }

  async getEquipmentRecords(userId) {
    const rentals = await pool.query(`
      SELECT 
        id,
        equipment_ids,
        start_date,
        end_date,
        total_price,
        status,
        notes as condition_notes,
        created_at
      FROM rentals
      WHERE user_id = $1
      ORDER BY start_date DESC
    `, [userId]);

    return {
      rentals: rentals.rows
    };
  }

  async getSupportRequests(userId) {
    const { rows } = await pool.query(`
      SELECT 
        id,
        subject,
        message as description,
        channel as category,
        priority,
        status,
        resolved_at,
        created_at,
        updated_at
      FROM student_support_requests
      WHERE student_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    return rows;
  }

  async getSecurityAuditLog(userId) {
    const { rows } = await pool.query(`
      SELECT 
        action,
        ip_address,
        user_agent,
        details,
        created_at
      FROM security_audit
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `, [userId]);

    return rows;
  }

  getRightsInformation() {
    return {
      rightToAccess: 'You have the right to obtain confirmation of whether personal data concerning you is being processed.',
      rightToRectification: 'You have the right to request correction of inaccurate personal data.',
      rightToErasure: 'You have the right to request deletion of your personal data (Right to be Forgotten).',
      rightToRestriction: 'You have the right to request restriction of processing your personal data.',
      rightToPortability: 'You have the right to receive your personal data in a structured, machine-readable format.',
      rightToObject: 'You have the right to object to processing of your personal data.',
      rightToWithdrawConsent: 'You have the right to withdraw consent at any time.',
      rightToLodgeComplaint: 'You have the right to lodge a complaint with a supervisory authority.',
      contactEmail: 'privacy@plannivo.com',
      dataProtectionOfficer: 'dpo@plannivo.com'
    };
  }

  countRecords(dataPackage) {
    let count = 0;
    
    if (dataPackage.personalInformation) count++;
    count += dataPackage.consents?.length || 0;
    count += dataPackage.bookings?.length || 0;
    count += dataPackage.financialRecords?.transactions?.length || 0;
    count += dataPackage.financialRecords?.commissions?.length || 0;
    count += dataPackage.financialRecords?.balances?.length || 0;
    count += dataPackage.communications?.notifications?.length || 0;
    count += dataPackage.ratings?.ratingsGiven?.length || 0;
    count += dataPackage.ratings?.ratingsReceived?.length || 0;
    count += dataPackage.instructorData?.services?.length || 0;
    count += dataPackage.instructorData?.studentNotes?.length || 0;
    count += dataPackage.servicePackages?.length || 0;
    count += dataPackage.accommodation?.length || 0;
    count += dataPackage.equipment?.rentals?.length || 0;
    count += dataPackage.supportRequests?.length || 0;
    count += dataPackage.securityAudit?.length || 0;
    count += dataPackage.chatMessages?.conversations?.length || 0;
    count += dataPackage.chatMessages?.messages?.length || 0;

    return count;
  }

  async getChatMessages(userId) {
    // Get user's conversations (within 5-day retention window)
    const conversations = await pool.query(`
      SELECT 
        c.id,
        c.type,
        c.name,
        c.created_at,
        cp.joined_at,
        cp.left_at,
        cp.role_in_conversation
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    // Get messages sent by user (within 5-day retention window)
    const messages = await pool.query(`
      SELECT 
        m.id,
        m.conversation_id,
        m.message_type,
        m.content,
        m.attachment_filename,
        m.voice_duration,
        m.created_at,
        m.edited_at
      FROM messages m
      WHERE m.sender_id = $1
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
    `, [userId]);

    return {
      conversations: conversations.rows,
      messages: messages.rows,
      retentionNotice: 'Chat messages are retained for 5 days only. Exported data includes messages within this window.'
    };
  }

  /**
   * Anonymize user data (Right to be Forgotten - with restrictions)
   * Note: Financial records must be retained for 7 years per tax law
   */
  async anonymizeUserData(userId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Anonymize personal information (keep ID for foreign key integrity)
      await client.query(`
        UPDATE users
        SET 
          email = CONCAT('deleted_', id, '@anonymized.local'),
          name = 'Deleted User',
          first_name = 'Deleted',
          last_name = 'User',
          phone = NULL,
          profile_image_url = NULL,
          age = NULL,
          weight = NULL,
          password_hash = 'ANONYMIZED',
          two_factor_secret = NULL,
          two_factor_backup_codes = NULL
        WHERE id = $1
      `, [userId]);

      // Anonymize booking notes
      await client.query(`
        UPDATE bookings
        SET notes = 'User requested data deletion',
            customer_notes = NULL
        WHERE student_id = $1
      `, [userId]);

      // Anonymize ratings (keep rating number for analytics, remove text)
      await client.query(`
        UPDATE instructor_ratings
        SET 
          feedback_text = NULL,
          is_anonymous = true
        WHERE student_id = $1
      `, [userId]);

      // Delete consent records
      await client.query(`
        DELETE FROM user_consents
        WHERE user_id = $1
      `, [userId]);

      // Delete notifications
      await client.query(`
        DELETE FROM notifications
        WHERE user_id = $1
      `, [userId]);

      // Keep financial records but mark as anonymized
      await client.query(`
        UPDATE transactions
        SET description = 'Anonymized transaction'
        WHERE customer_id = $1 OR instructor_id = $1
      `, [userId]);

      // Anonymize chat messages
      await client.query(`
        UPDATE messages
        SET 
          content = NULL,
          attachment_url = NULL,
          attachment_filename = NULL,
          voice_transcript = NULL,
          deleted_at = NOW(),
          deleted_by_expiration = FALSE
        WHERE sender_id = $1
          AND deleted_at IS NULL
      `, [userId]);

      // Keep user in conversation_participants for history integrity
      // but mark as left
      await client.query(`
        UPDATE conversation_participants
        SET left_at = COALESCE(left_at, NOW())
        WHERE user_id = $1
      `, [userId]);

      await client.query('COMMIT');

      logger.info('User data anonymized successfully', { userId });

      return {
        success: true,
        message: 'User data anonymized. Financial records retained for legal compliance (7 years).',
        anonymizedAt: new Date().toISOString()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('User data anonymization failed', { userId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new GdprDataExportService();
