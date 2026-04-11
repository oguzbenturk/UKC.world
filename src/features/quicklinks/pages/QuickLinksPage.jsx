/**
 * Quick Links & Forms Page
 * Orchestrates tabs for forms, links, submissions, and registrations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Tag, Tabs } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { FormOutlined, LinkOutlined, InboxOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import * as quickLinksService from '../services/quickLinksService';
import * as formService from '../../forms/services/formService';
import usersService from '@/shared/services/usersService';
import rolesService from '@/shared/services/rolesService';
import { findFieldValue, getPublicUrl } from '../utils/formHelpers';

import FormsTab from '../components/FormsTab';
import LinksTab from '../components/LinksTab';
import FormAnswersTab from '../components/FormAnswersTab';
import RegistrationsTab from '../components/RegistrationsTab';
import CreateFormDrawer from '../components/CreateFormModal';
import CreateLinkDrawer from '../components/CreateLinkModal';
import EditLinkDrawer from '../components/EditLinkModal';
import ShareLinkModal from '../components/ShareLinkModal';
import SubmissionDetailDrawer from '../components/SubmissionDetailDrawer';
import CreateUserModal from '../components/CreateUserModal';

const QuickLinksPage = ({ embedded = false }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('forms');
  const [submissionFilters, setSubmissionFilters] = useState({ status: 'all', formId: null, search: '' });

  const [createUserModalVisible, setCreateUserModalVisible] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserForm] = Form.useForm();

  const [selectedServiceType, setSelectedServiceType] = useState(null);

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

  // ===== Data Fetching =====

  const { data: roles = [] } = useQuery({
    queryKey: ['quicklinks', 'roles'],
    queryFn: async () => {
      const data = await rolesService.list();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 600_000,
  });

  const { data: allFormTemplates = [], isLoading: formTemplatesLoading, refetch: refetchForms } = useQuery({
    queryKey: ['quicklinks', 'forms'],
    queryFn: async () => {
      const data = await formService.getFormTemplates({ limit: 100 });
      return data.data || [];
    },
    staleTime: 300_000,
  });

  const { data: links = [], isLoading: loading, refetch: refetchLinks } = useQuery({
    queryKey: ['quicklinks', 'links'],
    queryFn: async () => {
      const data = await quickLinksService.getQuickLinks();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const linkIds = useMemo(() => links.map(l => l.id).sort().join(','), [links]);

  const { data: allRegistrations = [], isLoading: registrationsLoading, refetch: refetchRegistrations } = useQuery({
    queryKey: ['quicklinks', 'registrations', linkIds],
    queryFn: async () => {
      const allRegs = [];
      for (const link of links) {
        if (link.link_type !== 'form') {
          try {
            const regs = await quickLinksService.getRegistrations(link.id);
            if (regs?.length > 0) {
              allRegs.push(...regs.map(r => ({ ...r, link_name: link.name, link_code: link.link_code, service_type: link.service_type })));
            }
          } catch {
            // Skip failed fetches
          }
        }
      }
      return allRegs;
    },
    enabled: links.length > 0,
    staleTime: 60_000,
  });

  const { data: formSubmissions = [], isLoading: formSubmissionsLoading, refetch: refetchSubmissions } = useQuery({
    queryKey: ['quicklinks', 'submissions', submissionFilters],
    queryFn: async () => {
      const filters = { limit: 100, ...submissionFilters };
      if (filters.status === 'all') delete filters.status;
      const data = await formService.getFormSubmissions(filters);
      return data.submissions || [];
    },
    staleTime: 30_000,
  });

  const { data: servicesData } = useQuery({
    queryKey: ['quicklinks', 'services'],
    queryFn: async () => {
      const [accomRes, lessonRes, rentalRes, shopRes] = await Promise.allSettled([
        apiClient.get('/accommodation/units').then(r => r.data),
        apiClient.get('/services', { params: { category: 'lesson' } }).then(r => r.data),
        apiClient.get('/services', { params: { serviceType: 'rental' } }).then(r => r.data),
        apiClient.get('/shop/products').then(r => r.data),
      ]);
      const accomData = accomRes.status === 'fulfilled' ? accomRes.value : null;
      const lessonData = lessonRes.status === 'fulfilled' ? lessonRes.value : null;
      const rentalData = rentalRes.status === 'fulfilled' ? rentalRes.value : null;
      const shopData = shopRes.status === 'fulfilled' ? shopRes.value : null;
      return {
        accommodations: accomData ? (accomData.accommodations || accomData) : [],
        lessons: Array.isArray(lessonData) ? lessonData : [],
        rentals: Array.isArray(rentalData) ? rentalData : [],
        shopProducts: shopData ? (shopData.products || shopData) : [],
      };
    },
    staleTime: 600_000,
  });

  const accommodations = servicesData?.accommodations || [];
  const lessons = servicesData?.lessons || [];
  const rentals = servicesData?.rentals || [];
  const shopProducts = servicesData?.shopProducts || [];

  const fetchAllFormTemplates = refetchForms;
  const fetchLinks = refetchLinks;
  const fetchFormSubmissions = refetchSubmissions;

  // ===== Handlers =====

  const copyLink = (linkCode) => {
    navigator.clipboard.writeText(getPublicUrl(linkCode));
    message.success('Link copied to clipboard!');
  };

  const getFormLink = (formId) => {
    return links.find(l => l.form_template_id === formId && l.link_type === 'form');
  };

  const handleSaveNotes = async () => {
    if (!selectedSubmission) return;
    setSavingNotes(true);
    try {
      const updated = await formService.updateFormSubmission(selectedSubmission.id, { notes: instructorNotes });
      setSelectedSubmission(prev => ({ ...prev, notes: updated.notes }));
      fetchFormSubmissions();
      message.success('Notes saved');
    } catch {
      message.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDeleteSubmission = async (submissionId) => {
    try {
      await formService.deleteFormSubmission(submissionId);
      message.success('Submission deleted successfully');
      fetchFormSubmissions();
    } catch {
      message.error('Failed to delete submission');
    }
  };

  const handleViewSubmission = (submissionData) => {
    setSelectedSubmission(submissionData);
    setInstructorNotes(submissionData.notes || '');
    setSubmissionDetailVisible(true);
  };

  const handleOpenCreateUserModal = (submission) => {
    setSelectedSubmission(submission);
    const data = submission.submission_data || {};
    const formName = (submission.form_name || '').toLowerCase();
    let role = formName.includes('instructor') ? 'instructor' : 'student';

    let firstName = findFieldValue(data, ['first_name', 'firstName', 'firstname', 'fname', 'given_name']);
    let lastName = findFieldValue(data, ['last_name', 'lastName', 'lastname', 'lname', 'surname', 'family_name']);

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
      password: Math.random().toString(36).slice(-8),
      role
    });
    setCreateUserModalVisible(true);
  };

  const handleCreateUser = async () => {
    try {
      const values = await createUserForm.validateFields();
      setCreatingUser(true);
      const roleObj = roles.find(r => r.name === values.role);
      if (!roleObj) throw new Error(`Role '${values.role}' not found in the system.`);

      const payload = {
        ...values,
        role_id: roleObj.id,
        source: 'form_submission',
        submission_id: selectedSubmission?.id
      };
      delete payload.role;
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

  const handleCreateLinkForForm = (formTemplate) => {
    setSelectedFormForLink(formTemplate);
    createLinkForm.setFieldsValue({ name: formTemplate.name, form_template_id: formTemplate.id });
    setCreateLinkModalVisible(true);
  };

  const handleCreateLink = async (values) => {
    try {
      let linkType;
      if (values.form_template_id) {
        linkType = 'form';
      } else {
        linkType = values.link_type || (values.service_type ? 'service' : 'registration');
      }
      const data = {
        name: values.name,
        description: values.description,
        link_type: linkType,
        service_type: values.service_type,
        service_id: values.service_id,
        form_template_id: values.form_template_id,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
        max_uses: values.max_uses,
        require_payment: values.require_payment || false,
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

  const handleCreateForm = async (values) => {
    try {
      const template = await formService.createFormTemplate({ ...values, is_active: true });
      message.success('Form created! Opening builder...');
      setCreateFormModalVisible(false);
      createFormForm.resetFields();
      navigate(`/forms/builder/${template.id}`);
    } catch {
      message.error('Failed to create form');
    }
  };

  const handleDeleteForm = async (id, name) => {
    try {
      await formService.deleteFormTemplate(id);
      message.success(`"${name}" deleted`);
      fetchAllFormTemplates();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleDeleteLink = async (id) => {
    try {
      await quickLinksService.deleteQuickLink(id);
      message.success('Link deleted');
      fetchLinks();
    } catch {
      message.error('Failed to delete link');
    }
  };

  const handleEditLink = (link) => {
    setSelectedLink(link);
    setSelectedServiceType(link.service_type || null);
    createLinkForm.setFieldsValue({
      name: link.name,
      description: link.description,
      service_type: link.service_type,
      service_id: link.service_id,
      expires_at: link.expires_at ? dayjs(link.expires_at) : null,
      max_uses: link.max_uses,
      require_payment: link.require_payment || false,
    });
    setEditLinkModalVisible(true);
  };

  const handleUpdateLink = async (values) => {
    try {
      const data = {
        name: values.name,
        description: values.description,
        service_type: values.service_type,
        service_id: values.service_id,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
        max_uses: values.max_uses,
        require_payment: values.require_payment || false,
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

  const handleUpdateRegistration = async (id, status) => {
    try {
      await quickLinksService.updateRegistration(id, { status });
      message.success('Status updated');
      fetchLinks();
    } catch {
      message.error('Failed to update');
    }
  };

  const handleCloseEditLink = () => {
    setEditLinkModalVisible(false);
    setSelectedLink(null);
    setSelectedServiceType(null);
    createLinkForm.resetFields();
  };

  // ===== Render =====

  return (
    <div className={embedded ? "" : "p-4 md:p-6"}>
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
                  {allFormTemplates.length > 0 && <Tag color="blue">{allFormTemplates.length}</Tag>}
                </span>
              ),
              children: (
                <FormsTab
                  allFormTemplates={allFormTemplates}
                  formTemplatesLoading={formTemplatesLoading}
                  getFormLink={getFormLink}
                  copyLink={copyLink}
                  onCreateLinkForForm={handleCreateLinkForForm}
                  onDeleteForm={handleDeleteForm}
                  onCreateForm={() => setCreateFormModalVisible(true)}
                  fetchAllFormTemplates={fetchAllFormTemplates}
                />
              )
            },
            {
              key: 'links',
              label: (
                <span className="flex items-center gap-2">
                  <LinkOutlined />
                  Shareable Links
                  {links.length > 0 && <Tag color="green">{links.length}</Tag>}
                </span>
              ),
              children: (
                <LinksTab
                  links={links}
                  loading={loading}
                  fetchLinks={fetchLinks}
                  onEditLink={handleEditLink}
                  onDeleteLink={handleDeleteLink}
                  copyLink={copyLink}
                  onCreateLink={() => setCreateLinkModalVisible(true)}
                />
              )
            },
            {
              key: 'answers',
              label: (
                <span className="flex items-center gap-2">
                  <InboxOutlined />
                  Form Answers
                  {formSubmissions.length > 0 && <Tag color="blue">{formSubmissions.length}</Tag>}
                </span>
              ),
              children: (
                <FormAnswersTab
                  formSubmissions={formSubmissions}
                  formSubmissionsLoading={formSubmissionsLoading}
                  submissionFilters={submissionFilters}
                  setSubmissionFilters={setSubmissionFilters}
                  allFormTemplates={allFormTemplates}
                  formTemplatesLoading={formTemplatesLoading}
                  fetchFormSubmissions={fetchFormSubmissions}
                  onDeleteSubmission={handleDeleteSubmission}
                  onViewSubmission={handleViewSubmission}
                  onCreateUserFromSubmission={handleOpenCreateUserModal}
                />
              )
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
              children: (
                <RegistrationsTab
                  allRegistrations={allRegistrations}
                  registrationsLoading={registrationsLoading}
                  onRefresh={refetchRegistrations}
                  onUpdateRegistration={handleUpdateRegistration}
                />
              )
            }
          ]}
        />
      </Card>

      {/* Drawers */}
      <CreateFormDrawer
        open={createFormModalVisible}
        onCancel={() => setCreateFormModalVisible(false)}
        form={createFormForm}
        onFinish={handleCreateForm}
      />

      <CreateLinkDrawer
        open={createLinkModalVisible}
        onCancel={() => setCreateLinkModalVisible(false)}
        form={createLinkForm}
        onFinish={handleCreateLink}
        selectedFormForLink={selectedFormForLink}
        setSelectedServiceType={setSelectedServiceType}
        accommodations={accommodations}
        lessons={lessons}
        rentals={rentals}
        shopProducts={shopProducts}
      />

      <EditLinkDrawer
        open={editLinkModalVisible}
        onCancel={handleCloseEditLink}
        form={createLinkForm}
        onFinish={handleUpdateLink}
        selectedLink={selectedLink}
        accommodations={accommodations}
        lessons={lessons}
        rentals={rentals}
        shopProducts={shopProducts}
      />

      <ShareLinkModal
        open={shareLinkModalVisible}
        onCancel={() => setShareLinkModalVisible(false)}
        createdLink={createdLink}
        copyLink={copyLink}
      />

      <SubmissionDetailDrawer
        open={submissionDetailVisible}
        onClose={() => {
          setSubmissionDetailVisible(false);
          setSelectedSubmission(null);
          setInstructorNotes('');
        }}
        submission={selectedSubmission}
        instructorNotes={instructorNotes}
        setInstructorNotes={setInstructorNotes}
        savingNotes={savingNotes}
        onSaveNotes={handleSaveNotes}
        onDeleteSubmission={handleDeleteSubmission}
      />

      <CreateUserModal
        open={createUserModalVisible}
        onCancel={() => setCreateUserModalVisible(false)}
        form={createUserForm}
        onFinish={handleCreateUser}
        loading={creatingUser}
      />
    </div>
  );
};

export default QuickLinksPage;
