// src/features/admin/CreateRoleModal.jsx
import { useState } from 'react';
import { API_BASE_URL } from '../../config/api';
const CreateRoleModal = ({ onClose, onRoleCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [permissions, setPermissions] = useState({
    bookings: {
      view_all: false,
      view_own: true,
      create: false,
      edit_all: false,
      edit_own: false,
      delete: false
    },
    customers: {
      view_all: false,
      edit_data: false,
      create_students: false
    },
    payments: {
      view_all: false,
      process: false
    },
    shop: {
      view: true,
      add_items: false,
      manage: false
    },
    rentals: {
      view: false,
      manage: false
    },
    equipment: {
      view: false,
      manage: false
    },
    services: {
      view: true,
      manage: false
    },
    instructors: {
      view: true,
      manage: false
    },
    finances: {
      view: false,
      manage: false
    },
    settings: {
      view: false,
      manage: false
    },
    roles: {
      create: false,
      assign: false,
      view_permissions: false
    },
    reports: {
      view: false,
      manage: false
    },
    dashboard: {
      admin: false,
      manager: false
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        [permission]: !prev[category][permission]
      }
    }));
  };

  const handleCategorySelectAll = (category) => {
    setPermissions(prev => {
      const allSelected = Object.values(prev[category]).every(val => val === true);
      const updated = Object.keys(prev[category]).reduce((acc, key) => {
        acc[key] = !allSelected;
        return acc;
      }, {});
      return {
        ...prev,
        [category]: updated
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Role name is required');
      return;
    }

    if (!formData.description.trim()) {
      setError('Role description is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/roles`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name.trim().toLowerCase(),
          description: formData.description.trim(),
          permissions
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create role');
      }

      onRoleCreated();
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Create New Role</h2>
            <button
              onClick={onClose}
              className="text-blue-200 hover:text-white transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit}>
            {/* Basic Information */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., support_agent"
                    required
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                {Object.entries(permissions).map(([category, categoryPermissions]) => (
                  <div key={category} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-gray-900">{permissionLabels[category]}</h4>
                      <button
                        type="button"
                        onClick={() => handleCategorySelectAll(category)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        {Object.values(categoryPermissions).every(val => val === true) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {Object.entries(categoryPermissions).map(([permission, enabled]) => (
                        <label key={permission} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handlePermissionChange(category, permission)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">
                            {actionLabels[permission] || permission}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
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
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateRoleModal;
