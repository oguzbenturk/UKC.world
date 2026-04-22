import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Alert, Typography, Descriptions, Modal, Spin } from 'antd';
import { DownloadOutlined, DeleteOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';
import WaiverViewer from '@/features/compliance/components/WaiverViewer';
import WaiverModal from '@/features/compliance/components/WaiverModal';
import { useAuth } from '@/shared/hooks/useAuth';

const { Title, Paragraph, Text } = Typography;

/**
 * GDPR Data Management Component
 * Allows users to exercise their GDPR rights:
 * - Article 15: Right of Access (data export)
 * - Article 17: Right to Erasure (anonymization)
 */
const GdprDataManager = () => {
  const { t } = useTranslation(['admin']);
  const [loading, setLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isWaiverModalOpen, setIsWaiverModalOpen] = useState(false);
  const [waiverRefreshToken, setWaiverRefreshToken] = useState(0);

  const { message } = App.useApp();
  const { user } = useAuth();
  const userId = user?.id;

  /**
   * Handle data export (GDPR Article 15 - Right of Access)
   */
  const handleExportData = async () => {
    setLoading(true);
    setError(null);
    setExportSuccess(false);

    try {
      const response = await axios.get('/api/gdpr/export', {
        responseType: 'blob', // Important for file download
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `gdpr_data_export_${Date.now()}.json`;
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportSuccess(true);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle data anonymization (GDPR Article 17 - Right to Erasure)
   */
  const handleAnonymizeData = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete my data') {
      setError(t('admin:compliance.gdpr.deletion.confirmInstruction'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.delete('/api/gdpr/anonymize', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      Modal.success({
        title: t('admin:compliance.gdpr.deletion.successTitle_modal'),
        content: (
          <div>
            <Paragraph>
              {t('admin:compliance.gdpr.deletion.successDescription_modal')}
            </Paragraph>
            <Paragraph>
              <Text strong>{t('admin:compliance.gdpr.deletion.anonymizedAt')}</Text> {response.data.anonymizedAt}
            </Paragraph>
            <Paragraph type="warning">
              {t('admin:compliance.gdpr.deletion.loggingOut')}
            </Paragraph>
          </div>
        ),
        onOk: () => {
          // Logout and redirect
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
      });

      // Auto logout after 5 seconds
      setTimeout(() => {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }, 5000);

      setShowDeleteModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to anonymize data. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWaiver = () => {
    if (!userId) {
      setError(t('admin:compliance.gdpr.waiverSection.accountError'));
      return;
    }
    setIsWaiverModalOpen(true);
  };

  const handleWaiverSuccess = () => {
    setIsWaiverModalOpen(false);
    setWaiverRefreshToken((prev) => prev + 1);
    message.success(t('admin:compliance.gdpr.waiverSection.successToast'));
  };

  const handleWaiverCancel = () => {
    setIsWaiverModalOpen(false);
    message.info(t('admin:compliance.gdpr.waiverSection.cancelToast'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Glassmorphism Container */}
        <div className="backdrop-blur-xl bg-white/70 rounded-2xl shadow-2xl border border-white/20 p-8">
          <Title level={2} className="flex items-center gap-3 text-slate-800 mb-2">
            <InfoCircleOutlined className="text-blue-600" />
            {t('admin:compliance.gdpr.title')}
          </Title>

          <Alert
            message={t('admin:compliance.gdpr.privacyRightsTitle')}
            description={t('admin:compliance.gdpr.privacyRightsDescription')}
            type="info"
            showIcon
            className="mb-6 backdrop-blur-sm bg-blue-50/80 border-blue-200"
          />

          {error && (
            <Alert
              message={t('admin:compliance.gdpr.waiverSection.loadError')}
              description={error}
              type="error"
              closable
              onClose={() => setError(null)}
              className="mb-6 backdrop-blur-sm bg-red-50/80 border-red-200"
            />
          )}

          {exportSuccess && (
            <Alert
              message={t('admin:compliance.gdpr.export.successTitle')}
              description={t('admin:compliance.gdpr.export.successDescription')}
              type="success"
              closable
              onClose={() => setExportSuccess(false)}
              className="mb-6 backdrop-blur-sm bg-green-50/80 border-green-200"
            />
          )}

          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 mb-6 hover:shadow-xl transition-all">
            <Title level={4} className="text-slate-700 mb-3">{t('admin:compliance.gdpr.waiverSection.title')}</Title>
            <Paragraph className="text-slate-600 mb-4">
              {t('admin:compliance.gdpr.waiverSection.description')}
            </Paragraph>
            {userId ? (
              <WaiverViewer
                userId={String(userId)}
                userType="user"
                onRequestSign={handleOpenWaiver}
                refreshToken={waiverRefreshToken}
              />
            ) : (
              <Alert
                message={t('admin:compliance.gdpr.waiverSection.loadError')}
                description={t('admin:compliance.gdpr.waiverSection.loadErrorDescription')}
                type="warning"
                showIcon
              />
            )}
          </div>

          {/* Right of Access */}
          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 mb-6 hover:shadow-xl transition-all">
            <Title level={4} className="flex items-center gap-2 text-slate-700 mb-4">
              <DownloadOutlined className="text-green-600" />
              {t('admin:compliance.gdpr.export.title')}
            </Title>

            <Paragraph className="text-slate-600">
              {t('admin:compliance.gdpr.export.description')}
            </Paragraph>

            <ul className="text-slate-600 space-y-1 mb-6 ml-4">
              <li>Personal information (name, email, phone, etc.)</li>
              <li>Consent records (terms acceptance, marketing preferences)</li>
              <li>Booking history</li>
              <li>Financial records (transactions, commissions, balances)</li>
              <li>Communications (notifications)</li>
              <li>Ratings given and received</li>
              <li>Service packages</li>
              <li>Accommodation bookings</li>
              <li>Equipment rentals</li>
              <li>Support requests</li>
              <li>Security audit log</li>
            </ul>

            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExportData}
              loading={loading}
              size="large"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 border-0 shadow-md hover:shadow-lg transition-all"
            >
              {t('admin:compliance.gdpr.export.button')}
            </Button>
          </div>

          {/* Right to Erasure */}
          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 hover:shadow-xl transition-all">
            <Title level={4} className="flex items-center gap-2 text-slate-700 mb-4">
              <DeleteOutlined className="text-red-600" />
              {t('admin:compliance.gdpr.deletion.title')}
            </Title>

            <Alert
              message={t('admin:compliance.gdpr.deletion.importantNotice')}
              description={
                <div>
                  <Paragraph className="mb-2">
                    {t('admin:compliance.gdpr.deletion.noticeDescription1')}
                  </Paragraph>
                  <Paragraph className="mb-2">
                    {t('admin:compliance.gdpr.deletion.noticeDescription2')}
                  </Paragraph>
                  <Paragraph type="warning" className="mb-0 flex items-center gap-1">
                    <WarningOutlined />
                    {t('admin:compliance.gdpr.deletion.irreversible')}
                  </Paragraph>
                </div>
              }
              type="warning"
              showIcon
              className="mb-4 backdrop-blur-sm bg-amber-50/80 border-amber-200"
            />

            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => setShowDeleteModal(true)}
              size="large"
              className="shadow-md hover:shadow-lg transition-all"
            >
              {t('admin:compliance.gdpr.deletion.button')}
            </Button>
          </div>

          {/* GDPR Rights Information */}
          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 mt-6">
            <Title level={4} className="text-slate-700 mb-4">{t('admin:compliance.gdpr.rights.title')}</Title>
            <Descriptions column={1} bordered size="small" className="backdrop-blur-sm bg-white/50">
              <Descriptions.Item label={t('admin:compliance.gdpr.rights.access.label')}>
                {t('admin:compliance.gdpr.rights.access.value')}
              </Descriptions.Item>
              <Descriptions.Item label={t('admin:compliance.gdpr.rights.rectification.label')}>
                {t('admin:compliance.gdpr.rights.rectification.value')}
              </Descriptions.Item>
              <Descriptions.Item label={t('admin:compliance.gdpr.rights.erasure.label')}>
                {t('admin:compliance.gdpr.rights.erasure.value')}
              </Descriptions.Item>
              <Descriptions.Item label={t('admin:compliance.gdpr.rights.portability.label')}>
                {t('admin:compliance.gdpr.rights.portability.value')}
              </Descriptions.Item>
              <Descriptions.Item label={t('admin:compliance.gdpr.rights.withdrawConsent.label')}>
                {t('admin:compliance.gdpr.rights.withdrawConsent.value')}
              </Descriptions.Item>
            </Descriptions>

            <Paragraph className="mt-4 mb-2 text-slate-700">
              <Text strong>{t('admin:compliance.gdpr.contact')}</Text> privacy@plannivo.com | dpo@plannivo.com
            </Paragraph>
            <Paragraph className="mb-0 text-slate-500 text-sm">
              {t('admin:compliance.gdpr.responseTime')}
            </Paragraph>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal with Glassmorphism */}
      <Modal
        title={
          <span className="flex items-center gap-2">
            <WarningOutlined className="text-red-500" />
            {t('admin:compliance.gdpr.deletion.confirmTitle')}
          </span>
        }
        open={showDeleteModal}
        onOk={handleAnonymizeData}
        onCancel={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
          setError(null);
        }}
        okText={t('admin:compliance.gdpr.deletion.okText')}
        okButtonProps={{ danger: true, disabled: deleteConfirmText.toLowerCase() !== 'delete my data' }}
        cancelText={t('admin:compliance.gdpr.deletion.cancelText')}
        className="gdpr-delete-modal"
        styles={{ mask: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } }}
      >
        <Spin spinning={loading}>
          <Alert
            message={t('admin:compliance.gdpr.deletion.confirmAction')}
            type="error"
            showIcon
            className="mb-4"
          />

          <Paragraph>
            {t('admin:compliance.gdpr.deletion.confirmInstruction')} <Text code strong>DELETE MY DATA</Text>
          </Paragraph>

          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={t('admin:compliance.gdpr.deletion.confirmPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all backdrop-blur-sm bg-white/90"
          />

          <Paragraph type="secondary" className="mt-4 mb-0 text-sm">
            {t('admin:compliance.gdpr.deletion.retentionNote')}
          </Paragraph>
        </Spin>
      </Modal>

      {userId && (
        <WaiverModal
          open={isWaiverModalOpen}
          userId={String(userId)}
          userType="user"
          onSuccess={handleWaiverSuccess}
          onCancel={handleWaiverCancel}
        />
      )}
    </div>
  );
};

export default GdprDataManager;
