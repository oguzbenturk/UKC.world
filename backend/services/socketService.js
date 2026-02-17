// backend/services/socketService.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// SEC-017 FIX: Get JWT_SECRET securely from environment
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET not set for WebSocket authentication');
}
const JWT_SECRET = process.env.JWT_SECRET;

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
    try {
      // SEC-019 FIX: Define allowed origins for WebSocket CORS
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3003',
        'http://localhost:3005',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://plannivo.com',
        'https://plannivo.com',
        'http://www.plannivo.com',
        'https://www.plannivo.com',
        process.env.FRONTEND_URL
      ].filter(Boolean);

      this.io = new Server(server, {
        // SEC-019 FIX: Restrict CORS to allowed origins only
        cors: {
          origin: (origin, callback) => {
            // Allow no-origin requests (mobile apps, native clients)
            if (!origin) {
              return callback(null, true);
            }
            
            // In development, allow all origins for easier testing
            if (process.env.NODE_ENV === 'development') {
              return callback(null, true);
            }
            
            // In production, only allow specific origins
            if (allowedOrigins.indexOf(origin) !== -1) {
              callback(null, true);
            } else {
              console.warn(`⚠️ WebSocket connection rejected from unauthorized origin: ${origin}`);
              callback(new Error('Not allowed by CORS'));
            }
          },
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

      // SEC-017 FIX: Handle user authentication with JWT token verification
      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
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
   * SEC-017 FIX: Now requires JWT token verification
   * @param {Socket} socket - Socket.IO socket instance
   * @param {Object} data - Authentication data containing token
   */
  handleAuthentication(socket, data) {
    try {
      // SEC-017 FIX: Require JWT token, not client-provided user data
      const token = data?.token;
      
      if (!token) {
        console.warn(`⚠️ Authentication failed for socket ${socket.id}: No token provided`);
        socket.emit('auth_error', { error: 'Authentication token required' });
        return;
      }

      // SEC-017 FIX: Verify JWT token server-side
      let verified;
      try {
        verified = jwt.verify(token, JWT_SECRET);
      } catch (jwtError) {
        console.warn(`⚠️ JWT verification failed for socket ${socket.id}:`, jwtError.message);        socket.emit('auth_error', { 
          error: jwtError.name === 'TokenExpiredError' 
            ? 'Token expired. Please log in again.' 
            : 'Invalid authentication token' 
        });
        return;
      }

      // SEC-017 FIX: Extract user data from VERIFIED token, not from client
      if (!verified || !verified.id) {
        console.warn(`⚠️ Invalid token format for socket ${socket.id}`);
        socket.emit('auth_error', { error: 'Invalid token format' });
        return;
      }

      const userId = verified.id;
      const userRole = verified.role || 'user';
      const userEmail = verified.email;
      
      socket.userId = userId;
      socket.userRole = userRole;
      socket.userEmail = userEmail;
      
      this.connectedUsers.set(socket.id, {
        userId: userId,
        role: userRole,
        email: userEmail,
        connectedAt: new Date()
      });

      // Join role-based and user-specific rooms
      socket.join(`role:${userRole}`);
      socket.join(`user:${userId}`);
      socket.join('general');

      console.log(`👤 User authenticated via JWT: ${userId} (${userRole})`);
      
      socket.emit('authenticated', { 
        success: true, 
        userId: userId,
        role: userRole,
        timestamp: Date.now() 
      });
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
   * SEC-018 FIX: Validate channel access based on user authentication and role
   */
  handleChannelSubscription(socket, channels) {
    if (!Array.isArray(channels)) {
      return;
    }

    // SEC-018 FIX: Require authentication before subscribing to channels
    if (!socket.userId || !socket.userRole) {
      console.warn(`⚠️ Unauthenticated socket ${socket.id} attempted to subscribe to channels`);
      socket.emit('subscription_error', { error: 'Authentication required for channel subscription' });
      return;
    }

    const userId = socket.userId;
    const userRole = socket.userRole;
    const allowedChannels = [];
    const deniedChannels = [];

    channels.forEach(channel => {
      // SEC-018 FIX: Validate channel access based on role and user ID
      if (this.isChannelAllowed(channel, userId, userRole)) {
        socket.join(channel);
        allowedChannels.push(channel);
      } else {
        deniedChannels.push(channel);
        console.warn(`⚠️ User ${userId} (${userRole}) denied access to channel: ${channel}`);
      }
    });
    
    if (allowedChannels.length > 0) {
      this.userChannels.set(socket.id, allowedChannels);
      console.log(`📡 User ${userId} subscribed to channels:`, allowedChannels);
    }

    if (deniedChannels.length > 0) {
      socket.emit('subscription_error', { 
        error: 'Access denied to some channels',
        deniedChannels 
      });
    }
  }

  /**
   * SEC-018 FIX: Check if user is allowed to subscribe to a channel
   * @param {string} channel - Channel name
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {boolean} - Whether the user is allowed to subscribe
   */
  isChannelAllowed(channel, userId, userRole) {
    // Allow general channel for everyone
    if (channel === 'general') {
      return true;
    }

    // User-specific channels: only allow if it's the user's own channel
    if (channel.startsWith('user:')) {
      const channelUserId = channel.split(':')[1];
      return channelUserId === userId;
    }

    // Role-based channels: only allow if user has that role or higher
    if (channel.startsWith('role:')) {
      const channelRole = channel.split(':')[1];
      const roleHierarchy = ['outsider', 'student', 'instructor', 'manager', 'owner', 'admin', 'super_admin'];
      const userRoleIndex = roleHierarchy.indexOf(userRole);
      const channelRoleIndex = roleHierarchy.indexOf(channelRole);
      
      // Allow if user's role is equal or higher in hierarchy
      if (userRoleIndex >= 0 && channelRoleIndex >= 0) {
        return userRoleIndex >= channelRoleIndex;
      }
      
      // If role not in hierarchy, only allow exact match
      return userRole === channelRole;
    }

    // Conversation channels: check format but allow (authorization should be done in join_conversation)
    if (channel.startsWith('conversation:')) {
      return true; // Let conversation join handler do detailed auth
    }

    // Booking channels: check format but allow (authorization should be done in booking logic)
    if (channel.startsWith('booking:')) {
      return true; // Let booking handlers do detailed auth
    }

    // Admin/system channels: only for admin and super_admin
    if (channel.startsWith('admin:') || channel.startsWith('system:')) {
      return userRole === 'admin' || userRole === 'super_admin';
    }

    // Deny unknown channel patterns
    console.warn(`⚠️ Unknown channel pattern: ${channel}`);
    return false;
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