/**
 * Form Preview Modal Component
 * Full-screen modal with device preview options
 */

import { useState } from 'react';
import { 
  Modal, 
  Button, 
  Radio, 
  Space, 
  Tooltip,
  Typography,
  Divider 
} from 'antd';
import { 
  DesktopOutlined, 
  TabletOutlined, 
  MobileOutlined,
  ExpandOutlined,
  CloseOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import FormPreview from './FormPreview';

const { Text } = Typography;

// Device presets
const DEVICE_PRESETS = {
  desktop: { width: '100%', height: '100%', label: 'Desktop' },
  tablet: { width: 768, height: 1024, label: 'Tablet' },
  mobile: { width: 375, height: 667, label: 'Mobile' },
};

/**
 * FormPreviewModal - Full-screen preview with device simulation
 */
const FormPreviewModal = ({
  open,
  onClose,
  formTemplate,
  steps = [],
  title
}) => {
  const [device, setDevice] = useState('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [key, setKey] = useState(0);

  // Get current device settings
  const currentDevice = DEVICE_PRESETS[device];

  // Get computed steps from formTemplate if not provided directly
  const previewSteps = steps.length > 0 ? steps : formTemplate?.steps || [];

  // Reset form preview
  const handleReset = () => {
    setKey(prev => prev + 1);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Render device frame
  const renderDeviceFrame = (content) => {
    if (device === 'desktop') {
      return (
        <div style={{ height: 'calc(100vh - 200px)', overflow: 'auto' }}>
          {content}
        </div>
      );
    }

    // Mobile/Tablet frame
    return (
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'flex-start',
          padding: 24,
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 200px)',
          overflow: 'auto'
        }}
      >
        <div
          style={{
            width: currentDevice.width,
            maxHeight: currentDevice.height,
            backgroundColor: '#fff',
            borderRadius: device === 'mobile' ? 40 : 20,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            border: device === 'mobile' ? '8px solid #1a1a1a' : '12px solid #333',
            position: 'relative'
          }}
        >
          {/* Notch for mobile */}
          {device === 'mobile' && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 120,
                height: 28,
                backgroundColor: '#1a1a1a',
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
                zIndex: 10
              }}
            />
          )}
          
          {/* Screen content */}
          <div
            style={{
              height: currentDevice.height - (device === 'mobile' ? 80 : 40),
              overflow: 'auto',
              padding: device === 'mobile' ? '36px 8px 8px' : 16,
              backgroundColor: '#fff'
            }}
          >
            {content}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width={isFullscreen ? '100vw' : '90vw'}
      style={isFullscreen ? { 
        top: 0, 
        padding: 0, 
        maxWidth: '100vw' 
      } : { 
        top: 20 
      }}
      styles={{ 
        body: { padding: 0 },
        content: isFullscreen ? { borderRadius: 0 } : {}
      }}
      closable={false}
      destroyOnHidden
    >
      {/* Header Toolbar */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: '#fafafa'
        }}
      >
        {/* Title and info */}
        <div>
          <Text strong style={{ fontSize: 16 }}>
            {title || formTemplate?.name || 'Form Preview'}
          </Text>
          <Text type="secondary" style={{ marginLeft: 12 }}>
            Preview Mode - No data will be submitted
          </Text>
        </div>

        {/* Device selector */}
        <Space>
          <Radio.Group 
            value={device} 
            onChange={e => setDevice(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Tooltip title="Desktop">
              <Radio.Button value="desktop">
                <DesktopOutlined />
              </Radio.Button>
            </Tooltip>
            <Tooltip title="Tablet">
              <Radio.Button value="tablet">
                <TabletOutlined />
              </Radio.Button>
            </Tooltip>
            <Tooltip title="Mobile">
              <Radio.Button value="mobile">
                <MobileOutlined />
              </Radio.Button>
            </Tooltip>
          </Radio.Group>

          <Divider type="vertical" />

          <Tooltip title="Reset form">
            <Button 
              icon={<ReloadOutlined />} 
              onClick={handleReset}
              size="small"
            />
          </Tooltip>

          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <Button 
              icon={<ExpandOutlined />} 
              onClick={toggleFullscreen}
              size="small"
            />
          </Tooltip>

          <Tooltip title="Close preview">
            <Button 
              icon={<CloseOutlined />} 
              onClick={onClose}
              size="small"
              danger
            />
          </Tooltip>
        </Space>
      </div>

      {/* Preview Content */}
      <div 
        style={{ 
          backgroundColor: device === 'desktop' ? '#fff' : '#f5f5f5'
        }}
      >
        {renderDeviceFrame(
          <FormPreview
            key={key}
            template={formTemplate}
            steps={previewSteps}
            showStepNavigation={true}
            embedded={device !== 'desktop'}
          />
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 24px',
          borderTop: '1px solid #f0f0f0',
          backgroundColor: '#fafafa',
          textAlign: 'center'
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Viewing as: {currentDevice.label}
          {device !== 'desktop' && ` (${currentDevice.width}×${currentDevice.height}px)`}
        </Text>
      </div>
    </Modal>
  );
};

export default FormPreviewModal;
