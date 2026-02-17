import { useRef } from 'react';
import { Input, Tooltip } from 'antd';
import { BoldOutlined, ItalicOutlined, StrikethroughOutlined } from '@ant-design/icons';

/**
 * WhatsApp native formatting toolbar
 * Supports: *bold*, _italic_, ~strikethrough~, ```monospace```
 */
const WhatsAppToolbar = ({ textareaRef, value, onChange }) => {
  const applyFormat = (format) => {
    const textarea = textareaRef.current?.resizableTextArea?.textArea;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value || '';
    const selectedText = text.substring(start, end);

    const formats = {
      bold: { prefix: '*', suffix: '*' },
      italic: { prefix: '_', suffix: '_' },
      strikethrough: { prefix: '~', suffix: '~' },
      monospace: { prefix: '```', suffix: '```' },
    };

    if (formats[format]) {
      const { prefix, suffix } = formats[format];
      const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
      const newCursorPos = end + prefix.length + suffix.length;
      onChange(newText);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  const ToolBtn = ({ icon, tooltip, onClick }) => (
    <Tooltip title={tooltip}>
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-green-100 transition-colors text-gray-600 hover:text-green-600"
      >
        {icon}
      </button>
    </Tooltip>
  );

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-2">
      <div className="flex items-center gap-1">
        <ToolBtn icon={<BoldOutlined />} tooltip="Bold (*text*)" onClick={() => applyFormat('bold')} />
        <ToolBtn icon={<ItalicOutlined />} tooltip="Italic (_text_)" onClick={() => applyFormat('italic')} />
        <ToolBtn icon={<StrikethroughOutlined />} tooltip="Strikethrough (~text~)" onClick={() => applyFormat('strikethrough')} />
        <ToolBtn 
          icon={<span className="text-xs font-mono">{'<>'}</span>} 
          tooltip="Monospace (```text```)" 
          onClick={() => applyFormat('monospace')} 
        />
      </div>
      <div className="mt-2 pt-2 border-t border-green-200 text-xs text-green-700">
        <span className="font-medium">WhatsApp native:</span> *bold*, _italic_, ~strike~, ```mono```
      </div>
    </div>
  );
};

/**
 * WhatsApp TextArea with formatting toolbar
 */
export const WhatsAppTextArea = ({ value, onChange, placeholder, rows = 5 }) => {
  const textAreaRef = useRef(null);
  
  return (
    <div>
      <WhatsAppToolbar 
        textareaRef={textAreaRef}
        value={value}
        onChange={onChange}
      />
      <Input.TextArea
        ref={textAreaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="font-sans"
        style={{ fontSize: '14px', lineHeight: '1.6' }}
      />
    </div>
  );
};

export default WhatsAppToolbar;
