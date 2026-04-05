// src/features/admin/RoleEditor.jsx
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
const RoleEditor = ({ role, onClose, onRoleUpdated }) => {
  const [formData, setFormData] = useState({
    name: role.name || '',
    description: role.description || ''
  });
  const [permissions, setPermissions] = useState(role.permissions || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const isSystemRole = ['admin', 'manager', 'receptionist', 'instructor', 'assistant', 'freelancer', 'student'].includes(role.name);

  useEffect(() => {
    const fetchRoleUsers = async () => {
      try {
        setLoadingUsers(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/roles/users/${role.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setUsers(data.data);
        }
      } catch {
        // Failed to fetch role users - non-critical error
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchRoleUsers();
  }, [role.id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePermissionChange = (category, permission) => {
    setPermissions(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [permission]: !prev[category]?.[permission]
      }
    }));
  };

  const handleCategorySelectAll = (category) => {
    const categoryPermissions = permissions[category] || {};
    const allSelected = Object.values(categoryPermissions).every(val => val === true);
    
    const availablePermissions = getAvailablePermissions(category);
    setPermissions(prev => ({
      ...prev,
      [category]: availablePermissions.reduce((acc, key) => ({
        ...acc,
        [key]: !allSelected
      }), {})
    }));
  };

  const getAvailablePermissions = (category) => {
    const permissionMap = {
      bookings: ['view_all', 'view_own', 'create', 'edit_all', 'edit_own', 'delete'],
      customers: ['view_all', 'edit_data', 'create_students'],
      payments: ['view_all', 'process'],
      shop: ['view', 'add_items', 'manage'],
      rentals: ['view', 'manage'],
      equipment: ['view', 'manage'],
      services: ['view', 'manage'],
      instructors: ['view', 'manage'],
      finances: ['view', 'manage'],
      settings: ['view', 'manage'],
      roles: ['create', 'assign', 'view_permissions'],
      reports: ['view', 'manage'],
      dashboard: ['admin', 'manager']
    };
    return permissionMap[category] || [];
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
        permissions
      };

      // Only allow name changes for non-system roles
      if (!isSystemRole) {
        updateData.name = formData.name.trim().toLowerCase();
      }

      const response = await fetch(`${API_BASE_URL}/api/roles/${role.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update role');
      }

      onRoleUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const permissionLabels = {
    bookings: 'Bookings',
    customers: 'Customers',
    payments: 'Payments',
    shop: 'Shop',
    rentals: 'Rentals',
    equipment: 'Equipment',
    services: 'Services',
    instructors: 'Instructors',
    finances: 'Finances',
    settings: 'Settings',
    roles: 'Role Management',
    reports: 'Reports',
    dashboard: 'Dashboard Access'
  };

  const actionLabels = {
    view_all: 'View All',
    view_own: 'View Own',
    view: 'View',
    create: 'Create',
    edit_all: 'Edit All',
    edit_own: 'Edit Own',
    edit_data: 'Edit Data',
    delete: 'Delete',
    manage: 'Manage',
    process: 'Process',
    add_items: 'Add Items',
    create_students: 'Create Students',
    assign: 'Assign',
    view_permissions: 'View Permissions',
    admin: 'Admin Dashboard',
    manager: 'Manager Dashboard'
  };

  const getRoleDisplayName = (roleName) => {
    const displayNames = {
      admin: 'Administrator',
      manager: 'Manager',
      receptionist: 'Receptionist',
      instructor: 'Instructor',
      assistant: 'Assistant',
      freelancer: 'Freelancer',
      student: 'Student'
    };
    return displayNames[roleName] || roleName.charAt(0).toUpperCase() + roleName.slice(1);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
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
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-140px)]">
          {/* Main Form */}
          <div className="flex-1 p-6 overflow-y-auto">
            <form onSubmit={handleSubmit}>
              {/* Basic Information */}
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
                      placeholder="e.g., support_agent"
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

              {/* Permissions */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Permissions</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {Object.entries(permissionLabels).map(([category, label]) => {
                    const categoryPermissions = permissions[category] || {};
                    const availablePermissions = getAvailablePermissions(category);
                    
                    return (
                      <div key={category} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-medium text-gray-900">{label}</h4>
                          <button
                            type="button"
                            onClick={() => handleCategorySelectAll(category)}
                            className="text-sm text-green-600 hover:text-green-800"
                          >
                            {availablePermissions.every(perm => categoryPermissions[perm] === true) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        
                        <div className="space-y-2">
                          {availablePermissions.map((permission) => (
                            <label key={permission} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={categoryPermissions[permission] || false}
                                onChange={() => handlePermissionChange(category, permission)}
                                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">
                                {actionLabels[permission] || permission}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}

              {/* Footer */}
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

          {/* Sidebar - Assigned Users */}
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
