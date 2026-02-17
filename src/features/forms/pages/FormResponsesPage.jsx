/**
 * Form Responses Page
 * Displays and manages form submissions
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  Dropdown,
  Modal,
  Descriptions,
  Typography,
  Tooltip,
  Empty,
  Drawer,
  Row,
  Col,
  Divider,
  Avatar,
  Image
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftOutlined,
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  MoreOutlined,
  ReloadOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileWordOutlined,
  UserOutlined,
  MailOutlined,
  PrinterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as formService from '../services/formService';
import { logger } from '@/shared/utils/logger';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_CONFIG = {
  draft: { color: 'default', icon: <ClockCircleOutlined />, label: 'Draft' },
  submitted: { color: 'blue', icon: <CheckCircleOutlined />, label: 'Submitted' },
  pending: { color: 'gold', icon: <ClockCircleOutlined />, label: 'Pending' },
  processed: { color: 'green', icon: <CheckCircleOutlined />, label: 'Processed' },
  archived: { color: 'default', icon: <InboxOutlined />, label: 'Archived' }
};

// eslint-disable-next-line complexity
const FormResponsesPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({
    status: 'submitted', // Default to showing only submitted forms
    search: '',
    dateRange: null
  });
  const [selectedRows, setSelectedRows] = useState([]);
  const [detailDrawer, setDetailDrawer] = useState({ visible: false, submission: null });
  const [exporting, setExporting] = useState(false);

  const fetchForm = useCallback(async () => {
    try {
      const data = await formService.getFormById(id);
      setForm(data);
    } catch (err) {
      logger.error('Error fetching form:', err);
      message.error('Failed to load form');
    }
  }, [id]);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        form_template_id: id,
        page: pagination.current,
        limit: pagination.pageSize,
        status: filters.status,
        search: filters.search || undefined,
        start_date: filters.dateRange?.[0]?.toISOString(),
        end_date: filters.dateRange?.[1]?.toISOString()
      };

      const data = await formService.getSubmissions(params);
      setSubmissions(data.submissions || []);
      setPagination(prev => ({
        ...prev,
        total: data.total || 0
      }));
    } catch (err) {
      logger.error('Error fetching submissions:', err);
      message.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filters]);

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleTableChange = (pag) => {
    setPagination(prev => ({
      ...prev,
      current: pag.current,
      pageSize: pag.pageSize
    }));
  };

  const handleStatusChange = async (submissionId, newStatus) => {
    try {
      await formService.updateSubmissionStatus(submissionId, newStatus);
      message.success(`Submission marked as ${newStatus}`);
      fetchSubmissions();
    } catch (err) {
      logger.error('Error updating status:', err);
      message.error('Failed to update status');
    }
  };

  const handleBulkProcess = async () => {
    try {
      await formService.bulkProcessSubmissions(selectedRows);
      message.success(`${selectedRows.length} submissions processed`);
      setSelectedRows([]);
      fetchSubmissions();
    } catch (err) {
      logger.error('Error bulk processing:', err);
      message.error('Failed to process submissions');
    }
  };

  const handleDelete = async (submissionId) => {
    try {
      await formService.deleteSubmission(submissionId);
      message.success('Submission deleted');
      fetchSubmissions();
    } catch (err) {
      logger.error('Error deleting submission:', err);
      message.error('Failed to delete submission');
    }
  };

  // Export individual submission as PDF
  const handleExportPDF = async (submission) => {
    try {
      message.loading('Generating PDF...', 0);
      
      // Get full submission details with form fields
      const fullSubmission = await formService.getFormSubmission(submission.id);
      
      // Generate and download PDF
      await generateSubmissionPDF(fullSubmission, form);
      
      message.destroy();
      message.success('PDF generated successfully');
    } catch (err) {
      message.destroy();
      logger.error('Error generating PDF:', err);
      message.error('Failed to generate PDF');
    }
  };

  // Generate PDF for submission
  const generateSubmissionPDF = async (submission, formTemplate) => {
    // Create a printable HTML content
    const data = submission.submission_data || {};
    const fields = submission.form_fields || [];
    
    // Categorize files
    const profilePic = findProfilePicture(data);
    const cvFile = findCVFile(data);
    const otherFiles = findOtherFiles(data, profilePic, cvFile);
    
    // Get submitter info
    const submitterName = data.full_name || data.name || data.first_name || 'Anonymous';
    const submitterEmail = data.email || data.email_address || '';
    const submitterPhone = data.phone || data.phone_number || data.mobile || '';
    
    // Build HTML for PDF
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Form Submission #${submission.id}</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 40px;
            color: #333;
            line-height: 1.6;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid #1890ff;
          }
          .header h1 {
            color: #1890ff;
            margin: 0 0 10px 0;
            font-size: 28px;
          }
          .header .submission-id {
            color: #666;
            font-size: 14px;
          }
          .profile-section {
            display: flex;
            gap: 30px;
            margin-bottom: 40px;
            align-items: flex-start;
          }
          .profile-pic {
            flex-shrink: 0;
          }
          .profile-pic img {
            width: 150px;
            height: 150px;
            object-fit: cover;
            border-radius: 8px;
            border: 3px solid #e8e8e8;
          }
          .profile-info {
            flex-grow: 1;
          }
          .profile-info h2 {
            margin: 0 0 15px 0;
            color: #1890ff;
            font-size: 24px;
          }
          .profile-info .info-item {
            margin: 8px 0;
            font-size: 14px;
          }
          .profile-info .info-item strong {
            color: #666;
            min-width: 100px;
            display: inline-block;
          }
          .cv-section {
            margin-bottom: 40px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
            border-left: 4px solid #52c41a;
          }
          .cv-section h3 {
            margin: 0 0 15px 0;
            color: #52c41a;
            font-size: 18px;
          }
          .cv-section a {
            color: #1890ff;
            text-decoration: none;
            font-weight: 500;
          }
          .section {
            margin-bottom: 30px;
          }
          .section h3 {
            color: #1890ff;
            font-size: 20px;
            margin: 0 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #e8e8e8;
          }
          .field-group {
            margin-bottom: 20px;
            padding: 15px;
            background: #fafafa;
            border-radius: 6px;
          }
          .field-label {
            font-weight: 600;
            color: #595959;
            margin-bottom: 5px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .field-value {
            color: #262626;
            font-size: 15px;
            word-wrap: break-word;
          }
          .field-value.empty {
            color: #bfbfbf;
            font-style: italic;
          }
          .file-list {
            margin-top: 10px;
          }
          .file-item {
            padding: 8px 12px;
            background: white;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            margin: 5px 0;
            font-size: 13px;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #e8e8e8;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class=\"header\">
          <h1>${formTemplate?.name || 'Form Submission'}</h1>
          <div class=\"submission-id\">Submission #${submission.id} | Submitted on ${dayjs(submission.created_at).format('MMMM D, YYYY at h:mm A')}</div>
        </div>
    `;
    
    // Profile section with picture
    html += '<div class=\"profile-section\">';
    if (profilePic) {
      html += `
        <div class=\"profile-pic\">
          <img src=\"${profilePic}\" alt=\"Profile Picture\" />
        </div>
      `;
    }
    html += `
      <div class=\"profile-info\">
        <h2>${submitterName}</h2>
        ${submitterEmail ? `<div class=\"info-item\"><strong>Email:</strong> ${submitterEmail}</div>` : ''}
        ${submitterPhone ? `<div class=\"info-item\"><strong>Phone:</strong> ${submitterPhone}</div>` : ''}
        <div class=\"info-item\"><strong>Status:</strong> <span style=\"color: #1890ff;\">${submission.status || 'Submitted'}</span></div>
      </div>
    </div>`;
    
    // CV section
    if (cvFile) {
      html += `
        <div class=\"cv-section\">
          <h3>📄 Curriculum Vitae / Resume</h3>
          <div><a href=\"${cvFile.url}\" target=\"_blank\">${cvFile.name || 'View CV'}</a></div>
          ${cvFile.size ? `<div style=\"color: #666; font-size: 12px; margin-top: 5px;\">File size: ${(cvFile.size / 1024).toFixed(1)} KB</div>` : ''}
        </div>
      `;
    }
    
    // Form responses organized by step
    const stepGroups = {};
    fields.forEach(field => {
      const stepTitle = field.step_title || 'General Information';
      if (!stepGroups[stepTitle]) {
        stepGroups[stepTitle] = [];
      }
      stepGroups[stepTitle].push(field);
    });
    
    Object.entries(stepGroups).forEach(([stepTitle, stepFields]) => {
      html += `<div class=\"section\"><h3>${stepTitle}</h3>`;
      
      stepFields.forEach(field => {
        const value = data[field.field_name];
        const formattedValue = formatValueForPDF(value, field.field_type);
        
        html += `
          <div class=\"field-group\">
            <div class=\"field-label\">${field.field_label}</div>
            <div class=\"field-value ${!value ? 'empty' : ''}\">${formattedValue}</div>
          </div>
        `;
      });
      
      html += '</div>';
    });
    
    // Other files section
    if (otherFiles.length > 0) {
      html += '<div class=\"section\"><h3>📎 Additional Files</h3><div class=\"file-list\">';
      otherFiles.forEach(file => {
        html += `<div class=\"file-item\">📁 ${file.name || 'File'} ${file.size ? `(${(file.size / 1024).toFixed(1)} KB)` : ''}</div>`;
      });
      html += '</div></div>';
    }
    
    html += `
        <div class=\"footer\">
          Generated on ${dayjs().format('MMMM D, YYYY at h:mm A')} | ${formTemplate?.name || 'Form Submission'}
        </div>
      </body>
      </html>
    `;
    
    // Open in new window and trigger print
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Wait for images to load, then print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1000);
  };

  // Helper to find profile picture
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

  // Helper to find CV file
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

  // Helper to find other files
  const findOtherFiles = (data, excludeProfilePic, excludeCV) => {
    const files = [];
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value) && value[0]?.url) {
        value.forEach(file => {
          if (excludeProfilePic !== file.url && excludeCV?.url !== file.url) {
            files.push(file);
          }
        });
      } else if (value?.url && value.url !== excludeProfilePic && value.url !== excludeCV?.url) {
        files.push(value);
      }
    });
    return files;
  };

  // Helper to format values for PDF
  const formatValueForPDF = (value, fieldType) => {
    if (value === null || value === undefined || value === '') return '<em>Not provided</em>';
    
    if (Array.isArray(value)) {
      // Skip file arrays as they're handled separately
      if (value[0]?.url) return '<em>See attachments section</em>';
      return value.join(', ');
    }
    
    if (typeof value === 'object') {
      if (value.url) return '<em>See attachments section</em>';
      return Object.entries(value)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || '<em>Not provided</em>';
    }
    
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    
    return String(value);
  };

  const handleExport = async (format) => {
    try {
      setExporting(true);
      const blob = await formService.exportSubmissions(id, format, {
        status: filters.status,
        start_date: filters.dateRange?.[0]?.toISOString(),
        end_date: filters.dateRange?.[1]?.toISOString()
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form?.form_name || 'submissions'}_${dayjs().format('YYYY-MM-DD')}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success('Export downloaded');
    } catch (err) {
      logger.error('Error exporting:', err);
      message.error('Failed to export submissions');
    } finally {
      setExporting(false);
    }
  };

  const showDetail = async (submission) => {
    try {
      // Fetch full submission data with form fields
      const fullSubmission = await formService.getFormSubmission(submission.id);
      setDetailDrawer({ visible: true, submission: fullSubmission });
    } catch (err) {
      logger.error('Error fetching submission details:', err);
      message.error('Failed to load submission details');
      // Fallback to basic submission data
      setDetailDrawer({ visible: true, submission });
    }
  };

  // Get appropriate icon for file type
  const getFileIcon = (file) => {
    const type = file.type || '';
    const name = file.name || '';
    if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
      return <FileImageOutlined style={{ color: '#52c41a' }} />;
    }
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
    }
    if (type.includes('word') || /\.(doc|docx)$/i.test(name)) {
      return <FileWordOutlined style={{ color: '#1890ff' }} />;
    }
    return <FileOutlined />;
  };

  // Check if value is a file upload (array of objects with url property)
  const isFileUpload = (value) => {
    return Array.isArray(value) && value.length > 0 && value[0]?.url;
  };

  // Render file upload value with clickable links
  const renderFileValue = (files) => {
    if (!Array.isArray(files)) return '-';
    
    return (
      <Space direction="vertical" size="small" className="w-full">
        {files.map((file, index) => {
          const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
          
          return (
            <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              {isImage ? (
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                  <img 
                    src={file.url} 
                    alt={file.name || 'Uploaded image'}
                    className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80"
                  />
                </a>
              ) : (
                getFileIcon(file)
              )}
              <div className="flex-1 min-w-0">
                <Text ellipsis className="block">{file.name || 'File'}</Text>
                {file.size && (
                  <Text type="secondary" className="text-xs">
                    {(file.size / 1024).toFixed(1)} KB
                  </Text>
                )}
              </div>
              <Space>
                <Tooltip title="View">
                  <Button 
                    type="link" 
                    size="small" 
                    icon={<EyeOutlined />}
                    href={file.url}
                    target="_blank"
                  />
                </Tooltip>
                <Tooltip title="Download">
                  <Button 
                    type="link" 
                    size="small" 
                    icon={<DownloadOutlined />}
                    href={file.url}
                    download={file.name || 'download'}
                  />
                </Tooltip>
              </Space>
            </div>
          );
        })}
      </Space>
    );
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    // Check if this is a file upload array
    if (isFileUpload(value)) {
      return renderFileValue(value);
    }
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
      // Check if it's a single file object
      if (value.url) {
        return renderFileValue([value]);
      }
      return Object.entries(value)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: 'Submitter',
      key: 'submitter',
      width: 200,
      render: (_, record) => {
        const data = record.submission_data || {};
        const name = data.full_name || data.name || data.first_name || record.user_name || 'Anonymous';
        const email = data.email || data.email_address || record.user_email || '';
        
        return (
          <div className="flex items-start gap-2">
            <Avatar size="small" icon={<UserOutlined />} />
            <div className="flex-1 min-w-0">
              <Text strong className="block" ellipsis>{name}</Text>
              {email && (
                <Text type="secondary" className="text-xs block" ellipsis>
                  {email}
                </Text>
              )}
            </div>
          </div>
        );
      }
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      sorter: true,
      render: (date) => (
        <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(date).format('MMM D, YYYY HH:mm')}
        </Tooltip>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      }
    },
    {
      title: 'Preview',
      key: 'preview',
      ellipsis: true,
      render: (_, record) => {
        const data = record.submission_data || {};
        const preview = Object.entries(data)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${formatValue(v)}`)
          .join(' | ');
        return (
          <Text type="secondary" ellipsis>
            {preview || 'No data'}
          </Text>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => showDetail(record)}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'pdf',
                  label: 'Export as PDF',
                  icon: <PrinterOutlined />,
                  onClick: () => handleExportPDF(record)
                },
                { type: 'divider' },
                {
                  key: 'process',
                  label: 'Mark as Processed',
                  icon: <CheckCircleOutlined />,
                  onClick: () => handleStatusChange(record.id, 'processed'),
                  disabled: record.status === 'processed'
                },
                {
                  key: 'archive',
                  label: 'Archive',
                  icon: <InboxOutlined />,
                  onClick: () => handleStatusChange(record.id, 'archived')
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: 'Delete',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: 'Delete Submission?',
                      content: 'This action cannot be undone.',
                      okText: 'Delete',
                      okType: 'danger',
                      onOk: () => handleDelete(record.id)
                    });
                  }
                }
              ]
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      )
    }
  ];

  if (!form && !loading) {
    return (
      <Empty
        description="Form not found"
        extra={
          <Button type="primary" onClick={() => navigate('/forms')}>
            Back to Forms
          </Button>
        }
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/forms')}
          >
            Back
          </Button>
          <div>
            <Title level={4} className="mb-0">{form?.form_name || 'Loading...'}</Title>
            <Text type="secondary">
              {pagination.total} submission{pagination.total !== 1 ? 's' : ''}
            </Text>
          </div>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchSubmissions}
            loading={loading}
          >
            Refresh
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'csv', label: 'Export as CSV', onClick: () => handleExport('csv') },
                { key: 'xlsx', label: 'Export as Excel', onClick: () => handleExport('xlsx') }
              ]
            }}
          >
            <Button icon={<DownloadOutlined />} loading={exporting}>
              Export
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search submissions..."
              prefix={<SearchOutlined />}
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6}>
            <Select
              placeholder="Status"
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              allowClear
              className="w-full"
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'submitted', label: 'Submitted' },
                { value: 'pending', label: 'Pending' },
                { value: 'processed', label: 'Processed' },
                { value: 'archived', label: 'Archived' }
              ]}
            />
          </Col>
          <Col xs={12} sm={10}>
            <RangePicker
              value={filters.dateRange}
              onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates }))}
              className="w-full"
            />
          </Col>
        </Row>
      </Card>

      {/* Bulk Actions */}
      {selectedRows.length > 0 && (
        <Card className="mb-4 bg-blue-50">
          <Space>
            <Text strong>{selectedRows.length} selected</Text>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={handleBulkProcess}
            >
              Mark as Processed
            </Button>
            <Button size="small" onClick={() => setSelectedRows([])}>
              Clear Selection
            </Button>
          </Space>
        </Card>
      )}

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={submissions}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} submissions`
          }}
          onChange={handleTableChange}
          rowSelection={{
            selectedRowKeys: selectedRows,
            onChange: setSelectedRows
          }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty
                description="No submissions yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={
          <div className="flex items-center justify-between">
            <span>Submission #{detailDrawer.submission?.id}</span>
            <Button
              type="primary"
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => handleExportPDF(detailDrawer.submission)}
            >
              Export PDF
            </Button>
          </div>
        }
        placement="right"
        width={600}
        open={detailDrawer.visible}
        onClose={() => setDetailDrawer({ visible: false, submission: null })}
        extra={
          <Space>
            <Tag color={STATUS_CONFIG[detailDrawer.submission?.status]?.color}>
              {STATUS_CONFIG[detailDrawer.submission?.status]?.label}
            </Tag>
          </Space>
        }
      >
        {detailDrawer.submission && (() => {
          const data = detailDrawer.submission.submission_data || {};
          const fields = detailDrawer.submission.form_fields || [];
          const submitterName = data.full_name || data.name || data.first_name || 'Anonymous';
          const submitterEmail = data.email || data.email_address || '';
          const submitterPhone = data.phone || data.phone_number || data.mobile || '';
          
          // Categorize files
          const profilePic = findProfilePicture(data);
          const cvFile = findCVFile(data);
          
          // Group fields by step
          const stepGroups = {};
          fields.forEach(field => {
            const stepTitle = field.step_title || 'General Information';
            if (!stepGroups[stepTitle]) {
              stepGroups[stepTitle] = [];
            }
            stepGroups[stepTitle].push(field);
          });
          
          return (
            <div className="space-y-6">
              {/* Submitter Profile */}
              <Card size="small" className="bg-blue-50">
                <div className="flex items-start gap-4">
                  {profilePic ? (
                    <Image
                      src={profilePic}
                      alt="Profile"
                      width={80}
                      height={80}
                      className="rounded-lg object-cover"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <Avatar size={80} icon={<UserOutlined />} />
                  )}
                  <div className="flex-1">
                    <Title level={5} className="!mb-2">{submitterName}</Title>
                    {submitterEmail && (
                      <div className="flex items-center gap-2 mb-1">
                        <MailOutlined className="text-gray-400" />
                        <Text type="secondary">{submitterEmail}</Text>
                      </div>
                    )}
                    {submitterPhone && (
                      <div className="flex items-center gap-2">
                        <UserOutlined className="text-gray-400" />
                        <Text type="secondary">{submitterPhone}</Text>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* CV/Resume Section */}
              {cvFile && (
                <Card size="small" className="bg-green-50">
                  <Title level={5} className="!mb-2 flex items-center gap-2">
                    <FilePdfOutlined /> CV / Resume
                  </Title>
                  <div className="flex items-center gap-2 p-2 bg-white rounded border">
                    {getFileIcon(cvFile)}
                    <div className="flex-1 min-w-0">
                      <Text ellipsis className="block">{cvFile.name || 'Resume.pdf'}</Text>
                      {cvFile.size && (
                        <Text type="secondary" className="text-xs">
                          {(cvFile.size / 1024).toFixed(1)} KB
                        </Text>
                      )}
                    </div>
                    <Space>
                      <Button
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        href={cvFile.url}
                        target="_blank"
                      />
                      <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        href={cvFile.url}
                        download={cvFile.name || 'download'}
                      />
                    </Space>
                  </div>
                </Card>
              )}

              {/* Submission Info */}
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Submitted On">
                  {dayjs(detailDrawer.submission.created_at).format('MMMM D, YYYY HH:mm:ss')}
                </Descriptions.Item>
                <Descriptions.Item label="Session ID">
                  <Text code>{detailDrawer.submission.session_id}</Text>
                </Descriptions.Item>
              </Descriptions>

              <Divider orientation="left">Form Responses</Divider>

              {/* Organized by steps */}
              {Object.entries(stepGroups).map(([stepTitle, stepFields]) => (
                <div key={stepTitle}>
                  <Title level={5} className="!mb-3">{stepTitle}</Title>
                  <Descriptions column={1} size="small" bordered className="mb-6">
                    {stepFields.map(field => {
                      const value = data[field.field_name];
                      // Skip file fields shown in special sections
                      if (field.field_type === 'FILE' || field.field_type === 'IMAGE') {
                        if (['profile_picture', 'profile_pic', 'photo', 'picture', 'avatar', 'cv', 'resume', 'curriculum_vitae'].includes(field.field_name)) {
                          return null;
                        }
                      }
                      
                      return (
                        <Descriptions.Item
                          key={field.field_name}
                          label={field.field_label}
                        >
                          {formatValue(value)}
                        </Descriptions.Item>
                      );
                    })}
                  </Descriptions>
                </div>
              ))}

              {/* Metadata */}
              {detailDrawer.submission.metadata && (
                <div>
                  <Divider orientation="left">Technical Details</Divider>
                  <Descriptions column={1} size="small">
                    {detailDrawer.submission.metadata.user_agent && (
                      <Descriptions.Item label="Browser">
                        <Text type="secondary" ellipsis>
                          {detailDrawer.submission.metadata.user_agent}
                        </Text>
                      </Descriptions.Item>
                    )}
                    {detailDrawer.submission.metadata.referrer && (
                      <Descriptions.Item label="Referrer">
                        {detailDrawer.submission.metadata.referrer}
                      </Descriptions.Item>
                    )}
                    {detailDrawer.submission.metadata.ip_address && (
                      <Descriptions.Item label="IP Address">
                        {detailDrawer.submission.metadata.ip_address}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </div>
              )}

              {/* Actions */}
              <Space className="w-full justify-center">
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    handleStatusChange(detailDrawer.submission.id, 'processed');
                    setDetailDrawer({ visible: false, submission: null });
                  }}
                  disabled={detailDrawer.submission.status === 'processed'}
                >
                  Mark as Processed
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handleExportPDF(detailDrawer.submission)}
                >
                  Export as PDF
                </Button>
              </Space>
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
};

export default FormResponsesPage;
