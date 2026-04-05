// Automatic Database Backup Service
// backend/services/backupService.js

import { exec, spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { pool } from '../db.js';
import { fileURLToPath } from 'url';
// use path.dirname via imported path

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BackupService {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
    // Defaults
    this.dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'plannivo',
      username: process.env.DB_USER || 'postgres'
    };
    this.dbPassword = process.env.DB_PASSWORD || '';
    // If DATABASE_URL is set, prefer it
    if (process.env.DATABASE_URL) {
      try {
        const u = new URL(process.env.DATABASE_URL);
        this.dbConfig.host = u.hostname || this.dbConfig.host;
        this.dbConfig.port = Number(u.port) || this.dbConfig.port;
        this.dbConfig.database = (u.pathname || '').replace(/^\//, '') || this.dbConfig.database;
        // URL.username may be empty if connection string only uses passwordless unix socket (unlikely)
        this.dbConfig.username = decodeURIComponent(u.username || this.dbConfig.username);
        this.dbPassword = decodeURIComponent(u.password || this.dbPassword);
      } catch (_) {
        // ignore parse error and use existing env-based config
      }
    }
    this.composeProject = process.env.COMPOSE_PROJECT_NAME || path.basename(path.resolve(path.join(__dirname, '..', '..')));
    this.dbContainerName = process.env.DB_CONTAINER_NAME || '';
    this.enabled = process.env.BACKUPS_ENABLED !== 'false';
  }
  
  /**
   * Initialize backup service with scheduled jobs
   */
  async initialize() {
    // Ensure backup directory exists
    await this.ensureBackupDirectory();
    if (!this.enabled) {
      console.log('⏸️  Backup service disabled by env (BACKUPS_ENABLED=false)');
      return;
    }
    if (!this.canBackup()) {
      console.warn('⚠️  Backup tools not available (no pg_dump and Docker not running). Disabling scheduled backups.');
      this.enabled = false;
      return;
    }
    // Schedule automatic backups
    this.scheduleBackups();
    
    console.log('🔄 Backup service initialized');
  }
  
  /**
   * Ensure backup directory exists
   */
  async ensureBackupDirectory() {
    try {
      await fs.access(this.backupDir);
    } catch (error) {
      await fs.mkdir(this.backupDir, { recursive: true });
      console.log(`📁 Created backup directory: ${this.backupDir}`);
    }
  }
  
  /**
   * Schedule automatic backups
   */
  scheduleBackups() {
    if (!this.enabled) {
      console.log('⏭️  Backups disabled; schedules not registered');
      return;
    }
    // Daily full backup at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.createFullBackup();
        console.log('✅ Daily full backup completed');
      } catch (error) {
        console.error('❌ Daily backup failed:', error);
      }
    });
    
    // Weekly backup cleanup (keep only last 4 weeks)
    cron.schedule('0 3 * * 0', async () => {
      try {
        await this.cleanupOldBackups();
        console.log('✅ Weekly backup cleanup completed');
      } catch (error) {
        console.error('❌ Backup cleanup failed:', error);
      }
    });
    
    // Monthly hard delete of old soft-deleted records
    cron.schedule('0 4 1 * *', async () => {
      try {
        await this.performScheduledHardDeletes();
        console.log('✅ Monthly hard delete completed');
      } catch (error) {
        console.error('❌ Hard delete failed:', error);
      }
    });
    
    console.log('⏰ Backup schedules configured:');
    console.log('  - Daily full backup: 2:00 AM');
    console.log('  - Weekly cleanup: 3:00 AM Sunday');
    console.log('  - Monthly hard delete: 4:00 AM 1st of month');
  }

  canBackup() {
    return this.commandExists('pg_dump') || this.dockerAvailable();
  }
  
  // ----- Internals: pg_dump runners -----
  commandExists(cmd) {
    try {
      const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
      return result.status === 0;
    } catch (_) {
      return false;
    }
  }

  dockerAvailable() {
    return this.commandExists('docker');
  }

  async execPromise(cmd, options) {
    return new Promise((resolve, reject) => {
      exec(cmd, options, (error, stdout, stderr) => {
        if (error) return reject(Object.assign(error, { stdout, stderr }));
        resolve({ stdout, stderr });
      });
    });
  }

  async findDbContainerName() {
    if (this.dbContainerName) return this.dbContainerName;
    try {
      const { stdout } = await this.execPromise('docker ps --format "{{.Names}} {{.Image}}"');
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      // Prefer names containing "_db_" or ending with ":postgres" image
      const candidates = lines
        .map(line => {
          const [name, ...imageParts] = line.split(' ');
          const image = imageParts.join(' ');
          return { name, image };
        })
        .filter(item => /(^|_)db(_|$)/i.test(item.name) || /^postgres/i.test(item.image) || /postgres/i.test(item.image));
      if (candidates.length > 0) {
        // Heuristic: if compose project is known, prefer it
        const preferred = candidates.find(c => c.name.toLowerCase().includes(`${this.composeProject.toLowerCase()}-db`)) || candidates[0];
        return preferred.name;
      }
    } catch (_) {}
    return '';
  }

  async runPgDumpLocal(filepath, args) {
    const env = { ...process.env };
    if (this.dbPassword) env.PGPASSWORD = this.dbPassword;
    const command = `pg_dump ${args.join(' ')} -f "${filepath}" --no-password`;
    await this.execPromise(command, { env });
  }

  async runPgDumpInDocker(filepath, args) {
    // Dump inside the DB container to a temp file, then docker cp it out
    const container = await this.findDbContainerName();
    if (!container) throw new Error('Could not determine Postgres container name for Docker fallback');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const inContainerPath = `/tmp/backup-${ts}.sql`;
    const envPart = this.dbPassword ? `PGPASSWORD=${this.dbPassword} ` : '';
    const dumpCmd = `docker exec ${container} sh -lc '${envPart}pg_dump ${args.join(' ')} -f "${inContainerPath}" --no-password'`;
    await this.execPromise(dumpCmd);
    // Copy out
    const cpCmd = `docker cp ${container}:"${inContainerPath}" "${filepath}"`;
    await this.execPromise(cpCmd);
    // Clean up temp file (best-effort)
    await this.execPromise(`docker exec ${container} sh -lc 'rm -f "${inContainerPath}"'`).catch(() => {});
  }

  async runPgDumpWithDockerRun(filepath, args) {
    // Use ephemeral postgres image to run pg_dump against host DB
    if (!this.dockerAvailable()) throw new Error('Docker is not available');
    // Map backup directory into container
    const bindDir = this.backupDir;
    const outName = path.basename(filepath);
    const outInContainer = `/backups/${outName}`;
    // Replace localhost target for Windows Docker Desktop
    const hostForContainer = ['localhost', '127.0.0.1', '::1'].includes(String(args[1])) ? 'host.docker.internal' : args[1];
    // Rebuild args with corrected host and drop any -f flags (we control output path)
    const rebuilt = ['-h', hostForContainer];
    for (let i = 2; i < args.length; i++) rebuilt.push(args[i]);
    const envPart = this.dbPassword ? `-e PGPASSWORD=\"${this.dbPassword}\"` : '';
    const volPart = `-v \"${bindDir}\":/backups`;
    const dumpCmd = `docker run --rm ${envPart} ${volPart} postgres:15-alpine pg_dump ${rebuilt.join(' ')} -f ${outInContainer} --no-password`;
    await this.execPromise(dumpCmd);
  }

  async runPgDump(filepath, specificArgs = []) {
    // Build shared args from config
    const baseArgs = ['-h', `${this.dbConfig.host}`, '-p', `${this.dbConfig.port}`, '-U', `${this.dbConfig.username}`, '-d', `${this.dbConfig.database}`];
    const args = [...baseArgs, ...specificArgs];
    if (this.commandExists('pg_dump')) {
      return this.runPgDumpLocal(filepath, args);
    }
    // Try Docker fallbacks
    if (this.dockerAvailable()) {
      try {
        // Prefer exec into an existing DB container (fast, no image pulls)
        const dockerArgs = ['-h', 'localhost', '-U', `${this.dbConfig.username}`, '-d', `${this.dbConfig.database}`, ...specificArgs.filter(a => a !== '-h' && a !== this.dbConfig.host)];
        return await this.runPgDumpInDocker(filepath, dockerArgs);
      } catch (e) {
        // Fallback to docker run with postgres image targeting host.docker.internal
        await this.runPgDumpWithDockerRun(filepath, args);
        return;
      }
    }
    throw new Error('pg_dump is not installed and Docker is unavailable. Install Postgres client tools or enable Docker.');
  }

  /**
   * Create a full database backup
   */
  async createFullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `plannivo_backup_${timestamp}.sql`;
    const filepath = path.join(this.backupDir, filename);
    try {
      await this.runPgDump(filepath);
      console.log(`✅ Full backup created: ${filename}`);
      return filepath;
    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  }
  
  /**
   * Create incremental backup of specific tables
   */
  async createIncrementalBackup(tables = ['bookings', 'deleted_bookings_backup']) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `plannivo_incremental_${timestamp}.sql`;
    const filepath = path.join(this.backupDir, filename);
    try {
      const tableArgs = tables.flatMap(t => ['-t', t]);
      await this.runPgDump(filepath, tableArgs);
      console.log(`✅ Incremental backup created: ${filename}`);
      return filepath;
    } catch (error) {
      console.error('❌ Incremental backup failed:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup old backup files
   */
  async cleanupOldBackups(retentionDays = 30) {
    try {
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        if (file.endsWith('.sql')) {
          const filepath = path.join(this.backupDir, file);
          const stats = await fs.stat(filepath);
          
          if (now - stats.mtime.getTime() > retentionMs) {
            await fs.unlink(filepath);
            console.log(`🗑️ Deleted old backup: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }
  
  /**
   * Perform scheduled hard deletes of old soft-deleted records
   */
  async performScheduledHardDeletes() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get records scheduled for hard deletion
      const result = await client.query(`
        SELECT id, original_data 
        FROM deleted_bookings_backup 
        WHERE scheduled_hard_delete_at <= NOW() 
          AND hard_deleted_at IS NULL
        LIMIT 100
      `);
      
      console.log(`🗑️ Found ${result.rows.length} records for hard deletion`);
      
      // Create final backup before hard delete
      if (result.rows.length > 0) {
        const finalBackupData = result.rows.map(row => ({
          id: row.id,
          data: row.original_data,
          hardDeletedAt: new Date().toISOString()
        }));
        
        const backupFilename = `hard_delete_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const backupPath = path.join(this.backupDir, backupFilename);
        
        await fs.writeFile(backupPath, JSON.stringify(finalBackupData, null, 2));
        console.log(`📁 Created final backup: ${backupFilename}`);
      }
      
      // Mark as hard deleted (don't actually delete for safety)
      await client.query(`
        UPDATE deleted_bookings_backup 
        SET hard_deleted_at = NOW()
        WHERE scheduled_hard_delete_at <= NOW() 
          AND hard_deleted_at IS NULL
      `);
      
      // Also clean up related backup data
      await client.query(`
        DELETE FROM deleted_booking_relations_backup
        WHERE booking_id IN (
          SELECT id FROM deleted_bookings_backup 
          WHERE hard_deleted_at IS NOT NULL
        )
      `);
      
      await client.query('COMMIT');
      
      console.log(`✅ Hard deleted ${result.rows.length} records`);
      
      return result.rows.length;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Hard delete failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get backup status and statistics
   */
  async getBackupStatus() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.endsWith('.sql'));
      
      const backups = await Promise.all(
        backupFiles.map(async (file) => {
          const filepath = path.join(this.backupDir, file);
          const stats = await fs.stat(filepath);
          return {
            filename: file,
            size: stats.size,
            created: stats.mtime,
            type: file.includes('incremental') ? 'incremental' : 'full'
          };
        })
      );
      
      // Get soft delete statistics
      const client = await pool.connect();
      
      try {
        const softDeleteStats = await client.query(`
          SELECT 
            COUNT(*) as total_soft_deleted,
            COUNT(*) FILTER (WHERE hard_deleted_at IS NULL) as pending_hard_delete,
            COUNT(*) FILTER (WHERE hard_deleted_at IS NOT NULL) as hard_deleted,
            MIN(scheduled_hard_delete_at) as next_hard_delete
          FROM deleted_bookings_backup
        `);
        
        return {
          backups: backups.sort((a, b) => b.created - a.created),
          totalBackups: backups.length,
          latestBackup: backups.length > 0 ? backups[0] : null,
          softDeleteStats: softDeleteStats.rows[0]
        };
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Failed to get backup status:', error);
      throw error;
    }
  }
}

export default BackupService;
