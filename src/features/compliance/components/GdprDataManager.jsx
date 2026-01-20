import { useState } from 'react';
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
      setError('Please type "DELETE MY DATA" to confirm');
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
        title: 'Data Anonymization Successful',
        content: (
          <div>
            <Paragraph>
              Your personal data has been anonymized. Financial records have been retained for legal compliance (7 years).
            </Paragraph>
            <Paragraph>
              <Text strong>Anonymized at:</Text> {response.data.anonymizedAt}
            </Paragraph>
            <Paragraph type="warning">
              You will be logged out in 5 seconds...
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
      setError('We could not determine your account to load the waiver. Please sign in again.');
      return;
    }
    setIsWaiverModalOpen(true);
  };

  const handleWaiverSuccess = () => {
    setIsWaiverModalOpen(false);
    setWaiverRefreshToken((prev) => prev + 1);
    message.success('Thanks! Your liability waiver is now up to date.');
  };

  const handleWaiverCancel = () => {
    setIsWaiverModalOpen(false);
    message.info('You can sign the waiver whenever you need from this page.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Glassmorphism Container */}
        <div className="backdrop-blur-xl bg-white/70 rounded-2xl shadow-2xl border border-white/20 p-8">
          <Title level={2} className="flex items-center gap-3 text-slate-800 mb-2">
            <InfoCircleOutlined className="text-blue-600" />
            GDPR Data Privacy Rights
          </Title>

          <Alert
            message="Your Privacy Rights"
            description="Under the General Data Protection Regulation (GDPR), you have specific rights regarding your personal data. You can export all your data or request deletion at any time."
            type="info"
            showIcon
            className="mb-6 backdrop-blur-sm bg-blue-50/80 border-blue-200"
          />

          {error && (
            <Alert
              message="Error"
              description={error}
              type="error"
              closable
              onClose={() => setError(null)}
              className="mb-6 backdrop-blur-sm bg-red-50/80 border-red-200"
            />
          )}

          {exportSuccess && (
            <Alert
              message="Data Export Successful"
              description="Your data has been downloaded. The file contains all your personal information in JSON format."
              type="success"
              closable
              onClose={() => setExportSuccess(false)}
              className="mb-6 backdrop-blur-sm bg-green-50/80 border-green-200"
            />
          )}

          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 mb-6 hover:shadow-xl transition-all">
            <Title level={4} className="text-slate-700 mb-3">Liability Waiver & Signature History</Title>
            <Paragraph className="text-slate-600 mb-4">
              View your current waiver status and review previous signatures. If you need to sign or refresh your waiver, you can do so directly below.
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
                message="Unable to load waiver details"
                description="We couldn't find your account information. Please sign in again and revisit this page."
                type="warning"
                showIcon
              />
            )}
          </div>

          {/* Right of Access */}
          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 mb-6 hover:shadow-xl transition-all">
            <Title level={4} className="flex items-center gap-2 text-slate-700 mb-4">
              <DownloadOutlined className="text-green-600" />
              Export Your Data (Article 15 - Right of Access)
            </Title>
            
            <Paragraph className="text-slate-600">
              Download a complete copy of all your personal data in machine-readable format (JSON).
              This includes:
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
              Export All My Data
            </Button>
          </div>

          {/* Right to Erasure */}
          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 hover:shadow-xl transition-all">
            <Title level={4} className="flex items-center gap-2 text-slate-700 mb-4">
              <DeleteOutlined className="text-red-600" />
              Delete Your Data (Article 17 - Right to Erasure)
            </Title>
            
            <Alert
              message="Important Notice"
              description={
                <div>
                  <Paragraph className="mb-2">
                    This action will <strong>anonymize</strong> your personal data. Your account will be permanently deleted.
                  </Paragraph>
                  <Paragraph className="mb-2">
                    <Text strong>Please note:</Text> Financial records must be retained for 7 years per tax law compliance.
                    These records will be kept but anonymized (no personal identifiers).
                  </Paragraph>
                  <Paragraph type="warning" className="mb-0 flex items-center gap-1">
                    <WarningOutlined />
                    This action cannot be undone!
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
              Request Data Deletion
            </Button>
          </div>

          {/* GDPR Rights Information */}
          <div className="backdrop-blur-md bg-white/60 rounded-xl shadow-lg border border-white/30 p-6 mt-6">
            <Title level={4} className="text-slate-700 mb-4">Your GDPR Rights</Title>
            <Descriptions column={1} bordered size="small" className="backdrop-blur-sm bg-white/50">
              <Descriptions.Item label="Right to Access (Art. 15)">
                Export all your personal data
              </Descriptions.Item>
              <Descriptions.Item label="Right to Rectification (Art. 16)">
                Update your profile information in account settings
              </Descriptions.Item>
              <Descriptions.Item label="Right to Erasure (Art. 17)">
                Request deletion of your personal data
              </Descriptions.Item>
              <Descriptions.Item label="Right to Portability (Art. 20)">
                Receive your data in machine-readable format (JSON)
              </Descriptions.Item>
              <Descriptions.Item label="Right to Withdraw Consent (Art. 7)">
                Manage communication preferences in account settings
              </Descriptions.Item>
            </Descriptions>

            <Paragraph className="mt-4 mb-2 text-slate-700">
              <Text strong>Contact:</Text> privacy@plannivo.com | dpo@plannivo.com
            </Paragraph>
            <Paragraph className="mb-0 text-slate-500 text-sm">
              We will respond to your request within 30 days as required by GDPR.
            </Paragraph>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal with Glassmorphism */}
      <Modal
        title={
          <span className="flex items-center gap-2">
            <WarningOutlined className="text-red-500" />
            Confirm Data Deletion
          </span>
        }
        open={showDeleteModal}
        onOk={handleAnonymizeData}
        onCancel={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
          setError(null);
        }}
        okText="Delete My Data"
        okButtonProps={{ danger: true, disabled: deleteConfirmText.toLowerCase() !== 'delete my data' }}
        cancelText="Cancel"
        className="gdpr-delete-modal"
        styles={{ mask: { backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.45)' } }}
      >
        <Spin spinning={loading}>
          <Alert
            message="This action is permanent and cannot be undone!"
            type="error"
            showIcon
            className="mb-4"
          />
          
          <Paragraph>
            To confirm deletion, please type <Text code strong>DELETE MY DATA</Text> below:
          </Paragraph>

          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type: DELETE MY DATA"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all backdrop-blur-sm bg-white/90"
          />

          <Paragraph type="secondary" className="mt-4 mb-0 text-sm">
            Financial records will be retained for 7 years (anonymized) for legal compliance.
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
