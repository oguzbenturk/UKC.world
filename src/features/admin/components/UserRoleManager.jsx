// src/features/admin/components/UserRoleManager.jsx
import { useState } from 'react';
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

const ROLE_LABELS = {
  [ROLE_IDS.admin]: 'Admin',
  [ROLE_IDS.manager]: 'Manager',
  [ROLE_IDS.receptionist]: 'Receptionist', 
  [ROLE_IDS.instructor]: 'Instructor',
  [ROLE_IDS.assistant]: 'Assistant',
  [ROLE_IDS.freelancer]: 'Freelancer',
  [ROLE_IDS.student]: 'Student'
};

const UserRoleManager = ({ 
  visible, 
  onCancel, 
  userData, 
  onRoleChanged 
}) => {
  
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
      message.info('No changes made');
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
        message.success(`Successfully changed ${userData.name}'s role to ${newRoleLabel}`);
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
          Manage User Role
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

        <Divider orientation="left">Change Role</Divider>

        {/* Role Selection */}
        <div>
          <Text className="block mb-2">Select new role:</Text>
          <Select
            value={selectedRole}
            onChange={setSelectedRole}
            style={{ width: '100%' }}
            size="large"
          >
            <Option value={ROLE_IDS.student}>
              <Space>
                <Tag color={ROLE_COLORS.student}>Student</Tag>
                <span>Basic user access</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.freelancer}>
              <Space>
                <Tag color={ROLE_COLORS.freelancer}>Freelancer</Tag>
                <span>Independent contractor</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.assistant}>
              <Space>
                <Tag color={ROLE_COLORS.assistant}>Assistant</Tag>
                <span>Limited administrative support</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.instructor}>
              <Space>
                <Tag color={ROLE_COLORS.instructor}>Instructor</Tag>
                <span>Teaching and booking management</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.receptionist}>
              <Space>
                <Tag color={ROLE_COLORS.receptionist}>Receptionist</Tag>
                <span>Front desk operations</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.manager}>
              <Space>
                <Tag color={ROLE_COLORS.manager}>Manager</Tag>
                <span>Operational management</span>
              </Space>
            </Option>
            <Option value={ROLE_IDS.admin}>
              <Space>
                <Tag color={ROLE_COLORS.admin} icon={<CrownOutlined />}>Admin</Tag>
                <span>Full system access</span>
              </Space>
            </Option>
          </Select>
        </div>

        {selectedRole !== userData.role_id && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
            <Text type="warning">
              <strong>Warning:</strong> Changing the user's role will immediately affect their 
              access permissions. They may need to log out and log back in for changes to take full effect.
            </Text>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="primary" 
            onClick={handleRoleChange}
            loading={loading}
            disabled={selectedRole === userData.role_id}
          >
            {selectedRole === userData.role_id ? 'No Changes' : 'Update Role'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserRoleManager;
