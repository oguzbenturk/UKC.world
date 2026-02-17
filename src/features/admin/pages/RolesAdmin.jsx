import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Form, Input, Modal, Row, Select, Space, Typography, Popconfirm, Checkbox, Collapse, Tag, Divider, Switch, Tooltip, List, Avatar, Empty } from 'antd';
import { InfoCircleOutlined, UserOutlined, SwapOutlined, EditOutlined, UserAddOutlined, DeleteOutlined } from '@ant-design/icons';
import { message } from '@/shared/utils/antdStatic';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';
import rolesService from '../../../shared/services/rolesService';
import usersService from '../../../shared/services/usersService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { hasPermission, ROLES } from '../../../shared/utils/roleUtils';

const { Title, Paragraph, Text } = Typography;

const RoleMobileCard = ({ 
  record, 
  canManage, 
  protectedRoles, 
  onViewUsers, 
  onEdit, 
  onAssign, 
  onDelete 
}) => {
  const perms = record.permissions;
  let permTag = <Tag>No permissions</Tag>;
  if (perms && perms['*'] === true) {
    permTag = <Tag color="gold">Full Access</Tag>;
  } else if (perms && Object.keys(perms).length > 0) {
    const count = Object.values(perms).filter(v => v === true).length;
    permTag = <Tag color="blue">{count} permission{count !== 1 ? 's' : ''}</Tag>;
  }

  const isProtected = protectedRoles.has(record.name);
  const hasUsers = (record.user_count || 0) > 0;

  return (
      <Card 
        size="small" 
        className="mb-3 border-gray-100 shadow-sm"
        actions={[
          <Button key="view" type="link" size="small" icon={<UserOutlined />} onClick={() => onViewUsers(record)} disabled={!hasUsers}>
             Users ({record.user_count || 0})
          </Button>,
          <Button key="edit" type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} disabled={!canManage}>Edit</Button>,
          <Button key="assign" type="link" size="small" icon={<UserAddOutlined />} onClick={() => onAssign(record)} disabled={!canManage}>Assign</Button>,
          <Popconfirm
            key="delete"
            title="Delete role"
            description="Are you sure you want to delete this role?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => onDelete(record)}
            disabled={!canManage || isProtected || hasUsers}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!canManage || isProtected || hasUsers}>Delete</Button>
          </Popconfirm>
        ]}
      >
        <div className="flex justify-between items-start mb-2">
           <Text strong className="text-lg">{record.name}</Text>
           {permTag}
        </div>
        <div className="mb-2">
           {record.description ? <Text type="secondary">{record.description}</Text> : <Text type="secondary" italic>No description</Text>}
        </div>
      </Card>
  );
};

// Permission categories and their actions
const PERMISSION_CATEGORIES = {
  bookings: {
    label: 'Bookings',
    description: 'Manage lesson and activity bookings',
    actions: {
      read: 'View bookings',
      write: 'Create/edit bookings',
      delete: 'Cancel/delete bookings',
      approve: 'Approve pending bookings'
    }
  },
  users: {
    label: 'Users',
    description: 'Manage user accounts',
    actions: {
      read: 'View users',
      write: 'Create/edit users',
      delete: 'Delete users',
      assign_roles: 'Assign roles to users'
    }
  },
  finances: {
    label: 'Finances',
    description: 'Access financial data and transactions',
    actions: {
      read: 'View financial reports',
      write: 'Create transactions/payments',
      refund: 'Process refunds',
      reconcile: 'Run financial reconciliation'
    }
  },
  wallet: {
    label: 'Wallet',
    description: 'Manage user wallet operations',
    actions: {
      read: 'View wallet balances',
      topup: 'Add funds to wallets',
      deduct: 'Deduct from wallets',
      transfer: 'Transfer between wallets'
    }
  },
  instructors: {
    label: 'Instructors',
    description: 'Manage instructor profiles and schedules',
    actions: {
      read: 'View instructors',
      write: 'Create/edit instructors',
      schedule: 'Manage schedules',
      earnings: 'View/manage earnings'
    }
  },
  equipment: {
    label: 'Equipment',
    description: 'Manage rental equipment inventory',
    actions: {
      read: 'View equipment',
      write: 'Create/edit equipment',
      delete: 'Delete equipment',
      rental: 'Manage rentals'
    }
  },
  services: {
    label: 'Services',
    description: 'Manage service offerings',
    actions: {
      read: 'View services',
      write: 'Create/edit services',
      delete: 'Delete services',
      pricing: 'Manage pricing'
    }
  },
  settings: {
    label: 'Settings',
    description: 'System configuration',
    actions: {
      read: 'View settings',
      write: 'Modify settings'
    }
  },
  reports: {
    label: 'Reports',
    description: 'Access analytics and reports',
    actions: {
      read: 'View reports',
      export: 'Export data'
    }
  },
  notifications: {
    label: 'Notifications',
    description: 'Manage system notifications',
    actions: {
      read: 'View notifications',
      send: 'Send notifications',
      manage: 'Manage notification settings'
    }
  },
  audit: {
    label: 'Audit Logs',
    description: 'Access system audit logs',
    actions: {
      read: 'View audit logs'
    }
  },
  system: {
    label: 'System',
    description: 'System administration',
    actions: {
      admin: 'Full system access',
      backup: 'Manage backups',
      maintenance: 'Maintenance mode'
    }
  }
};

// Helper to convert checkbox state to permissions object
const checkboxesToPermissions = (selectedPerms) => {
  const permissions = {};
  selectedPerms.forEach(perm => {
    permissions[perm] = true;
  });
  return permissions;
};

// Helper to convert permissions object to checkbox state
const permissionsToCheckboxes = (permissions) => {
  if (!permissions || typeof permissions !== 'object') return [];
  return Object.entries(permissions)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
};

// Permission Editor Component
const PermissionEditor = ({ value = [], onChange }) => {
  const [selectedPerms, setSelectedPerms] = useState(value);
  const [hasWildcard, setHasWildcard] = useState(value.includes('*'));

  useEffect(() => {
    setSelectedPerms(value);
    setHasWildcard(value.includes('*'));
  }, [value]);

  const handlePermissionChange = (category, action, checked) => {
    const permKey = `${category}:${action}`;
    let newPerms;
    if (checked) {
      newPerms = [...selectedPerms.filter(p => p !== permKey), permKey];
    } else {
      newPerms = selectedPerms.filter(p => p !== permKey);
    }
    setSelectedPerms(newPerms);
    onChange?.(newPerms);
  };

  const handleCategorySelectAll = (category, checked) => {
    const categoryActions = Object.keys(PERMISSION_CATEGORIES[category].actions);
    let newPerms = selectedPerms.filter(p => !p.startsWith(`${category}:`));
    if (checked) {
      categoryActions.forEach(action => {
        newPerms.push(`${category}:${action}`);
      });
    }
    setSelectedPerms(newPerms);
    onChange?.(newPerms);
  };

  const handleWildcardChange = (checked) => {
    setHasWildcard(checked);
    if (checked) {
      onChange?.(['*']);
    } else {
      onChange?.([]);
    }
  };

  const isCategoryFullySelected = (category) => {
    const categoryActions = Object.keys(PERMISSION_CATEGORIES[category].actions);
    return categoryActions.every(action => 
      selectedPerms.includes(`${category}:${action}`) || selectedPerms.includes('*')
    );
  };

  const isCategoryPartiallySelected = (category) => {
    const categoryActions = Object.keys(PERMISSION_CATEGORIES[category].actions);
    const selectedCount = categoryActions.filter(action => 
      selectedPerms.includes(`${category}:${action}`)
    ).length;
    return selectedCount > 0 && selectedCount < categoryActions.length;
  };

  const collapseItems = Object.entries(PERMISSION_CATEGORIES).map(([category, config]) => ({
    key: category,
    label: (
      <div className="flex items-center justify-between w-full pr-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isCategoryFullySelected(category) || hasWildcard}
            indeterminate={isCategoryPartiallySelected(category) && !hasWildcard}
            disabled={hasWildcard}
            onChange={(e) => {
              e.stopPropagation();
              handleCategorySelectAll(category, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="font-medium">{config.label}</span>
        </div>
        {(isCategoryFullySelected(category) || hasWildcard) && (
          <Tag color="green" className="ml-2">Full Access</Tag>
        )}
        {isCategoryPartiallySelected(category) && !hasWildcard && (
          <Tag color="orange" className="ml-2">Partial</Tag>
        )}
      </div>
    ),
    children: (
      <div className="pl-6">
        <Text type="secondary" className="block mb-3">{config.description}</Text>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(config.actions).map(([action, label]) => (
            <Checkbox
              key={`${category}:${action}`}
              checked={selectedPerms.includes(`${category}:${action}`) || hasWildcard}
              disabled={hasWildcard}
              onChange={(e) => handlePermissionChange(category, action, e.target.checked)}
            >
              <span>{label}</span>
              <Text type="secondary" className="ml-1 text-xs">({category}:{action})</Text>
            </Checkbox>
          ))}
        </div>
      </div>
    )
  }));

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
        <Switch
          checked={hasWildcard}
          onChange={handleWildcardChange}
          size="small"
        />
        <Text strong>Super Admin (Full Access)</Text>
        <Tooltip title="Grants all permissions including future ones. Use with caution.">
          <InfoCircleOutlined className="text-yellow-600" />
        </Tooltip>
      </div>
      
      {!hasWildcard && (
        <Collapse 
          items={collapseItems}
          defaultActiveKey={[]}
          className="permission-collapse"
        />
      )}

      {hasWildcard && (
        <div className="text-center py-8 bg-green-50 rounded-lg">
          <Text type="success" strong>✓ This role has full access to all features</Text>
        </div>
      )}
    </div>
  );
};

const RolesAdmin = () => {
  const { user } = useAuth();
  const canManage = user && hasPermission(user.role, [ROLES.ADMIN]);

  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [viewUsersOpen, setViewUsersOpen] = useState(false);
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [selectedUserForRoleChange, setSelectedUserForRoleChange] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [changeRoleForm] = Form.useForm();
  const [permissions, setPermissions] = useState([]);

  const protectedRoles = useMemo(() => new Set(['super_admin','admin','manager','instructor','student','customer','freelancer']), []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [roleList, userList] = await Promise.all([
        rolesService.list(),
        usersService.list()
      ]);
      setRoles(roleList);
      setUsers(userList);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to load roles/users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (name) => (
      <span className="font-medium">{name}</span>
    )},
    { title: 'Description', dataIndex: 'description', key: 'description', render: (v) => v || <Text type="secondary">-</Text> },
    { 
      title: 'Permissions', 
      dataIndex: 'permissions', 
      key: 'permissions', 
      width: 200,
      render: (perms) => {
        if (!perms || Object.keys(perms).length === 0) {
          return <Tag>No permissions</Tag>;
        }
        if (perms['*'] === true) {
          return <Tag color="gold">Full Access</Tag>;
        }
        const count = Object.values(perms).filter(v => v === true).length;
        return <Tag color="blue">{count} permission{count !== 1 ? 's' : ''}</Tag>;
      }
    },
    { title: 'Users', dataIndex: 'user_count', key: 'user_count', width: 80, 
      render: (count, record) => (
        <Button type="link" size="small" onClick={() => onViewUsers(record)} disabled={!count}>
          {count || 0} user{count !== 1 ? 's' : ''}
        </Button>
      )
    },
    {
      title: 'Actions', key: 'actions', width: 320,
      render: (_, record) => (
        <Space wrap>
          <Button size="small" icon={<UserOutlined />} onClick={() => onViewUsers(record)} disabled={(record.user_count || 0) === 0}>
            View Users
          </Button>
          <Button size="small" onClick={() => onEdit(record)} disabled={!canManage}>Edit</Button>
          <Button size="small" onClick={() => onAssign(record)} disabled={!canManage}>Assign</Button>
          <Popconfirm
            title="Delete role"
            description="Are you sure you want to delete this role?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => onDelete(record)}
            disabled={!canManage || protectedRoles.has(record.name) || (record.user_count || 0) > 0}
          >
            <Button size="small" danger disabled={!canManage || protectedRoles.has(record.name) || (record.user_count || 0) > 0}>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const onCreate = () => {
    form.resetFields();
    setPermissions([]);
    setCreateOpen(true);
  };

  const onEdit = (role) => {
    setCurrentRole(role);
    form.setFieldsValue({ name: role.name, description: role.description });
    setPermissions(permissionsToCheckboxes(role.permissions));
    setEditOpen(true);
  };

  const onAssign = (role) => {
    setCurrentRole(role);
    assignForm.resetFields();
    setAssignOpen(true);
  };

  const onDelete = async (role) => {
    try {
      await rolesService.remove(role.id);
      message.success('Role deleted');
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to delete role');
    }
  };

  const handleCreateFinish = async (values) => {
    try {
      const payload = { 
        name: values.name.trim(), 
        description: values.description?.trim() || '',
        permissions: checkboxesToPermissions(permissions)
      };
      await rolesService.create(payload);
      message.success('Role created');
      setCreateOpen(false);
      setPermissions([]);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to create role');
    }
  };

  const handleEditFinish = async (values) => {
    try {
      const payload = { 
        name: values.name.trim(), 
        description: values.description?.trim(),
        permissions: checkboxesToPermissions(permissions)
      };
      await rolesService.update(currentRole.id, payload);
      message.success('Role updated');
      setEditOpen(false);
      setCurrentRole(null);
      setPermissions([]);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to update role');
    }
  };

  const handleAssignFinish = async (values) => {
    try {
      await rolesService.assign(currentRole.id, values.user_id);
      message.success('Role assigned to user');
      setAssignOpen(false);
      setCurrentRole(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to assign role');
    }
  };

  // View users in a role
  const onViewUsers = (role) => {
    setCurrentRole(role);
    setViewUsersOpen(true);
  };

  // Get users with a specific role
  const getUsersWithRole = (roleName) => {
    return users.filter(u => 
      (u.role?.toLowerCase() === roleName?.toLowerCase()) || 
      (u.role_name?.toLowerCase() === roleName?.toLowerCase())
    );
  };

  // Open change role modal for a specific user
  const openChangeRoleModal = (userToChange) => {
    setSelectedUserForRoleChange(userToChange);
    changeRoleForm.resetFields();
    setChangeRoleOpen(true);
  };

  // Handle changing user's role
  const handleChangeRoleFinish = async (values) => {
    try {
      await rolesService.assign(values.new_role_id, selectedUserForRoleChange.id);
      message.success(`Role changed successfully for ${selectedUserForRoleChange.first_name || selectedUserForRoleChange.name || 'user'}`);
      setChangeRoleOpen(false);
      setSelectedUserForRoleChange(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to change role');
    }
  };

  const userOptions = users.map(u => ({ value: u.id, label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.name || u.email }));
  
  // Role options for changing roles (exclude current role)
  const roleOptionsForChange = roles
    .filter(r => r.name !== currentRole?.name)
    .map(r => ({ value: r.id, label: r.name }));

  return (
    <div className="p-4 md:p-6">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space align="center" className="w-full" style={{ justifyContent: 'space-between' }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>Roles Management</Title>
              <Paragraph type="secondary" style={{ margin: 0 }}>Create, update, delete roles and assign them to users.</Paragraph>
            </div>
            <Space>
              <Button type="primary" onClick={onCreate} disabled={!canManage}>New Role</Button>
            </Space>
          </Space>
        </Col>
        <Col span={24}>
          <Card styles={{ body: { padding: 0 } }}>
            <UnifiedResponsiveTable
              rowKey="id"
              columns={columns}
              dataSource={roles}
              loading={loading}
              pagination={{ pageSize: 10 }}
              mobileCardRenderer={(props) => (
                <RoleMobileCard 
                  {...props}
                  canManage={canManage}
                  protectedRoles={protectedRoles}
                  onViewUsers={onViewUsers}
                  onEdit={onEdit}
                  onAssign={onAssign}
                  onDelete={onDelete}
                />
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Create Role Modal */}
      <Modal
        title="Create Role"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setPermissions([]); }}
        footer={null}
        destroyOnHidden
        width={700}
      >
        <Form layout="vertical" form={form} onFinish={handleCreateFinish}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Role name is required' }]}>
            <Input placeholder="e.g., sales_manager" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Describe the role's purpose" rows={2} />
          </Form.Item>
          <Divider>Permissions</Divider>
          <div className="mb-4">
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </div>
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setCreateOpen(false); setPermissions([]); }}>Cancel</Button>
            <Button type="primary" htmlType="submit">Create Role</Button>
          </Space>
        </Form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        title={currentRole ? `Edit Role: ${currentRole.name}` : 'Edit Role'}
        open={editOpen}
        onCancel={() => { setEditOpen(false); setPermissions([]); }}
        footer={null}
        destroyOnHidden
        width={700}
      >
        <Form layout="vertical" form={form} onFinish={handleEditFinish}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Role name is required' }]}>
            <Input disabled={currentRole && protectedRoles.has(currentRole.name)} />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Divider>Permissions</Divider>
          <div className="mb-4">
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </div>
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setEditOpen(false); setPermissions([]); }}>Cancel</Button>
            <Button type="primary" htmlType="submit">Save Changes</Button>
          </Space>
        </Form>
      </Modal>

      {/* Assign Role Modal */}
      <Modal
        title={currentRole ? `Assign Role: ${currentRole.name}` : 'Assign Role'}
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form layout="vertical" form={assignForm} onFinish={handleAssignFinish}>
          <Form.Item label="User" name="user_id" rules={[{ required: true, message: 'Select a user' }]}>
            <Select
              showSearch
              placeholder="Select user"
              options={userOptions}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit">Assign</Button>
          </Space>
        </Form>
      </Modal>

      {/* View Users in Role Modal */}
      <Modal
        title={currentRole ? `Users with Role: ${currentRole.name}` : 'Users'}
        open={viewUsersOpen}
        onCancel={() => { setViewUsersOpen(false); setCurrentRole(null); }}
        footer={<Button onClick={() => { setViewUsersOpen(false); setCurrentRole(null); }}>Close</Button>}
        destroyOnHidden
        width={600}
      >
        {currentRole && (
          <>
            <Paragraph type="secondary" className="mb-4">
              {currentRole.description || `Users currently assigned to the ${currentRole.name} role.`}
            </Paragraph>
            {getUsersWithRole(currentRole.name).length === 0 ? (
              <Empty description="No users with this role" />
            ) : (
              <List
                dataSource={getUsersWithRole(currentRole.name)}
                renderItem={(u) => (
                  <List.Item
                    actions={canManage ? [
                      <Button 
                        key="change" 
                        type="link" 
                        icon={<SwapOutlined />}
                        onClick={() => openChangeRoleModal(u)}
                      >
                        Change Role
                      </Button>
                    ] : []}
                  >
                    <List.Item.Meta
                      avatar={<Avatar icon={<UserOutlined />} />}
                      title={`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.name || 'Unknown'}
                      description={u.email}
                    />
                  </List.Item>
                )}
              />
            )}
          </>
        )}
      </Modal>

      {/* Change User Role Modal */}
      <Modal
        title={selectedUserForRoleChange ? `Change Role for ${selectedUserForRoleChange.first_name || selectedUserForRoleChange.name || 'User'}` : 'Change Role'}
        open={changeRoleOpen}
        onCancel={() => { setChangeRoleOpen(false); setSelectedUserForRoleChange(null); }}
        footer={null}
        destroyOnHidden
      >
        <Form layout="vertical" form={changeRoleForm} onFinish={handleChangeRoleFinish}>
          <Paragraph type="secondary" className="mb-4">
            Current role: <Tag color="blue">{currentRole?.name}</Tag>
          </Paragraph>
          <Form.Item label="New Role" name="new_role_id" rules={[{ required: true, message: 'Select a new role' }]}>
            <Select
              showSearch
              placeholder="Select new role"
              options={roleOptionsForChange}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setChangeRoleOpen(false); setSelectedUserForRoleChange(null); }}>Cancel</Button>
            <Button type="primary" htmlType="submit">Change Role</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default RolesAdmin;
