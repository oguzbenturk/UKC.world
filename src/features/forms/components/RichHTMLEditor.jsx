/**
 * Rich HTML Editor Component
 * True WYSIWYG editor for styled content in form fields
 */

import { useState, useEffect, useRef } from 'react';
import { Input, Button, Tabs, Tooltip, ColorPicker } from 'antd';
import { 
  BoldOutlined, 
  ItalicOutlined,
  AlignCenterOutlined,
  UnorderedListOutlined,
  CodeOutlined,
  InfoCircleOutlined,
  BgColorsOutlined
} from '@ant-design/icons';

const { TextArea } = Input;

const RichHTMLEditor = ({ value = '', onChange }) => {
  const [mode, setMode] = useState('visual'); // 'visual' or 'html'
  const editorRef = useRef(null);
  const isInitialized = useRef(false);
  const lastValue = useRef(value);

  // Initialize content - only on mount or when value changes externally
  useEffect(() => {
    if (editorRef.current && mode === 'visual') {
      // Only initialize if not already set or if value changed externally
      if (!isInitialized.current || (lastValue.current !== value && document.activeElement !== editorRef.current)) {
        editorRef.current.innerHTML = value || '<p><br></p>';
        isInitialized.current = true;
        lastValue.current = value;
      }
    }
  }, [value, mode]);

  // Handle content change and notify parent immediately
  const handleContentChange = () => {
    if (editorRef.current && onChange) {
      let html = editorRef.current.innerHTML;
      // Preserve empty paragraphs
      html = html.replace(/<p><\/p>/g, '<p><br></p>');
      // Clean up any browser-added styles we don't want
      html = html.replace(/<div><br><\/div>/g, '<p><br></p>');
      lastValue.current = html;
      onChange(html);
    }
  };

  // Apply formatting to selected text
  const applyFormat = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    // Small delay to ensure DOM is updated
    setTimeout(() => handleContentChange(), 50);
  };

  // Insert HTML block at cursor
  const insertHTMLBlock = (html) => {
    if (!editorRef.current) return;
    
    editorRef.current.focus();
    const selection = window.getSelection();
    
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    // Create a temporary container
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Insert all child nodes
    const fragment = document.createDocumentFragment();
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    
    range.deleteContents();
    range.insertNode(fragment);
    
    // Move cursor to end of inserted content and add space for next content
    range.collapse(false);
    const lineBreak = document.createElement('p');
    lineBreak.innerHTML = '<br>';
    range.insertNode(lineBreak);
    
    selection.removeAllRanges();
    selection.addRange(range);
    
    handleContentChange();
  };

  // Handle keyboard events
  const handleKeyDown = (e) => {
    // Handle Enter key to ensure proper line breaks
    if (e.key === 'Enter') {
      if (!e.shiftKey) {
        // Regular Enter - create new paragraph
        document.execCommand('insertParagraph', false);
        e.preventDefault();
        setTimeout(() => handleContentChange(), 50);
      }
    }
  };

  // Quick formatting buttons
  const quickFormats = [
    {
      key: 'heading',
      label: 'Heading',
      onClick: () => applyFormat('formatBlock', '<h1>'),
    },
    {
      key: 'subheading',
      label: 'Subheading',
      onClick: () => applyFormat('formatBlock', '<h2>'),
    },
    {
      key: 'paragraph',
      label: 'Paragraph',
      onClick: () => applyFormat('formatBlock', '<p>'),
    },
    {
      key: 'bold',
      icon: <BoldOutlined />,
      onClick: () => applyFormat('bold'),
    },
    {
      key: 'italic',
      icon: <ItalicOutlined />,
      onClick: () => applyFormat('italic'),
    },
    {
      key: 'center',
      icon: <AlignCenterOutlined />,
      onClick: () => applyFormat('justifyCenter'),
    },
    {
      key: 'list',
      icon: <UnorderedListOutlined />,
      onClick: () => applyFormat('insertUnorderedList'),
    },
    {
      key: 'info-box',
      label: 'Info Box',
      icon: <InfoCircleOutlined />,
      onClick: () => insertHTMLBlock(
        '<div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 16px; padding: 28px; margin: 24px auto; max-width: 550px; border: 1px solid #bae6fd;"><p style="font-weight: 600; margin-bottom: 16px; color: #0077b6; font-size: 15px;">Important Information:</p><ul style="list-style: none; padding: 0; margin: 0;"><li style="padding: 10px 0; padding-left: 32px; color: #2d3748;">✓ Point one</li><li style="padding: 10px 0; padding-left: 32px; color: #2d3748;">✓ Point two</li></ul></div>'
      ),
    },
  ];

  return (
    <div className="rich-html-editor">
      <Tabs
        activeKey={mode}
        onChange={setMode}
        items={[
          {
            key: 'visual',
            label: 'Visual Editor',
            children: (
              <div className="space-y-3">
                {/* Quick Formatting Toolbar */}
                <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded border">
                  {quickFormats.map(format => (
                    <Tooltip key={format.key} title={format.label || format.key}>
                      <Button
                        size="small"
                        icon={format.icon}
                        onClick={format.onClick}
                      >
                        {!format.icon && format.label}
                      </Button>
                    </Tooltip>
                  ))}
                  
                  {/* Color Picker */}
                  <Tooltip title="Text Color">
                    <ColorPicker
                      size="small"
                      presets={[
                        {
                          label: 'Common Colors',
                          colors: [
                            '#000000', // Black
                            '#ffffff', // White
                            '#0077b6', // Blue
                            '#2d3748', // Dark Gray
                            '#e63946', // Red
                            '#06d6a0', // Green
                            '#f77f00', // Orange
                            '#9b59b6', // Purple
                          ],
                        },
                      ]}
                      onChange={(color) => {
                        const hexColor = color.toHexString();
                        applyFormat('foreColor', hexColor);
                      }}
                      trigger="click"
                    >
                      <Button size="small" icon={<BgColorsOutlined />} />
                    </ColorPicker>
                  </Tooltip>
                </div>

                {/* WYSIWYG Editor */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="wysiwyg-editor"
                  onInput={handleContentChange}
                  onBlur={handleContentChange}
                  onKeyDown={handleKeyDown}
                  style={{
                    minHeight: '400px',
                    padding: '16px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '6px',
                    background: 'white',
                    outline: 'none',
                    fontSize: '16px',
                    lineHeight: '1.8',
                    color: '#2d3748',
                    whiteSpace: 'pre-wrap'
                  }}
                />
                
                <div className="text-xs text-gray-500">
                  💡 Tip: Select text and use the formatting buttons above, or type naturally like in Word
                </div>
              </div>
            ),
          },
          {
            key: 'html',
            label: (
              <span>
                <CodeOutlined /> HTML Code
              </span>
            ),
            children: (
              <div className="space-y-3">
                <div className="text-xs text-gray-600">
                  Edit the raw HTML directly. Use inline styles for formatting.
                </div>
                <TextArea
                  className="font-mono text-sm"
                  rows={20}
                  value={editorRef.current?.innerHTML || value}
                  onChange={(e) => {
                    if (editorRef.current) {
                      editorRef.current.innerHTML = e.target.value;
                    }
                    if (onChange) onChange(e.target.value);
                  }}
                  placeholder="<div>Your HTML here...</div>"
                />
              </div>
            ),
          },
        ]}
      />

      <style>{`
        .wysiwyg-editor h1 {
          color: #0077b6;
          font-size: 28px;
          margin-bottom: 8px;
          margin-top: 16px;
        }
        .wysiwyg-editor h2 {
          color: #2d3748;
          font-size: 20px;
          margin-bottom: 8px;
          margin-top: 12px;
        }
        .wysiwyg-editor h3 {
          color: #2d3748;
          font-size: 18px;
          margin-bottom: 6px;
          margin-top: 10px;
        }
        .wysiwyg-editor p {
          margin-bottom: 12px;
          font-size: 16px;
          min-height: 1em;
        }
        .wysiwyg-editor p:empty:before {
          content: '\\200B'; /* Zero-width space to keep empty paragraphs */
          line-height: 1.8;
        }
        .wysiwyg-editor ul {
          margin: 12px 0;
          padding-left: 24px;
        }
        .wysiwyg-editor li {
          margin-bottom: 6px;
        }
        .wysiwyg-editor strong {
          font-weight: 600;
          color: #1f2937;
        }
        .wysiwyg-editor em {
          font-style: italic;
        }
        .wysiwyg-editor:focus {
          border-color: #1890ff;
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
        }
      `}</style>
    </div>
  );
};

export default RichHTMLEditor;
