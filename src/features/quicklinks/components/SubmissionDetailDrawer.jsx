import {
  Drawer, Card, Tag, Button, Input, Collapse, Descriptions,
  Divider, Image, Space, Empty, Popconfirm, Typography
} from 'antd';
import {
  FileTextOutlined,
  FormOutlined,
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  findProfilePicture,
  findCVFile,
  getFileIcon,
  getAbsoluteFileUrl,
  formatSubmissionValue,
  getSubmitterName,
  getSubmitterEmail,
} from '../utils/formHelpers';

const { Text } = Typography;

const SubmissionDetailDrawer = ({
  open,
  onClose,
  submission,
  instructorNotes,
  setInstructorNotes,
  savingNotes,
  onSaveNotes,
  onDeleteSubmission,
}) => {
  if (!submission) return null;

  const data = submission.submission_data || {};
  const fields = submission.form_fields || [];
  const profilePic = findProfilePicture(data);
  const cvFile = findCVFile(data);

  const renderFormFields = () => {
    if (fields.length > 0) {
      const stepGroups = {};
      fields.forEach(field => {
        const stepTitle = field.step_title || 'General Information';
        if (!stepGroups[stepTitle]) stepGroups[stepTitle] = [];
        stepGroups[stepTitle].push(field);
      });
      
      return (
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
          {Object.entries(stepGroups).map(([stepTitle, stepFields]) => {
            const rendered = new Set();
            return (
              <div key={stepTitle}>
                <Text strong className="block mb-2 text-blue-600">{stepTitle}</Text>
                <div className="space-y-2">
                  {stepFields.map((field, index) => {
                    if (rendered.has(field.field_name)) return null;
                    
                    const value = data[field.field_name];
                    
                    if (['profile_picture', 'profile_pic', 'photo', 'picture', 'avatar', 'cv', 'resume', 'curriculum_vitae'].includes(field.field_name)) {
                      return null;
                    }
                    
                    if (field.field_type === 'SECTION_HEADER' || field.field_type === 'section_header') {
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
                      
                      return (
                        <div key={field.field_name} className="mt-4 mb-2 pt-3 border-t border-gray-300">
                          <Text strong className="text-base text-gray-800">🎯 {field.field_label}</Text>
                        </div>
                      );
                    }
                    
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
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    
    // Fallback to raw data display
    return (
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {Object.entries(data).map(([key, value]) => {
          if (!value || value === '' || (Array.isArray(value) && value.length === 0)) return null;
          
          const formattedKey = key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
          
          return (
            <div key={key} className="bg-white rounded border p-2 hover:bg-gray-50 transition-colors">
              <Text type="secondary" className="text-xs uppercase tracking-wide block">{formattedKey}</Text>
              <Text className="block whitespace-pre-wrap text-sm">{formatSubmissionValue(value)}</Text>
            </div>
          );
        })}
        {Object.keys(data).length === 0 && (
          <Empty description="No form data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    );
  };

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <FileTextOutlined />
          <span>Form Submission</span>
        </div>
      }
      placement="right"
      width={650}
      open={open}
      onClose={onClose}
      extra={
        <Tag color={submission.status === 'approved' ? 'green' : submission.status === 'rejected' ? 'red' : 'orange'}>
          {submission.status === 'pending' ? 'Pending' : submission.status || 'Pending'}
        </Tag>
      }
    >
      <div className="space-y-4">
        {/* Summary Card */}
        <Card size="small" className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-start justify-between">
            <div>
              <Text strong className="text-lg block">{getSubmitterName(submission)}</Text>
              {getSubmitterEmail(submission) && (
                <Text type="secondary">{getSubmitterEmail(submission)}</Text>
              )}
            </div>
            <div className="text-right">
              <Text type="secondary" className="text-xs block">
                {dayjs(submission.submitted_at || submission.created_at).format('MMM D, YYYY')}
              </Text>
              <Text type="secondary" className="text-xs block">
                {dayjs(submission.submitted_at || submission.created_at).format('h:mm A')}
              </Text>
            </div>
          </div>
          <div className="mt-2">
            <Tag color="blue" icon={<FormOutlined />} className="mt-1">
              {submission.form_name || 'Unknown Form'}
            </Tag>
          </div>
        </Card>

        {/* Profile & CV Section */}
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
                <Button type="link" size="small" icon={<EyeOutlined />} href={getAbsoluteFileUrl(cvFile.url)} target="_blank" />
                <Button type="link" size="small" icon={<DownloadOutlined />} href={getAbsoluteFileUrl(cvFile.url)} download={cvFile.name || 'download'} />
              </Space>
            </div>
          </Card>
        )}

        {/* Collapsible Sections */}
        <Collapse 
          defaultActiveKey={['responses', 'notes']} 
          ghost
          items={[
            {
              key: 'responses',
              label: <Text strong>Form Responses ({Object.keys(data).length} fields)</Text>,
              children: renderFormFields()
            },
            {
              key: 'notes',
              label: (
                <div className="flex items-center gap-2">
                  <Text strong>Instructor Notes</Text>
                  {submission.notes && <Tag color="blue" size="small">Has Notes</Tag>}
                </div>
              ),
              children: (
                <div className="space-y-3">
                  <Input.TextArea
                    placeholder="Add your thoughts, questions, or follow-up notes here..."
                    rows={4}
                    value={instructorNotes || submission.notes || ''}
                    onChange={(e) => setInstructorNotes(e.target.value)}
                    className="resize-none"
                  />
                  <div className="flex justify-end">
                    <Button 
                      type="primary" 
                      size="small"
                      loading={savingNotes}
                      onClick={onSaveNotes}
                      disabled={instructorNotes === (submission.notes || '')}
                    >
                      Save Notes
                    </Button>
                  </div>
                </div>
              )
            },
            ...(submission.metadata && Object.keys(submission.metadata).length > 0 ? [{
              key: 'metadata',
              label: <Text type="secondary">Technical Info</Text>,
              children: (
                <Descriptions column={1} size="small" bordered>
                  {submission.metadata.user_agent && (
                    <Descriptions.Item label="Browser">
                      <Text className="text-xs">{submission.metadata.user_agent.substring(0, 80)}...</Text>
                    </Descriptions.Item>
                  )}
                  {submission.metadata.ip_address && (
                    <Descriptions.Item label="IP Address">
                      {submission.metadata.ip_address}
                    </Descriptions.Item>
                  )}
                  {submission.metadata.referrer && (
                    <Descriptions.Item label="Referrer">
                      <Text className="text-xs">{submission.metadata.referrer}</Text>
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
              onDeleteSubmission(submission.id);
              onClose();
            }}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Drawer>
  );
};

export default SubmissionDetailDrawer;
