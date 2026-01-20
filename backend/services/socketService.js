// backend/services/socketService.js
import { Server } from 'socket.io';

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.userChannels = new Map();
  }

  /**
   * Initialize Socket.IO server
   * @param {http.Server} server - HTTP server instance
   */
  initialize(server) {
    try {      this.io = new Server(server, {
        // Allow connections from any origin, including production behind nginx proxy
        // Nginx terminates TLS and proxies to this server, so origin will be the public domain
        cors: {
          origin: (origin, callback) => callback(null, true),
          methods: ["GET", "POST"],
          credentials: true
        },
        // Trust proxy headers from nginx for secure WebSocket connections
        transports: ['websocket', 'polling'],
        connectTimeout: 45000,
        upgradeTimeout: 30000
      });

      this.setupEventHandlers();
      console.log('✅ Socket.IO server initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Socket.IO server:', error);
      return false;
    }
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 Client connected: ${socket.id}`);

      // Handle user authentication
      socket.on('authenticate', (userData) => {
        this.handleAuthentication(socket, userData);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });

      // Handle channel subscription
      socket.on('subscribe', (channels) => {
        this.handleChannelSubscription(socket, channels);
      });

      // Handle ping for connection monitoring
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle chat events
      socket.on('chat:join_conversation', (conversationId) => {
        this.handleJoinConversation(socket, conversationId);
      });

      socket.on('chat:leave_conversation', (conversationId) => {
        this.handleLeaveConversation(socket, conversationId);
      });

      socket.on('chat:typing', ({ conversationId }) => {
        this.handleTypingIndicator(socket, conversationId);
      });

      socket.on('chat:stop_typing', ({ conversationId }) => {
        this.handleStopTyping(socket, conversationId);
      });
    });
  }

  /**
   * Handle user authentication
   */
  handleAuthentication(socket, userData) {
    try {
      if (userData && userData.id) {
        socket.userId = userData.id;
        socket.userRole = userData.role;
        
        this.connectedUsers.set(socket.id, {
          userId: userData.id,
          role: userData.role,
          connectedAt: new Date()
        });

        // Join role-based rooms
        socket.join(`role:${userData.role}`);
        socket.join(`user:${userData.id}`);
        socket.join('general');

        console.log(`👤 User authenticated: ${userData.id} (${userData.role})`);
        
        socket.emit('authenticated', { 
          success: true, 
          timestamp: Date.now() 
        });
      }
    } catch (error) {
      console.error('Authentication error:', error);
      socket.emit('auth_error', { error: 'Authentication failed' });
    }
  }

  /**
   * Handle user disconnection
   */
  handleDisconnection(socket) {
    const user = this.connectedUsers.get(socket.id);
    if (user) {
      console.log(`👤 User disconnected: ${user.userId}`);
      this.connectedUsers.delete(socket.id);
    }
    console.log(`🔌 Client disconnected: ${socket.id}`);
  }

  /**
   * Handle channel subscription
   */
  handleChannelSubscription(socket, channels) {
    if (Array.isArray(channels)) {
      channels.forEach(channel => {
        socket.join(channel);
      });
      this.userChannels.set(socket.id, channels);
      console.log(`📡 Client ${socket.id} subscribed to channels:`, channels);
    }
  }

  /**
   * Emit to specific channel
   */
  emitToChannel(channel, event, data) {
    if (this.io) {
      this.io.to(channel).emit(event, {
        ...data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Emit to specific role
   */
  emitToRole(role, event, data) {
    if (this.io) {
      this.io.to(`role:${role}`).emit(event, {
        ...data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Emit booking events
   */
  emitBookingCreated(booking) {
    this.emitToChannel('general', 'booking:created', booking);
  }

  emitBookingUpdated(booking) {
    this.emitToChannel('general', 'booking:updated', booking);
  }

  emitBookingDeleted(bookingId) {
    this.emitToChannel('general', 'booking:deleted', { id: bookingId });
  }

  /**
   * Emit equipment events
   */
  emitEquipmentUpdated(equipment) {
    this.emitToChannel('general', 'equipment:updated', equipment);
  }

  /**
   * Emit instructor events
   */
  emitInstructorUpdated(instructor) {
    this.emitToChannel('general', 'instructor:updated', instructor);
  }

  /**
   * Emit payroll events
   */
  emitPayrollGenerated(payroll) {
    this.emitToRole('admin', 'payroll:generated', payroll);
    this.emitToRole('manager', 'payroll:generated', payroll);
  }

  emitPayrollProcessed(payroll) {
    this.emitToRole('admin', 'payroll:processed', payroll);
    this.emitToRole('manager', 'payroll:processed', payroll);
  }

  /**
   * Emit financial events
   */
  emitTransactionCreated(transaction) {
    this.emitToChannel('general', 'transaction:created', transaction);
  }

  emitFinancialSummaryUpdated(summary) {
    this.emitToChannel('general', 'financial:summary_updated', summary);
  }

  /**
   * Emit dashboard events
   */
  emitDashboardRefresh() {
    this.emitToChannel('general', 'dashboard:refresh', {});
  }

  emitStatsUpdated(stats) {
    this.emitToChannel('general', 'stats:updated', stats);
  }

  /**
   * Chat-specific methods
   */
  handleJoinConversation(socket, conversationId) {
    try {
      const roomName = `conversation:${conversationId}`;
      socket.join(roomName);
      console.log(`👥 User ${socket.userId} joined conversation ${conversationId}`);
      
      // Notify others in conversation
      socket.to(roomName).emit('chat:user_joined', {
        userId: socket.userId,
        conversationId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error joining conversation:', error);
    }
  }

  handleLeaveConversation(socket, conversationId) {
    try {
      const roomName = `conversation:${conversationId}`;
      socket.leave(roomName);
      console.log(`👥 User ${socket.userId} left conversation ${conversationId}`);
      
      // Notify others in conversation
      socket.to(roomName).emit('chat:user_left', {
        userId: socket.userId,
        conversationId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error leaving conversation:', error);
    }
  }

  handleTypingIndicator(socket, conversationId) {
    try {
      const roomName = `conversation:${conversationId}`;
      
      // Emit to others in conversation (not to sender)
      socket.to(roomName).emit('chat:user_typing', {
        userId: socket.userId,
        conversationId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling typing indicator:', error);
    }
  }

  handleStopTyping(socket, conversationId) {
    try {
      const roomName = `conversation:${conversationId}`;
      
      socket.to(roomName).emit('chat:user_stop_typing', {
        userId: socket.userId,
        conversationId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling stop typing:', error);
    }
  }

  emitToConversation(conversationId, event, data) {
    if (this.io) {
      const roomName = `conversation:${conversationId}`;
      this.io.to(roomName).emit(event, data);
    }
  }

  emitMessageSent(conversationId, message) {
    this.emitToConversation(conversationId, 'chat:message_sent', message);
  }

  emitMessageRead(conversationId, data) {
    this.emitToConversation(conversationId, 'chat:message_read', data);
  }

  emitConversationUpdated(conversationId, data) {
    this.emitToConversation(conversationId, 'chat:conversation_updated', data);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = {
      totalConnections: this.connectedUsers.size,
      usersByRole: {},
      activeChannels: new Set()
    };

    // Count users by role
    this.connectedUsers.forEach(user => {
      stats.usersByRole[user.role] = (stats.usersByRole[user.role] || 0) + 1;
    });

    // Get active channels
    this.userChannels.forEach(channels => {
      channels.forEach(channel => stats.activeChannels.add(channel));
    });

    stats.activeChannels = Array.from(stats.activeChannels);

    return stats;
  }

  /**
   * Check if service is initialized
   */
  isInitialized() {
    return this.io !== null;
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;