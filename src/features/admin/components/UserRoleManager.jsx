// src/features/admin/components/UserRoleManager.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Select, Button, App, Space, Typography, Tag, Divider } from 'antd';
import { UserOutlined, CrownOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import { ROLE_IDS } from '@/shared/constants/roles';
const { Option } = Select;
const { Text } = Typography;

const ROLE_COLORS = {
  admin: 'red',
  manager: 'orange',
  receptionist: 'blue',
  instructor: 'green',
  assistant: 'cyan',
  freelancer: 'purple',
  student: 'default'
};

const UserRoleManager = ({
  visible,
  onCancel,
  userData,
  onRoleChanged
}) => {
  const { t } = useTranslation(['admin']);
  const [selectedRole, setSelectedRole] = useState(userData?.role_id);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { message } = App.useApp();
  
  const isAdmin = user && user.role === 'admin';

  if (!isAdmin || !userData) {
    return null;
  }

  const currentRoleName = Object.keys(ROLE_LABELS).find(key => 
    ROLE_LABELS[key].toLowerCase() === userData.role?.toLowerCase()
  );
  
  const currentRoleLabel = currentRoleName ? ROLE_LABELS[currentRoleName] : userData.role;

  const handleRoleChange = async () => {
    if (selectedRole === userData.role_id) {
      message.info(t('admin:userRoleManager.toast.noChanges'));
      onCancel();
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.put(`/roles/assign-user`, {
        userId: userData.id,
        roleId: selectedRole
      });

      if (response.data) {
        const newRoleLabel = ROLE_LABELS[selectedRole];
        message.success(t('admin:userRoleManager.toast.success', { name: userData.name, role: newRoleLabel }));
        onRoleChanged?.(userData.id, selectedRole, newRoleLabel);
        onCancel();
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to update user role';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserOutlined />
          {t('admin:userRoleManager.title')}
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={500}
    >
      <div className="space-y-4">
        {/* User Info */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <Text strong className="text-lg">{userData.name}</Text>
              <br />
              <Text type="secondary">{userData.email}</Text>
            </div>
            <Tag 
              color={ROLE_COLORS[userData.role?.toLowerCase()] || 'default'}
              icon={userData.role === 'admin' ? <CrownOutlined /> : <UserOutlined />}
            >
              {currentRoleLabel}
            </Tag>
          </div>
        </div>

        <Divider orientation="left">{t('admin:userRoleManager.changeRole')}</Divider>

        {/* Role Selection */}
        <div>
          <Text className="block mb-2">{t('admin:userRoleManager.selectNewRole')}</Text>
          <Select
            value={selectedRole}
            onChange={setSelectedRole}
            style={{ width: '100%' }}
            size="large"
          >
            <Option value={ROLE_IDS.student}>
              <Space>
                <Tag color={ROLE_COLORS.student}>Student</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.student')}</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.freelancer}>
              <Space>
                <Tag color={ROLE_COLORS.freelancer}>Freelancer</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.freelancer')}</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.assistant}>
              <Space>
                <Tag color={ROLE_COLORS.assistant}>Assistant</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.assistant')}</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.instructor}>
              <Space>
                <Tag color={ROLE_COLORS.instructor}>Instructor</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.instructor')}</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.receptionist}>
              <Space>
                <Tag color={ROLE_COLORS.receptionist}>Receptionist</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.receptionist')}</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.manager}>
              <Space>
                <Tag color={ROLE_COLORS.manager}>Manager</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.manager')}</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.admin}>
              <Space>
                <Tag color={ROLE_COLORS.admin} icon={<CrownOutlined />}>Admin</Tag>
                <span>{t('admin:userRoleManager.roleDescriptions.admin')}</span>
              </Space>
            </Option>
          </Select>
        </div>

        {selectedRole !== userData.role_id && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
            <Text type="warning">
              <strong>{t('admin:userRoleManager.warningLabel')}</strong> {t('admin:userRoleManager.warning')}
            </Text>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button onClick={onCancel}>
            {t('admin:userRoleManager.cancel')}
          </Button>
          <Button
            type="primary"
            onClick={handleRoleChange}
            loading={loading}
            disabled={selectedRole === userData.role_id}
          >
            {selectedRole === userData.role_id ? t('admin:userRoleManager.noChanges') : t('admin:userRoleManager.updateRole')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserRoleManager;
