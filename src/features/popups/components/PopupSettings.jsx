import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Tabs,
  Form,
  Input,
  Button,
  Switch,
  Select,
  InputNumber,
  Space,
  Row,
  Col,
  Modal,
  Typography,
  Tag,
  Tooltip
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  EyeOutlined,
  SaveOutlined,
  DeleteOutlined,
  CopyOutlined
} from '@ant-design/icons';
import PopupDisplay from './PopupDisplay';
import PopupTemplates from './PopupTemplates';
import PopupAnalytics from './PopupAnalytics';
import styles from './PopupSettings.module.css';
import './popup-settings.css';
import dayjs from 'dayjs';
import { useData } from '@/shared/hooks/useData';

const stripAuditFields = (popup) => {
  if (!popup || typeof popup !== 'object') {
    return {};
  }

  const {
    id: _id,
    createdByLabel: _createdByLabel,
    createdAtFormatted: _createdAtFormatted,
    updatedAtFormatted: _updatedAtFormatted,
    createdBy: _createdBy,
    createdByName: _createdByName,
    created_by: _created_by,
    created_by_name: _created_by_name,
    createdAt: _createdAt,
    created_at: _created_at,
    updatedAt: _updatedAt,
    updated_at: _updated_at,
    ...rest
  } = popup;

  return rest;
};

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

const PopupSettings = () => {
  const [form] = Form.useForm();
  const [popups, setPopups] = useState([]);
  const [selectedPopup, setSelectedPopup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [activeTab, setActiveTab] = useState('general');

  const {
    usersWithStudentRole = [],
    instructors = [],
    students = []
  } = useData();

  const actorDirectory = useMemo(() => {
    const directory = {};

    const register = (candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }

      const id = candidate.id || candidate.user_id || candidate.userId;
      if (!id) {
        return;
      }

      const label =
        candidate.name ||
        candidate.full_name ||
        candidate.fullName ||
        [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() ||
        candidate.email ||
        candidate.username ||
        null;

      if (label) {
        directory[String(id)] = label;
      }
    };

    [...usersWithStudentRole, ...instructors, ...students].forEach(register);

    return directory;
  }, [usersWithStudentRole, instructors, students]);

  const resolveActorLabel = useCallback(
    (actorId, preferredLabel) => {
      if (preferredLabel && typeof preferredLabel === 'string' && preferredLabel.trim()) {
        return preferredLabel.trim();
      }

      if (!actorId) {
        return 'System automation';
      }

      const key = String(actorId);
      if (actorDirectory[key]) {
        return actorDirectory[key];
      }

      const normalized = key.toLowerCase();
      if (normalized === '00000000-0000-0000-0000-000000000000' || normalized === 'system') {
        return 'System automation';
      }

      return key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key;
    },
    [actorDirectory]
  );

  const formatAuditTimestamp = useCallback((value) => {
    if (!value) return null;
    const parsed = dayjs(value);
    if (!parsed.isValid()) return null;
    return parsed.format('MMM DD, YYYY HH:mm');
  }, []);

  const decoratePopup = useCallback(
    (popup) => {
      if (!popup || typeof popup !== 'object') {
        return popup;
      }

      const createdBy = popup.createdBy ?? popup.created_by ?? null;
      const createdByName = popup.createdByName ?? popup.created_by_name ?? null;
      const createdAt = popup.createdAt ?? popup.created_at ?? null;
      const updatedAt = popup.updatedAt ?? popup.updated_at ?? null;

      return {
        ...popup,
        createdBy,
        createdByName,
        createdAt,
        updatedAt,
        createdByLabel: resolveActorLabel(createdBy, createdByName),
        createdAtFormatted: formatAuditTimestamp(createdAt),
        updatedAtFormatted: formatAuditTimestamp(updatedAt)
      };
    },
    [formatAuditTimestamp, resolveActorLabel]
  );

  const selectedPopupId = selectedPopup?.id ?? null;

  const loadPopups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/popups', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      const popupsArray = Array.isArray(data) ? data.map(decoratePopup) : [];
      setPopups(popupsArray);

      if (popupsArray.length === 0) {
        setSelectedPopup(null);
        form.resetFields();
        return;
      }

      const nextSelected =
        (selectedPopupId && popupsArray.find((popup) => popup.id === selectedPopupId)) ||
        popupsArray[0];

      if (nextSelected) {
        setSelectedPopup(nextSelected);
        form.setFieldsValue(stripAuditFields(nextSelected));
      }
    } catch {
      message.error('Failed to load popups');
      setPopups([]);
      setSelectedPopup(null);
      form.resetFields();
    } finally {
      setLoading(false);
    }
  }, [decoratePopup, form, selectedPopupId]);

  useEffect(() => {
    loadPopups();
  }, [loadPopups]);

  const handleSave = async (values) => {
    try {
      setLoading(true);
      const url = selectedPopup?.id ? `/api/popups/${selectedPopup.id}` : '/api/popups';
      const method = selectedPopup?.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(stripAuditFields(values))
      });

      if (response.ok) {
        message.success(`Popup ${selectedPopup?.id ? 'updated' : 'created'} successfully`);
        loadPopups();
      } else {
        throw new Error('Failed to save popup');
      }
    } catch {
      message.error('Failed to save popup');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (popupId) => {
    Modal.confirm({
      title: 'Delete Popup',
      content: 'Are you sure you want to delete this popup? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await fetch(`/api/popups/${popupId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });

          if (response.ok) {
            message.success('Popup deleted successfully');
            loadPopups();
            if (selectedPopup?.id === popupId) {
              setSelectedPopup(null);
              form.resetFields();
            }
          } else {
            throw new Error('Failed to delete popup');
          }
        } catch {
          message.error('Failed to delete popup');
        }
      }
    });
  };

  const handlePreview = () => {
    const formData = form.getFieldsValue();
    setPreviewData({
      ...selectedPopup,
      ...formData,
      createdByLabel: selectedPopup?.createdByLabel,
      createdAtFormatted: selectedPopup?.createdAtFormatted,
      updatedAtFormatted: selectedPopup?.updatedAtFormatted
    });
    setPreviewVisible(true);
  };

  const handleCreateNew = () => {
    setSelectedPopup(null);
    form.resetFields();
    form.setFieldsValue({
      name: 'New Popup',
      enabled: true,
      config: {
        general: {
          targetAudience: 'new_users',
          displayFrequency: 'once',
          allowClose: true
        },
        content: {
          title: 'Welcome!',
          subtitle: 'Thank you for joining us',
          bodyText: 'We\'re excited to have you on board.'
        },
        design: {
          theme: 'default',
          width: 600,
          position: 'center',
          animation: 'fade'
        }
      }
    });
  };

  const handleDuplicate = async () => {
    if (!selectedPopup) return;
    
    const duplicateData = {
      ...stripAuditFields(selectedPopup),
      name: `${selectedPopup.name} (Copy)`,
      id: undefined
    };
    
    try {
      const response = await fetch('/api/popups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(duplicateData)
      });

      if (response.ok) {
        message.success('Popup duplicated successfully');
        loadPopups();
      } else {
        throw new Error('Failed to duplicate popup');
      }
    } catch {
      message.error('Failed to duplicate popup');
    }
  };

  const renderGeneralSettings = () => (
    <Card title="General Settings" size="small">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Form.Item name="name" label="Popup Name" rules={[{ required: true }]}>
            <Input placeholder="Enter popup name" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Form.Item name={['config', 'general', 'targetAudience']} label="Target Audience">
            <Select>
              <Option value="all_users">All Users</Option>
              <Option value="new_users">New Users Only</Option>
              <Option value="admin">Administrators</Option>
              <Option value="manager">Managers</Option>
              <Option value="employee">Employees</Option>
              <Option value="customer">Customers</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name={['config', 'general', 'displayFrequency']} label="Display Frequency">
            <Select>
              <Option value="once">Once per user</Option>
              <Option value="daily">Once per day</Option>
              <Option value="session">Once per session</Option>
              <Option value="always">Every visit</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name={['config', 'general', 'priority']} label="Priority">
            <Select>
              <Option value="low">Low</Option>
              <Option value="medium">Medium</Option>
              <Option value="high">High</Option>
              <Option value="urgent">Urgent</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Form.Item name={['config', 'general', 'allowClose']} label="Allow Close" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name={['config', 'general', 'autoClose']} label="Auto Close (seconds)">
            <InputNumber min={0} placeholder="0 = manual close" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name={['config', 'general', 'pages']} label="Show on Pages">
        <Select mode="multiple" placeholder="Leave empty for all pages">
          <Option value="/">Home</Option>
          <Option value="/dashboard">Dashboard</Option>
          <Option value="/finances">Finances</Option>
          <Option value="/bookings">Bookings</Option>
          <Option value="/customers">Customers</Option>
          <Option value="/settings">Settings</Option>
        </Select>
      </Form.Item>
    </Card>
  );

  const renderContentSettings = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card title="Text Content" size="small">
        <Form.Item name={['config', 'content', 'title']} label="Title">
          <Input placeholder="Enter popup title" />
        </Form.Item>
        
        <Form.Item name={['config', 'content', 'subtitle']} label="Subtitle">
          <Input placeholder="Enter subtitle" />
        </Form.Item>
        
        <Form.Item name={['config', 'content', 'bodyText']} label="Body Text">
          <TextArea rows={4} placeholder="Enter body text" />
        </Form.Item>
        
        <Form.Item name={['config', 'content', 'htmlContent']} label="Allow HTML" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Card>

      <Card title="Media Content" size="small">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Form.Item name={['config', 'content', 'heroImage']} label="Hero Image URL">
              <Input placeholder="https://example.com/image.jpg" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name={['config', 'design', 'logo']} label="Logo URL">
              <Input placeholder="https://example.com/logo.png" />
            </Form.Item>
          </Col>
        </Row>
        
        <Form.Item name={['config', 'design', 'backgroundImage']} label="Background Image URL">
          <Input placeholder="https://example.com/background.jpg" />
        </Form.Item>
        
        <Form.Item name={['config', 'design', 'backgroundOpacity']} label="Background Opacity">
          <InputNumber min={0} max={1} step={0.1} placeholder="0.8" />
        </Form.Item>
      </Card>

      <Card title="Call-to-Action Buttons" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name={['config', 'content', 'primaryButton', 'text']} label="Primary Button Text">
              <Input placeholder="Get Started" />
            </Form.Item>
            <Form.Item name={['config', 'content', 'primaryButton', 'action']} label="Primary Button Action">
              <Select>
                <Option value="close">Close Popup</Option>
                <Option value="redirect">Redirect to URL</Option>
                <Option value="external">Open External Link</Option>
                <Option value="custom">Custom Action</Option>
              </Select>
            </Form.Item>
            <Form.Item name={['config', 'content', 'primaryButton', 'url']} label="Primary Button URL">
              <Input placeholder="https://example.com or /dashboard" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={['config', 'content', 'secondaryButton', 'text']} label="Secondary Button Text">
              <Input placeholder="Learn More" />
            </Form.Item>
            <Form.Item name={['config', 'content', 'secondaryButton', 'action']} label="Secondary Button Action">
              <Select>
                <Option value="close">Close Popup</Option>
                <Option value="redirect">Redirect to URL</Option>
                <Option value="external">Open External Link</Option>
                <Option value="custom">Custom Action</Option>
              </Select>
            </Form.Item>
            <Form.Item name={['config', 'content', 'secondaryButton', 'url']} label="Secondary Button URL">
              <Input placeholder="https://example.com or /help" />
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </Space>
  );

  const renderDesignSettings = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card title="Layout & Style" size="small">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Form.Item name={['config', 'design', 'theme']} label="Theme">
              <Select>
                <Option value="default">Default</Option>
                <Option value="modern">Modern</Option>
                <Option value="business">Business</Option>
                <Option value="elegant">Elegant</Option>
                <Option value="minimal">Minimal</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name={['config', 'design', 'width']} label="Width (px)">
              <InputNumber min={300} max={1200} placeholder="600" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name={['config', 'design', 'position']} label="Position">
              <Select>
                <Option value="center">Center</Option>
                <Option value="top">Top</Option>
                <Option value="bottom">Bottom</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name={['config', 'design', 'animation']} label="Animation">
              <Select>
                <Option value="fade">Fade</Option>
                <Option value="slide">Slide</Option>
                <Option value="zoom">Zoom</Option>
                <Option value="bounce">Bounce</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={['config', 'design', 'borderRadius']} label="Border Radius (px)">
              <InputNumber min={0} max={50} placeholder="8" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title="Colors & Typography" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name={['config', 'design', 'backgroundColor']} label="Background Color">
              <Input placeholder="#ffffff" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={['config', 'design', 'textColor']} label="Text Color">
              <Input placeholder="#333333" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name={['config', 'design', 'titleSize']} label="Title Font Size">
              <InputNumber min={12} max={48} placeholder="24" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'design', 'textSize']} label="Text Font Size">
              <InputNumber min={10} max={24} placeholder="14" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'design', 'textAlignment']} label="Text Alignment">
              <Select>
                <Option value="left">Left</Option>
                <Option value="center">Center</Option>
                <Option value="right">Right</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </Space>
  );

  const renderTargetingSettings = () => (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card title="User Conditions" size="small">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name={['config', 'targeting', 'userRoles']} label="User Roles">
              <Select mode="multiple" placeholder="Select user roles">
                <Option value="admin">Administrator</Option>
                <Option value="manager">Manager</Option>
                <Option value="employee">Employee</Option>
                <Option value="customer">Customer</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={['config', 'targeting', 'loginCount']} label="Login Count Condition">
              <Select>
                <Option value="first">First login only</Option>
                <Option value="<=5">Less than 5 logins</Option>
                <Option value=">=10">More than 10 logins</Option>
                <Option value="any">Any login count</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name={['config', 'targeting', 'registrationDays']} label="Days Since Registration">
              <Select>
                <Option value="0">Same day</Option>
                <Option value="<=7">Within 7 days</Option>
                <Option value="<=30">Within 30 days</Option>
                <Option value=">=30">More than 30 days</Option>
                <Option value="any">Any time</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={['config', 'targeting', 'deviceType']} label="Device Type">
              <Select mode="multiple">
                <Option value="desktop">Desktop</Option>
                <Option value="tablet">Tablet</Option>
                <Option value="mobile">Mobile</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title="Timing Rules" size="small">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name={['config', 'targeting', 'delaySeconds']} label="Delay After Login (seconds)">
              <InputNumber min={0} placeholder="0" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'targeting', 'timeOfDay']} label="Time of Day">
              <Select mode="multiple">
                <Option value="morning">Morning (6-12)</Option>
                <Option value="afternoon">Afternoon (12-18)</Option>
                <Option value="evening">Evening (18-24)</Option>
                <Option value="night">Night (0-6)</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name={['config', 'targeting', 'weekdays']} label="Days of Week">
              <Select mode="multiple">
                <Option value="monday">Monday</Option>
                <Option value="tuesday">Tuesday</Option>
                <Option value="wednesday">Wednesday</Option>
                <Option value="thursday">Thursday</Option>
                <Option value="friday">Friday</Option>
                <Option value="saturday">Saturday</Option>
                <Option value="sunday">Sunday</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name={['config', 'targeting', 'startDate']} label="Start Date">
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={['config', 'targeting', 'endDate']} label="End Date">
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </Space>
  );

  return (
    <div className="p-3 sm:p-6">
      <Row gutter={[16, 16]}>
        {/* Mobile-responsive layout: full width on mobile, 6 cols on desktop */}
        <Col xs={24} lg={6}>
          <Card 
            className="popup-list-card"
            title="Popup List" 
            size="small"
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                size="small"
                onClick={handleCreateNew}
              >
                <span className="hidden sm:inline">New</span>
              </Button>
            }
          >
            <div className="max-h-96 lg:max-h-[600px] overflow-y-auto">
              {Array.isArray(popups) && popups.length > 0 ? (
                popups.map(popup => (
                  <Card
                    key={popup.id}
                    size="small"
                    className={`mb-2 cursor-pointer transition-all duration-200 ${
                      selectedPopup?.id === popup.id 
                        ? 'border-blue-500 border-2' 
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  onClick={() => {
                    setSelectedPopup(popup);
                    form.setFieldsValue(stripAuditFields(popup));
                  }}
                  actions={[
                    <EyeOutlined 
                      key="preview" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewData(popup);
                        setPreviewVisible(true);
                      }} 
                    />,
                    <CopyOutlined 
                      key="duplicate" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate();
                      }} 
                    />,
                    <DeleteOutlined 
                      key="delete" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(popup.id);
                      }} 
                    />
                  ]}
                >
                  <Card.Meta
                    title={<span className="text-sm">{popup.name}</span>}
                    description={
                      <Space direction="vertical" size="small">
                        <div className="flex flex-wrap gap-1">
                          <Tag color={popup.enabled ? 'green' : 'red'} className="text-xs">
                            {popup.enabled ? 'Active' : 'Inactive'}
                          </Tag>
                          <Tag color="blue" className="text-xs">
                            {popup.config?.general?.targetAudience || 'All Users'}
                          </Tag>
                        </div>
                        <Space direction="vertical" size={2} className="text-xs">
                          {popup.createdByLabel && (
                            <Tooltip
                              title={popup.createdAtFormatted ? `Created ${popup.createdAtFormatted}` : 'Created automatically'}
                            >
                              <span className="text-gray-600">
                                Created by {popup.createdByLabel}
                              </span>
                            </Tooltip>
                          )}
                          {popup.updatedAtFormatted ? (
                            <span className="text-gray-500">
                              Updated {popup.updatedAtFormatted}
                            </span>
                          ) : null}
                        </Space>
                      </Space>
                    }
                  />
                </Card>
                ))
              ) : (
                <div className="text-center py-5">
                  <Text type="secondary" className="text-sm">
                    No popups found. Click "New" to create your first popup.
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* Mobile-responsive layout: full width on mobile, 18 cols on desktop */}
        <Col xs={24} lg={18}>
          <Card
            className="popup-detail-card"
            title={
              <span className="text-sm sm:text-base truncate">
                {selectedPopup ? `Edit: ${selectedPopup.name}` : 'Create New Popup'}
              </span>
            }
            extra={
              <Space size="small">
                <Button 
                  icon={<EyeOutlined />} 
                  onClick={handlePreview}
                  size="small"
                  className="hidden sm:inline-flex"
                >
                  Preview
                </Button>
                <Button 
                  type="primary" 
                  icon={<SaveOutlined />} 
                  loading={loading}
                  onClick={() => form.submit()}
                  size="small"
                >
                  Save
                </Button>
              </Space>
            }
          >
            {selectedPopup && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Created by:</span>
                  <Tooltip
                    title={selectedPopup.createdAtFormatted ? `Created ${selectedPopup.createdAtFormatted}` : 'Created automatically'}
                  >
                    <span className="truncate max-w-[200px]">
                      {selectedPopup.createdByLabel || 'System automation'}
                    </span>
                  </Tooltip>
                </div>
                {selectedPopup.updatedAtFormatted && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-700">Last updated:</span>
                    <span>{selectedPopup.updatedAtFormatted}</span>
                  </div>
                )}
              </div>
            )}
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
            >
              <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab} 
                className={`popup-settings-tabs ${styles.popupSettingsTabs || ''}`}
                items={[
                  {
                    key: 'general',
                    label: 'General',
                    children: renderGeneralSettings()
                  },
                  {
                    key: 'content',
                    label: 'Content',
                    children: renderContentSettings()
                  },
                  {
                    key: 'design',
                    label: 'Design',
                    children: renderDesignSettings()
                  },
                  {
                    key: 'targeting',
                    label: 'Targeting',
                    children: renderTargetingSettings()
                  },
                  {
                    key: 'templates',
                    label: 'Templates',
                    children: (
                      <PopupTemplates onSelectTemplate={(template) => {
                        form.setFieldsValue(template);
                        message.success('Template applied successfully');
                      }} />
                    )
                  },
                  {
                    key: 'analytics',
                    label: 'Analytics',
                    children: <PopupAnalytics popupId={selectedPopup?.id} />
                  }
                ]}
              />
              {/* Mobile action bar - only visible on mobile */}
              <div className="mobile-action-bar lg:hidden mt-4 p-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    icon={<EyeOutlined />} 
                    onClick={handlePreview}
                    className="flex-1"
                  >
                    Preview Popup
                  </Button>
                  <Button 
                    type="primary" 
                    icon={<SaveOutlined />} 
                    loading={loading}
                    onClick={() => form.submit()
                    }
                    className="flex-1"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </Form>
          </Card>
        </Col>
      </Row>

      <PopupDisplay
        popup={previewData}
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        onAction={(action, data) => {
          message.info(`Action: ${action}, Data: ${JSON.stringify(data)}`);
        }}
      />
    </div>
  );
};

export default PopupSettings;
