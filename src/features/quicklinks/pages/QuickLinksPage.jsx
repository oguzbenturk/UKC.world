/**
 * Quick Links & Forms Page
 * Redesigned for clarity - no tooltips, clear workflow
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  DatePicker,
  InputNumber,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Empty,
  Tabs,
  Popconfirm,
  Drawer,
  Descriptions,
  Divider,
  Collapse,
  Image
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  LinkOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  HomeOutlined,
  BookOutlined,
  ShoppingCartOutlined,
  CarOutlined,
  EyeOutlined,
  FormOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ShareAltOutlined,
  GlobalOutlined,
  SendOutlined,
  RightOutlined,
  UserOutlined,
  InboxOutlined,
  MessageOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileOutlined,
  PrinterOutlined,
  MailOutlined,
  DownloadOutlined,
  FilterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as quickLinksService from '../services/quickLinksService';
import * as formService from '../../forms/services/formService';
import usersService from '@/shared/services/usersService';
import rolesService from '@/shared/services/rolesService';

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;

const SERVICE_TYPES = [
  { value: 'accommodation', label: 'Accommodation', icon: <HomeOutlined />, color: 'blue' },
  { value: 'lesson', label: 'Lessons', icon: <BookOutlined />, color: 'green' },
  { value: 'rental', label: 'Rentals', icon: <CarOutlined />, color: 'orange' },
  { value: 'shop', label: 'Shop', icon: <ShoppingCartOutlined />, color: 'purple' }
];

// Helper functions for file handling
const findProfilePicture = (data) => {
  const profileFields = ['profile_picture', 'profile_pic', 'photo', 'picture', 'avatar'];
  for (const field of profileFields) {
    const value = data[field];
    if (value) {
      if (Array.isArray(value) && value[0]?.url) return value[0].url;
      if (value.url) return value.url;
      if (typeof value === 'string' && value.startsWith('http')) return value;
    }
  }
  return null;
};

const findCVFile = (data) => {
  const cvFields = ['cv', 'resume', 'curriculum_vitae', 'cv_file', 'resume_file'];
  for (const field of cvFields) {
    const value = data[field];
    if (value) {
      if (Array.isArray(value) && value[0]?.url) return value[0];
      if (value.url) return value;
    }
  }
  return null;
};

const getFileIcon = (file) => {
  const type = file?.type || '';
  const name = file?.name || '';
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
    return <FileImageOutlined style={{ color: '#52c41a', fontSize: 20 }} />;
  }
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />;
  }
  if (type.includes('word') || /\.(doc|docx)$/i.test(name)) {
    return <FileWordOutlined style={{ color: '#1890ff', fontSize: 20 }} />;
  }
  return <FileOutlined style={{ fontSize: 20 }} />;
};

// Helper to ensure file URL is absolute
const getAbsoluteFileUrl = (url) => {
  if (!url) return '';
  // If already absolute, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // If relative, prepend API base URL or current origin
  const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  return url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
};

const formatSubmissionValue = (value) => {
  if (value === null || value === undefined || value === '') return <span className="text-gray-400 italic">Not provided</span>;
  
  // Check if it's a file array
  if (Array.isArray(value) && value[0]?.url) {
    return value.map((file, idx) => {
      const fileUrl = getAbsoluteFileUrl(file.url);
      return (
        <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded border mt-1">
          {getFileIcon(file)}
          <div className="flex-1 min-w-0">
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block truncate">
              {file.name || 'View file'}
            </a>
            {file.size && <span className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</span>}
          </div>
          <Space size="small">
            <Button type="link" size="small" icon={<EyeOutlined />} href={fileUrl} target="_blank" />
            <Button type="link" size="small" icon={<DownloadOutlined />} href={fileUrl} download={file.name} />
          </Space>
        </div>
      );
    });
  }
  
  // Check if it's a single file object
  if (value?.url) {
    const fileUrl = getAbsoluteFileUrl(value.url);
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
        {getFileIcon(value)}
        <div className="flex-1 min-w-0">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block truncate">
            {value.name || 'View file'}
          </a>
          {value.size && <span className="text-xs text-gray-500">{(value.size / 1024).toFixed(1)} KB</span>}
        </div>
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} href={fileUrl} target="_blank" />
          <Button type="link" size="small" icon={<DownloadOutlined />} href={fileUrl} download={value.name} />
        </Space>
      </div>
    );
  }
  
  // Check if it's a date string
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return dayjs(value).format('MMMM D, YYYY');
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400 italic">Not provided</span>;
    return value.map(v => humanizeValue(v)).join(', ');
  }
  
  // Handle booleans
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No';
  
  // Handle objects
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  
  // Humanize string values (convert snake_case, handle enums)
  return humanizeValue(value);
};

// Helper to convert technical values to human-readable format
const humanizeValue = (value) => {
  if (!value) return '';
  
  const str = String(value);
  
  // Handle specific enum mappings
  const enumMappings = {
    // Hours ranges
    'under_500': 'Under 500 hours',
    '500_1000': '500-1000 hours',
    '1000_2000': '1000-2000 hours',
    '2000_3000': '2000-3000 hours',
    'over_3000': 'Over 3000 hours',
    
    // Experience levels
    'absolute_beginners': 'Absolute Beginners',
    'independent_advance': 'Independent/Advanced',
    'advanced_safety': 'Advanced Safety',
    'strong_wind': 'Strong Wind',
    'light_wind': 'Light Wind',
    'flat_water': 'Flat Water',
    'choppy_waves': 'Choppy/Waves',
    'gusty_thermal': 'Gusty/Thermal Winds',
    
    // Work arrangements
    'full_season': 'Full Season',
    'high_volume': 'High Volume',
    'occasional': 'Occasional',
    'premium_clientele': 'Premium Clientele',
    'duotone_pro_center': 'Duotone Pro Center',
    
    // Teaching tools
    'radio_helmets': 'Radio Helmets',
    'progression_plans': 'Progression Plans',
    'video_analysis': 'Video Analysis',
    'lesson_debriefing': 'Lesson Debriefing',
    
    // Certifications
    'iko': 'IKO',
    'vdws': 'VDWS',
    'bksa': 'BKSA',
    'us1': 'US Level 1',
    'us2': 'US Level 2',
    'us3': 'US Level 3',
    'us4': 'US Level 4',
    
    // Languages
    'english': 'English',
    'turkish': 'Turkish',
    'german': 'German',
    'french': 'French',
    'spanish': 'Spanish',
    'italian': 'Italian',
    'portuguese': 'Portuguese',
    'dutch': 'Dutch',
    'russian': 'Russian'
  };
  
  // Check if we have a direct mapping
  if (enumMappings[str.toLowerCase()]) {
    return enumMappings[str.toLowerCase()];
  }
  
  // Convert snake_case to Title Case
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
};

const FORM_CATEGORIES = [
  { value: 'registration', label: 'Registration', color: 'blue' },
  { value: 'feedback', label: 'Feedback', color: 'green' },
  { value: 'waiver', label: 'Waiver/Consent', color: 'orange' },
  { value: 'booking', label: 'Booking', color: 'purple' },
  { value: 'survey', label: 'Survey', color: 'cyan' },
  { value: 'application', label: 'Application', color: 'magenta' },
  { value: 'other', label: 'Other', color: 'default' }
];

const QuickLinksPage = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('forms');
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allFormTemplates, setAllFormTemplates] = useState([]);
  const [formTemplatesLoading, setFormTemplatesLoading] = useState(false);
  const [allRegistrations, setAllRegistrations] = useState([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [formSubmissions, setFormSubmissions] = useState([]);
  const [formSubmissionsLoading, setFormSubmissionsLoading] = useState(false);
  const [submissionFilters, setSubmissionFilters] = useState({ status: 'all', formId: null, search: '' });
  
  // Create User from Submission
  const [createUserModalVisible, setCreateUserModalVisible] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserForm] = Form.useForm();
  
  const [roles, setRoles] = useState([]);

  // Fetch roles
  useEffect(() => {
    // Only fetch if we are an admin/manager who can create users
    const fetchRoles = async () => {
        try {
            const data = await rolesService.list();
            setRoles(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to fetch roles', e);
        }
    };
    fetchRoles();
  }, []);
  
  // Service items for link configuration
  const [accommodations, setAccommodations] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [shopProducts, setShopProducts] = useState([]);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  
  // Modals
  const [createFormModalVisible, setCreateFormModalVisible] = useState(false);
  const [createLinkModalVisible, setCreateLinkModalVisible] = useState(false);
  const [editLinkModalVisible, setEditLinkModalVisible] = useState(false);
  const [selectedLink, setSelectedLink] = useState(null);
  const [shareLinkModalVisible, setShareLinkModalVisible] = useState(false);
  const [selectedFormForLink, setSelectedFormForLink] = useState(null);
  const [createdLink, setCreatedLink] = useState(null);
  const [submissionDetailVisible, setSubmissionDetailVisible] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [instructorNotes, setInstructorNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  
  const [createFormForm] = Form.useForm();
  const [createLinkForm] = Form.useForm();

  // Save instructor notes
  const handleSaveNotes = async () => {
    if (!selectedSubmission) return;
    setSavingNotes(true);
    try {
      const updated = await formService.updateFormSubmission(selectedSubmission.id, { notes: instructorNotes });
      setSelectedSubmission(prev => ({ ...prev, notes: updated.notes }));
      // Update in list too
      setFormSubmissions(prev => prev.map(s => s.id === selectedSubmission.id ? { ...s, notes: updated.notes } : s));
      message.success('Notes saved');
    } catch {
      message.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  // Helper to extract submitter name from submission data
  const getSubmitterName = (record) => {
    const data = record.submission_data || {};
    // Use the robust findFieldValue logic since we share the same data source
    const firstName = findFieldValue(data, ['first_name', 'firstName', 'firstname', 'fname', 'given_name']);
    const lastName = findFieldValue(data, ['last_name', 'lastName', 'lastname', 'lname', 'surname', 'family_name']);
    
    if (firstName || lastName) {
        return `${firstName} ${lastName}`.trim();
    }
    
    // Try separate full name field
    const fullName = findFieldValue(data, ['name', 'full_name', 'fullName', 'fullname', 'your_name', 'yourname', 'complete_name']);
    if (fullName) return fullName;

    // Fall back to email
    const email = findFieldValue(data, ['email', 'email_address', 'e-mail', 'mail']);
    if (email) return email;

    // Last resort
    return record.submitted_by_name || record.user_name || 'Anonymous';
  };

  // Helper to get submitter email
  const getSubmitterEmail = (record) => {
    const data = record.submission_data || {};
    return findFieldValue(data, ['email', 'email_address', 'e-mail', 'mail']) || record.submitted_by_email || '';
  };

  // Fetch all form templates
  const fetchAllFormTemplates = useCallback(async () => {
    setFormTemplatesLoading(true);
    try {
      const data = await formService.getFormTemplates({ limit: 100 });
      setAllFormTemplates(data.data || []);
    } catch {
      message.error('Failed to load forms');
    } finally {
      setFormTemplatesLoading(false);
    }
  }, []);

  // Fetch quick links
  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await quickLinksService.getQuickLinks();
      setLinks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load links:', error);
      message.error('Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch registrations (from quick links - simple service registrations)
  const fetchAllRegistrations = useCallback(async (linksList) => {
    if (!linksList || linksList.length === 0) {
      setAllRegistrations([]);
      return;
    }
    setRegistrationsLoading(true);
    try {
      const allRegs = [];
      for (const link of linksList) {
        // Only get registrations from non-form links
        if (link.link_type !== 'form') {
          try {
            const regs = await quickLinksService.getRegistrations(link.id);
            if (regs && regs.length > 0) {
              allRegs.push(...regs.map(r => ({
                ...r,
                link_name: link.name,
                link_code: link.link_code,
                service_type: link.service_type
              })));
            }
          } catch {
            // Skip failed fetches
          }
        }
      }
      setAllRegistrations(allRegs);
    } catch {
      // Silently fail
    } finally {
      setRegistrationsLoading(false);
    }
  }, []);

  // Fetch form submissions (from custom forms)
  const fetchFormSubmissions = useCallback(async () => {
    setFormSubmissionsLoading(true);
    try {
      const filters = { 
        limit: 100,
        ...submissionFilters
      };
      
      // Handle 'all' status
      if (filters.status === 'all') delete filters.status;
      
      const data = await formService.getFormSubmissions(filters);
      setFormSubmissions(data.submissions || []);
    } catch {
      // Silently fail
    } finally {
      setFormSubmissionsLoading(false);
    }
  }, [submissionFilters]);

  // Delete a form submission
  const handleDeleteSubmission = async (submissionId) => {
    try {
      await formService.deleteFormSubmission(submissionId);
      message.success('Submission deleted successfully');
      fetchFormSubmissions(); // Refresh the list
    } catch (error) {
      message.error('Failed to delete submission');
    }
  };

  // Helper to safely find field values case-insensitively
  const findFieldValue = (data, possibleKeys) => {
    const dataKeys = Object.keys(data);
    for (const key of possibleKeys) {
      // 1. Direct match
      if (data[key]) return data[key];
      
      // 2. Case-insensitive match
      const foundKey = dataKeys.find(k => k.toLowerCase() === key.toLowerCase());
      if (foundKey && data[foundKey]) return data[foundKey];
    }
    return '';
  };

  // Open Create User Modal
  const handleOpenCreateUserModal = (submission) => {
    setSelectedSubmission(submission);
    
    // Auto-map fields
    const data = submission.submission_data || {};
    const formName = (submission.form_name || '').toLowerCase();
    
    let role = 'student'; // Default
    if (formName.includes('instructor')) role = 'instructor';
    
    // 1. Try to find explicit first/last names
    let firstName = findFieldValue(data, ['first_name', 'firstName', 'firstname', 'fname', 'given_name']);
    let lastName = findFieldValue(data, ['last_name', 'lastName', 'lastname', 'lname', 'surname', 'family_name']);
    
    // 2. If one or both missing, try to parse from full name fields
    if (!firstName || !lastName) {
      const fullName = findFieldValue(data, ['name', 'full_name', 'fullName', 'fullname', 'your_name', 'yourname', 'complete_name']);
      
      if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) {
          if (!firstName) firstName = parts[0];
        } else if (parts.length > 1) {
          const lastPart = parts.pop();
          const firstPart = parts.join(' ');
          
          if (!lastName) lastName = lastPart;
          if (!firstName) firstName = firstPart;
        }
      }
    }

    createUserForm.setFieldsValue({
      first_name: firstName,
      last_name: lastName,
      email: findFieldValue(data, ['email', 'email_address', 'e-mail', 'mail']),
      phone: findFieldValue(data, ['phone', 'phoneNumber', 'mobile', 'cell', 'tel', 'phone_number']),
      password: Math.random().toString(36).slice(-8), // Suggest a random password
      role: role
    });
    
    setCreateUserModalVisible(true);
  };

  const handleCreateUser = async () => {
    try {
      const values = await createUserForm.validateFields();
      setCreatingUser(true);
      
      // Map role name to role ID
      const roleName = values.role;
      const roleObj = roles.find(r => r.name === roleName);
      
      if (!roleObj) {
        throw new Error(`Role '${roleName}' not found in the system.`);
      }

      const payload = {
        ...values,
        role_id: roleObj.id,
        // Add metadata
        source: 'form_submission', 
        submission_id: selectedSubmission?.id
      };
      delete payload.role; // Remove role name, backend expects role_id

      await usersService.create(payload);
      
      message.success('User created successfully');
      setCreateUserModalVisible(false);
      createUserForm.resetFields();
    } catch (error) {
      console.error(error);
      message.error(error.message || error.error || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };


  useEffect(() => {
    fetchAllFormTemplates();
    fetchLinks();
    fetchFormSubmissions();
    fetchServices();
  }, [fetchAllFormTemplates, fetchLinks, fetchFormSubmissions]);

  // Fetch available services for link configuration
  const fetchServices = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;

      // Fetch accommodations
      const accomResponse = await fetch('/api/accommodation/units', headers ? { headers } : {});
      if (accomResponse.ok) {
        const accomData = await accomResponse.json();
        setAccommodations(accomData.accommodations || accomData || []);
      }

      // Fetch lessons (from services with category=lesson)
      const lessonResponse = await fetch('/api/services?category=lesson');
      if (lessonResponse.ok) {
        const lessonData = await lessonResponse.json();
        setLessons(Array.isArray(lessonData) ? lessonData : []);
      }

      // Fetch rentals (from services with serviceType=rental)
      const rentalResponse = await fetch('/api/services?serviceType=rental');
      if (rentalResponse.ok) {
        const rentalData = await rentalResponse.json();
        setRentals(Array.isArray(rentalData) ? rentalData : []);
      }

      // Fetch shop products
      const shopResponse = await fetch('/api/shop/products', headers ? { headers } : {});
      if (shopResponse.ok) {
        const shopData = await shopResponse.json();
        setShopProducts(shopData.products || shopData || []);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    }
  };

  useEffect(() => {
    if (links.length > 0) {
      fetchAllRegistrations(links);
    }
  }, [links, fetchAllRegistrations]);

  // Get public URL
  const getPublicUrl = (linkCode) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/f/${linkCode}`;
  };

  // Copy link to clipboard
  const copyLink = (linkCode) => {
    navigator.clipboard.writeText(getPublicUrl(linkCode));
    message.success('Link copied to clipboard!');
  };

  // Create a shareable link for a form
  const handleCreateLinkForForm = (formTemplate) => {
    setSelectedFormForLink(formTemplate);
    createLinkForm.setFieldsValue({
      name: formTemplate.name,
      form_template_id: formTemplate.id
    });
    setCreateLinkModalVisible(true);
  };

  // Submit create link
  const handleCreateLink = async (values) => {
    try {
      // Determine link type based on whether a form is selected
      const linkType = values.form_template_id ? 'form' : values.service_type ? 'service' : 'registration';
      
      const data = {
        name: values.name,
        description: values.description,
        link_type: linkType,
        service_type: values.service_type,
        service_id: values.service_id,
        form_template_id: values.form_template_id,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
        max_uses: values.max_uses,
        is_active: true
      };
      
      const newLink = await quickLinksService.createQuickLink(data);
      message.success('Shareable link created!');
      setCreateLinkModalVisible(false);
      createLinkForm.resetFields();
      setSelectedServiceType(null);
      setCreatedLink(newLink);
      setShareLinkModalVisible(true);
      fetchLinks();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to create link');
    }
  };

  // Create new form
  const handleCreateForm = async (values) => {
    try {
      const template = await formService.createFormTemplate({
        ...values,
        is_active: true
      });
      message.success('Form created! Opening builder...');
      setCreateFormModalVisible(false);
      createFormForm.resetFields();
      navigate(`/forms/builder/${template.id}`);
    } catch {
      message.error('Failed to create form');
    }
  };

  // Delete form
  const handleDeleteForm = async (id, name) => {
    try {
      await formService.deleteFormTemplate(id);
      message.success(`"${name}" deleted`);
      fetchAllFormTemplates();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  // Delete link
  const handleDeleteLink = async (id) => {
    try {
      await quickLinksService.deleteQuickLink(id);
      message.success('Link deleted');
      fetchLinks();
    } catch {
      message.error('Failed to delete link');
    }
  };

  // Open edit link modal
  const handleEditLink = (link) => {
    setSelectedLink(link);
    setSelectedServiceType(link.service_type || null);
    createLinkForm.setFieldsValue({
      name: link.name,
      description: link.description,
      service_type: link.service_type,
      service_id: link.service_id,
      expires_at: link.expires_at ? dayjs(link.expires_at) : null,
      max_uses: link.max_uses
    });
    setEditLinkModalVisible(true);
  };

  // Update link
  const handleUpdateLink = async (values) => {
    try {
      const data = {
        name: values.name,
        description: values.description,
        service_type: values.service_type,
        service_id: values.service_id,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
        max_uses: values.max_uses
      };
      
      await quickLinksService.updateQuickLink(selectedLink.id, data);
      message.success('Link updated successfully!');
      setEditLinkModalVisible(false);
      createLinkForm.resetFields();
      setSelectedLink(null);
      setSelectedServiceType(null);
      fetchLinks();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to update link');
    }
  };

  // Update registration status
  const handleUpdateRegistration = async (id, status) => {
    try {
      await quickLinksService.updateRegistration(id, { status });
      message.success('Status updated');
      fetchLinks();
    } catch {
      message.error('Failed to update');
    }
  };

  // Get link for a form
  const getFormLink = (formId) => {
    return links.find(l => l.form_template_id === formId && l.link_type === 'form');
  };

  // ============ FORMS TAB ============
  const FormsTab = () => (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">Your Forms</Title>
          <Text type="secondary">Create custom forms for applications, waivers, surveys, and feedback</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          size="large"
          className="w-full sm:w-auto"
          onClick={() => setCreateFormModalVisible(true)}
        >
          Create New Form
        </Button>
      </div>

      {/* Forms List */}
      {allFormTemplates.length === 0 ? (
        <Card className="text-center py-12">
          <Empty
            image={<FormOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
            description={
              <div className="space-y-2">
                <Text className="text-lg">No forms yet</Text>
                <Paragraph type="secondary">
                  Create your first form to start collecting applications, feedback, or registrations
                </Paragraph>
              </div>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreateFormModalVisible(true)}>
              Create Your First Form
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {allFormTemplates.map(form => {
            const existingLink = getFormLink(form.id);
            const cat = FORM_CATEGORIES.find(c => c.value === form.category);
            
            return (
              <Col xs={24} md={12} lg={8} key={form.id}>
                <Card 
                  className="h-full hover:shadow-md transition-shadow"
                  actions={[
                    <Button 
                      key="edit" 
                      type="link" 
                      icon={<EditOutlined />}
                      onClick={() => navigate(`/forms/builder/${form.id}`)}
                    >
                      Edit
                    </Button>,
                    <Button 
                      key="preview" 
                      type="link" 
                      icon={<EyeOutlined />}
                      onClick={() => navigate(`/forms/preview/${form.id}`)}
                    >
                      Preview
                    </Button>,
                    existingLink ? (
                      <Button 
                        key="copy" 
                        type="link" 
                        icon={<CopyOutlined />}
                        onClick={() => copyLink(existingLink.link_code)}
                      >
                        Copy Link
                      </Button>
                    ) : (
                      <Button 
                        key="share" 
                        type="link" 
                        icon={<ShareAltOutlined />}
                        onClick={() => handleCreateLinkForForm(form)}
                      >
                        Get Link
                      </Button>
                    )
                  ]}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Text strong className="text-base">{form.name}</Text>
                        {form.description && (
                          <Paragraph type="secondary" className="!mb-0 text-sm line-clamp-2">
                            {form.description}
                          </Paragraph>
                        )}
                      </div>
                      <Tag color={form.is_active ? 'green' : 'default'}>
                        {form.is_active ? 'Active' : 'Draft'}
                      </Tag>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{form.step_count || 0} steps</span>
                      <span>{form.field_count || 0} fields</span>
                      {cat && <Tag color={cat.color} className="!m-0">{cat.label}</Tag>}
                    </div>

                    {/* Show link status */}
                    {existingLink ? (
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <div className="flex items-center gap-2 text-green-700">
                          <GlobalOutlined />
                          <Text className="text-green-700 font-medium">Shareable link active</Text>
                        </div>
                        <code className="text-xs text-green-600 block mt-1 truncate">
                          {getPublicUrl(existingLink.link_code)}
                        </code>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <Text type="secondary" className="text-sm">
                          <ShareAltOutlined className="mr-2" />
                          Click "Get Link" to share this form publicly
                        </Text>
                      </div>
                    )}

                    {/* Submissions count */}
                    {(form.submission_count || 0) > 0 && (
                      <Button 
                        type="link" 
                        className="!p-0" 
                        icon={<FileTextOutlined />}
                        onClick={() => navigate(`/forms/${form.id}/responses`)}
                      >
                        View {form.submission_count} submission{form.submission_count > 1 ? 's' : ''}
                      </Button>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );

  // ============ LINKS TAB ============
  const LinksTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">Active Links</Title>
          <Text type="secondary">All your shareable links - copy and send to customers</Text>
        </div>
        <Space className="w-full sm:w-auto">
          <Button 
            type="primary"
            icon={<PlusOutlined />} 
            className="flex-1 sm:flex-none"
            onClick={() => {
              setSelectedFormForLink(null);
              createLinkForm.resetFields();
              setCreateLinkModalVisible(true);
            }}
          >
            Create Link
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchLinks}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* Links Table */}
      <Card>
        <Table
          dataSource={links}
          rowKey="id"
          scroll={{ x: 1000 }}
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: (
              <Empty description="No links created yet. Create a form first, then get a shareable link." />
            )
          }}
          columns={[
            {
              title: 'Link Name',
              key: 'name',
              render: (_, record) => (
                <div>
                  <Text strong>{record.name}</Text>
                  <div className="text-xs text-gray-500">{record.link_type === 'form' ? 'Custom Form' : record.service_type}</div>
                </div>
              )
            },
            {
              title: 'URL',
              key: 'url',
              render: (_, record) => (
                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                  /f/{record.link_code}
                </code>
              )
            },
            {
              title: 'Status',
              key: 'status',
              width: 100,
              render: (_, record) => (
                <Tag color={record.is_active ? 'green' : 'default'}>
                  {record.is_active ? 'Active' : 'Inactive'}
                </Tag>
              )
            },
            {
              title: 'Uses',
              dataIndex: 'current_uses',
              key: 'uses',
              width: 80,
              render: (uses, record) => (
                <span>{uses || 0}{record.max_uses ? `/${record.max_uses}` : ''}</span>
              )
            },
            {
              title: 'Expires',
              dataIndex: 'expires_at',
              key: 'expires',
              width: 120,
              render: (date) => date ? dayjs(date).format('MMM D, YYYY') : 'Never'
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 250,
              render: (_, record) => (
                <Space>
                  <Button 
                    size="small" 
                    icon={<EditOutlined />}
                    onClick={() => handleEditLink(record)}
                  >
                    Edit
                  </Button>
                  <Button 
                    type="primary" 
                    size="small" 
                    icon={<CopyOutlined />}
                    onClick={() => copyLink(record.link_code)}
                  >
                    Copy
                  </Button>
                  <Button 
                    size="small" 
                    icon={<EyeOutlined />}
                    onClick={() => window.open(getPublicUrl(record.link_code), '_blank')}
                  >
                    Open
                  </Button>
                  <Popconfirm
                    title="Delete this link?"
                    onConfirm={() => handleDeleteLink(record.id)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
    </div>
  );

  // ============ FORM ANSWERS TAB ============
  const FormAnswersTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">Form Answers</Title>
          <Text type="secondary">Submissions from your custom forms</Text>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchFormSubmissions}
          className="w-full sm:w-auto"
        >
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card size="small" className="bg-gray-50">
        <div className="flex flex-wrap gap-4 items-center">
            <span className="text-gray-500"><FilterOutlined /> Filters:</span>
            <Input.Search
                placeholder="Search submitter..."
                allowClear
                className="w-full sm:w-64"
                onSearch={(value) => setSubmissionFilters(prev => ({ ...prev, search: value }))}
            />
            
            <Select 
                placeholder="Status"
                className="w-full sm:w-40"
                value={submissionFilters.status}
                onChange={(value) => setSubmissionFilters(prev => ({ ...prev, status: value }))}
            >
                <Option value="all">All Statuses</Option>
                <Option value="submitted">Submitted</Option>
                <Option value="pending">Pending</Option>
                <Option value="reviewed">Reviewed</Option>
                <Option value="approved">Approved</Option>
                <Option value="rejected">Rejected</Option>
            </Select>
            
            <Select 
                placeholder="Filter by Form"
                allowClear
                className="w-full sm:w-64"
                value={submissionFilters.formId}
                onChange={(value) => setSubmissionFilters(prev => ({ ...prev, formId: value }))}
                loading={formTemplatesLoading}
                dropdownMatchSelectWidth={false}
            >
                {allFormTemplates.map(t => (
                    <Option key={t.id} value={t.id}>{t.name}</Option>
                ))}
            </Select>

            <Button onClick={() => setSubmissionFilters({ status: 'all', formId: null, search: '' })}>
                Reset
            </Button>
        </div>
      </Card>

      {/* Form Answers Table */}
      <Card>
        <Table
          dataSource={formSubmissions}
          rowKey="id"
          scroll={{ x: 1000 }}
          loading={formSubmissionsLoading}
          pagination={{ pageSize: 15 }}
          locale={{
            emptyText: (
              <Empty description="No form submissions found matching your filters." />
            )
          }}
          columns={[
            {
              title: 'Submitted By',
              key: 'submitter',
              render: (_, record) => (
                <div>
                  <div className="flex items-center gap-2">
                    <UserOutlined className="text-gray-400" />
                    <Text strong>
                      {getSubmitterName(record)}
                    </Text>
                  </div>
                  {getSubmitterEmail(record) && (
                    <div className="text-xs text-gray-500 ml-5">{getSubmitterEmail(record)}</div>
                  )}
                </div>
              )
            },
            {
              title: 'Form',
              key: 'form',
              render: (_, record) => (
                <div>
                  <Tag color="blue" icon={<FormOutlined />}>{record.form_name || 'Unknown Form'}</Tag>
                </div>
              )
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              render: (status) => {
                const config = {
                  pending: { color: 'orange', text: 'Pending Review' },
                  reviewed: { color: 'blue', text: 'Reviewed' },
                  approved: { color: 'green', text: 'Approved' },
                  rejected: { color: 'red', text: 'Rejected' },
                  submitted: { color: 'cyan', text: 'Submitted' }
                };
                const c = config[status] || config.pending;
                return <Tag color={c.color}>{c.text}</Tag>;
              }
            },
            {
              title: '',
              dataIndex: 'notes',
              key: 'notes',
              width: 40,
              render: (notes) => notes ? (
                <MessageOutlined className="text-blue-500" title="Has notes" />
              ) : null
            },
            {
              title: 'Submitted',
              dataIndex: 'submitted_at',
              key: 'date',
              width: 150,
              render: (date) => date ? dayjs(date).format('MMM D, YYYY h:mm A') : '-'
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 200,
              render: (_, record) => (
                <Space size="small">
                  <Button 
                    type="primary" 
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={async () => {
                      try {
                        // Fetch full submission with form fields
                        const fullSubmission = await formService.getFormSubmission(record.id);
                        setSelectedSubmission(fullSubmission);
                        setInstructorNotes(fullSubmission.notes || '');
                        setSubmissionDetailVisible(true);
                      } catch (err) {
                        // Fallback to basic data
                        setSelectedSubmission(record);
                        setInstructorNotes(record.notes || '');
                        setSubmissionDetailVisible(true);
                      }
                    }}
                  >
                    View
                  </Button>
                  <Button 
                    size="small"
                    icon={<UserOutlined />}
                    onClick={() => handleOpenCreateUserModal(record)}
                    title="Create User Account"
                  >
                    User
                  </Button>
                  <Popconfirm
                    title="Delete submission"
                    description="Are you sure you want to delete this submission? This cannot be undone."
                    onConfirm={() => handleDeleteSubmission(record.id)}
                    okText="Delete"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                  >
                    <Button 
                      danger 
                      size="small"
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
    </div>
  );

  // ============ REGISTRATIONS TAB ============
  const RegistrationsTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">Link Registrations</Title>
          <Text type="secondary">Service registrations from your shareable links</Text>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={() => fetchAllRegistrations(links)}
          className="w-full sm:w-auto"
        >
          Refresh
        </Button>
      </div>

      {/* Registrations Table */}
      <Card>
        <Table
          dataSource={allRegistrations}
          rowKey="id"
          scroll={{ x: 1000 }}
          loading={registrationsLoading}
          pagination={{ pageSize: 15 }}
          locale={{
            emptyText: (
              <Empty description="No registrations yet. Share your links to receive sign-ups." />
            )
          }}
          columns={[
            {
              title: 'Customer',
              key: 'customer',
              render: (_, record) => (
                <div>
                  <Text strong>{record.first_name} {record.last_name}</Text>
                  <div className="text-xs text-gray-500">{record.email}</div>
                  {record.phone && <div className="text-xs text-gray-400">{record.phone}</div>}
                </div>
              )
            },
            {
              title: 'Service',
              key: 'service',
              render: (_, record) => (
                <div>
                  <Text>{record.link_name}</Text>
                  <div className="text-xs text-gray-400">
                    {record.service_type || 'General'}
                  </div>
                </div>
              )
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              render: (status) => {
                const config = {
                  pending: { color: 'orange', icon: <ClockCircleOutlined /> },
                  confirmed: { color: 'green', icon: <CheckCircleOutlined /> },
                  cancelled: { color: 'red', icon: <CloseCircleOutlined /> }
                };
                const c = config[status] || config.pending;
                return <Tag color={c.color} icon={c.icon}>{status?.toUpperCase()}</Tag>;
              }
            },
            {
              title: 'Date',
              dataIndex: 'created_at',
              key: 'date',
              width: 150,
              render: (date) => dayjs(date).format('MMM D, YYYY h:mm A')
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 150,
              render: (_, record) => (
                <Select
                  value={record.status}
                  style={{ width: 120 }}
                  size="small"
                  onChange={(value) => handleUpdateRegistration(record.id, value)}
                >
                  <Option value="pending">Pending</Option>
                  <Option value="confirmed">Confirm</Option>
                  <Option value="cancelled">Cancel</Option>
                </Select>
              )
            }
          ]}
        />
      </Card>
    </div>
  );

  return (
    <div className={embedded ? "" : "p-4 md:p-6"}>
      {/* Page Header - only show when not embedded */}
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FormOutlined className="text-white text-lg" />
            </div>
            <div>
              <Title level={2} className="!mb-0">Forms & Links</Title>
              <Text type="secondary">Build forms and create shareable links</Text>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats - only show when not embedded */}
      {!embedded && (
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={12} sm={6}>
            <Card className="text-center h-full">
              <div className="text-2xl font-bold text-indigo-600">{allFormTemplates.length}</div>
              <Text type="secondary">Forms</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="text-center h-full">
              <div className="text-2xl font-bold text-green-600">{links.length}</div>
              <Text type="secondary">Links</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="text-center h-full">
              <div className="text-2xl font-bold text-blue-600">{formSubmissions.length}</div>
              <Text type="secondary">Answers</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="text-center h-full">
              <div className="text-2xl font-bold text-orange-600">{allRegistrations.length}</div>
              <Text type="secondary">Registrations</Text>
            </Card>
          </Col>
        </Row>
      )}

      {/* Main Tabs */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          items={[
            {
              key: 'forms',
              label: (
                <span className="flex items-center gap-2">
                  <FormOutlined />
                  My Forms
                  {allFormTemplates.length > 0 && (
                    <Tag color="blue">{allFormTemplates.length}</Tag>
                  )}
                </span>
              ),
              children: <FormsTab />
            },
            {
              key: 'links',
              label: (
                <span className="flex items-center gap-2">
                  <LinkOutlined />
                  Shareable Links
                  {links.length > 0 && (
                    <Tag color="green">{links.length}</Tag>
                  )}
                </span>
              ),
              children: <LinksTab />
            },
            {
              key: 'answers',
              label: (
                <span className="flex items-center gap-2">
                  <InboxOutlined />
                  Form Answers
                  {formSubmissions.length > 0 && (
                    <Tag color="blue">{formSubmissions.length}</Tag>
                  )}
                </span>
              ),
              children: <FormAnswersTab />
            },
            {
              key: 'registrations',
              label: (
                <span className="flex items-center gap-2">
                  <UserOutlined />
                  Registrations
                  {allRegistrations.filter(r => r.status === 'pending').length > 0 && (
                    <Tag color="orange">{allRegistrations.filter(r => r.status === 'pending').length}</Tag>
                  )}
                </span>
              ),
              children: <RegistrationsTab />
            }
          ]}
        />
      </Card>

      {/* Create Form Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <FormOutlined className="text-indigo-500" />
            <span>Create New Form</span>
          </div>
        }
        open={createFormModalVisible}
        onCancel={() => setCreateFormModalVisible(false)}
        footer={null}
        width={500}
      >
        <div className="py-4">
          <Paragraph type="secondary" className="mb-4">
            Create a form, then build it with our drag-and-drop editor.
          </Paragraph>
          
          <Form
            form={createFormForm}
            layout="vertical"
            onFinish={handleCreateForm}
          >
            <Form.Item
              name="name"
              label="Form Name"
              rules={[{ required: true, message: 'Enter a name' }]}
            >
              <Input size="large" placeholder="e.g., Instructor Application, Waiver Form" />
            </Form.Item>

            <Form.Item
              name="description"
              label="Description (optional)"
            >
              <Input.TextArea rows={2} placeholder="What is this form for?" />
            </Form.Item>

            <Form.Item
              name="category"
              label="Category"
              rules={[{ required: true, message: 'Select a category' }]}
            >
              <Select size="large" placeholder="Select category">
                {FORM_CATEGORIES.map(cat => (
                  <Option key={cat.value} value={cat.value}>
                    {cat.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <div className="flex justify-end gap-2 mt-6">
              <Button onClick={() => setCreateFormModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" icon={<RightOutlined />} size="large">
                Create & Open Builder
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* Create Link Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ShareAltOutlined className="text-green-500" />
            <span>Create Shareable Link</span>
          </div>
        }
        open={createLinkModalVisible}
        onCancel={() => setCreateLinkModalVisible(false)}
        footer={null}
        width={500}
      >
        <div className="py-4">
          {selectedFormForLink && (
            <div className="bg-indigo-50 rounded-lg p-3 mb-4">
              <Text type="secondary">Creating link for:</Text>
              <div className="font-medium text-indigo-700">{selectedFormForLink.name}</div>
            </div>
          )}
          
          <Form
            form={createLinkForm}
            layout="vertical"
            onFinish={handleCreateLink}
          >
            <Form.Item name="form_template_id" hidden>
              <Input />
            </Form.Item>

            <Form.Item
              name="name"
              label="Link Name"
              rules={[{ required: true, message: 'Enter a name' }]}
            >
              <Input size="large" placeholder="e.g., Instructor Application 2026" />
            </Form.Item>

            {/* Show service type selector only if no form is selected */}
            {!selectedFormForLink && (
              <>
                <Form.Item
                  name="service_type"
                  label="Service Type"
                  rules={[{ required: true, message: 'Select a service type' }]}
                >
                  <Select 
                    size="large" 
                    placeholder="Select service type"
                    onChange={(value) => {
                      setSelectedServiceType(value);
                      createLinkForm.setFieldsValue({ service_id: undefined });
                    }}
                  >
                    <Option value="accommodation">
                      <Space>
                        <HomeOutlined />
                        Accommodation
                      </Space>
                    </Option>
                    <Option value="lesson">
                      <Space>
                        <BookOutlined />
                        Lessons
                      </Space>
                    </Option>
                    <Option value="rental">
                      <Space>
                        <CarOutlined />
                        Rentals
                      </Space>
                    </Option>
                    <Option value="shop">
                      <Space>
                        <ShoppingCartOutlined />
                        Shop
                      </Space>
                    </Option>
                  </Select>
                </Form.Item>

                {/* Show specific service item selector based on service type */}
                <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.service_type !== currentValues.service_type}>
                  {({ getFieldValue }) => {
                    const serviceType = getFieldValue('service_type');
                    if (!serviceType) return null;

                    let items = [];
                    let label = '';
                    
                    if (serviceType === 'accommodation') {
                      items = accommodations;
                      label = 'Select Accommodation';
                    } else if (serviceType === 'lesson') {
                      items = lessons;
                      label = 'Select Lesson';
                    } else if (serviceType === 'rental') {
                      items = rentals;
                      label = 'Select Rental';
                    } else if (serviceType === 'shop') {
                      items = shopProducts;
                      label = 'Select Product';
                    }

                    return (
                      <Form.Item
                        name="service_id"
                        label={label}
                        rules={[{ required: true, message: `Please select a ${serviceType}` }]}
                      >
                        <Select 
                          size="large" 
                          placeholder={`Choose specific ${serviceType}...`}
                          showSearch
                          filterOption={(input, option) =>
                            option.children.toLowerCase().includes(input.toLowerCase())
                          }
                        >
                          {items.map(item => (
                            <Option key={item.id} value={item.id}>
                              {item.name || item.title}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    );
                  }}
                </Form.Item>
              </>
            )}

            <Form.Item
              name="description"
              label="Description (optional)"
            >
              <Input.TextArea 
                size="large" 
                rows={3}
                placeholder="Add details about what this link is for..."
              />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="expires_at"
                  label="Expires (optional)"
                >
                  <DatePicker 
                    className="w-full" 
                    size="large"
                    placeholder="Never"
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="max_uses"
                  label="Max responses (optional)"
                >
                  <InputNumber 
                    className="w-full" 
                    size="large"
                    min={1} 
                    placeholder="Unlimited" 
                  />
                </Form.Item>
              </Col>
            </Row>

            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={() => setCreateLinkModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" icon={<LinkOutlined />} size="large">
                Create Link
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* Edit Link Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <EditOutlined className="text-blue-500" />
            <span>Edit Link</span>
          </div>
        }
        open={editLinkModalVisible}
        onCancel={() => {
          setEditLinkModalVisible(false);
          setSelectedLink(null);
          setSelectedServiceType(null);
          createLinkForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <div className="py-4">
          <Form
            form={createLinkForm}
            layout="vertical"
            onFinish={handleUpdateLink}
          >
            <Form.Item
              name="name"
              label="Link Name"
              rules={[{ required: true, message: 'Enter a name' }]}
            >
              <Input size="large" placeholder="e.g., Instructor Application 2026" />
            </Form.Item>

            {/* Show service type selector (read-only if already set) */}
            {selectedLink && selectedLink.service_type && (
              <>
                <Form.Item
                  name="service_type"
                  label="Service Type"
                >
                  <Select size="large" disabled>
                    <Option value="accommodation">
                      <Space>
                        <HomeOutlined />
                        Accommodation
                      </Space>
                    </Option>
                    <Option value="lesson">
                      <Space>
                        <BookOutlined />
                        Lessons
                      </Space>
                    </Option>
                    <Option value="rental">
                      <Space>
                        <CarOutlined />
                        Rentals
                      </Space>
                    </Option>
                    <Option value="shop">
                      <Space>
                        <ShoppingCartOutlined />
                        Shop
                      </Space>
                    </Option>
                  </Select>
                </Form.Item>

                {/* Show specific service item selector */}
                <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.service_type !== currentValues.service_type}>
                  {({ getFieldValue }) => {
                    const serviceType = getFieldValue('service_type');
                    if (!serviceType) return null;

                    let items = [];
                    let label = '';
                    
                    if (serviceType === 'accommodation') {
                      items = accommodations;
                      label = 'Select Accommodation';
                    } else if (serviceType === 'lesson') {
                      items = lessons;
                      label = 'Select Lesson';
                    } else if (serviceType === 'rental') {
                      items = rentals;
                      label = 'Select Rental';
                    } else if (serviceType === 'shop') {
                      items = shopProducts;
                      label = 'Select Product';
                    }

                    return (
                      <Form.Item
                        name="service_id"
                        label={label}
                        rules={[{ required: true, message: `Please select a ${serviceType}` }]}
                      >
                        <Select 
                          size="large" 
                          placeholder={`Choose specific ${serviceType}...`}
                          showSearch
                          filterOption={(input, option) =>
                            option.children.toLowerCase().includes(input.toLowerCase())
                          }
                        >
                          {items.map(item => (
                            <Option key={item.id} value={item.id}>
                              {item.name || item.title}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    );
                  }}
                </Form.Item>
              </>
            )}

            <Form.Item
              name="description"
              label="Description (optional)"
            >
              <Input.TextArea 
                size="large" 
                rows={3}
                placeholder="Add details about what this link is for..."
              />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="expires_at"
                  label="Expires (optional)"
                >
                  <DatePicker 
                    className="w-full" 
                    size="large"
                    placeholder="Never"
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="max_uses"
                  label="Max responses (optional)"
                >
                  <InputNumber 
                    className="w-full" 
                    size="large"
                    min={1} 
                    placeholder="Unlimited" 
                  />
                </Form.Item>
              </Col>
            </Row>

            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={() => {
                setEditLinkModalVisible(false);
                setSelectedLink(null);
                setSelectedServiceType(null);
                createLinkForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" icon={<EditOutlined />} size="large">
                Update Link
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* Share Link Success Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircleOutlined />
            <span>Link Created!</span>
          </div>
        }
        open={shareLinkModalVisible}
        onCancel={() => setShareLinkModalVisible(false)}
        footer={
          <Button type="primary" onClick={() => setShareLinkModalVisible(false)}>
            Done
          </Button>
        }
        width={550}
      >
        {createdLink && (
          <div className="py-4 space-y-4">
            <Paragraph>
              Your shareable link is ready! Copy it and send to anyone.
            </Paragraph>

            <div className="bg-gray-50 rounded-xl p-4 border">
              <Text type="secondary" className="text-xs uppercase tracking-wide">Your Link</Text>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  value={getPublicUrl(createdLink.link_code)}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={() => copyLink(createdLink.link_code)}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <Text className="text-blue-800">
                <strong>Next step:</strong> Send this link via email, WhatsApp, or post it on social media.
                Anyone with the link can fill out your form.
              </Text>
            </div>
          </div>
        )}
      </Modal>

      {/* Submission Detail Drawer */}
      <Drawer
        title={
          <div className="flex items-center gap-2">
            <FileTextOutlined />
            <span>Form Submission</span>
          </div>
        }
        placement="right"
        width={650}
        open={submissionDetailVisible}
        onClose={() => {
          setSubmissionDetailVisible(false);
          setSelectedSubmission(null);
          setInstructorNotes('');
        }}
        extra={
          selectedSubmission && (
            <Tag color={selectedSubmission.status === 'approved' ? 'green' : selectedSubmission.status === 'rejected' ? 'red' : 'orange'}>
              {selectedSubmission.status === 'pending' ? 'Pending' : selectedSubmission.status || 'Pending'}
            </Tag>
          )
        }
      >
        {selectedSubmission && (
          <div className="space-y-4">
            {/* Summary Card */}
            <Card size="small" className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-start justify-between">
                <div>
                  <Text strong className="text-lg block">{getSubmitterName(selectedSubmission)}</Text>
                  {getSubmitterEmail(selectedSubmission) && (
                    <Text type="secondary">{getSubmitterEmail(selectedSubmission)}</Text>
                  )}
                </div>
                <div className="text-right">
                  <Text type="secondary" className="text-xs block">
                    {selectedSubmission.submitted_at 
                      ? dayjs(selectedSubmission.submitted_at).format('MMM D, YYYY')
                      : dayjs(selectedSubmission.created_at).format('MMM D, YYYY')}
                  </Text>
                  <Text type="secondary" className="text-xs block">
                    {selectedSubmission.submitted_at 
                      ? dayjs(selectedSubmission.submitted_at).format('h:mm A')
                      : dayjs(selectedSubmission.created_at).format('h:mm A')}
                  </Text>
                </div>
              </div>
              <div className="mt-2">
                <Tag color="blue" icon={<FormOutlined />} className="mt-1">
                  {selectedSubmission.form_name || 'Unknown Form'}
                </Tag>
              </div>
            </Card>

            {/* Profile & CV Section */}
            {(() => {
              const data = selectedSubmission.submission_data || {};
              const profilePic = findProfilePicture(data);
              const cvFile = findCVFile(data);
              
              return (
                <>
                  {profilePic && (
                    <Card size="small" className="bg-blue-50">
                      <div className="flex items-center gap-3">
                        <Image
                          src={getAbsoluteFileUrl(profilePic)}
                          alt="Profile"
                          width={60}
                          height={60}
                          className="rounded-lg object-cover"
                          style={{ objectFit: 'cover' }}
                        />
                        <Text strong>Profile Picture</Text>
                      </div>
                    </Card>
                  )}
                  {cvFile && (
                    <Card size="small" className="bg-green-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getFileIcon(cvFile)}
                          <div>
                            <Text strong className="block">CV / Resume</Text>
                            <Text type="secondary" className="text-xs">
                              {cvFile.name || 'Resume.pdf'} {cvFile.size && `(${(cvFile.size / 1024).toFixed(1)} KB)`}
                            </Text>
                          </div>
                        </div>
                        <Space>
                          <Button
                            type="link"
                            size="small"
                            icon={<EyeOutlined />}
                            href={getAbsoluteFileUrl(cvFile.url)}
                            target="_blank"
                          />
                          <Button
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            href={getAbsoluteFileUrl(cvFile.url)}
                            download={cvFile.name || 'download'}
                          />
                        </Space>
                      </div>
                    </Card>
                  )}
                </>
              );
            })()}

            {/* Collapsible Sections */}
            <Collapse 
              defaultActiveKey={['responses', 'notes']} 
              ghost
              items={[
                {
                  key: 'responses',
                  label: <Text strong>Form Responses ({Object.keys(selectedSubmission.submission_data || {}).length} fields)</Text>,
                  children: (() => {
                    const data = selectedSubmission.submission_data || {};
                    const fields = selectedSubmission.form_fields || [];
                    
                    // If we have form fields structure, organize by steps
                    if (fields.length > 0) {
                      const stepGroups = {};
                      fields.forEach(field => {
                        const stepTitle = field.step_title || 'General Information';
                        if (!stepGroups[stepTitle]) {
                          stepGroups[stepTitle] = [];
                        }
                        stepGroups[stepTitle].push(field);
                      });
                      
                      return (
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                          {Object.entries(stepGroups).map(([stepTitle, stepFields]) => (
                            <div key={stepTitle}>
                              <Text strong className="block mb-2 text-blue-600">{stepTitle}</Text>
                              <div className="space-y-2">
                                {(() => {
                                  const rendered = new Set();
                                  
                                  return stepFields.map((field, index) => {
                                    // Skip if already rendered
                                    if (rendered.has(field.field_name)) return null;
                                    
                                    const value = data[field.field_name];
                                    
                                    // Skip profile pic and CV shown above
                                    if (['profile_picture', 'profile_pic', 'photo', 'picture', 'avatar', 'cv', 'resume', 'curriculum_vitae'].includes(field.field_name)) {
                                      return null;
                                    }
                                    
                                    // Check if this is a section header
                                    if (field.field_type === 'SECTION_HEADER' || field.field_type === 'section_header') {
                                      // Find the next data field with empty label (skip other headers)
                                      let dataField = null;
                                      for (let i = index + 1; i < stepFields.length; i++) {
                                        const candidate = stepFields[i];
                                        const hasLabel = candidate.field_label && candidate.field_label.trim().length > 0;
                                        const isLayoutField = ['SECTION_HEADER', 'section_header', 'PARAGRAPH', 'paragraph'].includes(candidate.field_type);
                                        
                                        if (!isLayoutField && !hasLabel && !rendered.has(candidate.field_name)) {
                                          dataField = candidate;
                                          break;
                                        }
                                      }
                                      
                                      // If we found a matching data field, render them together
                                      if (dataField) {
                                        rendered.add(dataField.field_name);
                                        const dataValue = data[dataField.field_name];
                                        const hasValue = dataValue && dataValue !== '' && (!Array.isArray(dataValue) || dataValue.length > 0);
                                        
                                        return (
                                          <div key={field.field_name} className="mt-4 pt-3 border-t border-gray-300">
                                            <Text strong className="text-base text-gray-800 block mb-2">🎯 {field.field_label}</Text>
                                            <div className="bg-white rounded border p-3 hover:bg-gray-50 transition-colors">
                                              <Text className="block whitespace-pre-wrap">
                                                {hasValue ? formatSubmissionValue(dataValue) : <span className="text-gray-400 italic">Not answered</span>}
                                              </Text>
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      // Otherwise just show the header
                                      return (
                                        <div key={field.field_name} className="mt-4 mb-2 pt-3 border-t border-gray-300">
                                          <Text strong className="text-base text-gray-800">🎯 {field.field_label}</Text>
                                        </div>
                                      );
                                    }
                                    
                                    // Render PARAGRAPH as descriptive text
                                    if (field.field_type === 'PARAGRAPH' || field.field_type === 'paragraph') {
                                      return (
                                        <div key={field.field_name} className="mb-2">
                                          <Text type="secondary" className="text-sm">{field.field_label}</Text>
                                        </div>
                                      );
                                    }
                                    
                                    const hasValue = value && value !== '' && (!Array.isArray(value) || value.length > 0);
                                    const hasLabel = field.field_label && field.field_label.trim().length > 0;
                                    
                                    return (
                                      <div key={field.field_name} className="bg-white rounded border p-3 hover:bg-gray-50 transition-colors">
                                        {hasLabel && (
                                          <Text type="secondary" className="text-xs uppercase tracking-wide block mb-1">
                                            {field.field_label}
                                          </Text>
                                        )}
                                        <Text className="block whitespace-pre-wrap">
                                          {hasValue ? formatSubmissionValue(value) : <span className="text-gray-400 italic">Not answered</span>}
                                        </Text>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    
                    // Fallback to raw data display
                    return (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                        {Object.entries(data).map(([key, value]) => {
                          // Skip empty values
                          if (!value || value === '' || (Array.isArray(value) && value.length === 0)) {
                            return null;
                          }
                          
                          const formattedKey = key
                            .replace(/_/g, ' ')
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, str => str.toUpperCase())
                            .trim();
                          
                          return (
                            <div key={key} className="bg-white rounded border p-2 hover:bg-gray-50 transition-colors">
                              <Text type="secondary" className="text-xs uppercase tracking-wide block">
                                {formattedKey}
                              </Text>
                              <Text className="block whitespace-pre-wrap text-sm">
                                {formatSubmissionValue(value)}
                              </Text>
                            </div>
                          );
                        })}
                        {Object.keys(data).length === 0 && (
                          <Empty description="No form data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </div>
                    );
                  })()
                },
                {
                  key: 'notes',
                  label: (
                    <div className="flex items-center gap-2">
                      <Text strong>Instructor Notes</Text>
                      {selectedSubmission.notes && <Tag color="blue" size="small">Has Notes</Tag>}
                    </div>
                  ),
                  children: (
                    <div className="space-y-3">
                      <Input.TextArea
                        placeholder="Add your thoughts, questions, or follow-up notes here..."
                        rows={4}
                        value={instructorNotes || selectedSubmission.notes || ''}
                        onChange={(e) => setInstructorNotes(e.target.value)}
                        className="resize-none"
                      />
                      <div className="flex justify-end">
                        <Button 
                          type="primary" 
                          size="small"
                          loading={savingNotes}
                          onClick={handleSaveNotes}
                          disabled={instructorNotes === (selectedSubmission.notes || '')}
                        >
                          Save Notes
                        </Button>
                      </div>
                    </div>
                  )
                },
                ...(selectedSubmission.metadata && Object.keys(selectedSubmission.metadata).length > 0 ? [{
                  key: 'metadata',
                  label: <Text type="secondary">Technical Info</Text>,
                  children: (
                    <Descriptions column={1} size="small" bordered>
                      {selectedSubmission.metadata.user_agent && (
                        <Descriptions.Item label="Browser">
                          <Text className="text-xs">{selectedSubmission.metadata.user_agent.substring(0, 80)}...</Text>
                        </Descriptions.Item>
                      )}
                      {selectedSubmission.metadata.ip_address && (
                        <Descriptions.Item label="IP Address">
                          {selectedSubmission.metadata.ip_address}
                        </Descriptions.Item>
                      )}
                      {selectedSubmission.metadata.referrer && (
                        <Descriptions.Item label="Referrer">
                          <Text className="text-xs">{selectedSubmission.metadata.referrer}</Text>
                        </Descriptions.Item>
                      )}
                    </Descriptions>
                  )
                }] : [])
              ]}
            />

            {/* Action Buttons */}
            <Divider className="!my-3" />
            <div className="flex justify-between">
              <Popconfirm
                title="Delete this submission?"
                description="This action cannot be undone."
                onConfirm={() => {
                  handleDeleteSubmission(selectedSubmission.id);
                  setSubmissionDetailVisible(false);
                }}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>Delete</Button>
              </Popconfirm>
              <Button onClick={() => setSubmissionDetailVisible(false)}>Close</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Create User Modal */}
      <Modal
        title="Create User Account"
        open={createUserModalVisible}
        onCancel={() => setCreateUserModalVisible(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={createUserForm}
          layout="vertical"
          onFinish={handleCreateUser}
        >
          <div className="grid grid-cols-2 gap-4">
             <Form.Item
                name="first_name"
                label="First Name"
                rules={[{ required: true, message: 'Required' }]}
             >
                <Input placeholder="John" />
             </Form.Item>
             <Form.Item
                name="last_name"
                label="Last Name"
                rules={[{ required: true, message: 'Required' }]}
             >
                <Input placeholder="Doe" />
             </Form.Item>
          </div>
          
          <Form.Item
            name="email"
            label="Email"
            rules={[
                { required: true, message: 'Required' },
                { type: 'email', message: 'Invalid email' }
            ]}
          >
            <Input placeholder="john@example.com" prefix={<MailOutlined />} />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Phone"
          >
            <Input placeholder="+1234567890" />
          </Form.Item>
          
          <Form.Item
            name="role"
            label="Role"
            rules={[{ required: true, message: 'Required' }]}
          >
             <Select>
                <Option value="student">Student / Customer</Option>
                <Option value="instructor">Instructor</Option>
             </Select>
          </Form.Item>
          
          <Form.Item
            name="password"
            label="Initial Password"
            rules={[{ required: true, message: 'Required' }]}
            help="Share this password with the user."
          >
             <Input.Password placeholder="secret" />
          </Form.Item>
          
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={() => setCreateUserModalVisible(false)}>
                Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={creatingUser}>
                Create Account
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default QuickLinksPage;
