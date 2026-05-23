// src/features/admin/RoleEditor.jsx
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';

const PERMISSION_CATALOG = {
  bookings:      ['read', 'write', 'delete', 'approve'],
  users:         ['read', 'write', 'delete'],
  students:      ['read', 'write'],
  instructors:   ['read', 'write', 'schedule'],
  equipment:     ['read', 'write', 'delete', 'rental'],
  services:      ['read', 'write', 'delete'],
  finances:      ['read', 'write', 'delete'],
  shop:          ['read', 'write'],
  wallet:        ['read', 'topup'],
  reports:       ['read'],
  notifications: ['read', 'send'],
  marketing:     ['read', 'write'],
  settings:      ['read', 'write'],
  admin:         ['settings', 'roles'],
};

const CATEGORY_LABELS = {
  bookings: 'Bookings',
  users: 'Customers / Users',
  students: 'Students',
  instructors: 'Instructors',
  equipment: 'Equipment / Rentals',
  services: 'Services & Packages',
  finances: 'Finances',
  shop: 'Shop',
  wallet: 'Wallet',
  reports: 'Reports / Dashboard',
  notifications: 'Notifications',
  marketing: 'Marketing',
  settings: 'Settings',
  admin: 'Admin',
};

const ACTION_LABELS = {
  read: 'View',
  write: 'Create / Edit',
  delete: 'Delete',
  approve: 'Approve',
  rental: 'Rentals',
  schedule: 'Schedule',
  topup: 'Top-up',
  send: 'Send',
  settings: 'Settings Access',
  roles: 'Role Management',
};

// Maps the old nested permission shape produced by the previous editor
// into the canonical flat `scope:action` keys the backend reads.
const LEGACY_MAP = {
  'bookings.view_all': 'bookings:read',
  'bookings.view_own': 'bookings:read',
  'bookings.create': 'bookings:write',
  'bookings.edit_all': 'bookings:write',
  'bookings.edit_own': 'bookings:write',
  'bookings.delete': 'bookings:delete',
  'customers.view_all': 'users:read',
  'customers.edit_data': 'users:write',
  'customers.create_students': 'users:write',
  'payments.view_all': 'finances:read',
  'payments.process': 'finances:write',
  'shop.view': 'shop:read',
  'shop.add_items': 'shop:write',
  'shop.manage': 'shop:write',
  'rentals.view': 'equipment:read',
  'rentals.manage': 'equipment:write',
  'equipment.view': 'equipment:read',
  'equipment.manage': 'equipment:write',
  'services.view': 'services:read',
  'services.manage': 'services:write',
  'instructors.view': 'instructors:read',
  'instructors.manage': 'instructors:write',
  'finances.view': 'finances:read',
  'finances.manage': 'finances:write',
  'reports.view': 'reports:read',
  'reports.manage': 'reports:read',
  'dashboard.admin': 'reports:read',
  'dashboard.manager': 'reports:read',
  'roles.create': 'admin:roles',
  'roles.assign': 'admin:roles',
  'roles.view_permissions': 'admin:roles',
  'settings.view': 'settings:read',
  'settings.manage': 'admin:settings',
};

function isLegacyShape(perms) {
  if (!perms || typeof perms !== 'object') return false;
  return Object.values(perms).some(v => v && typeof v === 'object' && !Array.isArray(v));
}

function normalizePermissions(perms) {
  if (!perms || typeof perms !== 'object') return {};
  if (!isLegacyShape(perms)) return { ...perms };
  const flat = {};
  for (const [category, actions] of Object.entries(perms)) {
    if (!actions || typeof actions !== 'object') {
      if (actions === true) flat[category] = true;
      continue;
    }
    for (const [action, value] of Object.entries(actions)) {
      if (value !== true) continue;
      const legacyKey = `${category}.${action}`;
      const flatKey = LEGACY_MAP[legacyKey];
      if (flatKey) flat[flatKey] = true;
    }
  }
  return flat;
}

const RoleEditor = ({ role, onClose, onRoleUpdated }) => {
  const [formData, setFormData] = useState({
    name: role.name || '',
    description: role.description || '',
  });
  const [permissions, setPermissions] = useState(() => normalizePermissions(role.permissions));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const SYSTEM_ROLE_NAMES = new Set([
    'admin', 'manager', 'instructor', 'student', 'customer',
    'freelancer', 'super_admin', 'outsider', 'trusted_customer',
  ]);
  const isSystemRole = SYSTEM_ROLE_NAMES.has((role.name || '').toLowerCase());
  const isAdminRole = (role.name || '').toLowerCase() === 'admin';
  const hasWildcard = permissions['*'] === true;

  useEffect(() => {
    const fetchRoleUsers = async () => {
      try {
        setLoadingUsers(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/roles/users/${role.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setUsers(data.data || []);
        }
      } catch {
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchRoleUsers();
  }, [role.id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const togglePerm = (scope, action) => {
    const key = `${scope}:${action}`;
    setPermissions(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  const toggleCategoryAll = (scope) => {
    const actions = PERMISSION_CATALOG[scope] || [];
    const allOn = actions.every(a => permissions[`${scope}:${a}`] === true);
    setPermissions(prev => {
      const next = { ...prev };
      actions.forEach(a => {
        const key = `${scope}:${a}`;
        if (allOn) delete next[key];
        else next[key] = true;
      });
      return next;
    });
  };

  const toggleWildcard = () => {
    setPermissions(prev => {
      const next = { ...prev };
      if (next['*']) delete next['*'];
      else next['*'] = true;
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      setError('Role description is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const updateData = {
        description: formData.description.trim(),
        permissions,
      };
      if (!isSystemRole) {
        updateData.name = formData.name.trim();
      }
      const response = await fetch(`${API_BASE_URL}/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to update role');
      }
      onRoleUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRoleDisplayName = (roleName) => {
    const displayNames = {
      admin: 'Administrator',
      manager: 'Manager',
      receptionist: 'Receptionist',
      instructor: 'Instructor',
      assistant: 'Assistant',
      freelancer: 'Freelancer',
      student: 'Student',
    };
    const key = (roleName || '').toLowerCase();
    return displayNames[key] || (roleName ? roleName.charAt(0).toUpperCase() + roleName.slice(1) : 'Role');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-green-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Edit Role: {getRoleDisplayName(role.name)}</h2>
              {isSystemRole && (
                <p className="text-green-200 text-sm mt-1">System Role - Name cannot be changed</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-green-200 hover:text-white transition-colors duration-200"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex h-[calc(90vh-140px)]">
          <div className="flex-1 p-6 overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      Role Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      disabled={isSystemRole}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                        isSystemRole ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                      placeholder="e.g., front_desk"
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                      Description *
                    </label>
                    <input
                      type="text"
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Brief description of this role"
                      required
                    />
                  </div>
                </div>
              </div>

              {isAdminRole && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasWildcard}
                      onChange={toggleWildcard}
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <span className="ml-3 text-sm font-medium text-amber-900">
                      Full access (<code>*</code>) — bypasses all permission checks
                    </span>
                  </label>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Permissions</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Each box grants one <code>scope:action</code>. The backend checks these exact keys.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {Object.entries(PERMISSION_CATALOG).map(([scope, actions]) => {
                    const allOn = actions.every(a => permissions[`${scope}:${a}`] === true);
                    return (
                      <div key={scope} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-medium text-gray-900">
                            {CATEGORY_LABELS[scope] || scope}
                          </h4>
                          <button
                            type="button"
                            onClick={() => toggleCategoryAll(scope)}
                            className="text-sm text-green-600 hover:text-green-800"
                            disabled={hasWildcard}
                          >
                            {allOn ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="space-y-2">
                          {actions.map((action) => {
                            const key = `${scope}:${action}`;
                            return (
                              <label key={action} className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={permissions[key] === true || hasWildcard}
                                  onChange={() => togglePerm(scope, action)}
                                  disabled={hasWildcard}
                                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded disabled:opacity-50"
                                />
                                <span className="ml-2 text-sm text-gray-700">
                                  {ACTION_LABELS[action] || action}
                                  <span className="ml-2 text-xs text-gray-400 font-mono">{key}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}

              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {loading ? 'Updating...' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>

          <div className="w-80 border-l border-gray-200 p-6 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assigned Users</h3>
            {loadingUsers ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
                <p className="text-sm text-gray-500 mt-2">Loading users...</p>
              </div>
            ) : users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="font-medium text-gray-900">
                      {user.first_name} {user.last_name}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-2">
                  <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">No users assigned to this role</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleEditor;
