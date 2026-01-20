import React, { useState, useEffect } from 'react';
import apiClient from '@/shared/services/apiClient';

const UserRolePromotion = ({ userId, currentRole, userName, onRoleChanged, onClose }) => {
  const [availableRoles, setAvailableRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAvailableRoles();
  }, []);

  const fetchAvailableRoles = async () => {
    try {
      // Roles matching the database schema
      const roles = [
        { id: 'outsider', name: 'Outsider (Guest)' },
        { id: 'student', name: 'Student' },
        { id: 'trusted_customer', name: 'Trusted Customer' },
        { id: 'instructor', name: 'Instructor' },
        { id: 'manager', name: 'Manager' },
        { id: 'admin', name: 'Admin' }
      ];
      
      // Filter out the current role
      const filteredRoles = roles.filter(role => role.id !== currentRole?.toLowerCase());
      setAvailableRoles(filteredRoles);
      
      if (filteredRoles.length > 0) {
        setSelectedRole(filteredRoles[0].id);
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
      setError('Failed to load available roles');
    }
  };

  const handlePromoteRole = async (e) => {
    e.preventDefault();
    
    if (!selectedRole) {
      setError('Please select a role');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post(`/users/${userId}/promote-role`, {
        role_name: selectedRole
      });

      // Call parent callback to update UI
      if (onRoleChanged) {
        onRoleChanged(response.data);
      }

      // Close the modal
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Error promoting user role:', err);
      setError(err.response?.data?.error || 'Failed to change user role');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Change User Role
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            User: <span className="font-medium">{userName}</span>
          </p>
          <p className="text-sm text-gray-600">
            Current Role: <span className="font-medium capitalize">{currentRole}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handlePromoteRole}>
          <div className="mb-4">
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
              New Role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            >
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !selectedRole}
            >
              {isLoading ? 'Changing...' : 'Change Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserRolePromotion;
