import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const PermissionDisplay = ({ perms, t }) => {
  if (!perms || Object.keys(perms).length === 0) {
    return <span className="text-xs text-slate-400 italic">{t('admin:roles.permissions.noPermissions')}</span>;
  }
  if (perms['*'] === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <KeyOutlined style={{ fontSize: 10 }} /> {t('admin:roles.permissions.fullAccess')}
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
      {rest > 0 && <span className="text-xs text-slate-400">{t('admin:roles.permissions.moreCategories', { count: rest })}</span>}
    </div>
  );
};

const RoleMobileCard = ({ record, canManage, protectedRoles, onViewUsers, onEdit, onAssign, onDelete, t }) => {
  const isProtected = protectedRoles.has(record.name);
  const hasUsers = (record.user_count || 0) > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800">{record.name}</span>
          {isProtected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 font-medium">
              <LockOutlined style={{ fontSize: 10 }} /> {t('admin:roles.mobileCard.system')}
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
          {t('admin:roles.mobileCard.users', { count: record.user_count || 0 })}
        </button>
      </div>
      {record.description && (
        <p className="text-sm text-slate-500 mb-3 leading-snug">{record.description}</p>
      )}
      <div className="mb-3">
        <PermissionDisplay perms={record.permissions} t={t} />
      </div>
      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-50">
        <Button size="small" icon={<TeamOutlined />} onClick={() => onViewUsers(record)} disabled={!hasUsers}>
          {t('admin:roles.mobileCard.usersButton')}
        </Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} disabled={!canManage}>
          {t('admin:roles.mobileCard.edit')}
        </Button>
        <Button size="small" icon={<UserAddOutlined />} onClick={() => onAssign(record)} disabled={!canManage}>
          {t('admin:roles.mobileCard.assign')}
        </Button>
        <div className="ml-auto">
          <Popconfirm
            title={t('admin:roles.popconfirm.deleteTitle')}
            description={t('admin:roles.popconfirm.deleteDescription')}
            okText={t('admin:roles.popconfirm.deleteOk')}
            okButtonProps={{ danger: true }}
            cancelText={t('admin:roles.popconfirm.cancel')}
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

// Permission category keys (actions are static — labels come from t())
const PERMISSION_CATEGORY_KEYS = {
  bookings: { actions: ['read', 'write', 'delete', 'approve'] },
  users: { actions: ['read', 'write', 'delete', 'assign_roles'] },
  finances: { actions: ['read', 'write', 'refund', 'reconcile'] },
  wallet: { actions: ['read', 'topup', 'deduct', 'transfer'] },
  instructors: { actions: ['read', 'write', 'schedule', 'earnings'] },
  equipment: { actions: ['read', 'write', 'delete', 'rental'] },
  services: { actions: ['read', 'write', 'delete', 'pricing'] },
  settings: { actions: ['read', 'write'] },
  reports: { actions: ['read', 'export'] },
  notifications: { actions: ['read', 'send', 'manage'] },
  audit: { actions: ['read'] },
  system: { actions: ['admin', 'backup', 'maintenance'] },
};

const buildPermissionCategories = (t) =>
  Object.fromEntries(
    Object.entries(PERMISSION_CATEGORY_KEYS).map(([cat, { actions }]) => [
      cat,
      {
        label: t(`admin:roles.categories.${cat}.label`),
        description: t(`admin:roles.categories.${cat}.description`),
        actions: Object.fromEntries(
          actions.map((a) => [a, t(`admin:roles.categories.${cat}.${a}`)])
        ),
      },
    ])
  );

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

const PermissionEditor = ({ value = [], onChange, t }) => {
  const PERMISSION_CATEGORIES = buildPermissionCategories(t);
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
              {t('admin:roles.permissions.allGranted')}
            </span>
          )}
          {partiallySelected && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
              {t('admin:roles.permissions.partial')}
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
          <span className="text-sm font-semibold text-amber-800">{t('admin:roles.superAdmin.label')}</span>
          <p className="text-xs text-amber-600 mt-0.5 mb-0">{t('admin:roles.superAdmin.description')}</p>
        </div>
        <Tooltip title={t('admin:roles.superAdmin.tooltip')}>
          <InfoCircleOutlined className="text-amber-500 flex-shrink-0" />
        </Tooltip>
      </div>

      {hasWildcard ? (
        <div className="text-center py-8 bg-emerald-50 border border-emerald-100 rounded-lg">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-sm font-semibold text-emerald-700 mb-0">{t('admin:roles.superAdmin.fullAccessMessage')}</p>
          <p className="text-xs text-emerald-500 mt-1">{t('admin:roles.superAdmin.fullAccessHint')}</p>
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
  const { t } = useTranslation(['admin']);
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
      message.error(err?.response?.data?.error || t('admin:roles.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const columns = [
    {
      title: t('admin:roles.table.role'),
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
                {t('admin:roles.mobileCard.system')}
              </span>
            )}
          </div>
        );
      }
    },
    {
      title: t('admin:roles.table.description'),
      dataIndex: 'description',
      key: 'description',
      render: (v) => v
        ? <span className="text-sm text-slate-600">{v}</span>
        : <span className="text-sm text-slate-300 italic">—</span>
    },
    {
      title: t('admin:roles.table.permissions'),
      dataIndex: 'permissions',
      key: 'permissions',
      width: 260,
      render: (perms) => <PermissionDisplay perms={perms} t={t} />
    },
    {
      title: t('admin:roles.table.users'),
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
            <Tooltip title={t('admin:roles.tooltips.viewUsers')}>
              <Button
                size="small"
                type="text"
                icon={<TeamOutlined />}
                onClick={() => onViewUsers(record)}
                disabled={!hasUsers}
                className="text-slate-500 hover:text-sky-600"
              />
            </Tooltip>
            <Tooltip title={t('admin:roles.tooltips.edit')}>
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
                disabled={!canManage}
                className="text-slate-500 hover:text-sky-600"
              />
            </Tooltip>
            <Tooltip title={t('admin:roles.tooltips.assignToUser')}>
              <Button
                size="small"
                type="text"
                icon={<UserAddOutlined />}
                onClick={() => onAssign(record)}
                disabled={!canManage}
                className="text-slate-500 hover:text-sky-600"
              />
            </Tooltip>
            <Tooltip title={isProtected ? t('admin:roles.tooltips.systemRoleCannotDelete') : hasUsers ? t('admin:roles.tooltips.removeUsersFirst') : t('admin:roles.tooltips.deleteRole')}>
              <Popconfirm
                title={t('admin:roles.popconfirm.deleteTitle')}
                description={t('admin:roles.popconfirm.deleteDescription')}
                okText={t('admin:roles.popconfirm.deleteOk')}
                okButtonProps={{ danger: true }}
                cancelText={t('admin:roles.popconfirm.cancel')}
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
      message.success(t('admin:roles.toast.roleDeleted'));
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || t('admin:roles.toast.roleDeleteError'));
    }
  };

  const handleCreateFinish = async (values) => {
    try {
      await rolesService.create({
        name: values.name.trim(),
        description: values.description?.trim() || '',
        permissions: checkboxesToPermissions(permissions)
      });
      message.success(t('admin:roles.toast.roleCreated'));
      setCreateOpen(false);
      setPermissions([]);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || t('admin:roles.toast.roleCreateError'));
    }
  };

  const handleEditFinish = async (values) => {
    try {
      await rolesService.update(currentRole.id, {
        name: values.name.trim(),
        description: values.description?.trim(),
        permissions: checkboxesToPermissions(permissions)
      });
      message.success(t('admin:roles.toast.roleUpdated'));
      setEditOpen(false);
      setCurrentRole(null);
      setPermissions([]);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || t('admin:roles.toast.roleUpdateError'));
    }
  };

  const handleAssignFinish = async (values) => {
    try {
      await rolesService.assign(currentRole.id, values.user_id);
      message.success(t('admin:roles.toast.roleAssigned'));
      setAssignOpen(false);
      setCurrentRole(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || t('admin:roles.toast.roleAssignError'));
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
      message.success(t('admin:roles.toast.roleChanged', { name: selectedUserForRoleChange.first_name || selectedUserForRoleChange.name || 'user' }));
      setChangeRoleOpen(false);
      setSelectedUserForRoleChange(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.error || t('admin:roles.toast.roleChangeError'));
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
      <Button onClick={onCancel}>{t('admin:roles.modals.cancel')}</Button>
      <Button type="primary" htmlType="submit">{submitLabel}</Button>
    </div>
  );

  return (
    <>
      {/* Action bar — sits above the table, no duplicate title (parent UserSettings renders it) */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">
          {!loading && roles.length > 0 && t('admin:roles.roleCount', { count: roles.length })}
        </span>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            {t('admin:roles.newRole')}
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
            t={t}
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
            <span className="font-semibold text-slate-800">{t('admin:roles.modals.createRole')}</span>
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
              label={<span className="text-sm font-medium text-slate-700">{t('admin:roles.modals.roleNameLabel')}</span>}
              name="name"
              rules={[{ required: true, message: t('admin:roles.modals.roleNameRequired') }]}
            >
              <Input placeholder={t('admin:roles.modals.roleNamePlaceholder')} />
            </Form.Item>
            <Form.Item
              label={<span className="text-sm font-medium text-slate-700">{t('admin:roles.modals.descriptionLabel')}</span>}
              name="description"
            >
              <Input placeholder={t('admin:roles.modals.descriptionPlaceholder')} />
            </Form.Item>
          </div>
          <Divider className="my-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('admin:roles.modals.permissionsLabel')}</span>
          </Divider>
          <div className="mb-4">
            <PermissionEditor value={permissions} onChange={setPermissions} t={t} />
          </div>
          {modalFooterButtons(() => { setCreateOpen(false); setPermissions([]); }, t('admin:roles.modals.createRoleButton'))}
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
              {t('admin:roles.modals.editRole')}
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
              label={<span className="text-sm font-medium text-slate-700">{t('admin:roles.modals.roleNameLabel')}</span>}
              name="name"
              rules={[{ required: true, message: t('admin:roles.modals.roleNameRequired') }]}
            >
              <Input disabled={currentRole && protectedRoles.has(currentRole.name)} />
            </Form.Item>
            <Form.Item
              label={<span className="text-sm font-medium text-slate-700">{t('admin:roles.modals.descriptionLabel')}</span>}
              name="description"
            >
              <Input />
            </Form.Item>
          </div>
          <Divider className="my-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('admin:roles.modals.permissionsLabel')}</span>
          </Divider>
          <div className="mb-4">
            <PermissionEditor value={permissions} onChange={setPermissions} t={t} />
          </div>
          {modalFooterButtons(() => { setEditOpen(false); setPermissions([]); }, t('admin:roles.modals.saveChanges'))}
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
              {t('admin:roles.modals.assignRole')}
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
            label={<span className="text-sm font-medium text-slate-700">{t('admin:roles.modals.selectUserLabel')}</span>}
            name="user_id"
            rules={[{ required: true, message: t('admin:roles.modals.selectUserRequired') }]}
          >
            <Select
              showSearch
              placeholder={t('admin:roles.modals.selectUserPlaceholder')}
              options={userOptions}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          {modalFooterButtons(() => setAssignOpen(false), t('admin:roles.modals.assignRoleButton'))}
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
              <span className="ml-1.5 text-slate-400 font-normal text-sm">— {t('admin:roles.modals.viewUsers')}</span>
            </span>
          </div>
        }
        open={viewUsersOpen}
        onCancel={() => { setViewUsersOpen(false); setCurrentRole(null); }}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => { setViewUsersOpen(false); setCurrentRole(null); }}>{t('admin:roles.modals.close')}</Button>
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
                description={<span className="text-sm text-slate-400">{t('admin:roles.modals.noUsersWithRole')}</span>}
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
                        {t('admin:roles.modals.change')}
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
              {t('admin:roles.modals.changeRole')}
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
              {t('admin:roles.modals.currentRole')}
              <CategoryChip category={currentRole.name in CATEGORY_COLORS ? currentRole.name : 'settings'} />
              <span className="font-medium text-slate-700">{currentRole.name}</span>
            </div>
          )}
          <Form.Item
            label={<span className="text-sm font-medium text-slate-700">{t('admin:roles.modals.selectNewRoleLabel')}</span>}
            name="new_role_id"
            rules={[{ required: true, message: t('admin:roles.modals.selectNewRoleRequired') }]}
          >
            <Select
              showSearch
              placeholder={t('admin:roles.modals.selectNewRolePlaceholder')}
              options={roleOptionsForChange}
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          {modalFooterButtons(() => { setChangeRoleOpen(false); setSelectedUserForRoleChange(null); }, t('admin:roles.modals.changeRoleButton'))}
        </Form>
      </Modal>
    </>
  );
};

export default RolesAdmin;
