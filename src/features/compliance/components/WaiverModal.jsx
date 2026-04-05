/**
 * WaiverModal Component
 * 
 * Information modal about in-person waiver signing at Duotone Pro Center
 * Displays that waivers must be signed at the center before lessons
 */

import { Modal, Typography, Space, Alert } from 'antd';
import PropTypes from 'prop-types';
import { SafetyOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const WaiverModal = ({ open, userId, userType, onSuccess, onCancel }) => {
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
      okText="I Understand"
      cancelButtonProps={{ style: { display: 'none' } }}
      centered
    >
      <div className="py-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
            <EditOutlined className="text-3xl text-blue-600 dark:text-blue-400" />
          </div>
          <Title level={3} className="mb-2">Liability Waiver Required</Title>
          <Text type="secondary" className="text-base">
            Duotone Pro Center Safety Protocol
          </Text>
        </div>

        <Alert
          message="In-Person Signing Required"
          description="For your safety and legal protection, all liability waivers must be signed in person at our center before your first lesson or equipment rental."
          type="info"
          showIcon
          icon={<SafetyOutlined />}
          className="mb-6"
        />

        <Space direction="vertical" size="middle" className="w-full">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <Title level={5} className="mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <CheckCircleOutlined className="text-green-600" />
              What to Expect
            </Title>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>Arrive 15 minutes before your scheduled lesson time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>Sign the waiver with a valid government-issued ID</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>Our staff will provide the liability waiver at the center</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>Read the waiver carefully and ask any questions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <span>Waivers are valid for 12 months from the date of signing</span>
              </li>
            </ul>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-300 dark:border-orange-800">
            <Title level={5} className="mb-2 text-orange-900 dark:text-orange-200">
              Important Information
            </Title>
            <Paragraph className="mb-2 text-sm text-orange-900 dark:text-orange-200">
              <strong>Participants under 18:</strong> A parent or legal guardian must be present to sign the waiver on behalf of the minor.
            </Paragraph>
            <Paragraph className="mb-0 text-sm text-orange-900 dark:text-orange-200">
              <strong>Group bookings:</strong> Each participant must sign their own waiver. Please allow extra time for groups.
            </Paragraph>
          </div>

          <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
            <Text className="text-2xl font-bold text-slate-900 dark:text-white block mb-2">
              You will sign the waiver at the center before your lesson
            </Text>
            <Text type="secondary" className="text-sm">
              No online signature required • Valid for 12 months • Bring valid ID
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
