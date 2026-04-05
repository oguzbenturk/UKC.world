import { Card, Button, Tag, Empty, Row, Col, Popconfirm, Typography } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ShareAltOutlined,
  EyeOutlined,
  FormOutlined,
  CopyOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { FORM_CATEGORIES, getPublicUrl } from '../utils/formHelpers';

const { Text, Title } = Typography;

const FormsTab = ({
  allFormTemplates,
  getFormLink,
  copyLink,
  onCreateLinkForForm,
  onDeleteForm,
  onCreateForm,
}) => {
  const navigate = useNavigate();

  return (
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
          onClick={onCreateForm}
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
              <div className="mt-4">
                <Title level={5} className="!mb-2">No forms yet</Title>
                <Text type="secondary">
                  Create your first form to collect applications, feedback, or waivers
                </Text>
              </div>
            }
          >
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={onCreateForm}
            >
              Create Your First Form
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {allFormTemplates.map(form => {
            const existingLink = getFormLink(form.id);
            const category = FORM_CATEGORIES.find(c => c.value === form.category);
            
            return (
              <Col xs={24} sm={12} lg={8} key={form.id}>
                <Card 
                  hoverable
                  className="h-full"
                  actions={[
                    <Button type="text" icon={<EditOutlined />} onClick={() => navigate(`/forms/builder/${form.id}`)} key="edit">
                      Edit
                    </Button>,
                    <Button type="text" icon={<EyeOutlined />} onClick={() => navigate(`/forms/preview/${form.id}`)} key="preview">
                      Preview
                    </Button>,
                    existingLink ? (
                      <Button type="text" icon={<CopyOutlined />} onClick={() => copyLink(existingLink.link_code)} key="share">
                        Copy
                      </Button>
                    ) : (
                      <Button type="text" icon={<ShareAltOutlined />} onClick={() => onCreateLinkForForm(form)} key="share">
                        Get Link
                      </Button>
                    )
                  ]}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <Text strong className="text-base block truncate">{form.name}</Text>
                        {form.description && (
                          <Text type="secondary" className="text-sm line-clamp-2">{form.description}</Text>
                        )}
                      </div>
                      <Popconfirm
                        title="Delete this form?"
                        description="This will also delete all submissions."
                        onConfirm={() => onDeleteForm(form.id, form.name)}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                      </Popconfirm>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {category && <Tag color={category.color}>{category.label}</Tag>}
                      <Tag color={form.is_active ? 'green' : 'default'}>
                        {form.is_active ? 'Active' : 'Draft'}
                      </Tag>
                    </div>

                    {/* Link Status */}
                    {existingLink && (
                      <div className="bg-green-50 rounded p-2 text-xs">
                        <Text type="secondary">
                          Shared at: <Text copyable={{ text: getPublicUrl(existingLink.link_code) }} className="text-xs">{getPublicUrl(existingLink.link_code)}</Text>
                        </Text>
                      </div>
                    )}

                    {/* Submission Count */}
                    {form.submission_count > 0 && (
                      <Button 
                        type="link" 
                        size="small" 
                        icon={<InboxOutlined />}
                        className="!p-0"
                        onClick={() => navigate(`/forms/${form.id}/responses`)}
                      >
                        {form.submission_count} response{form.submission_count !== 1 ? 's' : ''}
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
};

export default FormsTab;
