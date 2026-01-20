/**
 * MessageInput Component
 * 
 * Modern, calm input with emoji, attachments, and voice recording
 * Design: Clean, minimal, professional
 */

import { useState, useRef, useCallback } from 'react';
import { Input, Upload, Popover, message as antdMessage, Tooltip } from 'antd';
import { 
  SendOutlined, 
  SmileOutlined, 
  PictureOutlined,
  PaperClipOutlined,
  AudioOutlined,
  LoadingOutlined,
  StopOutlined
} from '@ant-design/icons';
import EmojiPicker from 'emoji-picker-react';
import ChatApi from '../services/chatApi';

const { TextArea } = Input;

// eslint-disable-next-line complexity
const MessageInput = ({ 
  conversationId, 
  onMessageSent,
  onTyping,
  onStopTyping 
}) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const typingTimeoutRef = useRef(null);
  const textAreaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  const handleTyping = useCallback(() => {
    if (onTyping) onTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (onStopTyping) onStopTyping();
    }, 3000);
  }, [onTyping, onStopTyping]);

  const handleChange = (e) => {
    setMessage(e.target.value);
    handleTyping();
  };

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    try {
      setSending(true);
      const sentMessage = await ChatApi.sendTextMessage(conversationId, message.trim());
      setMessage('');
      if (onStopTyping) onStopTyping();
      if (onMessageSent) onMessageSent(sentMessage);
    } catch {
      antdMessage.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
    setShowEmoji(false);
    textAreaRef.current?.focus();
  };

  const handleImageUpload = async (file) => {
    try {
      setUploading(true);
      const uploadResult = await ChatApi.uploadChatImage(file);
      const sentMessage = await ChatApi.sendImageMessage(
        conversationId,
        uploadResult.url,
        uploadResult.filename,
        uploadResult.size
      );
      if (onMessageSent) onMessageSent(sentMessage);
    } catch {
      antdMessage.error('Failed to send image');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleFileUpload = async (file) => {
    try {
      setUploading(true);
      const uploadResult = await ChatApi.uploadChatFile(file);
      const sentMessage = await ChatApi.sendFileMessage(
        conversationId,
        uploadResult.url,
        uploadResult.filename,
        uploadResult.size
      );
      if (onMessageSent) onMessageSent(sentMessage);
    } catch {
      antdMessage.error('Failed to send file');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = recordingTime;
        
        try {
          const uploadResult = await ChatApi.uploadVoiceMessage(audioBlob, duration);
          const sentMessage = await ChatApi.sendVoiceMessage(
            conversationId,
            uploadResult.url,
            uploadResult.filename,
            uploadResult.size,
            duration
          );
          if (onMessageSent) onMessageSent(sentMessage);
        } catch {
          antdMessage.error('Failed to send voice message');
        }

        stream.getTracks().forEach(track => track.stop());
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch {
      antdMessage.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const ActionButton = ({ icon, onClick, title, loading: btnLoading, disabled, active }) => (
    <Tooltip title={title}>
      <button
        onClick={onClick}
        disabled={disabled || btnLoading}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors
          ${active ? 'bg-red-50 text-red-500' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {btnLoading ? <LoadingOutlined /> : icon}
      </button>
    </Tooltip>
  );

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-3">
      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 rounded-lg">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-600 font-medium">Recording {formatRecordingTime(recordingTime)}</span>
          <button
            onClick={stopRecording}
            className="ml-auto text-red-600 hover:text-red-700 text-sm font-medium"
          >
            Stop & Send
          </button>
        </div>
      )}

      <div className="flex flex-row items-end gap-2 w-full">
        {/* Actions - hidden on mobile, shown on larger screens */}
        <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
          <Popover
            content={
              <EmojiPicker 
                onEmojiClick={handleEmojiClick}
                width={320}
                height={380}
                searchPlaceholder="Search emoji..."
                skinTonesDisabled
                previewConfig={{ showPreview: false }}
              />
            }
            trigger="click"
            open={showEmoji}
            onOpenChange={setShowEmoji}
            placement="topLeft"
          >
            <div>
              <ActionButton icon={<SmileOutlined />} title="Emoji" />
            </div>
          </Popover>

          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleImageUpload}
            disabled={uploading || sending || recording}
          >
            <ActionButton icon={<PictureOutlined />} title="Image" loading={uploading} disabled={recording} />
          </Upload>

          <Upload
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            showUploadList={false}
            beforeUpload={handleFileUpload}
            disabled={uploading || sending || recording}
          >
            <ActionButton icon={<PaperClipOutlined />} title="File" disabled={recording} />
          </Upload>

          <ActionButton
            icon={recording ? <StopOutlined /> : <AudioOutlined />}
            title={recording ? 'Stop recording' : 'Voice message'}
            onClick={recording ? stopRecording : startRecording}
            active={recording}
            disabled={uploading || sending}
          />
        </div>

        {/* Input - takes full remaining width */}
        <div className="flex-1 min-w-0">
          <TextArea
            ref={textAreaRef}
            value={message}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="w-full border-gray-200 rounded-xl resize-none focus:border-slate-300 hover:border-gray-300"
            style={{ width: '100%' }}
            disabled={sending || uploading || recording}
          />
        </div>

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending || uploading || recording}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-700 text-white
            hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? <LoadingOutlined /> : <SendOutlined />}
        </button>
      </div>

      <p className="text-[11px] text-gray-400 mt-2 px-1 hidden sm:block">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
};

export default MessageInput;
