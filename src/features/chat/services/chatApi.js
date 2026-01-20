/**
 * Chat API Service
 * 
 * API client for chat system endpoints
 */

import apiClient from '@/shared/services/apiClient';

class ChatApi {
  /**
   * Get user's conversations
   */
  static async getConversations(limit = 50, offset = 0) {
    const { data } = await apiClient.get('/chat/conversations', {
      params: { limit, offset }
    });
    return data.conversations || [];
  }

  /**
   * Get available channels to join
   */
  static async getAvailableChannels() {
    const { data } = await apiClient.get('/chat/channels/available');
    return data.channels || [];
  }

  /**
   * Join a channel
   */
  static async joinChannel(channelId) {
    const { data } = await apiClient.post(`/chat/channels/${channelId}/join`);
    return data.channel;
  }

  /**
   * Get conversation details
   */
  static async getConversationDetails(conversationId) {
    const { data } = await apiClient.get(`/chat/conversations/${conversationId}`);
    return data;
  }

  /**
   * Create or get direct conversation
   */
  static async createDirectConversation(otherUserId) {
    const { data } = await apiClient.post('/chat/conversations/direct', {
      otherUserId
    });
    return data;
  }

  /**
   * Create group (admin/manager only)
   */
  static async createGroup(name, participantIds = [], welcomeMessage = '') {
    const { data } = await apiClient.post('/chat/conversations/group', {
      name,
      participantIds,
      welcomeMessage
    });
    return data;
  }

  /**
   * Create channel (admin/manager only)
   */
  static async createChannel(name, participantIds = [], welcomeMessage = '') {
    const { data } = await apiClient.post('/chat/conversations/channel', {
      name,
      participantIds,
      welcomeMessage
    });
    return data;
  }

  /**
   * Delete conversation (admin/manager only, or conversation owner)
   */
  static async deleteConversation(conversationId) {
    const { data } = await apiClient.delete(`/chat/conversations/${conversationId}`);
    return data;
  }

  /**
   * Get messages for a conversation
   */
  static async getMessages(conversationId, limit = 50, beforeMessageId = null) {
    const { data } = await apiClient.get(`/chat/conversations/${conversationId}/messages`, {
      params: { limit, before: beforeMessageId }
    });
    return data.messages || [];
  }

  /**
   * Send a text message
   */
  static async sendTextMessage(conversationId, content) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
      messageType: 'text',
      content
    });
    return data;
  }

  /**
   * Send image message
   */
  static async sendImageMessage(conversationId, attachmentUrl, attachmentFilename, attachmentSize, content = null) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
      messageType: 'image',
      content,
      attachmentUrl,
      attachmentFilename,
      attachmentSize
    });
    return data;
  }

  /**
   * Send file message
   */
  static async sendFileMessage(conversationId, attachmentUrl, attachmentFilename, attachmentSize) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
      messageType: 'file',
      attachmentUrl,
      attachmentFilename,
      attachmentSize
    });
    return data;
  }

  /**
   * Send voice message
   */
  static async sendVoiceMessage(conversationId, attachmentUrl, attachmentFilename, attachmentSize, voiceDuration, voiceTranscript = null) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
      messageType: 'voice',
      attachmentUrl,
      attachmentFilename,
      attachmentSize,
      voiceDuration,
      voiceTranscript
    });
    return data;
  }

  /**
   * Mark conversation as read
   */
  static async markAsRead(conversationId) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/read`);
    return data;
  }

  /**
   * Search messages (full-text search)
   */
  static async searchMessages(query, conversationIds = null, limit = 50) {
    const { data } = await apiClient.get('/chat/search', {
      params: { 
        q: query, 
        conversations: conversationIds ? conversationIds.join(',') : null,
        limit 
      }
    });
    return data;
  }

  /**
   * Add participants to conversation
   */
  static async addParticipants(conversationId, userIds) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/participants`, {
      userIds
    });
    return data;
  }

  /**
   * Leave conversation
   */
  static async leaveConversation(conversationId) {
    const { data } = await apiClient.post(`/chat/conversations/${conversationId}/leave`);
    return data;
  }

  /**
   * Upload chat image
   */
  static async uploadChatImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const { data } = await apiClient.post('/upload/chat-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  }

  /**
   * Upload chat file
   */
  static async uploadChatFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const { data } = await apiClient.post('/upload/chat-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  }

  /**
   * Upload voice message
   */
  static async uploadVoiceMessage(file, duration) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('duration', duration);
    
    const { data } = await apiClient.post('/upload/voice-message', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  }

  /**
   * Get chat system statistics (admin only)
   */
  static async getStats() {
    const { data } = await apiClient.get('/chat/admin/stats');
    return data;
  }

  /**
   * Health check
   */
  static async healthCheck() {
    const { data } = await apiClient.get('/chat/health');
    return data;
  }
}

export default ChatApi;
