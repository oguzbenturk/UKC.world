import BackupService from '../services/backupService.js';

(async () => {
  try {
    const svc = new BackupService();
    await svc.ensureBackupDirectory();
    const path = await svc.createFullBackup();
    console.log('Backup OK:', path);
  } catch (e) {
    console.error('Backup ERR:', e?.message || e);
    throw e;
  }
})();
