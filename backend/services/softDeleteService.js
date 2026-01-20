// Enhanced Soft Delete Service  
// src/services/softDeleteService.js
// Fixed syntax error - restart trigger

import { pool } from '../db.js';

class SoftDeleteService {
  /**
   * Soft delete a booking with full backup
   * @param {string} bookingId - The booking ID to delete
   * @param {string} deletedBy - User ID who is deleting
   * @param {string} reason - Reason for deletion
   * @param {Object} metadata - Additional metadata
   */
  static async softDeleteBooking(bookingId, deletedBy, reason = 'User deletion', metadata = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Get the complete booking data before deletion
      const bookingResult = await client.query(`
        SELECT b.*, 
               u.name as student_name, 
               i.name as instructor_name,
               s.name as service_name
        FROM bookings b
        LEFT JOIN users u ON b.student_user_id = u.id
        LEFT JOIN users i ON b.instructor_user_id = i.id
        LEFT JOIN services s ON b.service_id = s.id
        WHERE b.id = $1 AND b.deleted_at IS NULL
      `, [bookingId]);
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found or already deleted');
      }
      
      const booking = bookingResult.rows[0];
      
      // 2. Backup related data before deletion
      const relatedData = await this.backupRelatedData(client, bookingId);
      
      // 3. Create backup record
      const backupResult = await client.query(`
        INSERT INTO deleted_bookings_backup (
          id, original_data, deleted_at, deleted_by, deletion_reason, 
          deletion_metadata, scheduled_hard_delete_at
        ) VALUES ($1, $2, NOW(), $3, $4, $5, NOW() + INTERVAL '90 days')
        RETURNING backed_up_at
      `, [
        bookingId,
        JSON.stringify(booking),
        deletedBy,
        reason,
        JSON.stringify({
          ...metadata,
          relatedDataCount: relatedData.length,
          softDeleteVersion: '2.0'
        })
      ]);
      
      // 4. Soft delete the booking
      await client.query(`
        UPDATE bookings 
        SET deleted_at = NOW(),
            deleted_by = $2,
            deletion_reason = $3,
            deletion_metadata = $4,
            status = 'deleted',
            updated_at = NOW()
        WHERE id = $1
      `, [
        bookingId,
        deletedBy,
        reason,
        JSON.stringify(metadata)
      ]);
      
      // 5. Soft delete related records
      await this.softDeleteRelatedRecords(client, bookingId, deletedBy, reason);
      
      await client.query('COMMIT');
      
      console.log(`✅ Soft deleted booking ${bookingId} with backup`);
      
      return {
        success: true,
        bookingId,
        backedUpAt: backupResult.rows[0].backed_up_at,
        relatedRecords: relatedData.length,
        scheduledHardDeleteAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Soft delete failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Backup related data before deletion
   */
  static async backupRelatedData(client, bookingId) {
    const relatedTables = [
      'instructor_earnings',
      'booking_equipment', 
      'booking_custom_commissions',
      'payment_intents',
      'transactions'
    ];
    
    const backedUpData = [];
    
    for (const tableName of relatedTables) {
      try {
        const result = await client.query(`
          SELECT * FROM ${tableName} WHERE booking_id = $1
        `, [bookingId]);
        
        for (const row of result.rows) {
          await client.query(`
            INSERT INTO deleted_booking_relations_backup 
            (booking_id, table_name, original_data)
            VALUES ($1, $2, $3)
          `, [bookingId, tableName, JSON.stringify(row)]);
          
          backedUpData.push({ table: tableName, id: row.id });
        }
      } catch (error) {
        console.warn(`⚠️ Could not backup ${tableName}:`, error.message);
      }
    }
    
    return backedUpData;
  }
  
  /**
   * Soft delete related records
   */
  static async softDeleteRelatedRecords(client, bookingId, deletedBy, reason) {
    const relatedTables = [
      'instructor_earnings',
      'booking_equipment',
      'booking_custom_commissions'
    ];
    
    for (const tableName of relatedTables) {
      try {
        // Add soft delete columns if they don't exist
        await client.query(`
          ALTER TABLE ${tableName} 
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
          ADD COLUMN IF NOT EXISTS deleted_by UUID NULL,
          ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL
        `);
        
        // Soft delete the records
        await client.query(`
          UPDATE ${tableName}
          SET deleted_at = NOW(),
              deleted_by = $2,
              deletion_reason = $3
          WHERE booking_id = $1 AND deleted_at IS NULL
        `, [bookingId, deletedBy, reason]);
        
      } catch (error) {
        console.warn(`⚠️ Could not soft delete ${tableName}:`, error.message);
      }
    }
  }
  
  /**
   * Restore a soft-deleted booking
   */
  static async restoreBooking(bookingId, restoredBy, reason = 'Admin restoration') {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if booking exists in backup
      const backupResult = await client.query(`
        SELECT * FROM deleted_bookings_backup 
        WHERE id = $1 AND hard_deleted_at IS NULL
      `, [bookingId]);
      
      if (backupResult.rows.length === 0) {
        throw new Error('Backup not found or already hard deleted');
      }
      
      // Restore the booking
      await client.query(`
        UPDATE bookings
        SET deleted_at = NULL,
            deleted_by = NULL,
            deletion_reason = NULL,
            deletion_metadata = NULL,
            status = 'confirmed',
            updated_at = NOW()
        WHERE id = $1
      `, [bookingId]);
      
      // Restore related records
      await this.restoreRelatedRecords(client, bookingId);
      
      // Log the restoration
      await client.query(`
        UPDATE deleted_bookings_backup
        SET deletion_metadata = deletion_metadata || $2
        WHERE id = $1
      `, [bookingId, JSON.stringify({
        restoredAt: new Date().toISOString(),
        restoredBy,
        restorationReason: reason
      })]);
      
      await client.query('COMMIT');
      
      console.log(`✅ Restored booking ${bookingId}`);
      
      return { success: true, bookingId, restoredAt: new Date() };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Restore failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Restore related records
   */
  static async restoreRelatedRecords(client, bookingId) {
    const relatedTables = [
      'instructor_earnings',
      'booking_equipment',
      'booking_custom_commissions'
    ];
    
    for (const tableName of relatedTables) {
      try {
        await client.query(`
          UPDATE ${tableName}
          SET deleted_at = NULL,
              deleted_by = NULL,
              deletion_reason = NULL
          WHERE booking_id = $1
        `, [bookingId]);
      } catch (error) {
        console.warn(`⚠️ Could not restore ${tableName}:`, error.message);
      }
    }
  }
  
  /**
   * Get list of soft-deleted bookings for admin review
   */
  static async getDeletedBookings(limit = 50, offset = 0) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT db.id, db.original_data, db.deleted_at, db.deleted_by,
               db.deletion_reason, db.scheduled_hard_delete_at,
               u.name as deleted_by_name
        FROM deleted_bookings_backup db
        LEFT JOIN users u ON db.deleted_by = u.id
        WHERE db.hard_deleted_at IS NULL
        ORDER BY db.deleted_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      return result.rows.map(row => ({
        ...row,
        original_data: JSON.parse(row.original_data),
        canRestore: new Date() < new Date(row.scheduled_hard_delete_at),
        daysUntilHardDelete: Math.ceil(
          (new Date(row.scheduled_hard_delete_at) - new Date()) / (1000 * 60 * 60 * 24)
        )
      }));
      
    } finally {
      client.release();
    }
  }
}

export default SoftDeleteService;
