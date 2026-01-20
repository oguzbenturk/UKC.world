import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { Card, Spin, Alert, Typography, Button } from 'antd';
import DataService from '@/shared/services/dataService';
// eslint-disable-next-line no-unused-vars
import UserForm from '@/shared/components/ui/UserForm';
// eslint-disable-next-line no-unused-vars
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';

// eslint-disable-next-line no-unused-vars
const { Title } = Typography;

function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id || id === 'undefined') {
        setError('Invalid user ID.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
  const userData = await DataService.getUserById(id); // Ensure this method exists in DataService
        setUser(userData);
        
        // Only fetch roles if the current user is admin/manager (they need it for role dropdown)
        const canManageRoles = currentUser?.role === 'admin' || currentUser?.role === 'manager';
        if (canManageRoles) {
          try {
            const rolesData = await DataService.getRoles();
            setRoles(rolesData || []);
          } catch {
            // Silently fail - roles are only needed for admin/manager
            setRoles([]);
          }
        }

      } catch {
        setError('Failed to load user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id]);
  
  if (loading) {
    return (
      <div className="p-4 md:p-6 flex justify-center items-center min-h-[calc(100vh-120px)]">
        <Spin size="large">
          <div className="p-4">Loading user profile...</div>
        </Spin>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          action={
            <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
          }
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 md:p-6">
        <Alert message="User not found." type="warning" showIcon />
      </div>
    );
  }
  
  return (
    <div className="p-4 md:p-6">
      <Button 
        type="text" 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate(-1)} 
        className="mb-4"
      >
        Back
      </Button>
      <Title level={2} className="mb-6">
        Edit User Profile: {user.name || `${user.first_name} ${user.last_name}`}
      </Title>
      
      <Card variant="outlined" className="shadow-lg">
        <UserForm 
          user={user} // Pass user data to the form
          roles={roles} // Pass roles data to the form
          onSuccess={() => navigate(-1)} // Go back on success
          onCancel={() => navigate(-1)} // Go back on cancel
        />
      </Card>
    </div>
  );
}

export default UserProfilePage;
