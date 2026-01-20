// src/pages/CustomerFormPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Spin, Alert } from 'antd';
import DataService from '@/shared/services/dataService';
import UserForm from '@/shared/components/ui/UserForm';

function CustomerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNewCustomer = !id;

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(!isNewCustomer);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isNewCustomer) {
      setLoading(false);
      return;
    }

    if (!id || id === 'undefined') {
      setError('Invalid customer ID');
      setLoading(false);
      return;
    }

    const fetchCustomer = async () => {
      try {
        const data = await dataService.getCustomerById(id);
        setCustomer(data);
      } catch (err) {
        console.error('Error fetching customer:', err);
        setError('Failed to load customer data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [id, isNewCustomer]);

  if (!isNewCustomer && loading) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="mt-2 text-gray-600">Loading customer data...</p>
        </div>
      </div>
    );
  }

  if (!isNewCustomer && error) {
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
          {isNewCustomer ? 'Add New Customer' : `Edit Customer: ${customer?.name}`}
        </h1>
      </div>

      <Card>
        <UserForm 
          user={isNewCustomer ? null : customer}
          roles={['customer']} // Default role for new customers
          onSuccess={() => navigate('/customers')}
          onCancel={() => navigate('/customers')}
        />
      </Card>
    </div>
  );
}

export default CustomerFormPage;