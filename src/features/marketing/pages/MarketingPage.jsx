import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Card, Tabs, Button, Table, Tag, Modal, Form, Input, Select, 
  Row, Col, Statistic, Space, Divider, ColorPicker, Switch,
  Upload, Typography, Spin, Popconfirm, Tooltip
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { Editor } from '@tinymce/tinymce-react';
import { 
  MailOutlined, 
  BellOutlined, 
  MessageOutlined,
  SendOutlined,
  TeamOutlined,
  PercentageOutlined,
  WhatsAppOutlined,
  PlusOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  PictureOutlined,
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
import apiClient from '@/shared/services/apiClient';

// Import extracted components
import { WhatsAppTextArea } from '../components/WhatsAppToolbar';
import CroppableImage from '../components/CroppableImage';
import PopupFormIntegration from '@/features/popups/components/PopupFormIntegration';
import { 
  EmailPreview, 
  PopupPreview, 
  SMSPreview, 
  WhatsAppPreview, 
  QuestionPreview 
} from '../components/PreviewRenderers';

const { Text, Title } = Typography;

// Initial state for previews
const getInitialPreviewState = () => ({
  email: { 
    subject: '', 
    content: '', 
    html: '', 
    backgroundImage: '', 
    attachments: [], 
    bgColor: '#ffffff', 
    textColor: '#111827', 
    contentBgColor: '#ffffff', 
    templateImage: '',
    overlayText: '',
    overlayHtml: ''
  },
  popup: { 
    title: '', 
    subtitle: '',
    message: '', 
    html: '',
    buttonText: '', 
    buttonUrl: '', 
    imageUrl: '', 
    bgColor: '#ffffff', 
    textColor: '#000000', 
    buttonColor: '#1890ff', 
    templateImage: '',
    overlayText: '',
    overlayHtml: '',
    name: '',
    enabled: true,
    targetAudience: 'all',
    displayFrequency: 'once',
    priority: 5,
    allowClose: true,
    autoClose: 0,
    showOnPages: 'all',
    position: 'center',
    animation: 'fade',
    theme: 'modern',
    deviceType: 'all',
    language: 'all',
    timeBasedDisplay: false,
    displayStartDate: null,
    displayEndDate: null
  },
  sms: { content: '', attachedImage: '', bubbleColor: '#22c55e', bgColor: '#0f172a' },
  whatsapp: { content: '', mediaUrl: '', mediaType: '', bubbleColor: '#ffffff', bgColor: '#075e54' },
  question: {
    questionText: '',
    subtitle: '',
    backgroundImage: '',
    bgColor: '#ffffff',
    textColor: '#111827',
    iconType: 'question',
    answers: [
      { id: 1, text: '', buttonColor: '#3b82f6', action: 'link', actionValue: '' },
      { id: 2, text: '', buttonColor: '#10b981', action: 'link', actionValue: '' }
    ]
  }
});

// TinyMCE configuration
const getTinyMCEConfig = () => ({
  height: 300,
  menubar: false,
  plugins: [
    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
    'insertdatetime', 'media', 'table', 'help', 'wordcount', 'emoticons'
  ],
  toolbar: 'undo redo | blocks fontfamily fontsize | ' +
    'bold italic underline strikethrough | forecolor backcolor | ' +
    'alignleft aligncenter alignright alignjustify | ' +
    'bullist numlist outdent indent | link image emoticons | removeformat help',
  content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; }',
  skin: 'oxide',
  branding: false,
  promotion: false,
  license_key: 'gpl',
});

// Audience and Template options
const audienceOptions = [
  { value: 'all', label: '📊 All Customers' },
  { value: 'students', label: '🎓 Active Students' },
  { value: 'inactive', label: '💤 Inactive (30+ days)' },
  { value: 'new', label: '✨ New Signups (7 days)' },
  { value: 'package_expiring', label: '⏰ Package Expiring' },
  { value: 'birthday', label: '🎂 Birthday This Month' },
  { value: 'high_value', label: '💎 High Value Customers' },
  { value: 'custom', label: '🎯 Custom Segment' },
];

const emailTemplates = [
  { value: 'promotion', label: '🎁 Promotion / Discount' },
  { value: 'newsletter', label: '📰 Newsletter' },
  { value: 'reminder', label: '⏰ Reminder' },
  { value: 'welcome', label: '👋 Welcome Email' },
  { value: 'reactivation', label: '🔄 Reactivation' },
  { value: 'custom', label: '✏️ Custom' },
];

/**
 * MarketingPage - Modular campaign builder with live preview
 * Optimized for performance with separated components
 */
const MarketingPage = () => {
  // Main state
  const [activeTab, setActiveTab] = useState('campaigns');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('email');
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [form] = Form.useForm();
  
  // Send campaign modal state
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [sendingInProgress, setSendingInProgress] = useState(false);
  
  // UI state
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [previewSize, setPreviewSize] = useState('desktop');
  
  // Crop state
  const [cropMode, setCropMode] = useState({ active: false, imageKey: null });
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  
  // Inline editing state
  const [inlineEdit, setInlineEdit] = useState({ active: false, field: null, tempValue: '' });

  // Preview state
  const [preview, setPreview] = useState(getInitialPreviewState);

  // Refs
  const emailEditorRef = useRef(null);
  const popupEditorRef = useRef(null);
  const overlayEditorRef = useRef(null);
  const inlineEditorRef = useRef(null);

  // Memoized TinyMCE config
  const tinyMCEConfig = useMemo(() => getTinyMCEConfig(), []);

  // Fetch campaigns on mount
  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/marketing/campaigns');
      setCampaigns(response.data.data);
    } catch {
      message.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  // Fetch active customers
  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const response = await apiClient.get('/users?role=student');
      // The /users endpoint returns rows directly, not wrapped in data
      const customersList = Array.isArray(response.data) ? response.data : [];
      console.log('Customers loaded:', customersList.length);
      setCustomers(customersList);
    } catch (error) {
      message.error('Failed to load customers');
      console.error('Error fetching customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Open send modal
  const openSendModal = useCallback((campaign) => {
    setSendingCampaign(campaign);
    setIsSendModalOpen(true);
    setSelectedCustomers([]);
    fetchCustomers();
  }, []);

  // Handle send campaign
  const handleSendCampaign = async () => {
    if (selectedCustomers.length === 0) {
      message.warning('Please select at least one customer');
      return;
    }

    setSendingInProgress(true);
    try {
      await apiClient.post(`/marketing/campaigns/${sendingCampaign.id}/send`, {
        customerIds: selectedCustomers
      });
      message.success(`Campaign sent to ${selectedCustomers.length} customer(s)`);
      setIsSendModalOpen(false);
      fetchCampaigns(); // Refresh to update stats
    } catch (error) {
      message.error('Failed to send campaign');
      console.error('Error sending campaign:', error);
    } finally {
      setSendingInProgress(false);
    }
  };

  // Form change handler - memoized
  const handleFormChange = useCallback((updates) => {
    setPreview(prev => ({
      ...prev,
      [modalType]: { ...prev[modalType], ...updates }
    }));
  }, [modalType]);

  // Inline editing functions
  const startInlineEdit = useCallback((field, currentValue) => {
    setInlineEdit({ active: true, field, tempValue: currentValue });
  }, []);

  const saveInlineEdit = useCallback(() => {
    if (inlineEdit.field === 'questionText') {
      handleFormChange({ questionText: inlineEdit.tempValue });
    } else if (inlineEdit.field === 'subtitle') {
      handleFormChange({ subtitle: inlineEdit.tempValue });
    }
    setInlineEdit({ active: false, field: null, tempValue: '' });
  }, [inlineEdit, handleFormChange]);

  const cancelInlineEdit = useCallback(() => {
    setInlineEdit({ active: false, field: null, tempValue: '' });
  }, []);

  // Handle icon change for question campaigns
  const handleIconChange = useCallback((iconType) => {
    handleFormChange({ iconType });
  }, [handleFormChange]);

  // Open campaign modal
  const openCampaignModal = useCallback((type, campaign = null) => {
    setModalType(type);
    setEditingCampaign(campaign);
    setIsModalOpen(true);
    setUseTemplateMode(false);
    
    if (campaign) {
      form.setFieldsValue({
        name: campaign.name,
        audience: campaign.audience,
        ...parseCampaignFields(campaign, type)
      });
      updatePreviewFromCampaign(campaign, type);
    } else {
      form.resetFields();
      resetPreview(type);
    }
  }, [form]);

  // Parse campaign fields for form
  const parseCampaignFields = useCallback((campaign, type) => {
    switch (type) {
      case 'email':
        return {
          template: campaign.template_type,
          subject: campaign.email_subject,
          content: campaign.email_content
        };
      case 'popup':
        return {
          title: campaign.popup_title,
          message: campaign.popup_message,
          buttonText: campaign.popup_button_text,
          buttonUrl: campaign.popup_button_url
        };
      case 'sms':
        return { content: campaign.sms_content };
      case 'whatsapp':
        return { content: campaign.whatsapp_content };
      case 'question':
        return {
          questionText: campaign.question_text,
          subtitle: campaign.question_subtitle,
          answers: campaign.question_answers || [],
          backgroundImage: campaign.question_bg_image,
          iconType: campaign.question_icon_type || 'question'
        };
      default:
        return {};
    }
  }, []);

  // Update preview from campaign data
  const updatePreviewFromCampaign = useCallback((campaign, type) => {
    const initialState = getInitialPreviewState();
    switch (type) {
      case 'email':
        setPreview(prev => ({
          ...prev,
          email: {
            ...initialState.email,
            subject: campaign.email_subject || '',
            html: campaign.email_content || '',
            content: campaign.email_content || ''
          }
        }));
        break;
      case 'popup':
        setPreview(prev => ({
          ...prev,
          popup: {
            ...initialState.popup,
            title: campaign.popup_title || '',
            html: campaign.popup_message || '',
            buttonText: campaign.popup_button_text || '',
            buttonUrl: campaign.popup_button_url || ''
          }
        }));
        break;
      case 'sms':
        setPreview(prev => ({
          ...prev,
          sms: {
            ...initialState.sms,
            content: campaign.sms_content || ''
          }
        }));
        break;
      case 'whatsapp':
        setPreview(prev => ({
          ...prev,
          whatsapp: {
            ...initialState.whatsapp,
            content: campaign.whatsapp_content || ''
          }
        }));
        break;
      case 'question':
        setPreview(prev => ({
          ...prev,
          question: {
            questionText: campaign.question_text || '',
            subtitle: campaign.question_subtitle || '',
            backgroundImage: campaign.question_bg_image || '',
            bgColor: campaign.question_bg_color || '#ffffff',
            textColor: campaign.question_text_color || '#111827',
            iconType: campaign.question_icon_type || 'question',
            answers: campaign.question_answers || prev.question.answers
          }
        }));
        break;
    }
  }, []);

  // Reset preview to initial state
  const resetPreview = useCallback((type) => {
    const initialState = getInitialPreviewState();
    setPreview(prev => ({
      ...prev,
      [type]: initialState[type]
    }));
  }, []);

  // Save campaign
  const handleSaveCampaign = async (values) => {
    try {
      const campaignData = {
        name: values.name,
        type: modalType,
        audience: values.audience,
        ...(modalType === 'email' && {
          templateType: values.template,
          emailSubject: preview.email.subject,
          emailContent: preview.email.html || preview.email.content
        }),
        ...(modalType === 'popup' && {
          popupTitle: preview.popup.title,
          popupMessage: preview.popup.html,
          popupButtonText: preview.popup.buttonText,
          popupButtonUrl: preview.popup.buttonUrl,
          popupImageUrl: preview.popup.imageUrl
        }),
        ...(modalType === 'sms' && {
          smsContent: preview.sms.content
        }),
        ...(modalType === 'whatsapp' && {
          whatsappContent: preview.whatsapp.content,
          whatsappMediaUrl: preview.whatsapp.mediaUrl
        }),
        ...(modalType === 'question' && {
          questionText: preview.question.questionText,
          questionSubtitle: preview.question.subtitle,
          questionBgImage: preview.question.backgroundImage,
          questionBgColor: preview.question.bgColor,
          questionTextColor: preview.question.textColor,
          questionIconType: preview.question.iconType,
          questionAnswers: preview.question.answers
        })
      };

      if (editingCampaign) {
        await apiClient.patch(`/marketing/campaigns/${editingCampaign.id}`, campaignData);
        message.success('Campaign updated successfully');
      } else {
        await apiClient.post('/marketing/campaigns', campaignData);
        message.success('Campaign created successfully');
      }

      setIsModalOpen(false);
      fetchCampaigns();
    } catch {
      message.error('Failed to save campaign');
    }
  };

  // Delete campaign
  const handleDeleteCampaign = async (id) => {
    try {
      await apiClient.delete(`/marketing/campaigns/${id}`);
      message.success('Campaign deleted');
      fetchCampaigns();
    } catch {
      message.error('Failed to delete campaign');
    }
  };

  // Duplicate campaign
  const handleDuplicateCampaign = useCallback((campaign) => {
    openCampaignModal(campaign.type, {
      ...campaign,
      name: `${campaign.name} (Copy)`
    });
    setEditingCampaign(null);
  }, [openCampaignModal]);

  // Crop functions
  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createCroppedImage = async (imageSrc, pixelCrop) => {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageSrc;
    });

    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg');
  };

  const getCurrentImageForCrop = useCallback(() => {
    switch (cropMode.imageKey) {
      case 'templateImage':
      case 'emailTemplate':
        return preview.email.templateImage;
      case 'emailHero':
        return preview.email.backgroundImage;
      case 'popupTemplate':
      case 'popupHero':
        return preview.popup.templateImage || preview.popup.imageUrl;
      case 'smsImage':
        return preview.sms.attachedImage;
      case 'whatsappMedia':
        return preview.whatsapp.mediaUrl;
      case 'questionBg':
        return preview.question.backgroundImage;
      default:
        return null;
    }
  }, [cropMode.imageKey, preview]);

  const applyCrop = useCallback(async () => {
    if (!croppedAreaPixels || !cropMode.imageKey) return;

    const currentImage = getCurrentImageForCrop();
    if (!currentImage) return;

    try {
      const croppedImage = await createCroppedImage(currentImage, croppedAreaPixels);
      
      switch (cropMode.imageKey) {
        case 'templateImage':
        case 'emailTemplate':
          handleFormChange({ templateImage: croppedImage });
          break;
        case 'emailHero':
          handleFormChange({ backgroundImage: croppedImage });
          break;
        case 'popupTemplate':
        case 'popupHero':
          handleFormChange({ templateImage: croppedImage, imageUrl: croppedImage });
          break;
        case 'smsImage':
          handleFormChange({ attachedImage: croppedImage });
          break;
        case 'whatsappMedia':
          handleFormChange({ mediaUrl: croppedImage });
          break;
        case 'questionBg':
          handleFormChange({ backgroundImage: croppedImage });
          break;
      }

      setCropMode({ active: false, imageKey: null });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch (err) {
      message.error('Failed to crop image');
    }
  }, [croppedAreaPixels, cropMode.imageKey, getCurrentImageForCrop, handleFormChange]);

  const cancelCrop = useCallback(() => {
    setCropMode({ active: false, imageKey: null });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  // Memoized crop props for preview components
  const cropProps = useMemo(() => ({
    cropMode,
    setCropMode,
    crop,
    setCrop,
    zoom,
    setZoom,
    onCropComplete,
    cancelCrop,
    applyCrop
  }), [cropMode, crop, zoom, onCropComplete, cancelCrop, applyCrop]);

  // Render live preview based on type
  const renderLivePreview = useCallback(() => {
    switch (modalType) {
      case 'email':
        return <EmailPreview preview={preview.email} useTemplateMode={useTemplateMode} cropProps={cropProps} />;
      case 'popup':
        return <PopupPreview preview={preview.popup} useTemplateMode={useTemplateMode} cropProps={cropProps} />;
      case 'sms':
        return <SMSPreview preview={preview.sms} cropProps={cropProps} />;
      case 'whatsapp':
        return <WhatsAppPreview preview={preview.whatsapp} cropProps={cropProps} />;
      case 'question':
        return (
          <QuestionPreview 
            preview={preview.question}
            inlineEdit={inlineEdit}
            setInlineEdit={setInlineEdit}
            startInlineEdit={startInlineEdit}
            saveInlineEdit={saveInlineEdit}
            cancelInlineEdit={cancelInlineEdit}
            inlineEditorRef={inlineEditorRef}
            onIconChange={handleIconChange}
          />
        );
      default:
        return null;
    }
  }, [modalType, preview, useTemplateMode, cropProps, inlineEdit, startInlineEdit, saveInlineEdit, cancelInlineEdit]);

  // Campaign table columns
  const campaignColumns = useMemo(() => [
    { 
      title: 'Campaign', 
      dataIndex: 'name', 
      key: 'name',
      render: (name, record) => (
        <div>
          <div className="font-semibold text-gray-900">{name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{record.audience}</div>
        </div>
      )
    },
    { 
      title: 'Type', 
      dataIndex: 'type', 
      key: 'type',
      render: (type) => {
        const typeConfig = {
          email: { color: 'purple', icon: <MailOutlined /> },
          popup: { color: 'blue', icon: <BellOutlined /> },
          sms: { color: 'green', icon: <MessageOutlined /> },
          whatsapp: { color: 'cyan', icon: <WhatsAppOutlined /> },
          question: { color: 'magenta', icon: <QuestionCircleOutlined /> }
        };
        const config = typeConfig[type] || { color: 'default', icon: null };
        return <Tag color={config.color} icon={config.icon}>{type?.toUpperCase()}</Tag>;
      }
    },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status) => {
        const statusColors = { draft: 'default', active: 'success', paused: 'warning', completed: 'blue' };
        return <Tag color={statusColors[status] || 'default'}>{status?.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button 
            size="small" 
            type="primary" 
            icon={<SendOutlined />}
            onClick={() => openSendModal(record)}
          >
            Send
          </Button>
          <Button 
            size="small" 
            type="primary" 
            ghost 
            icon={<EditOutlined />}
            onClick={() => openCampaignModal(record.type, record)}
          >
            Edit
          </Button>
          <Button 
            size="small" 
            icon={<CopyOutlined />}
            onClick={() => handleDuplicateCampaign(record)}
          >
            Duplicate
          </Button>
          <Popconfirm
            title="Delete this campaign?"
            onConfirm={() => handleDeleteCampaign(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ], [openCampaignModal, handleDuplicateCampaign, handleDeleteCampaign, openSendModal]);

  // Modal title
  const getModalTitle = () => {
    const titles = {
      email: '✉️ Email Campaign',
      popup: '🔔 Popup Campaign',
      sms: '📱 SMS Campaign',
      whatsapp: '💬 WhatsApp Campaign',
      question: '❓ Interactive Question'
    };
    return `${editingCampaign ? 'Edit' : 'Create'} ${titles[modalType] || 'Campaign'}`;
  };

  // Get preview width based on size
  const getPreviewWidth = () => {
    switch (previewSize) {
      case 'tablet': return '768px';
      case 'mobile': return '375px';
      default: return '100%';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Hero Section */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <SendOutlined /> Marketing Hub
            </div>
            <h1 className="text-3xl font-semibold">Campaign Builder</h1>
            <p className="text-sm text-white/75">
              Create powerful campaigns with live preview - Email, Popup, SMS & WhatsApp
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="primary"
              icon={<MailOutlined />}
              onClick={() => openCampaignModal('email')}
              className="h-11 rounded-2xl bg-white text-rose-600 border-0 shadow-lg hover:bg-slate-100"
            >
              New Email
            </Button>
            <Button
              icon={<BellOutlined />}
              onClick={() => openCampaignModal('popup')}
              className="h-11 rounded-2xl bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              New Popup
            </Button>
            <Button
              icon={<MessageOutlined />}
              onClick={() => openCampaignModal('sms')}
              className="h-11 rounded-2xl bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              New SMS
            </Button>
            <Button
              icon={<WhatsAppOutlined />}
              onClick={() => openCampaignModal('whatsapp')}
              className="h-11 rounded-2xl bg-green-500 text-white border-0 hover:bg-green-600"
            >
              WhatsApp
            </Button>
            <Button
              icon={<QuestionCircleOutlined />}
              onClick={() => openCampaignModal('question')}
              className="h-11 rounded-2xl bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              Ask Question
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={<span className="flex items-center gap-2"><TeamOutlined /> Total Sent</span>}
              value={campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0)}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={<span className="flex items-center gap-2"><EyeOutlined /> Total Opens</span>}
              value={campaigns.reduce((sum, c) => sum + (c.open_count || 0), 0)}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={<span className="flex items-center gap-2"><PercentageOutlined /> Avg Open Rate</span>}
              value={42.5}
              suffix="%"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={<span className="flex items-center gap-2"><SendOutlined /> Active Campaigns</span>}
              value={campaigns.filter(c => c.status === 'active').length}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Content Tabs */}
      <Card className="rounded-2xl shadow-sm">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'campaigns',
              label: <span><SendOutlined /> Campaigns</span>,
              children: (
                <Spin spinning={loading}>
                  <Table 
                    dataSource={campaigns} 
                    columns={campaignColumns} 
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: true }}
                    locale={{ emptyText: 'No campaigns yet. Create your first one!' }}
                  />
                </Spin>
              )
            },
            {
              key: 'analytics',
              label: <span><PercentageOutlined /> Analytics</span>,
              children: (
                <div className="text-center py-12 text-gray-500">
                  <PercentageOutlined className="text-4xl mb-4" />
                  <p>Analytics coming soon...</p>
                </div>
              )
            }
          ]}
        />
      </Card>

      {/* Campaign Modal */}
      <Modal
        title={getModalTitle()}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={modalType === 'popup' ? '98vw' : '95vw'}
        style={{ 
          maxWidth: modalType === 'popup' ? '1800px' : '1600px', 
          top: 20,
          paddingBottom: 20
        }}
        styles={{ 
          body: {
            maxHeight: 'calc(100vh - 140px)', 
            overflowY: 'auto',
            overflowX: 'hidden'
          }
        }}
        destroyOnClose
        className="campaign-modal"
      >
        <Row gutter={24}>
          {/* Form - Left Side */}
          <Col xs={24} lg={12} className="mb-6 lg:mb-0">
            <div className="sticky-form-container" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: 8 }}>
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSaveCampaign}
                className="space-y-4"
              >
                <Form.Item name="name" label="Campaign Name" rules={[{ required: true }]}>
                  <Input placeholder="Summer Sale Campaign" className="rounded-lg" />
                </Form.Item>

                <Form.Item name="audience" label="Target Audience" rules={[{ required: true }]}>
                  <Select placeholder="Select audience" options={audienceOptions} className="rounded-lg" />
                </Form.Item>

                <Divider />

                {/* Dynamic form content based on type */}
                <CampaignFormContent 
                  modalType={modalType}
                  preview={preview}
                  useTemplateMode={useTemplateMode}
                  setUseTemplateMode={setUseTemplateMode}
                  handleFormChange={handleFormChange}
                  tinyMCEConfig={tinyMCEConfig}
                  emailTemplates={emailTemplates}
                  emailEditorRef={emailEditorRef}
                  popupEditorRef={popupEditorRef}
                  overlayEditorRef={overlayEditorRef}
                  form={form}
                />

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t sticky bottom-0 bg-white pb-2">
                  <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
                  <Button type="primary" htmlType="submit" icon={<SendOutlined />}>
                    {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
                  </Button>
                </div>
              </Form>
            </div>
          </Col>

          {/* Live Preview - Right Side */}
          <Col xs={24} lg={12}>
            <div className="sticky top-0">
              <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <Text strong className="text-base">Live Preview</Text>
                <Space wrap>
                  <Button.Group size="small">
                    <Button 
                      type={previewSize === 'desktop' ? 'primary' : 'default'}
                      onClick={() => setPreviewSize('desktop')}
                    >
                      🖥️ Desktop
                    </Button>
                    <Button 
                      type={previewSize === 'tablet' ? 'primary' : 'default'}
                      onClick={() => setPreviewSize('tablet')}
                    >
                      📱 Tablet
                    </Button>
                    <Button 
                      type={previewSize === 'mobile' ? 'primary' : 'default'}
                      onClick={() => setPreviewSize('mobile')}
                    >
                      📱 Mobile
                    </Button>
                  </Button.Group>
                  <Tag color="blue" icon={<EyeOutlined />}>Real-time</Tag>
                </Space>
              </div>
              <div className="flex justify-center overflow-hidden">
                <div 
                  className="transition-all duration-300"
                  style={{
                    width: getPreviewWidth(),
                    maxWidth: '100%'
                  }}
                >
                  {renderLivePreview()}
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </Modal>

      {/* Send Campaign Modal */}
      <Modal
        title={
          <Space>
            <SendOutlined />
            <span>Send Campaign: {sendingCampaign?.name}</span>
          </Space>
        }
        open={isSendModalOpen}
        onCancel={() => setIsSendModalOpen(false)}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => setIsSendModalOpen(false)}>
            Cancel
          </Button>,
          <Button 
            key="send" 
            type="primary" 
            icon={<SendOutlined />}
            loading={sendingInProgress}
            onClick={handleSendCampaign}
            disabled={selectedCustomers.length === 0}
          >
            Send to {selectedCustomers.length} Customer{selectedCustomers.length !== 1 ? 's' : ''}
          </Button>,
        ]}
      >
        <div className="mb-4">
          <Text type="secondary">
            Select customers to send this campaign to. You can select multiple customers.
          </Text>
        </div>
        
        <Table
          dataSource={customers}
          columns={[
            {
              title: 'Name',
              dataIndex: 'first_name',
              key: 'name',
              render: (_, record) => `${record.first_name} ${record.last_name}`,
            },
            {
              title: 'Email',
              dataIndex: 'email',
              key: 'email',
            },
            {
              title: 'Phone',
              dataIndex: 'phone_number',
              key: 'phone',
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              key: 'status',
              render: (isActive) => (
                <Tag color={isActive ? 'green' : 'red'}>
                  {isActive ? 'Active' : 'Inactive'}
                </Tag>
              ),
            },
          ]}
          loading={loadingCustomers}
          rowKey="id"
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedCustomers,
            onChange: (selectedRowKeys) => {
              setSelectedCustomers(selectedRowKeys);
            },
          }}
          pagination={{ 
            pageSize: 10,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} customers`,
          }}
          scroll={{ y: 400 }}
        />
      </Modal>
    </div>
  );
};

/**
 * CampaignFormContent - Renders form fields based on campaign type
 * Extracted to reduce main component complexity
 */
const CampaignFormContent = ({
  modalType,
  preview,
  useTemplateMode,
  setUseTemplateMode,
  handleFormChange,
  tinyMCEConfig,
  emailTemplates,
  emailEditorRef,
  popupEditorRef,
  overlayEditorRef,
  form
}) => {
  // Common upload handler
  const handleImageUpload = (info, field) => {
    if (info.fileList.length > 0) {
      const file = info.fileList[0].originFileObj;
      const reader = new FileReader();
      reader.onload = (e) => handleFormChange({ [field]: e.target.result });
      reader.readAsDataURL(file);
    } else {
      handleFormChange({ [field]: '' });
    }
  };

  switch (modalType) {
    case 'email':
      return (
        <>
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <Text strong className="text-base">Template Mode</Text>
              <Switch 
                checked={useTemplateMode} 
                onChange={setUseTemplateMode}
                checkedChildren="Background + Text"
                unCheckedChildren="Full Editor"
              />
            </div>
            <Text className="text-xs text-gray-600">
              {useTemplateMode 
                ? '🎨 Upload a background image and add text overlay on top' 
                : '✏️ Build your email with the full rich text editor'}
            </Text>
          </div>

          {useTemplateMode ? (
            <>
              <Form.Item label="Background Template Image">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  beforeUpload={() => false}
                  onChange={(info) => handleImageUpload(info, 'templateImage')}
                >
                  <div>
                    <PictureOutlined />
                    <div style={{ marginTop: 8 }}>Upload Background</div>
                  </div>
                </Upload>
              </Form.Item>
              
              {preview.email.templateImage && (
                <Form.Item label="Text Overlay (optional)">
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <Editor
                      tinymceScriptSrc="/tinymce/tinymce.min.js"
                      onInit={(_evt, editor) => overlayEditorRef.current = editor}
                      value={preview.email.overlayHtml}
                      onEditorChange={(content) => handleFormChange({ overlayHtml: content })}
                      init={{ ...tinyMCEConfig, height: 200 }}
                    />
                  </div>
                </Form.Item>
              )}
            </>
          ) : (
            <>
              <Form.Item name="template" label="Email Template" rules={[{ required: true }]}>
                <Select placeholder="Select template" options={emailTemplates} />
              </Form.Item>
              <Form.Item name="subject" label="Email Subject" rules={[{ required: true }]}>
                <Input 
                  placeholder="Exciting offer just for you!" 
                  onChange={(e) => handleFormChange({ subject: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="Email Content" rules={[{ required: true }]}>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <Editor
                    tinymceScriptSrc="/tinymce/tinymce.min.js"
                    onInit={(_evt, editor) => emailEditorRef.current = editor}
                    value={preview.email.html}
                    onEditorChange={(content) => handleFormChange({ html: content })}
                    init={tinyMCEConfig}
                  />
                </div>
              </Form.Item>
              <Divider>Styling & Colors</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Page Background">
                    <ColorPicker value={preview.email.bgColor} onChange={(_, hex) => handleFormChange({ bgColor: hex })} showText />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Card Background">
                    <ColorPicker value={preview.email.contentBgColor} onChange={(_, hex) => handleFormChange({ contentBgColor: hex })} showText />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Text Color">
                <ColorPicker value={preview.email.textColor} onChange={(_, hex) => handleFormChange({ textColor: hex })} showText />
              </Form.Item>
              <Divider>Images & Attachments</Divider>
              <Form.Item label="Content Image">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  beforeUpload={() => false}
                  onChange={(info) => handleImageUpload(info, 'backgroundImage')}
                >
                  <div><PictureOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>
                </Upload>
              </Form.Item>
            </>
          )}
        </>
      );

    case 'popup':
      return <PopupFormIntegration form={form} preview={preview.popup} handleFormChange={handleFormChange} initialData={null} />;

    case 'sms':
      return (
        <>
          <Form.Item name="content" label="SMS Message" rules={[{ required: true }, { max: 160 }]}>
            <Input.TextArea
              value={preview.sms.content}
              onChange={(e) => handleFormChange({ content: e.target.value })}
              placeholder="Hi {name}, exclusive offer for you!"
              rows={4}
              maxLength={160}
              showCount
            />
          </Form.Item>
          <Form.Item label="Attach Image (MMS)">
            <Upload
              listType="picture-card"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => handleImageUpload(info, 'attachedImage')}
            >
              <div><PictureOutlined /><div style={{ marginTop: 8 }}>Add Image</div></div>
            </Upload>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Bubble Color">
                <ColorPicker value={preview.sms.bubbleColor} onChange={(_, hex) => handleFormChange({ bubbleColor: hex })} showText />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Background">
                <ColorPicker value={preview.sms.bgColor} onChange={(_, hex) => handleFormChange({ bgColor: hex })} showText />
              </Form.Item>
            </Col>
          </Row>
        </>
      );

    case 'whatsapp':
      return (
        <>
          <Form.Item name="content" label="WhatsApp Message" rules={[{ required: true }]}>
            <WhatsAppTextArea
              value={preview.whatsapp.content}
              onChange={(val) => handleFormChange({ content: val })}
              placeholder="Hello! We have something special for you..."
              rows={5}
            />
          </Form.Item>
          <Form.Item label="Attach Media">
            <Upload
              listType="picture-card"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                if (info.fileList.length > 0) {
                  const file = info.fileList[0].originFileObj;
                  const reader = new FileReader();
                  reader.onload = (e) => handleFormChange({ mediaUrl: e.target.result, mediaType: file.type });
                  reader.readAsDataURL(file);
                } else {
                  handleFormChange({ mediaUrl: '', mediaType: '' });
                }
              }}
            >
              <div><PictureOutlined /><div style={{ marginTop: 8 }}>Upload Media</div></div>
            </Upload>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Bubble Color">
                <ColorPicker value={preview.whatsapp.bubbleColor} onChange={(_, hex) => handleFormChange({ bubbleColor: hex })} showText />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Background">
                <ColorPicker value={preview.whatsapp.bgColor} onChange={(_, hex) => handleFormChange({ bgColor: hex })} showText />
              </Form.Item>
            </Col>
          </Row>
        </>
      );

    case 'question':
      return (
        <>
          <Form.Item name="questionText" label="Question" rules={[{ required: true }]}>
            <Input.TextArea
              value={preview.question.questionText}
              onChange={(e) => handleFormChange({ questionText: e.target.value })}
              placeholder="What would you like to know about our services?"
              rows={2}
            />
          </Form.Item>
          <Form.Item label="Subtitle (Optional)">
            <Input
              value={preview.question.subtitle}
              onChange={(e) => handleFormChange({ subtitle: e.target.value })}
              placeholder="Additional context or description"
            />
          </Form.Item>
          <Form.Item label="Background Image (Optional)">
            <Upload
              listType="picture-card"
              maxCount={1}
              beforeUpload={() => false}
              onChange={(info) => {
                if (info.fileList.length > 0) {
                  const file = info.fileList[0].originFileObj;
                  const reader = new FileReader();
                  reader.onload = (e) => handleFormChange({ backgroundImage: e.target.result });
                  reader.readAsDataURL(file);
                } else {
                  handleFormChange({ backgroundImage: '' });
                }
              }}
            >
              <div><PictureOutlined /><div style={{ marginTop: 8 }}>Upload Background</div></div>
            </Upload>
          </Form.Item>
          <Divider>Answer Options</Divider>
          {preview.question.answers.map((answer, index) => (
            <Card key={answer.id} className="mb-4 bg-gray-50" size="small">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <Input
                    value={answer.text}
                    onChange={(e) => {
                      const newAnswers = [...preview.question.answers];
                      newAnswers[index].text = e.target.value;
                      handleFormChange({ answers: newAnswers });
                    }}
                    placeholder={`Answer ${index + 1}`}
                    prefix={<span className="text-gray-400">#{index + 1}</span>}
                  />
                  <Row gutter={8}>
                    <Col span={12}>
                      <ColorPicker
                        value={answer.buttonColor}
                        onChange={(_, hex) => {
                          const newAnswers = [...preview.question.answers];
                          newAnswers[index].buttonColor = hex;
                          handleFormChange({ answers: newAnswers });
                        }}
                        showText
                        size="small"
                      />
                    </Col>
                    <Col span={12}>
                      <Select
                        value={answer.action}
                        onChange={(val) => {
                          const newAnswers = [...preview.question.answers];
                          newAnswers[index].action = val;
                          handleFormChange({ answers: newAnswers });
                        }}
                        size="small"
                        className="w-full"
                      >
                        <Select.Option value="link">Open Link</Select.Option>
                        <Select.Option value="next">Next Question</Select.Option>
                        <Select.Option value="close">Close Popup</Select.Option>
                      </Select>
                    </Col>
                  </Row>
                  <Input
                    value={answer.actionValue}
                    onChange={(e) => {
                      const newAnswers = [...preview.question.answers];
                      newAnswers[index].actionValue = e.target.value;
                      handleFormChange({ answers: newAnswers });
                    }}
                    placeholder={answer.action === 'link' ? 'https://example.com' : 'Action value'}
                    size="small"
                  />
                </div>
                {preview.question.answers.length > 1 && (
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      const newAnswers = preview.question.answers.filter((_, i) => i !== index);
                      handleFormChange({ answers: newAnswers });
                    }}
                  />
                )}
              </div>
            </Card>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => {
              const newAnswer = { id: Date.now(), text: '', buttonColor: '#3b82f6', action: 'link', actionValue: '' };
              handleFormChange({ answers: [...preview.question.answers, newAnswer] });
            }}
          >
            Add Answer Option
          </Button>
          <Divider />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Background Color">
                <ColorPicker value={preview.question.bgColor} onChange={(_, hex) => handleFormChange({ bgColor: hex })} showText />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Text Color">
                <ColorPicker value={preview.question.textColor} onChange={(_, hex) => handleFormChange({ textColor: hex })} showText />
              </Form.Item>
            </Col>
          </Row>
        </>
      );

    default:
      return null;
  }
};

export default MarketingPage;

