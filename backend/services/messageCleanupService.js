/**
 * Message Cleanup Service
 * 
 * Handles automatic 5-day message expiration for GDPR compliance:
 * - Soft-delete messages older than 5 days
 * - Remove message content and attachments
 * - Delete orphaned files from filesystem
 * - Scheduled daily at 3 AM
 * 
 * GDPR Data Minimization Compliance
 */

import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MessageCleanupService {
  static MESSAGE_RETENTION_DAYS = 5;
  static UPLOAD_BASE_PATH = path.join(__dirname, '../uploads');
  
  /**
   * Clean up expired messages (older than 5 days)
   * - Soft delete in database
   * - Remove content and attachment references
   * - Delete physical files
   */
  static async cleanupExpiredMessages() {
    const client = await pool.connect();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');
      
      // Use database function to soft-delete messages and get file paths
      const result = await client.query('SELECT * FROM cleanup_expired_messages()');
      
      const deletedCount = result.rows[0]?.deleted_count || 0;
      const filePaths = result.rows[0]?.file_paths || [];
      
      // Delete orphaned files from filesystem
      let filesDeleted = 0;
      let filesFailed = 0;
      
      if (filePaths && filePaths.length > 0) {
        for (const relativePath of filePaths) {
          if (relativePath) {
            try {
              await this.deleteFile(relativePath);
              filesDeleted++;
            } catch (error) {
              filesFailed++;
              logger.warn(`Failed to delete file ${relativePath}:`, error.message);
            }
          }
        }
      }
      
      await client.query('COMMIT');
      
      const duration = Date.now() - startTime;
      logger.info(`Message cleanup completed in ${duration}ms:`, {
        messagesDeleted: deletedCount,
        filesDeleted,
        filesFailed,
        retentionDays: this.MESSAGE_RETENTION_DAYS
      });
      
      return { 
        messagesDeleted: deletedCount, 
        filesDeleted, 
        filesFailed,
        duration
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Message cleanup failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Delete a file from the uploads directory
   * @param {string} relativePath - Relative path from uploads/ (e.g., 'chat-images/file.jpg')
   */
  static async deleteFile(relativePath) {
    try {
      const fullPath = path.join(this.UPLOAD_BASE_PATH, relativePath);
      await fs.unlink(fullPath);
      logger.debug(`Deleted file: ${relativePath}`);
    } catch (error) {
      // Don't throw if file doesn't exist (already deleted)
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  /**
   * Clean up orphaned files (files without database references)
   * Run this monthly or on-demand for maintenance
   */
  static async cleanupOrphanedFiles() {
    const chatDirs = [
      'chat-images',
      'chat-files', 
      'voice-messages'
    ];
    
    let orphansDeleted = 0;
    let orphansFailed = 0;
    
    try {
      // Get all attachment URLs from database
      const { rows } = await pool.query(`
        SELECT DISTINCT attachment_url 
        FROM messages 
        WHERE attachment_url IS NOT NULL 
          AND deleted_at IS NULL
      `);
      
      const validFiles = new Set(rows.map(r => r.attachment_url));
      
      // Check each chat directory
      for (const dir of chatDirs) {
        const dirPath = path.join(this.UPLOAD_BASE_PATH, dir);
        
        try {
          const files = await fs.readdir(dirPath);
          
          for (const file of files) {
            const relativePath = `${dir}/${file}`;
            
            // If file not in database, it's orphaned
            if (!validFiles.has(relativePath)) {
              try {
                await this.deleteFile(relativePath);
                orphansDeleted++;
                logger.debug(`Deleted orphaned file: ${relativePath}`);
              } catch (error) {
                orphansFailed++;
                logger.warn(`Failed to delete orphaned file ${relativePath}:`, error.message);
              }
            }
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            logger.warn(`Failed to scan directory ${dir}:`, error.message);
          }
        }
      }
      
      logger.info(`Orphaned file cleanup completed:`, {
        orphansDeleted,
        orphansFailed
      });
      
      return { orphansDeleted, orphansFailed };
    } catch (error) {
      logger.error('Orphaned file cleanup failed:', error);
      throw error;
    }
  }
  
  /**
   * Get cleanup statistics
   */
  static async getCleanupStats() {
    try {
      const { rows } = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE deleted_at IS NOT NULL AND deleted_by_expiration = TRUE) as expired_messages,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at < NOW() - INTERVAL '5 days') as pending_expiration,
          COUNT(*) FILTER (WHERE deleted_at IS NULL) as active_messages,
          COUNT(*) FILTER (WHERE attachment_url IS NOT NULL AND deleted_at IS NULL) as active_attachments
        FROM messages
      `);
      
      return rows[0];
    } catch (error) {
      logger.error('Failed to get cleanup stats:', error);
      throw error;
    }
  }
  
  /**
   * Start scheduled cleanup jobs
   */
  static startScheduler() {
    if (!cron.validate('0 3 * * *')) {
      logger.error('Invalid cron schedule for message cleanup');
      return;
    }
    
    // Daily cleanup at 3 AM (Europe/Istanbul timezone)
    cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('Starting scheduled message cleanup (5-day retention)...');
        await this.cleanupExpiredMessages();
      } catch (error) {
        logger.error('Scheduled message cleanup failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });
    
    // Monthly orphaned file cleanup (first day of month, 4 AM)
    cron.schedule('0 4 1 * *', async () => {
      try {
        logger.info('Starting monthly orphaned file cleanup...');
        await this.cleanupOrphanedFiles();
      } catch (error) {
        logger.error('Orphaned file cleanup failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });
    
    logger.info('Message cleanup scheduler started:', {
      dailyCleanup: '3:00 AM daily (5-day retention)',
      orphanedFiles: '4:00 AM monthly (1st of month)',
      timezone: 'Europe/Istanbul',
      retentionDays: this.MESSAGE_RETENTION_DAYS
    });
  }
  
  /**
   * Manual cleanup trigger (for testing or admin use)
   */
  static async runManualCleanup() {
    logger.info('Manual message cleanup triggered');
    const messageResult = await this.cleanupExpiredMessages();
    const orphanResult = await this.cleanupOrphanedFiles();
    
    return {
      messages: messageResult,
      orphanedFiles: orphanResult
    };
  }
}

export default MessageCleanupService;
