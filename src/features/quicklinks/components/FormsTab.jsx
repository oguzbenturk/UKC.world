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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['manager']);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">{t('manager:quicklinks.forms.heading')}</Title>
          <Text type="secondary">{t('manager:quicklinks.forms.headingDesc')}</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          className="w-full sm:w-auto"
          onClick={onCreateForm}
        >
          {t('manager:quicklinks.forms.createNew')}
        </Button>
      </div>

      {/* Forms List */}
      {allFormTemplates.length === 0 ? (
        <Card className="text-center py-12">
          <Empty
            image={<FormOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
            description={
              <div className="mt-4">
                <Title level={5} className="!mb-2">{t('manager:quicklinks.forms.noForms')}</Title>
                <Text type="secondary">
                  {t('manager:quicklinks.forms.noFormsDesc')}
                </Text>
              </div>
            }
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreateForm}
            >
              {t('manager:quicklinks.forms.createFirst')}
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
                      {t('manager:quicklinks.forms.edit')}
                    </Button>,
                    <Button type="text" icon={<EyeOutlined />} onClick={() => navigate(`/forms/preview/${form.id}`)} key="preview">
                      {t('manager:quicklinks.forms.preview')}
                    </Button>,
                    existingLink ? (
                      <Button type="text" icon={<CopyOutlined />} onClick={() => copyLink(existingLink.link_code)} key="share">
                        {t('manager:quicklinks.forms.copy')}
                      </Button>
                    ) : (
                      <Button type="text" icon={<ShareAltOutlined />} onClick={() => onCreateLinkForForm(form)} key="share">
                        {t('manager:quicklinks.forms.getLink')}
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
                        title={t('manager:quicklinks.forms.deleteConfirm')}
                        description={t('manager:quicklinks.forms.deleteDesc')}
                        onConfirm={() => onDeleteForm(form.id, form.name)}
                        okText={t('manager:quicklinks.forms.deleteOk')}
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                      </Popconfirm>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {category && <Tag color={category.color}>{category.label}</Tag>}
                      <Tag color={form.is_active ? 'green' : 'default'}>
                        {form.is_active ? t('manager:quicklinks.forms.statusActive') : t('manager:quicklinks.forms.statusDraft')}
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
                        {form.submission_count !== 1
                          ? t('manager:quicklinks.forms.responsesPlural', { count: form.submission_count })
                          : t('manager:quicklinks.forms.responses', { count: form.submission_count })}
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
