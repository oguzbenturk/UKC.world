import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Popconfirm, Checkbox, Collapse, Divider, Switch, Tooltip, List, Avatar, Empty, Typography } from 'antd';
import { InfoCircleOutlined, UserOutlined, SwapOutlined, EditOutlined, UserAddOutlined, DeleteOutlined, PlusOutlined, TeamOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { message } from '@/shared/utils/antdStatic';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';
import rolesService from '../../../shared/services/rolesService';
import usersService from '../../../shared/services/usersService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { hasPermission, ROLES } from '../../../shared/utils/roleUtils';

const { Text, Paragraph } = Typography;

const CATEGORY_COLORS = {
  bookings:      { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  users:         { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
  finances:      { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  wallet:        { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  instructors:   { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' },
  equipment:     { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' },
  services:      { bg: '#cffafe', text: '#0e7490', border: '#a5f3fc' },
  settings:      { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  reports:       { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  notifications: { bg: '#fce7f3', text: '#be185d', border: '#fbcfe8' },
  audit:         { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  system:        { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
};

const CategoryChip = ({ category }) => {
  const colors = CATEGORY_COLORS[category] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
  return (
    <span
      style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap"
    >
      {category}
    </span>
  );
};

const PermissionDisplay = ({ perms }) => {
  if (!perms || Object.keys(perms).length === 0) {
    return <span className="text-xs text-slate-400 italic">No permissions</span>;
  }
  if (perms['*'] === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <KeyOutlined style={{ fontSize: 10 }} /> Full Access
      </span>
    );
  }
  const categories = [...new Set(
    Object.keys(perms).filter(k => perms[k] === true && k !== '*').map(k => k.split(':')[0])
  )];
  const shown = categories.slice(0, 3);
  const rest = categories.length - 3;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(cat => <CategoryChip key={cat} category={cat} />)}
      {rest > 0 && <span className="text-xs text-slate-400">+{rest} more</span>}
    </div>
  );
};

const RoleMobileCard = ({ record, canManage, protectedRoles, onViewUsers, onEdit, onAssign, onDelete }) => {
  const isProtected = protectedRoles.has(record.name);
  const hasUsers = (record.user_count || 0) > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800">{record.name}</span>
          {isProtected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 font-medium">
              <LockOutlined style={{ fontSize: 10 }} /> system
            </span>
          )}
        </div>
        <button
          onClick={() => hasUsers && onViewUsers(record)}
          disabled={!hasUsers}
          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
            hasUsers
              ? 'bg-sky-50 text-sky-600 border border-sky-200 cursor-pointer hover:bg-sky-100'
              : 'bg-slate-50 text-slate-400 border border-slate-100 cursor-default'
          }`}
        >
          {record.user_count || 0} users
        </button>
      </div>
      {record.description && (
        <p className="text-sm text-slate-500 mb-3 leading-snug">{record.description}</p>
      )}
      <div className="mb-3">
        <PermissionDisplay perms={record.permissions} />
      </div>
      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-50">
        <Button size="small" icon={<TeamOutlined />} onClick={() => onViewUsers(record)} disabled={!hasUsers}>
          Users
        </Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} disabled={!canManage}>
          Edit
        </Button>
        <Button size="small" icon={<UserAddOutlined />} onClick={() => onAssign(record)} disabled={!canManage}>
          Assign
        </Button>
        <div className="ml-auto">
          <Popconfirm
            title="Delete role"
            description="Are you sure you want to delete this role?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => onDelete(record)}
            disabled={!canManage || isProtected || hasUsers}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!canManage || isProtected || hasUsers}
            />
          </Popconfirm>
        </div>
      </div>
    </div>
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

const checkboxesToPermissions = (selectedPerms) => {
  const permissions = {};
  selectedPerms.forEach(perm => { permissions[perm] = true; });
  return permissions;
};

const permissionsToCheckboxes = (permissions) => {
  if (!permissions || typeof permissions !== 'object') return [];
  return Object.entries(permissions)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
};

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
      categoryActions.forEach(action => newPerms.push(`${category}:${action}`));
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

  const collapseItems = Object.entries(PERMISSION_CATEGORIES).map(([category, config]) => {
    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.settings;
    const fullySelected = isCategoryFullySelected(category) || hasWildcard;
    const partiallySelected = isCategoryPartiallySelected(category) && !hasWildcard;

    return {
      key: category,
      label: (
        <div className="flex items-center justify-between w-full pr-2">
          <div className="flex items-center gap-2.5">
            <Checkbox
              checked={fullySelected}
              indeterminate={partiallySelected}
              disabled={hasWildcard}
              onChange={(e) => {
                e.stopPropagation();
                handleCategorySelectAll(category, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.text }}
            />
            <span className="font-medium text-slate-700 text-sm">{config.label}</span>
          </div>
          {fullySelected && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
              All granted
            </span>
          )}
          {partiallySelected && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
              Partial
            </span>
          )}
        </div>
      ),
      children: (
        <div className="pl-4 pt-1 pb-2">
          <p className="text-xs text-slate-400 mb-3">{config.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(config.actions).map(([action, label]) => (
              <Checkbox
                key={`${category}:${action}`}
                checked={selectedPerms.includes(`${category}:${action}`) || hasWildcard}
                disabled={hasWildcard}
                onChange={(e) => handlePermissionChange(category, action, e.target.checked)}
              >
                <span className="text-sm text-slate-700">{label}</span>
                <span className="ml-1 text-xs text-slate-400">({action})</span>
              </Checkbox>
            ))}
          </div>
        </div>
      )
    };
  });

  return (
    <div className="space-y-3">
      {/* Super Admin Toggle */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <Switch checked={hasWildcard} onChange={handleWildcardChange} size="small" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-amber-800">Super Admin — Full Access</span>
          <p className="text-xs text-amber-600 mt-0.5 mb-0">Grants all current and future permissions. Use with caution.</p>
        </div>
        <Tooltip title="Grants all permissions including future ones.">
          <InfoCircleOutlined className="text-amber-500 flex-shrink-0" />
        </Tooltip>
      </div>

      {hasWildcard ? (
        <div className="text-center py-8 bg-emerald-50 border border-emerald-100 rounded-lg">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-sm font-semibold text-emerald-700 mb-0">Full access to all features</p>
          <p className="text-xs text-emerald-500 mt-1">Toggle off above to configure granular permissions</p>
        </div>
      ) : (
        <Collapse
          items={collapseItems}
          defaultActiveKey={[]}
          className="permission-collapse bg-transparent"
          size="small"
        />
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

  useEffect(() => { fetchData(); }, []);

  const columns = [
    {
      title: 'Role',
      dataIndex: 'name',
      key: 'name',
      render: (name) => {
        const isProtected = protectedRoles.has(name);
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{name}</span>
            {isProtected && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 font-medium">
                <LockOutlined style={{ fontSize: 9 }} />
                system
              </span>
            )}
          </div>
        );
      }
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (v) => v
        ? <span className="text-sm text-slate-600">{v}</span>
        : <span className="text-sm text-slate-300 italic">—</span>
    },
    {
      title: 'Permissions',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 260,
      render: (perms) => <PermissionDisplay perms={perms} />
    },
    {
      title: 'Users',
      dataIndex: 'user_count',
      key: 'user_count',
      width: 90,
      render: (count, record) => (
        <button
          onClick={() => count && onViewUsers(record)}
          disabled={!count}
          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
            count
              ? 'bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100 cursor-pointer'
              : 'bg-slate-50 text-slate-400 border border-slate-100 cursor-default'
          }`}
        >
          {count || 0}
        </button>
      )
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_, record) => {
        const isProtected = protectedRoles.has(record.name);
        const hasUsers = (record.user_count || 0) > 0;
        return (
          <div className="flex items-center gap-1 justify-end">
            <Tooltip title="View Users">
              <Button
                size="small"
                type="text"
                icon={<TeamOutlined />}
                onClick={() => onViewUsers(record)}
                disabled={!hasUsers}
                className="text-slate-500 hover:text-sky-600"
              />
            </Tooltip>
            <Tooltip title="Edit">
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
                disabled={!canManage}
                className="text-slate-500 hover:text-sky-600"
              />
            </Tooltip>
            <Tooltip title="Assign to User">
              <Button
                size="small"
                type="text"
                icon={<UserAddOutlined />}
                onClick={() => onAssign(record)}
                disabled={!canManage}
                className="text-slate-500 hover:text-sky-600"
              />
            </Tooltip>
            <Tooltip title={isProtected ? 'System roles cannot be deleted' : hasUsers ? 'Remove all users first' : 'Delete role'}>
              <Popconfirm
                title="Delete role"
                description="Are you sure you want to delete this role?"
                okText="Delete"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
                onConfirm={() => onDelete(record)}
                disabled={!canManage || isProtected || hasUsers}
              >
                <Button
                  size="small"
                  type="text"
                  icon={<DeleteOutlined />}
                  danger
                  disabled={!canManage || isProtected || hasUsers}
                />
              </Popconfirm>
            </Tooltip>
          </div>
        );
      }
    }
  ];

  const onCreate = () => { form.resetFields(); setPermissions([]); setCreateOpen(true); };
  const onEdit = (role) => {
    setCurrentRole(role);
    form.setFieldsValue({ name: role.name, description: role.description });
    setPermissions(permissionsToCheckboxes(role.permissions));
    setEditOpen(true);
  };
  const onAssign = (role) => { setCurrentRole(role); assignForm.resetFields(); setAssignOpen(true); };
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
      await rolesService.create({
        name: values.name.trim(),
        description: values.description?.trim() || '',
        permissions: checkboxesToPermissions(permissions)
      });
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
      await rolesService.update(currentRole.id, {
        name: values.name.trim(),
        description: values.description?.trim(),
        permissions: checkboxesToPermissions(permissions)
      });
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

  const onViewUsers = (role) => { setCurrentRole(role); setViewUsersOpen(true); };

  const getUsersWithRole = (roleName) =>
    users.filter(u =>
      (u.role?.toLowerCase() === roleName?.toLowerCase()) ||
      (u.role_name?.toLowerCase() === roleName?.toLowerCase())
    );

  const openChangeRoleModal = (userToChange) => {
    setSelectedUserForRoleChange(userToChange);
    changeRoleForm.resetFields();
    setChangeRoleOpen(true);
  };

  const handleChangeRoleFinish = async (values) => {
    try {
      await rolesService.assign(values.new_role_id, selectedUserForRoleChange.id);
      message.success(`Role changed for ${selectedUserForRoleChange.first_name || selectedUserForRoleChange.name || 'user'}`);
      setChangeRoleOpen(false);
      setSelectedUserForRoleChange(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to change role');
    }
  };

  const userOptions = users.map(u => ({
    value: u.id,
    label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.name || u.email
  }));

  const roleOptionsForChange = roles
    .filter(r => r.name !== currentRole?.name)
    .map(r => ({ value: r.id, label: r.name }));

  const modalFooterButtons = (onCancel, submitLabel) => (
    <div className="flex justify-end gap-2 pt-2">
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="primary" htmlType="submit">{submitLabel}</Button>
    </div>
  );

  return (
    <>
      {/* Action bar — sits above the table, no duplicate title (parent UserSettings renders it) */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">
          {!loading && roles.length > 0 && `${roles.length} role${roles.length !== 1 ? 's' : ''}`}
        </span>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            New Role
          </Button>
        )}
      </div>

      {/* Table — no extra wrapper; UnifiedTable already has border + shadow */}
      <UnifiedResponsiveTable
        rowKey="id"
        columns={columns}
        dataSource={roles}
        loading={loading}
        pagination={{ pageSize: 10, size: 'small' }}
        size="middle"
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

      {/* Create Role Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center">
              <PlusOutlined style={{ fontSize: 12, color: '#0284c7' }} />
            </span>
            <span className="font-semibold text-slate-800">Create Role</span>
          </div>
        }
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setPermissions([]); }}
        footer={null}
        destroyOnHidden
        width={680}
      >
        <Form layout="vertical" form={form} onFinish={handleCreateFinish} className="pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              label={<span className="text-sm font-medium text-slate-700">Role Name</span>}
              name="name"
              rules={[{ required: true, message: 'Role name is required' }]}
            >
              <Input placeholder="e.g., sales_manager" />
            </Form.Item>
            <Form.Item
              label={<span className="text-sm font-medium text-slate-700">Description</span>}
              name="description"
            >
              <Input placeholder="Describe the role's purpose" />
            </Form.Item>
          </div>
          <Divider className="my-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Permissions</span>
          </Divider>
          <div className="mb-4">
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </div>
          {modalFooterButtons(() => { setCreateOpen(false); setPermissions([]); }, 'Create Role')}
        </Form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
              <EditOutlined style={{ fontSize: 12, color: '#475569' }} />
            </span>
            <span className="font-semibold text-slate-800">
              Edit Role
              {currentRole && <span className="ml-1.5 text-slate-400 font-normal">— {currentRole.name}</span>}
            </span>
          </div>
        }
        open={editOpen}
        onCancel={() => { setEditOpen(false); setPermissions([]); }}
        footer={null}
        destroyOnHidden
        width={680}
      >
        <Form layout="vertical" form={form} onFinish={handleEditFinish} className="pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              label={<span className="text-sm font-medium text-slate-700">Role Name</span>}
              name="name"
              rules={[{ required: true, message: 'Role name is required' }]}
            >
              <Input disabled={currentRole && protectedRoles.has(currentRole.name)} />
            </Form.Item>
            <Form.Item
              label={<span className="text-sm font-medium text-slate-700">Description</span>}
              name="description"
            >
              <Input />
            </Form.Item>
          </div>
          <Divider className="my-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Permissions</span>
          </Divider>
          <div className="mb-4">
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </div>
          {modalFooterButtons(() => { setEditOpen(false); setPermissions([]); }, 'Save Changes')}
        </Form>
      </Modal>

      {/* Assign Role Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-sky-100 flex items-center justify-center">
              <UserAddOutlined style={{ fontSize: 12, color: '#0284c7' }} />
            </span>
            <span className="font-semibold text-slate-800">
              Assign Role
              {currentRole && <span className="ml-1.5 text-slate-400 font-normal">— {currentRole.name}</span>}
            </span>
          </div>
        }
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form layout="vertical" form={assignForm} onFinish={handleAssignFinish} className="pt-2">
          <Form.Item
            label={<span className="text-sm font-medium text-slate-700">Select User</span>}
            name="user_id"
            rules={[{ required: true, message: 'Select a user' }]}
          >
            <Select
              showSearch
              placeholder="Search users..."
              options={userOptions}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          {modalFooterButtons(() => setAssignOpen(false), 'Assign Role')}
        </Form>
      </Modal>

      {/* View Users in Role Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
              <TeamOutlined style={{ fontSize: 12, color: '#475569' }} />
            </span>
            <span className="font-semibold text-slate-800">
              {currentRole?.name}
              <span className="ml-1.5 text-slate-400 font-normal text-sm">— users</span>
            </span>
          </div>
        }
        open={viewUsersOpen}
        onCancel={() => { setViewUsersOpen(false); setCurrentRole(null); }}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => { setViewUsersOpen(false); setCurrentRole(null); }}>Close</Button>
          </div>
        }
        destroyOnHidden
        width={520}
      >
        {currentRole && (
          <>
            {currentRole.description && (
              <p className="text-sm text-slate-500 mb-4">{currentRole.description}</p>
            )}
            {getUsersWithRole(currentRole.name).length === 0 ? (
              <Empty
                description={<span className="text-sm text-slate-400">No users with this role</span>}
                className="py-8"
              />
            ) : (
              <List
                dataSource={getUsersWithRole(currentRole.name)}
                renderItem={(u) => (
                  <List.Item
                    className="py-3"
                    actions={canManage ? [
                      <Button
                        key="change"
                        type="link"
                        size="small"
                        icon={<SwapOutlined />}
                        onClick={() => openChangeRoleModal(u)}
                        className="text-slate-500 hover:text-sky-600"
                      >
                        Change
                      </Button>
                    ] : []}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          icon={<UserOutlined />}
                          className="bg-sky-100 text-sky-600"
                          size={36}
                        />
                      }
                      title={
                        <span className="text-sm font-medium text-slate-800">
                          {`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.name || 'Unknown'}
                        </span>
                      }
                      description={<span className="text-xs text-slate-400">{u.email}</span>}
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
        title={
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
              <SwapOutlined style={{ fontSize: 12, color: '#475569' }} />
            </span>
            <span className="font-semibold text-slate-800">
              Change Role
              {selectedUserForRoleChange && (
                <span className="ml-1.5 text-slate-400 font-normal">
                  — {selectedUserForRoleChange.first_name || selectedUserForRoleChange.name || 'User'}
                </span>
              )}
            </span>
          </div>
        }
        open={changeRoleOpen}
        onCancel={() => { setChangeRoleOpen(false); setSelectedUserForRoleChange(null); }}
        footer={null}
        destroyOnHidden
      >
        <Form layout="vertical" form={changeRoleForm} onFinish={handleChangeRoleFinish} className="pt-2">
          {currentRole && (
            <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
              Current role:
              <CategoryChip category={currentRole.name in CATEGORY_COLORS ? currentRole.name : 'settings'} />
              <span className="font-medium text-slate-700">{currentRole.name}</span>
            </div>
          )}
          <Form.Item
            label={<span className="text-sm font-medium text-slate-700">New Role</span>}
            name="new_role_id"
            rules={[{ required: true, message: 'Select a new role' }]}
          >
            <Select
              showSearch
              placeholder="Select new role"
              options={roleOptionsForChange}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          {modalFooterButtons(() => { setChangeRoleOpen(false); setSelectedUserForRoleChange(null); }, 'Change Role')}
        </Form>
      </Modal>
    </>
  );
};

export default RolesAdmin;
