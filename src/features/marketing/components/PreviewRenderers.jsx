import { memo } from 'react';
import { Button, Typography, Dropdown } from 'antd';
import { Editor } from '@tinymce/tinymce-react';
import { 
  MailOutlined, 
  MessageOutlined,
  WhatsAppOutlined,
  QuestionCircleOutlined,
  InfoCircleOutlined,
  BulbOutlined,
  HeartOutlined,
  StarOutlined,
  TrophyOutlined,
  GiftOutlined,
  RocketOutlined,
  FireOutlined,
  BellFilled
} from '@ant-design/icons';
import CroppableImage from './CroppableImage';

const { Text, Title } = Typography;

// Icon map for question campaigns
const ICON_MAP = {
  question: <QuestionCircleOutlined />,
  info: <InfoCircleOutlined />,
  bulb: <BulbOutlined />,
  heart: <HeartOutlined />,
  star: <StarOutlined />,
  trophy: <TrophyOutlined />,
  gift: <GiftOutlined />,
  rocket: <RocketOutlined />,
  fire: <FireOutlined />,
  bell: <BellFilled />
};

// TinyMCE configuration for inline editing
const getInlineEditorConfig = (height = 150) => ({
  height,
  menubar: false,
  plugins: ['advlist', 'autolink', 'lists', 'link', 'charmap', 'emoticons'],
  toolbar: 'undo redo | bold italic | forecolor backcolor | alignleft aligncenter alignright | emoticons | removeformat',
  content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size:14px }',
  branding: false,
  promotion: false,
  license_key: 'gpl',
});

// Format WhatsApp text with markdown-like syntax
const formatWhatsAppText = (text) => {
  if (!text) return '';
  return text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/~([^~]+)~/g, '<del>$1</del>')
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
};

/**
 * Email Preview Component
 */
export const EmailPreview = memo(({ preview, useTemplateMode, cropProps }) => {
  if (useTemplateMode && preview.templateImage) {
    return (
      <div className="relative min-h-[500px] rounded-2xl overflow-hidden bg-gradient-to-br from-purple-900 via-pink-900 to-rose-900 p-6 flex items-center justify-center">
        <div className="relative max-w-lg w-full">
          <CroppableImage
            src={preview.templateImage}
            alt="Email Template"
            className="w-full h-auto rounded-2xl shadow-2xl"
            imageKey="emailTemplate"
            {...cropProps}
          />
          {preview.overlayHtml && (
            <div className="absolute inset-0 flex items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
              <div 
                className="bg-black/50 backdrop-blur-sm rounded-xl p-4 text-white max-w-[90%]"
                dangerouslySetInnerHTML={{ __html: preview.overlayHtml }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[500px] rounded-2xl overflow-hidden bg-gray-100 p-6 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-md overflow-hidden max-w-lg w-full border border-gray-200">
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <MailOutlined className="text-lg text-gray-600" />
            <div className="flex-1">
              <Text className="text-gray-500 text-xs block">From: Kiteboarding School</Text>
              <Text className="text-gray-900 text-sm font-medium">
                {preview.subject || 'Your Amazing Subject Line'}
              </Text>
            </div>
          </div>
        </div>
        <div className="p-6" style={{ backgroundColor: preview.contentBgColor, color: preview.textColor }}>
          {preview.backgroundImage && (
            <div className="mb-6 rounded-2xl overflow-hidden shadow-xl transform hover:scale-105 transition-all duration-300">
              <CroppableImage
                src={preview.backgroundImage}
                alt="Hero"
                className="w-full h-48 object-cover"
                imageKey="emailHero"
                {...cropProps}
              />
            </div>
          )}
          <div 
            className="prose max-w-none text-lg leading-relaxed"
            style={{ color: preview.textColor }}
            dangerouslySetInnerHTML={{ __html: preview.html || 'Start typing to see your beautiful email come to life with rich formatting and styling...' }}
          />
          {preview.templateImage && !useTemplateMode && (
            <div className="mt-6 rounded-xl overflow-hidden shadow-lg">
              <CroppableImage
                src={preview.templateImage}
                alt="Template"
                className="w-full h-auto"
                imageKey="templateImage"
                {...cropProps}
              />
            </div>
          )}
          {preview.attachments && preview.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t-2 border-purple-200">
              <Text strong className="text-sm text-gray-500 mb-3 block">📎 ATTACHMENTS</Text>
              <div className="flex flex-wrap gap-2">
                {preview.attachments.map((file) => (
                  <div key={file} className="px-4 py-2 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg text-sm font-medium text-purple-700 shadow-sm">
                    {file}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Popup Preview Component
 */
export const PopupPreview = memo(({ preview, useTemplateMode, cropProps }) => {
  if (useTemplateMode && preview.templateImage) {
    return (
      <div className="relative min-h-[500px] rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6 flex items-center justify-center">
        <div className="relative max-w-md w-full">
          <CroppableImage
            src={preview.templateImage}
            alt="Popup Template"
            className="w-full h-auto rounded-2xl shadow-2xl"
            imageKey="popupTemplate"
            {...cropProps}
          />
          {preview.overlayHtml && (
            <div className="absolute inset-0 flex items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
              <div 
                className="bg-black/50 backdrop-blur-sm rounded-xl p-4 text-white max-w-[90%]"
                dangerouslySetInnerHTML={{ __html: preview.overlayHtml }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[500px] rounded-2xl overflow-hidden bg-gray-100 p-6 flex items-center justify-center">
      <div 
        className="relative rounded-xl shadow-lg p-8 max-w-md w-full border"
        style={{ 
          backgroundColor: preview.bgColor, 
          color: preview.textColor,
          borderColor: `${preview.buttonColor}40`,
          boxShadow: `0 20px 60px -15px ${preview.buttonColor}60`
        }}
      >
        {preview.imageUrl && (
          <div className="mb-6 rounded-2xl overflow-hidden shadow-xl transform hover:scale-105 transition-all duration-300">
            <CroppableImage
              src={preview.imageUrl}
              alt="Popup"
              className="w-full h-48 object-cover"
              imageKey="popupHero"
              {...cropProps}
            />
          </div>
        )}
        <Title level={2} style={{ color: preview.textColor, marginTop: 0, textShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          {preview.title || '✨ Your Popup Title'}
        </Title>
        <div 
          className="mb-8 text-lg leading-relaxed" 
          style={{ opacity: 0.9, color: preview.textColor }}
          dangerouslySetInnerHTML={{ __html: preview.html || 'Your popup message will appear here with a stunning design...' }}
        />
        <button 
          className="w-full py-4 px-8 rounded-2xl font-bold text-white text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl"
          style={{ 
            backgroundColor: preview.buttonColor,
            boxShadow: `0 10px 30px -10px ${preview.buttonColor}`
          }}
        >
          {preview.buttonText || '🚀 Click Here'}
        </button>
      </div>
    </div>
  );
});

/**
 * SMS Preview Component
 */
export const SMSPreview = memo(({ preview, cropProps }) => (
  <div 
    className="relative min-h-[500px] rounded-2xl overflow-hidden bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 p-6 flex items-center justify-center"
    style={{ backgroundColor: preview.bgColor }}
  >
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMjAgMjBMMCAwaDQwdjQweiIgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjAzIi8+PC9zdmc+')] opacity-20" />
    <div className="relative max-w-sm w-full">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[3rem] shadow-2xl p-8 border-4 border-gray-700 transform hover:scale-105 transition-all duration-500">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-green-500/30">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
            <MessageOutlined className="text-xl text-white" />
          </div>
          <Text strong className="text-white text-lg">SMS Preview</Text>
        </div>
        {preview.attachedImage && (
          <div className="mb-4 rounded-2xl overflow-hidden shadow-xl">
            <CroppableImage
              src={preview.attachedImage}
              alt="MMS"
              className="w-full h-40 object-cover"
              imageKey="smsImage"
              {...cropProps}
            />
          </div>
        )}
        <div 
          className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-3xl p-5 shadow-xl transform hover:scale-102 transition-all"
          style={{ background: preview.bubbleColor }}
        >
          <Text className="text-base font-medium leading-relaxed" style={{ color: '#ffffff' }}>
            {preview.content || '📱 Your SMS message will appear here...'}
          </Text>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/20">
            <Text className="text-xs text-white/80">
              {preview.content ? `${preview.content.length}/160 characters` : '0/160'}
            </Text>
            <Text className="text-xs text-white/80">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </div>
        </div>
      </div>
    </div>
  </div>
));

/**
 * WhatsApp Preview Component
 */
export const WhatsAppPreview = memo(({ preview, cropProps }) => (
  <div 
    className="relative min-h-[500px] rounded-2xl overflow-hidden bg-gradient-to-br from-teal-900 via-green-900 to-emerald-900 p-6 flex items-center justify-center"
    style={{ backgroundColor: preview.bgColor }}
  >
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.15),transparent_50%)]" />
    <div className="relative max-w-sm w-full">
      <div className="bg-gradient-to-br from-[#075e54] to-[#128c7e] rounded-[2.5rem] shadow-2xl p-8 border-2 border-green-400/20 transform hover:scale-105 transition-all duration-500">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/20">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-xl">
            <WhatsAppOutlined className="text-2xl text-white" />
          </div>
          <div>
            <Text strong className="text-white text-lg block">WhatsApp</Text>
            <Text className="text-green-200 text-xs">Real-time Preview</Text>
          </div>
        </div>
        <div 
          className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-5 shadow-2xl transform hover:scale-102 transition-all"
          style={{ background: preview.bubbleColor }}
        >
          {preview.mediaUrl && (
            <div className="mb-4 rounded-xl overflow-hidden shadow-lg">
              {preview.mediaType?.startsWith('application/pdf') ? (
                <div className="bg-gradient-to-br from-red-50 to-orange-50 p-6 text-center border-2 border-red-200 rounded-xl">
                  <Text className="text-3xl mb-2 block">📄</Text>
                  <Text strong className="text-red-700">PDF Document</Text>
                </div>
              ) : (
                <CroppableImage
                  src={preview.mediaUrl}
                  alt="Media"
                  className="w-full h-48 object-cover"
                  imageKey="whatsappMedia"
                  {...cropProps}
                />
              )}
            </div>
          )}
          <div 
            className="text-base text-gray-800 leading-relaxed mb-3"
            dangerouslySetInnerHTML={{ __html: formatWhatsAppText(preview.content) || '💬 Your WhatsApp message will appear here...' }}
          />
          <div className="flex justify-end items-center gap-2 pt-2">
            <Text className="text-xs text-gray-400">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <div className="flex gap-1">
              <div className="w-4 h-4 text-blue-500">✓✓</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
));

/**
 * Question Preview Component
 */
export const QuestionPreview = memo(({ 
  preview, 
  inlineEdit, 
  setInlineEdit,
  startInlineEdit, 
  saveInlineEdit, 
  cancelInlineEdit,
  inlineEditorRef,
  onIconChange
}) => {
  const iconType = preview.iconType || 'question';
  
  const iconMenuItems = [
    { key: 'question', label: 'Question', icon: <QuestionCircleOutlined /> },
    { key: 'info', label: 'Info', icon: <InfoCircleOutlined /> },
    { key: 'bulb', label: 'Idea', icon: <BulbOutlined /> },
    { key: 'heart', label: 'Heart', icon: <HeartOutlined /> },
    { key: 'star', label: 'Star', icon: <StarOutlined /> },
    { key: 'trophy', label: 'Trophy', icon: <TrophyOutlined /> },
    { key: 'gift', label: 'Gift', icon: <GiftOutlined /> },
    { key: 'rocket', label: 'Rocket', icon: <RocketOutlined /> },
    { key: 'fire', label: 'Fire', icon: <FireOutlined /> },
    { key: 'bell', label: 'Bell', icon: <BellFilled /> }
  ];

  return (
    <div 
      className="relative min-h-[500px] rounded-2xl overflow-hidden flex items-center justify-center p-6"
      style={{ 
        backgroundColor: preview.bgColor,
        backgroundImage: preview.backgroundImage ? `url(${preview.backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {preview.backgroundImage && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      )}
      <div className="relative max-w-md w-full bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 transform hover:scale-105 transition-all duration-500">
        <div className="text-center mb-8">
          <Dropdown
            menu={{
              items: iconMenuItems,
              onClick: ({ key }) => onIconChange(key)
            }}
            trigger={['click']}
          >
            <div className="text-6xl mb-4 cursor-pointer hover:scale-110 transition-transform inline-block" style={{ color: preview.textColor }}>
              {ICON_MAP[iconType]}
            </div>
          </Dropdown>
          
          {/* Editable Question Text */}
          {inlineEdit.active && inlineEdit.field === 'questionText' ? (
            <div className="mb-4">
            <Editor
              tinymceScriptSrc="/tinymce/tinymce.min.js"
              onInit={(evt, editor) => { if (inlineEditorRef) inlineEditorRef.current = editor; }}
              value={inlineEdit.tempValue}
              onEditorChange={(content) => setInlineEdit(prev => ({ ...prev, tempValue: content }))}
              init={getInlineEditorConfig(150)}
            />
            <div className="flex gap-2 mt-2 justify-center">
              <Button type="primary" size="small" onClick={saveInlineEdit}>Save</Button>
              <Button size="small" onClick={cancelInlineEdit}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => startInlineEdit('questionText', preview.questionText)}
            className="cursor-pointer hover:bg-gray-100/50 rounded p-2 transition-colors"
            title="Click to edit"
          >
            {preview.questionText ? (
              <div 
                className="text-2xl font-bold"
                style={{ color: preview.textColor, marginBottom: '8px' }}
                dangerouslySetInnerHTML={{ __html: preview.questionText }}
              />
            ) : (
              <Title level={2} style={{ color: preview.textColor, marginBottom: '8px' }}>
                Your question here? (Click to edit)
              </Title>
            )}
          </div>
        )}

        {/* Editable Subtitle */}
        {inlineEdit.active && inlineEdit.field === 'subtitle' ? (
          <div className="mb-4">
            <Editor
              tinymceScriptSrc="/tinymce/tinymce.min.js"
              value={inlineEdit.tempValue}
              onEditorChange={(content) => setInlineEdit(prev => ({ ...prev, tempValue: content }))}
              init={getInlineEditorConfig(100)}
            />
            <div className="flex gap-2 mt-2 justify-center">
              <Button type="primary" size="small" onClick={saveInlineEdit}>Save</Button>
              <Button size="small" onClick={cancelInlineEdit}>Cancel</Button>
            </div>
          </div>
        ) : (
          preview.subtitle && (
            <div 
              onClick={() => startInlineEdit('subtitle', preview.subtitle)}
              className="cursor-pointer hover:bg-gray-100/50 rounded p-2 transition-colors"
              title="Click to edit"
            >
              <div 
                className="text-gray-600 text-base"
                dangerouslySetInnerHTML={{ __html: preview.subtitle }}
              />
            </div>
          )
        )}
      </div>
      <div className="space-y-3">
        {preview.answers.map((answer, index) => (
          answer.text && (
            <button
              key={answer.id || index}
              className="w-full py-4 px-6 rounded-xl font-semibold text-white text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
              style={{ 
                backgroundColor: answer.buttonColor || '#3b82f6',
                boxShadow: `0 10px 30px -10px ${answer.buttonColor || '#3b82f6'}`
              }}
            >
              {answer.text}
            </button>
          )
        ))}
        {preview.answers.filter(a => a.text).length === 0 && (
          <div className="text-center text-gray-400 py-8">
            Add answer options below
          </div>
        )}
      </div>
    </div>
  </div>
);
});

// Add display names for debugging
EmailPreview.displayName = 'EmailPreview';
PopupPreview.displayName = 'PopupPreview';
SMSPreview.displayName = 'SMSPreview';
WhatsAppPreview.displayName = 'WhatsAppPreview';
QuestionPreview.displayName = 'QuestionPreview';

export default {
  EmailPreview,
  PopupPreview,
  SMSPreview,
  WhatsAppPreview,
  QuestionPreview
};
