# Live Chat Implementation Progress

## ✅ Completed (Steps 1-10: Backend + Frontend Foundation)

### 1. Database Migration (118_create_chat_system.sql)
- **conversations** table: direct (1:1), group, channel types
- **conversation_participants**: role-based membership with read receipts
- **messages**: 5-day retention, full-text search (tsvector + GIN index), GDPR-compliant soft delete
- **message_reactions**: emoji reactions (MVP+)
- Helper functions: `get_unread_count()`, `cleanup_expired_messages()`, `search_messages()`
- Automatic "Support" channel creation on first admin

### 2. Message Cleanup Service (messageCleanupService.js)
- Cron job: Daily at 3 AM (5-day retention)
- Monthly orphaned file cleanup (1st of month, 4 AM)
- GDPR-compliant soft delete (nullifies content + attachments)
- File system cleanup for chat-images/, chat-files/, voice-messages/
- Statistics endpoint for monitoring

### 3. Chat Service (chatService.js)
- **1:1 conversations**: Auto-created on first message between users
- **Groups/Channels**: Admin/manager only creation
- **Messaging**: Send/receive with attachments, voice messages, transcripts
- **Full-text search**: Conversation-scoped (privacy) or global (admin/manager)
- **Read receipts**: Shared with all participants (last_read_at)
- Role-based access control throughout

### 4. Chat Routes (chat.js)
- GET /conversations - List user conversations with unread counts
- POST /conversations/direct - Auto-create 1:1 conversations
- POST /conversations/group - Create group (admin/manager)
- POST /conversations/channel - Create channel (admin/manager)
- POST /conversations/:id/messages - Send message (rate limited: 20/min)
- POST /conversations/:id/read - Mark as read
- GET /search - Full-text search (role-aware)
- Admin endpoints: /admin/stats, /admin/cleanup

### 5. Extended GDPR Service ✅
File: [backend/services/gdprDataExportService.js](backend/services/gdprDataExportService.js)
- ✅ Added `getChatMessages()` to export user conversations + messages
- ✅ Included chat data in `exportUserData()` package
- ✅ Implemented chat anonymization in `anonymizeUserData()`
- ✅ Nullifies message content, attachments, transcripts on erasure
- ✅ Marks participants as left (maintains history integrity)

### 6. Extended Socket.IO ✅
File: [backend/services/socketService.js](backend/services/socketService.js)
- ✅ Added `handleJoinConversation()` / `handleLeaveConversation()`
- ✅ Added `handleTypingIndicator()` / `handleStopTyping()`
- ✅ Added `emitToConversation()`, `emitMessageSent()`, `emitMessageRead()`
- ✅ Auto-broadcast user_joined, user_left events
- ✅ Typing indicators (ephemeral, 3s timeout)

### 7. Chat Media Upload Routes ✅
File: [backend/routes/upload.js](backend/routes/upload.js)
- ✅ POST /upload/chat-image (10MB, jpg/png/gif → chat-images/)
- ✅ POST /upload/chat-file (25MB, pdf/docx/xlsx → chat-files/)
- ✅ POST /upload/voice-message (5MB, 2-min validation → voice-messages/)
- ✅ File type and size validation
- ✅ Returns relative path, filename, size, duration

### 8. Frontend Feature Structure ✅
Directory: [src/features/chat/](src/features/chat/)
- ✅ Created folders: components/, hooks/, services/, pages/
- ✅ Created [chatApi.js](src/features/chat/services/chatApi.js) - API client wrapper
- ✅ Created [useChat.js](src/features/chat/hooks/useChat.js) - Socket.IO hook

### 9. Build Chat UI Components
Directory: [src/features/chat/components/](src/features/chat/components/)
- 🚧 **IN PROGRESS** - Core components needed:
  - ChatSidebar.jsx - Conversation list
  - ChatWindow.jsx - Main chat interface
  - MessageBubble.jsx - Individual messages with role tags
  - MessageInput.jsx - Text input + emoji picker
  - VoiceRecorder.jsx - Record voice messages
  - See "Remaining Frontend Work" section below

### 10. Server Integration ✅
File: [backend/server.js](backend/server.js)
- ✅ Imported chatRouter and MessageCleanupService
- ✅ Mounted route: `app.use('/api/chat', chatRouter)`
- ✅ Initialized cleanup scheduler on server start
- ✅ Logs: "Message cleanup scheduler started"

## 🚧 Remaining Frontend Work

### UI Components Needed
File: `backend/services/gdprDataExportService.js`
- Add chat messages to `exportUserData()` (within 5-day window)
- Add conversations to user export
- Implement `anonymizeChatData()` in `anonymizeUserData()`
- Ensure cascade delete from users → conversation_participants

### 6. Extend Socket.IO
File: `backend/services/socketService.js`
- Add `emitToConversation(conversationId, event, data)` method
- Handle `chat:send_message` event (broadcast to conversation room)
- Handle `chat:typing` event (ephemeral, 3s timeout, no DB)
- Handle `chat:mark_read` event (broadcast receipt to all participants)
- Handle `chat:user_online` / `chat:user_offline` (room-based presence)
- Auto-join conversation rooms on socket connect

### 7. Upload Routes for Chat Media
File: `backend/routes/upload.js`
- POST /upload/chat-image (10MB, jpg/png/gif → uploads/chat-images/)
- POST /upload/chat-file (25MB, pdf/docx/xlsx → uploads/chat-files/)
- POST /upload/voice-message (5MB, webm/mp4/m4a, 2-min validation → uploads/voice-messages/)

### 8. Frontend Feature Structure
```
src/features/chat/
├── components/
│   ├── ChatSidebar.jsx          # Conversation list
│   ├── ConversationList.jsx     # With unread badges
│   ├── ConversationHeader.jsx   # Participants, type
│   ├── ChatWindow.jsx           # Main chat UI
│   ├── MessageList.jsx          # Message history
│   ├── MessageBubble.jsx        # Single message with role tags
│   ├── MessageInput.jsx         # Text input + emoji picker
│   ├── VoiceRecorder.jsx        # Record voice messages
│   ├── AttachmentPreview.jsx   # Image/file previews
│   ├── TypingIndicator.jsx     # "User is typing..."
│   └── SearchBar.jsx            # Full-text search (admin/manager)
├── hooks/
│   ├── useChat.js               # Socket.IO connection
│   ├── useConversations.js      # Fetch conversations
│   ├── useMessages.js           # Fetch/send messages
│   └── useVoiceRecorder.js      # MediaRecorder API
├── services/
│   └── chatApi.js               # API client calls
└── pages/
    └── ChatPage.jsx             # Main chat page
```

### 9. Chat UI Components
- **Ant Design**: `List`, `Avatar`, `Badge`, `Upload.Dragger`, `Tooltip`, `Tag`
- **Tailwind**: Custom styling, role colors
- **Role badges**: Admin (blue), Manager (purple), Instructor (green), Student (gray)
- **Read receipts**: Small avatars below message
- **Voice recorder**: MediaRecorder with `audio/webm;codecs=opus`, waveform visualization
- **Emoji picker**: Use `emoji-picker-react` package

### 10. Server Integration
File: `backend/server.js`
```javascript
import chatRouter from './routes/chat.js';
import MessageCleanupService from './services/messageCleanupService.js';

// Routes
app.use('/api/chat', chatRouter);

// Start message cleanup scheduler
MessageCleanupService.startScheduler();
```

## 📋 Recommendations for Further Considerations

### 1. Voice Transcription: Web Speech API (Client-Side)
**Recommendation**: Use browser's Web Speech API (free, no server cost)
- Runs on client (Firefox, Chrome, Edge)
- No API keys or costs
- Limited language support (English best)
- Alternative: Record → upload → transcribe server-side with Vosk (offline, free)
  - Vosk models: 50MB (tiny) - 1.8GB (large)
  - Run as microservice: `docker run -p 2700:2700 alphacep/kaldi-en`
  - API call: POST audio file → get transcript JSON

### 2. Search Permissions: **Hybrid Approach**
- **Default**: Conversation-scoped (privacy-first)
- **Admin/Manager**: Global search across all conversations (moderation)
- **Implementation**: Already built in `chatService.searchMessages()`

### 3. Conversation Archival: **Phase 2 Feature**
- Mark conversations with no messages in 30+ days as "archived"
- Users can manually archive/unarchive
- Archived conversations hidden from main list but searchable
- Add `archived_at` column to `conversation_participants`

### 4. Rate Limiting: **✅ Implemented**
- 20 messages/minute per user (anti-spam)
- 429 status code with `retryAfter` header
- Automatic cleanup of rate limit cache

### 5. Message Editing/Deletion: **Recommended**
- Edit window: 5 minutes after sending
- Add `edited_at` column (already in migration)
- Socket.IO event: `chat:message_edited`
- UI: Show "(edited)" indicator
- Deletion: User can delete own messages (soft delete)

## 🎯 MVP Feature Checklist

- [x] Database schema with full-text search
- [x] 5-day message retention (GDPR)
- [x] Conversation management (1:1, group, channel)
- [x] Message sending with attachments
- [x] Read receipts
- [x] Rate limiting (anti-spam)
- [x] Full-text search (role-aware)
- [ ] GDPR data export/anonymization
- [ ] Socket.IO real-time events
- [ ] Upload routes for media
- [ ] Frontend components
- [ ] Voice recording (client-side)
- [ ] Emoji reactions
- [ ] Message editing (5-min window)

### Key Implementation Files Created

**Backend:**
- [118_create_chat_system.sql](backend/db/migrations/118_create_chat_system.sql) - Database schema
- [messageCleanupService.js](backend/services/messageCleanupService.js) - 5-day retention cron
- [chatService.js](backend/services/chatService.js) - Business logic
- [chat.js](backend/routes/chat.js) - REST API endpoints
- [gdprDataExportService.js](backend/services/gdprDataExportService.js) - Extended with chat
- [socketService.js](backend/services/socketService.js) - Extended with chat events
- [upload.js](backend/routes/upload.js) - Added chat media endpoints
- [server.js](backend/server.js) - Integrated chat routes + cleanup

**Frontend:**
- [chatApi.js](src/features/chat/services/chatApi.js) - API client
- [useChat.js](src/features/chat/hooks/useChat.js) - Socket.IO hook
- Directory structure: components/, hooks/, services/, pages/

## 🚀 Deployment Checklist

1. **Run migration**: `npm run migrate` or execute [118_create_chat_system.sql](backend/db/migrations/118_create_chat_system.sql)
2. **Create upload directories**:
   ```bash
   mkdir -p backend/uploads/chat-images
   mkdir -p backend/uploads/chat-files
   mkdir -p backend/uploads/voice-messages
   ```
3. **Environment variables**: No new env vars needed (uses existing DB config)
4. **Restart server**: Cleanup scheduler auto-starts
5. **Test endpoints**: GET /api/chat/health should return 200
6. **Monitor logs**: Check daily 3 AM for cleanup job logs

## 💡 Pro Tips

- **Performance**: Add Redis cache for online user presence (Phase 2)
- **Scalability**: Socket.IO adapter for multi-server (Redis pub/sub)
- **Analytics**: Track message volume, peak hours, top channels
- **Moderation**: Admin can soft-delete any message (add endpoint)
- **Notifications**: Integrate with NotificationContext (email for offline users)
- **Mobile**: Voice messages work on iOS/Android (MediaRecorder API)

---

**Estimated Remaining Time**: 4-6 hours for steps 5-10 (GDPR + Socket.IO + Frontend)
