// src/features/admin/RoleManagement.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../shared/hooks/useAuth';
import { hasPermission } from '../../shared/utils/roleUtils';
import CreateRoleModal from './CreateRoleModal';
import RoleEditor from './RoleEditor';
import { API_BASE_URL } from '../../config/api';
const RoleManagement = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  // Check if user has permission to manage roles
  if (!user || !hasPermission(user.role, ['admin'])) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access role management.</p>
        </div>
      </div>
    );
  }

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/roles`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }

      const data = await response.json();
      setRoles(data.data);
    } catch (err) {
      setError('Failed to load roles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setShowCreateModal(true);
  };

  const handleEditRole = (role) => {
    setSelectedRole(role);
    setShowEditor(true);
  };

  const handleDeleteRole = async (roleId, roleName) => {
    if (!window.confirm(`Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/roles/${roleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete role');
      }

      await fetchRoles(); // Refresh the list
      alert('Role deleted successfully');
    } catch (err) {
      alert('Failed to delete role: ' + err.message);
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
      student: 'Student'
    };
    return displayNames[roleName] || roleName.charAt(0).toUpperCase() + roleName.slice(1);
  };

  const getRoleBadgeColor = (roleName) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      manager: 'bg-purple-100 text-purple-800',
      receptionist: 'bg-blue-100 text-blue-800',
      instructor: 'bg-green-100 text-green-800',
      assistant: 'bg-yellow-100 text-yellow-800',
      freelancer: 'bg-orange-100 text-orange-800',
      student: 'bg-gray-100 text-gray-800'
    };
    return colors[roleName] || 'bg-gray-100 text-gray-800';
  };

  const getPermissionCount = (permissions) => {
    if (!permissions || typeof permissions !== 'object') return 0;
    
    let count = 0;
    Object.values(permissions).forEach(permissionGroup => {
      if (typeof permissionGroup === 'object') {
        count += Object.values(permissionGroup).filter(val => val === true).length;
      }
    });
    return count;
  };

  const isSystemRole = (roleName) => {
    const systemRoles = ['admin', 'manager', 'receptionist', 'instructor', 'assistant', 'freelancer', 'student'];
    return systemRoles.includes(roleName);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-600">Loading roles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Role Management</h1>
              <p className="text-gray-600 mt-2">Manage user roles and permissions</p>
            </div>
            <button
              onClick={handleCreateRole}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200"
            >
              Create New Role
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map((role) => (
            <div key={role.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(role.name)}`}>
                    {getRoleDisplayName(role.name)}
                  </span>
                  {isSystemRole(role.name) && (
                    <span className="ml-2 inline-block px-2 py-1 rounded text-xs bg-gray-200 text-gray-600">
                      System
                    </span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditRole(role)}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                  >
                    Edit
                  </button>
                  {!isSystemRole(role.name) && (
                    <button
                      onClick={() => handleDeleteRole(role.id, role.name)}
                      className="text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {getRoleDisplayName(role.name)}
              </h3>
              
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                {role.description || 'No description provided'}
              </p>

              <div className="flex justify-between items-center text-sm text-gray-500">
                <span>{getPermissionCount(role.permissions)} permissions</span>
                <span>Created {new Date(role.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>

        {roles.length === 0 && !loading && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM9 9a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No roles found</h3>
            <p className="text-gray-600 mb-6">Get started by creating your first role.</p>
            <button
              onClick={handleCreateRole}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Create Role
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateRoleModal
          onClose={() => setShowCreateModal(false)}
          onRoleCreated={() => {
            fetchRoles();
            setShowCreateModal(false);
          }}
        />
      )}

      {showEditor && selectedRole && (
        <RoleEditor
          role={selectedRole}
          onClose={() => {
            setShowEditor(false);
            setSelectedRole(null);
          }}
          onRoleUpdated={() => {
            fetchRoles();
            setShowEditor(false);
            setSelectedRole(null);
          }}
        />
      )}
    </div>
  );
};

export default RoleManagement;
