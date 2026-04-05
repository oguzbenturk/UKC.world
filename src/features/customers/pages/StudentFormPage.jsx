// src/pages/StudentFormPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Spin, Alert, Typography, Button } from 'antd';
import DataService from '@/shared/services/dataService';
import UserForm from '@/shared/components/ui/UserForm';

function StudentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNewStudent = !id; // Corrected logic: if id is undefined from useParams, it's a new student.
  
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(!isNewStudent);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // If we're creating a new student, no need to fetch data
    if (isNewStudent) {
      setLoading(false);
      return;
    }
    
    // Make sure id is valid before fetching
    if (!id || id === 'undefined') {      setError('Invalid user ID');
      setLoading(false);
      return;
    }
    
    const fetchStudent = async () => {
      try {
        const data = await dataService.getUserWithStudentRoleById(id);
        setStudent(data);
      } catch (err) {
        console.error('Error fetching user:', err);
        setError('Failed to load user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStudent();
  }, [id, isNewStudent]);
  
  if (!isNewStudent && loading) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="mt-2 text-gray-600">Loading student data...</p>
        </div>
      </div>
    );
  }
  
  if (!isNewStudent && error) {
    return (
      <div className="p-4">
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          action={
            <a onClick={() => navigate('/students')}>Back to Students</a>
          }
        />
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {isNewStudent ? 'Add New Student' : `Edit Student: ${student?.name}`}
        </h1>
      </div>
      
      <Card>
        <UserForm 
          student={isNewStudent ? null : student}
          roles={[]} // Pass roles data when available
          onSuccess={() => navigate('/students')}
          onCancel={() => navigate('/students')}
        />
      </Card>
    </div>
  );
}

export default StudentFormPage;
