/**
 * One-time script to sync all existing users to all existing channels
 * Run this after implementing auto-enrollment to ensure existing users see all channels
 */

import ChatService from './services/chatService.js';
import { logger } from './middlewares/errorHandler.js';

async function syncUsersToChannels() {
  try {
    console.log('Starting sync of all users to all channels...');
    
    const result = await ChatService.syncAllUsersToChannels();
    
    console.log('✅ Sync completed successfully!');
    console.log(`   Channels processed: ${result.channelsProcessed}`);
    console.log(`   User-channel relationships added: ${result.usersAdded}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    logger.error('Sync users to channels failed:', error);
    process.exit(1);
  }
}

syncUsersToChannels();
