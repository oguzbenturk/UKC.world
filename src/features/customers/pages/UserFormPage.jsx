// src/pages/UserFormPage.jsx
import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Spin, Alert } from 'antd';
import DataService from '@/shared/services/dataService';
import UserForm from '@/shared/components/ui/UserForm';
import { DataContext } from '@/shared/contexts/DataContext';
import apiClient from '@/shared/services/apiClient';

function UserFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dataContext = useContext(DataContext);
  const isNewUser = !id; // Corrected logic: if id is undefined from useParams, it's a new user.
  
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(!isNewUser);
  const [error, setError] = useState(null);

  const handleSuccess = () => {
    // Navigate back immediately so the form closes without delay
    navigate('/customers', { state: { userCreated: true } });

    // Refresh data in the background; failures are logged silently
    if (dataContext?.refreshData) {
      Promise.resolve(dataContext.refreshData()).catch(() => undefined);
    }
  };
  
  // Fetch roles on component mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await apiClient.get('/roles');
        setRoles(response.data || []);
      } catch (error) {
        // Failed to fetch roles - form will use empty array
        setRoles([]);
      }
    };
    
    fetchRoles();
  }, []);
  
  useEffect(() => {
    // If we're creating a new user, no need to fetch user data
    if (isNewUser) {
      setLoading(false);
      return;
    }
    
    // Make sure id is valid before fetching
    if (!id || id === 'undefined') {
      setError('Invalid user ID');
      setLoading(false);
      return;
    }
    
  const fetchUser = async () => {
      try {
    const data = await DataService.getUserWithStudentRoleById(id);
        setUser(data);
  } catch {
        setError('Failed to load user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUser();
  }, [id, isNewUser]);
  
  if (!isNewUser && loading) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="mt-2 text-gray-600">Loading user data...</p>
        </div>
      </div>
    );
  }
  
  if (!isNewUser && error) {
    return (
      <div className="p-4">
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          action={
            <a onClick={() => navigate('/customers')}>Back to Customers</a>
          }
        />
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {isNewUser ? 'Add New User' : `Edit User: ${user?.first_name} ${user?.last_name}`}
        </h1>
      </div>
      
      <Card>
        <UserForm 
          user={isNewUser ? null : user}
          roles={roles}
          onSuccess={handleSuccess}
          onCancel={() => navigate('/customers')}
        />
      </Card>
    </div>
  );
}

export default UserFormPage;
