/**
 * WaiverModal Component
 * 
 * Information modal about in-person waiver signing at Duotone Pro Center
 * Displays that waivers must be signed at the center before lessons
 */

import { Modal, Typography, Space, Alert } from 'antd';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { SafetyOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const WaiverModal = ({ open, userId, userType, onSuccess, onCancel }) => {
  const { t } = useTranslation(['admin']);
  const handleOk = () => {
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Modal
      open={open}
      title={null}
      onOk={handleOk}
      onCancel={handleCancel}
      width={600}
      okText={t('admin:compliance.waiver.iUnderstand')}
      cancelButtonProps={{ style: { display: 'none' } }}
      centered
    >
      <div className="py-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
            <EditOutlined className="text-3xl text-blue-600 dark:text-blue-400" />
          </div>
          <Title level={3} className="mb-2">{t('admin:compliance.waiver.title')}</Title>
          <Text type="secondary" className="text-base">
            {t('admin:compliance.waiver.subtitle')}
          </Text>
        </div>

        <Alert
          message={t('admin:compliance.waiver.inPersonTitle')}
          description={t('admin:compliance.waiver.inPersonDescription')}
          type="info"
          showIcon
          icon={<SafetyOutlined />}
          className="mb-6"
        />

        <Space direction="vertical" size="middle" className="w-full">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <Title level={5} className="mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <CheckCircleOutlined className="text-green-600" />
              {t('admin:compliance.waiver.whatToExpect')}
            </Title>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>{t('admin:compliance.waiver.expectItems.arrive')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>{t('admin:compliance.waiver.expectItems.signWithId')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>{t('admin:compliance.waiver.expectItems.staffProvide')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>{t('admin:compliance.waiver.expectItems.readCarefully')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>{t('admin:compliance.waiver.expectItems.validity')}</span>
              </li>
            </ul>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-300 dark:border-orange-800">
            <Title level={5} className="mb-2 text-orange-900 dark:text-orange-200">
              {t('admin:compliance.waiver.importantInfo')}
            </Title>
            <Paragraph className="mb-2 text-sm text-orange-900 dark:text-orange-200">
              {t('admin:compliance.waiver.minors')}
            </Paragraph>
            <Paragraph className="mb-0 text-sm text-orange-900 dark:text-orange-200">
              {t('admin:compliance.waiver.groups')}
            </Paragraph>
          </div>

          <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
            <Text className="text-2xl font-bold text-slate-900 dark:text-white block mb-2">
              {t('admin:compliance.waiver.finalNote')}
            </Text>
            <Text type="secondary" className="text-sm">
              {t('admin:compliance.waiver.finalSubnote')}
            </Text>
          </div>
        </Space>
      </div>
    </Modal>
  );
};

WaiverModal.propTypes = {
  open: PropTypes.bool.isRequired,
  userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  userType: PropTypes.string,
  onSuccess: PropTypes.func,
  onCancel: PropTypes.func
};

WaiverModal.defaultProps = {
  userId: null,
  userType: 'user',
  onSuccess: null,
  onCancel: null
};

export default WaiverModal;
