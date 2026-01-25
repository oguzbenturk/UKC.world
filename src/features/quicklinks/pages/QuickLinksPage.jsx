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
  Divider
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
  InboxOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as quickLinksService from '../services/quickLinksService';
import * as formService from '../../forms/services/formService';

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;

const SERVICE_TYPES = [
  { value: 'accommodation', label: 'Accommodation', icon: <HomeOutlined />, color: 'blue' },
  { value: 'lesson', label: 'Lessons', icon: <BookOutlined />, color: 'green' },
  { value: 'rental', label: 'Rentals', icon: <CarOutlined />, color: 'orange' },
  { value: 'shop', label: 'Shop', icon: <ShoppingCartOutlined />, color: 'purple' }
];

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
  
  // Modals
  const [createFormModalVisible, setCreateFormModalVisible] = useState(false);
  const [createLinkModalVisible, setCreateLinkModalVisible] = useState(false);
  const [shareLinkModalVisible, setShareLinkModalVisible] = useState(false);
  const [selectedFormForLink, setSelectedFormForLink] = useState(null);
  const [createdLink, setCreatedLink] = useState(null);
  const [submissionDetailVisible, setSubmissionDetailVisible] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  
  const [createFormForm] = Form.useForm();
  const [createLinkForm] = Form.useForm();

  // Helper to extract submitter name from submission data
  const getSubmitterName = (record) => {
    const data = record.submission_data || {};
    // Try common field names for name
    const firstName = data.first_name || data.firstName || data.firstname || '';
    const lastName = data.last_name || data.lastName || data.lastname || data.surname || '';
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    // Try full name field
    if (data.name || data.full_name || data.fullName) {
      return data.name || data.full_name || data.fullName;
    }
    // Fall back to email
    if (data.email) {
      return data.email;
    }
    // Last resort
    return record.submitted_by_name || record.user_name || 'Anonymous';
  };

  // Helper to get submitter email
  const getSubmitterEmail = (record) => {
    const data = record.submission_data || {};
    return data.email || data.email_address || record.submitted_by_email || '';
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
      setLinks(data || []);
    } catch {
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
      const data = await formService.getFormSubmissions({ limit: 100 });
      setFormSubmissions(data.submissions || []);
    } catch {
      // Silently fail
    } finally {
      setFormSubmissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFormTemplates();
    fetchLinks();
    fetchFormSubmissions();
  }, [fetchAllFormTemplates, fetchLinks, fetchFormSubmissions]);

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
      const data = {
        ...values,
        link_type: 'form',
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
        is_active: true
      };
      const newLink = await quickLinksService.createQuickLink(data);
      message.success('Shareable link created!');
      setCreateLinkModalVisible(false);
      createLinkForm.resetFields();
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
      <div className="flex items-center justify-between">
        <div>
          <Title level={4} className="!mb-1">Your Forms</Title>
          <Text type="secondary">Create custom forms for applications, waivers, surveys, and feedback</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          size="large"
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
      <div className="flex items-center justify-between">
        <div>
          <Title level={4} className="!mb-1">Active Links</Title>
          <Text type="secondary">All your shareable links - copy and send to customers</Text>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchLinks}
        >
          Refresh
        </Button>
      </div>

      {/* Links Table */}
      <Card>
        <Table
          dataSource={links}
          rowKey="id"
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
              width: 200,
              render: (_, record) => (
                <Space>
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
      <div className="flex items-center justify-between">
        <div>
          <Title level={4} className="!mb-1">Form Answers</Title>
          <Text type="secondary">Submissions from your custom forms</Text>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchFormSubmissions}
        >
          Refresh
        </Button>
      </div>

      {/* Form Answers Table */}
      <Card>
        <Table
          dataSource={formSubmissions}
          rowKey="id"
          loading={formSubmissionsLoading}
          pagination={{ pageSize: 15 }}
          locale={{
            emptyText: (
              <Empty description="No form submissions yet. Share your forms to receive answers." />
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
                  rejected: { color: 'red', text: 'Rejected' }
                };
                const c = config[status] || config.pending;
                return <Tag color={c.color}>{c.text}</Tag>;
              }
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
              width: 100,
              render: (_, record) => (
                <Button 
                  type="primary" 
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => {
                    setSelectedSubmission(record);
                    setSubmissionDetailVisible(true);
                  }}
                >
                  View
                </Button>
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
      <div className="flex items-center justify-between">
        <div>
          <Title level={4} className="!mb-1">Link Registrations</Title>
          <Text type="secondary">Service registrations from your shareable links</Text>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={() => fetchAllRegistrations(links)}
        >
          Refresh
        </Button>
      </div>

      {/* Registrations Table */}
      <Card>
        <Table
          dataSource={allRegistrations}
          rowKey="id"
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
        <Row gutter={16} className="mb-6">
          <Col xs={6}>
            <Card className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{allFormTemplates.length}</div>
              <Text type="secondary">Forms</Text>
            </Card>
          </Col>
          <Col xs={6}>
            <Card className="text-center">
              <div className="text-2xl font-bold text-green-600">{links.length}</div>
              <Text type="secondary">Links</Text>
            </Card>
          </Col>
          <Col xs={6}>
            <Card className="text-center">
              <div className="text-2xl font-bold text-blue-600">{formSubmissions.length}</div>
              <Text type="secondary">Answers</Text>
            </Card>
          </Col>
          <Col xs={6}>
            <Card className="text-center">
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
            <span>Form Submission Details</span>
          </div>
        }
        placement="right"
        width={600}
        open={submissionDetailVisible}
        onClose={() => {
          setSubmissionDetailVisible(false);
          setSelectedSubmission(null);
        }}
      >
        {selectedSubmission && (
          <div className="space-y-6">
            {/* Submission Info */}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Form">
                <Tag color="blue" icon={<FormOutlined />}>
                  {selectedSubmission.form_name || 'Unknown Form'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Submitted By">
                <div>
                  <Text strong>{getSubmitterName(selectedSubmission)}</Text>
                  {getSubmitterEmail(selectedSubmission) && (
                    <div className="text-xs text-gray-500">{getSubmitterEmail(selectedSubmission)}</div>
                  )}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Submitted At">
                {selectedSubmission.submitted_at 
                  ? dayjs(selectedSubmission.submitted_at).format('MMMM D, YYYY h:mm A')
                  : selectedSubmission.created_at
                    ? dayjs(selectedSubmission.created_at).format('MMMM D, YYYY h:mm A')
                    : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={selectedSubmission.status === 'approved' ? 'green' : selectedSubmission.status === 'rejected' ? 'red' : 'orange'}>
                  {selectedSubmission.status === 'pending' ? 'Pending Review' : selectedSubmission.status || 'Pending'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">Form Responses</Divider>

            {/* Form Data */}
            <div className="space-y-3">
              {Object.entries(selectedSubmission.submission_data || {}).map(([key, value]) => {
                // Format the key to be more readable
                const formattedKey = key
                  .replace(/_/g, ' ')
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, str => str.toUpperCase())
                  .trim();
                
                // Format the value
                let displayValue = value;
                if (Array.isArray(value)) {
                  displayValue = value.join(', ');
                } else if (typeof value === 'boolean') {
                  displayValue = value ? 'Yes' : 'No';
                } else if (typeof value === 'object' && value !== null) {
                  displayValue = JSON.stringify(value, null, 2);
                }

                return (
                  <div key={key} className="bg-gray-50 rounded-lg p-3 border">
                    <Text type="secondary" className="text-xs uppercase tracking-wide block mb-1">
                      {formattedKey}
                    </Text>
                    <Text className="block whitespace-pre-wrap">
                      {displayValue || <span className="text-gray-400 italic">Not provided</span>}
                    </Text>
                  </div>
                );
              })}
            </div>

            {/* Metadata */}
            {selectedSubmission.metadata && Object.keys(selectedSubmission.metadata).length > 0 && (
              <>
                <Divider orientation="left">Metadata</Divider>
                <Descriptions column={1} size="small">
                  {selectedSubmission.metadata.user_agent && (
                    <Descriptions.Item label="Browser">
                      <Text className="text-xs">{selectedSubmission.metadata.user_agent}</Text>
                    </Descriptions.Item>
                  )}
                  {selectedSubmission.metadata.ip_address && (
                    <Descriptions.Item label="IP Address">
                      {selectedSubmission.metadata.ip_address}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default QuickLinksPage;
