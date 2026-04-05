/**
 * MessageBubble Component
 * 
 * Modern, calm message display with subtle role indicators
 * Design: Clean bubbles, professional tone, soft colors
 */

import { Tooltip, Image } from 'antd';
import { 
  FileTextOutlined, 
  PlayCircleOutlined,
  DownloadOutlined,
  CheckOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { format } from 'date-fns';

// Subtle role colors - professional, not flashy
const ROLE_STYLES = {
  admin: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Admin' },
  manager: { bg: 'bg-indigo-50', text: 'text-indigo-600', label: 'Manager' },
  instructor: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Instructor' },
  support: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Support' },
  student: { bg: 'bg-gray-50', text: 'text-gray-600', label: '' },
  trusted_customer: { bg: 'bg-cyan-50', text: 'text-cyan-600', label: 'Verified' },
  outsider: { bg: 'bg-gray-50', text: 'text-gray-500', label: '' },
  default: { bg: 'bg-gray-50', text: 'text-gray-600', label: '' }
};

const getRoleStyle = (role) => {
  const key = role?.toLowerCase() || 'default';
  return ROLE_STYLES[key] || ROLE_STYLES.default;
};

// eslint-disable-next-line complexity
const MessageBubble = ({ 
  message, 
  isOwn, 
  showAvatar = true,
  showTimestamp = true 
}) => {
  const {
    sender_name,
    sender_role,
    content,
    message_type,
    attachment_url,
    attachment_filename,
    attachment_size,
    voice_duration,
    created_at,
    read_by = []
  } = message;

  const roleStyle = getRoleStyle(sender_role);

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderAttachment = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const fileUrl = `${apiUrl}/uploads/${attachment_url}`;

    switch (message_type) {
      case 'image':
        return (
          <div className="mt-2 rounded-lg overflow-hidden">
            <Image
              src={fileUrl}
              alt={attachment_filename}
              className="max-w-[280px] rounded-lg"
              preview={{ mask: <span className="text-xs">View</span> }}
            />
          </div>
        );

      case 'file':
        return (
          <a
            href={fileUrl}
            download={attachment_filename}
            className={`flex items-center gap-3 mt-2 p-3 rounded-lg transition-colors
              ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-gray-50 hover:bg-gray-100'}`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center
              ${isOwn ? 'bg-white/20' : 'bg-slate-100'}`}>
              <FileTextOutlined className={isOwn ? 'text-white' : 'text-slate-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-gray-700'}`}>
                {attachment_filename}
              </div>
              <div className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
                {formatFileSize(attachment_size)}
              </div>
            </div>
            <DownloadOutlined className={isOwn ? 'text-white/70' : 'text-gray-400'} />
          </a>
        );

      case 'voice':
        return (
          <div className={`mt-2 p-3 rounded-lg ${isOwn ? 'bg-white/20' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-3">
              <button className={`w-10 h-10 rounded-full flex items-center justify-center
                ${isOwn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}
                transition-colors`}>
                <PlayCircleOutlined className="text-lg" />
              </button>
              <div className="flex-1">
                <audio controls className="w-full h-8 opacity-80">
                  <source src={fileUrl} type="audio/webm" />
                  <source src={fileUrl} type="audio/mp4" />
                </audio>
                <span className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
                  {formatDuration(voice_duration)}
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`flex gap-2 mb-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {showAvatar && !isOwn ? (
        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium
          ${roleStyle.bg} ${roleStyle.text}`}>
          {sender_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      ) : (
        <div className="w-8 flex-shrink-0" />
      )}
      
      <div className={`flex flex-col max-w-[85%] sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender info - subtle */}
        {!isOwn && showAvatar && (
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-xs font-medium text-gray-600">{sender_name}</span>
            {roleStyle.label && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${roleStyle.bg} ${roleStyle.text}`}>
                {roleStyle.label}
              </span>
            )}
          </div>
        )}

        {/* Message bubble - calm colors */}
        <div
          className={`px-4 py-2.5 rounded-2xl
            ${isOwn 
              ? 'bg-slate-700 text-white rounded-br-md' 
              : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md'
            }
            ${message_type === 'system' ? 'bg-amber-50 text-amber-800 italic text-sm border border-amber-100' : ''}
          `}
        >
          {content && (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {content}
            </div>
          )}
          
          {renderAttachment()}
        </div>

        {/* Timestamp and read status - minimal */}
        {showTimestamp && (
          <div className={`flex items-center gap-1.5 mt-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
            <span className="text-[11px] text-gray-400">
              {format(new Date(created_at), 'HH:mm')}
            </span>
            
            {/* Read receipts - subtle */}
            {isOwn && (
              <Tooltip title={read_by?.length > 0 ? `Read by ${read_by.map(r => r.name).join(', ')}` : 'Sent'}>
                {read_by?.length > 0 ? (
                  <CheckCircleOutlined className="text-[11px] text-blue-400" />
                ) : (
                  <CheckOutlined className="text-[11px] text-gray-400" />
                )}
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
