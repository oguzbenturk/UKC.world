// src/components/InstructorServiceCommission.jsx
import { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react';
import { 
  Table, Form, Input, Select, Button, Spin, 
  Card, Tabs, Modal, InputNumber, Radio, Tag, Typography, 
  Tooltip, Space
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, 
  SaveOutlined, CloseOutlined, InfoCircleOutlined,
  DollarOutlined, PercentageOutlined
} from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { formatCurrency } from '@/shared/utils/formatters';

const { Text } = Typography;
const { Option } = Select;

const InstructorServiceCommission = forwardRef(({ 
  instructorId, 
  onSave = () => {}, 
  onCancel = () => {}
}, ref) => {
  const { apiClient } = useData();
  const { businessCurrency, getCurrencySymbol } = useCurrency();
  const [services, setServices] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('commissions');
  const [defaultCommission, setDefaultCommission] = useState({
    commissionType: 'percentage',
    commissionValue: 50 // Set reasonable default of 50%
  });
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = useCallback(async () => {
    if (!instructorId) {
      message.error('Cannot load commission data: missing instructor information');
      return;
    }
    
    setLoading(true);
    try {      
      // Fetch all services
      const servicesRes = await apiClient.get('/services');
      if (!servicesRes.data) {
        message.warning('No services returned from API');
      }
      setServices(servicesRes.data || []);
      
      // Fetch commission data directly (this includes service details)
      const commissionsRes = await apiClient.get(`/instructor-commissions/instructors/${instructorId}/commissions`);
      const commissionData = commissionsRes.data || {};
      
      if (commissionsRes.data && commissionsRes.data.defaultCommission) {
        setDefaultCommission({
          commissionType: commissionsRes.data.defaultCommission.type || 'fixed',
          commissionValue: commissionsRes.data.defaultCommission.value || 50
        });
      } else {
        // If no default commission exists, set UI defaults to fixed €50/hour
        setDefaultCommission({
          commissionType: 'fixed',
          commissionValue: 50
        });
      }
      
      // Use the commissions data directly from the API
      // The backend already provides service details with commission data
      const instructorCommissions = (commissionData.commissions || []).map(commission => {
        return {
          key: commission.serviceId,
          serviceId: commission.serviceId,
          serviceName: commission.serviceName,
          serviceCategory: commission.serviceCategory,
          serviceLevel: commission.serviceLevel,
          commissionType: commission.commissionType,
          commissionValue: commission.commissionValue,
        };
      });
      
      setCommissions(instructorCommissions);
      
      if (instructorCommissions.length === 0) {
        message.info('No service commissions found for this instructor. You can add them using the "Add Commission" button.');
      }
      
    } catch (error) {
      message.error(`Failed to load commission data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiClient, instructorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refreshData: fetchData
  }));

  const isEditing = (record) => record.key === editingKey;

  const edit = (record) => {
    if (!record || !record.serviceId) {
      message.error('Cannot edit this commission: missing service information');
      return;
    }
    
    // Set all fields from the record to the form, ensuring serviceId is included
    form.setFieldsValue({
      serviceId: record.serviceId,
      key: record.key,
      serviceName: record.serviceName,
      serviceCategory: record.serviceCategory,
      serviceLevel: record.serviceLevel,
      commissionType: record.commissionType || 'percentage',
      commissionValue: record.commissionValue || 0,
    });
    
    // Set the editingKey to the record's key to enable editing mode
    setEditingKey(record.key);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = async (key) => {
    try {
      const row = await form.validateFields();
      
      // Find the original record to get the serviceId
      const originalRecord = commissions.find(item => item.key === key);
      if (!originalRecord) {
        message.error('Failed to save commission: record not found');
        return;
      }
      
      // Make sure we have the serviceId
      if (!row.serviceId && originalRecord.serviceId) {
        row.serviceId = originalRecord.serviceId;
      }
      
      // Double check that we have a serviceId
      if (!row.serviceId) {
        message.error('Failed to save commission: service ID is missing');
        return;
      }
      
      const newData = [...commissions];
      const index = newData.findIndex((item) => key === item.key);
      
      if (index > -1) {
        const item = newData[index];
        // Create updated item with serviceId explicitly preserved
        const updatedItem = { 
          ...item, 
          ...row,
          serviceId: row.serviceId, // Ensure we keep the serviceId
          key: key // Make sure key is retained
        };
        newData.splice(index, 1, updatedItem);
        setCommissions(newData);
        setEditingKey('');
      } else {
        newData.push({...row, key: row.serviceId});
        setCommissions(newData);
        setEditingKey('');
      }
        try {
        // Double check that we have a serviceId for the API call
        if (!row.serviceId) {
          message.error('Cannot update: service ID is missing');
          return;
        }
        
        // Explicitly log the API endpoint for debugging
        const apiEndpoint = `/instructor-commissions/instructors/${instructorId}/commissions/${row.serviceId}`;
        
  await apiClient.put(apiEndpoint, {
          commissionType: row.commissionType,
          commissionValue: row.commissionValue,
        });
        
        message.success('Commission updated successfully');
        
        // Trigger parent refresh to update all instructor data
        onSave();
      } catch (error) {
        message.error(`Failed to save commission: ${error.response?.data?.error || error.message}`);
      }
  } catch {
      message.error('Validation failed. Please check your inputs.');
    }
  };

  const handleDelete = useCallback(async (serviceId) => {
    if (!serviceId) {
      message.error('Cannot delete commission: missing service information');
      return;
    }
    
  setDeleteTarget(serviceId);
  }, []);
  const handleAdd = useCallback(() => {
    // Use the existing form instance instead of creating a new one
    
    // Initialize form with default values
    form.setFieldsValue({
      commissionType: 'percentage',
      commissionValue: 0
    });
  setAddModalVisible(true);
  }, [form]);
  
  const handleSaveDefaultCommission = useCallback(async () => {
    try {
      await apiClient.put(`/instructor-commissions/instructors/${instructorId}/default-commission`, defaultCommission);
      message.success('Default commission updated successfully');
      
      // Trigger parent refresh to update all instructor data
      onSave();
    } catch {
      message.error('Failed to update default commission');
    }
  }, [apiClient, instructorId, defaultCommission, onSave]);

  // Calculate estimated earnings with useMemo to avoid recalculation on every render
  const getEstimatedEarnings = useMemo(() => {
    return (record) => {
      if (!record || !record.serviceId) return 'N/A';
      
      const service = services.find(s => s.id === record.serviceId);
      if (!service) return 'N/A';
      
      const price = service.price || 0;
      const duration = service.duration || 1; // Duration in hours
      let estimated = 0;
      
      if (record.commissionType === 'percentage' && record.commissionValue !== undefined) {
        estimated = price * (record.commissionValue / 100);
      } else if (record.commissionType === 'fixed_per_lesson' && record.commissionValue !== undefined) {
        // Fixed per lesson - flat rate regardless of duration
        estimated = record.commissionValue;
      } else if (record.commissionValue !== undefined) {
        // 'fixed' or 'fixed_per_hour' - multiply by duration (per hour rate)
        estimated = record.commissionValue * duration;
      }

      return formatCurrency(estimated, service.currency || businessCurrency || 'EUR');
    };
  }, [services, businessCurrency]);

  const columns = [
    {
      title: 'Service Name',
      dataIndex: 'serviceName',
      key: 'serviceName',
      editable: false,
      render: (text, record) => (
        <span>
          {text}
          <Tag color="blue" style={{ marginLeft: 8 }}>{record.serviceCategory}</Tag>
          <Tag color="green">{record.serviceLevel}</Tag>
        </span>
      ),
    },
    {
      title: 'Commission Type',
      dataIndex: 'commissionType',
      key: 'commissionType',
      editable: true,
      width: '20%',
      render: (text) => (
        <span>
          {text === 'percentage' ? (
            <Tag color="blue" icon={<PercentageOutlined />}>Percentage</Tag>
          ) : (
            <Tag color="green" icon={<DollarOutlined />}>Fixed Amount</Tag>
          )}
        </span>
      ),
    },
    {
      title: 'Value',
      dataIndex: 'commissionValue',
      key: 'commissionValue',
      editable: true,
      width: '15%',
      render: (text, record) => (
        <span>
          {record.commissionType === 'percentage'
            ? `${text}%`
            : formatCurrency(Number(text || 0), businessCurrency || 'EUR')}
        </span>
      ),
    },
    {
      title: 'Est. Earnings',
      key: 'estimatedEarnings',
      width: '15%',
      render: (_, record) => getEstimatedEarnings(record),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '15%',
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <span>
            <Button
              icon={<SaveOutlined />}
              type="link"
              onClick={() => save(record.key)}
              style={{ marginRight: 8 }}
            >
              Save
            </Button>
            <Button icon={<CloseOutlined />} type="link" onClick={cancel}>
              Cancel
            </Button>
          </span>
        ) : (
          <span>
            <Button
              disabled={editingKey !== ''}
              icon={<EditOutlined />}
              type="link"
              onClick={() => edit(record)}
              style={{ marginRight: 8 }}
            >
              Edit
            </Button>
            <Button
              disabled={editingKey !== ''}
              icon={<DeleteOutlined />}
              type="link"
              danger
              onClick={() => handleDelete(record.serviceId)}
            >
              Delete
            </Button>
          </span>
        );
      },
    },
  ];

  const mergedColumns = columns.map((col) => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record) => ({
        record,
        inputType: col.dataIndex === 'commissionType' ? 'select' : 'number',
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
      }),
    };
  });

  const EditableCell = useCallback(({ 
    editing,
    dataIndex,
    title,
    inputType,
    children,
    ...restProps
  }) => {
    let inputNode;
    
    if (inputType === 'select') {
      inputNode = (
        <Select>
          <Option value="percentage">Percentage</Option>
          <Option value="fixed">Fixed Amount</Option>
        </Select>
      );
    } else {
      // Get commission type from form or use percentage as fallback
      const isPercentage = form.getFieldValue('commissionType') === 'percentage';
      inputNode = (
        <InputNumber
          min={0}
          max={isPercentage ? 100 : undefined}
          addonAfter={isPercentage ? '%' : getCurrencySymbol(businessCurrency || 'EUR')}
        />
      );
    }
    
    return (
      <td {...restProps}>
        {editing ? (
          <Form.Item
            name={dataIndex}
            style={{ margin: 0 }}
            rules={[
              {
                required: true,
                message: `Please Input ${title}!`,
              },
            ]}
          >
            {inputNode}
          </Form.Item>
        ) : (
          children
        )}
      </td>
    );
  }, [form, businessCurrency, getCurrencySymbol]);

  const tabItems = useMemo(() => [
    {
      key: 'commissions',
      label: 'Service Commissions',
      children: (
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Service Commissions</span>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
                disabled={editingKey !== ''}
              >
                Add Service Commissions
              </Button>
            </div>
          }
          variant="outlined"
        >
          <Spin spinning={loading}>
            <Form form={form} component={false}>
              <Table
                components={{
                  body: { cell: EditableCell },
                }}
                bordered
                dataSource={commissions}
                columns={mergedColumns}
                rowClassName="editable-row"
                pagination={false}
                rowKey="key"
                locale={{
                  emptyText: (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <DollarOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
                      <div style={{ fontSize: '16px', color: '#595959', marginBottom: '8px' }}>
                        No Service Commissions Set
                      </div>
                      <div style={{ fontSize: '14px', color: '#8c8c8c', marginBottom: '16px' }}>
                        This instructor doesn't have any specific service commission rates configured.
                        <br />
                        Add commission rates to track earnings for different services.
                      </div>
                      <Button 
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={handleAdd}
                        size="small"
                      >
                        Add First Commissions
                      </Button>
                    </div>
                  )
                }}
              />
              {/* Delete confirmation */}
  <Modal
                title="Confirm Delete"
                open={!!deleteTarget}
                onCancel={() => setDeleteTarget(null)}
                onOk={async () => {
                  if (!deleteTarget) return;
                  try {
        await apiClient.delete(`/instructor-commissions/instructors/${instructorId}/commissions/${deleteTarget}`);
                    setCommissions(commissions.filter(item => item.serviceId !== deleteTarget));
                    message.success('Commission removed successfully');
                    onSave();
                  } catch {
                    message.error('Failed to delete commission');
                  } finally {
                    setDeleteTarget(null);
                  }
                }}
                okButtonProps={{ danger: true }}
              >
                This will reset to the default commission settings. Are you sure?
              </Modal>
              {/* Hidden Form Fields to ensure critical data is always in the form */}
              {editingKey !== '' && (
                <div style={{ display: 'none' }}>
                  <Form.Item name="serviceId">
                    <Input />
                  </Form.Item>
                  <Form.Item name="key">
                    <Input />
                  </Form.Item>
                </div>
              )}
            </Form>
          </Spin>
        </Card>
      )
    },
    {
      key: 'default',
      label: 'Default Commission',
      children: (
        <Card title="Default Commission Settings" variant="outlined">
          <Spin spinning={loading}>
            <div style={{ maxWidth: '500px', margin: '0 auto' }}>
              <Text type="secondary">
                These settings will be applied to all services that don't have specific commission rules.
              </Text>
              
              <div style={{ marginTop: 20 }}>
                <Form layout="vertical">
                  <Form.Item label="Commission Type">
                    <Radio.Group
                      value={defaultCommission.commissionType}
                      onChange={(e) => setDefaultCommission({
                        ...defaultCommission,
                        commissionType: e.target.value,
                      })}
                    >
                      <Radio value="fixed">
                        <Space>
                          Fixed Rate (per hour)
                          <Tooltip title="Instructor earns a fixed hourly rate (e.g., €50/hour)">
                            <InfoCircleOutlined />
                          </Tooltip>
                        </Space>
                      </Radio>
                      <Radio value="percentage">
                        <Space>
                          Percentage
                          <Tooltip title="Instructor earns a percentage of the service price">
                            <InfoCircleOutlined />
                          </Tooltip>
                        </Space>
                      </Radio>
                    </Radio.Group>
                  </Form.Item>
                  
                  <Form.Item label="Value">
                    <InputNumber
                      min={0}
                      max={defaultCommission.commissionType === 'percentage' ? 100 : undefined}
                      value={defaultCommission.commissionValue}
                      onChange={(value) => setDefaultCommission({
                        ...defaultCommission,
                        commissionValue: value,
                      })}
                      addonAfter={defaultCommission.commissionType === 'percentage' ? '%' : getCurrencySymbol(businessCurrency || 'EUR')}
                      style={{ width: '200px' }}
                      placeholder={defaultCommission.commissionType === 'fixed' ? '50' : '50'}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary">
                        {defaultCommission.commissionType === 'fixed' 
                          ? 'Fixed hourly rate (recommended: €40-60/hour)'
                          : 'Percentage of the lesson price (recommended: 40-60%)'
                        }
                      </Text>
                    </div>
                  </Form.Item>
                  
                  <Form.Item>
                    <Button
                      type="primary"
                      onClick={handleSaveDefaultCommission}
                      icon={<SaveOutlined />}
                    >
                      Save Default Commission
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            </div>
          </Spin>
        </Card>
      )
    }
  // Dependencies include all referenced values to satisfy hooks lint
  ], [commissions, loading, editingKey, form, mergedColumns, defaultCommission, handleAdd, handleSaveDefaultCommission, onSave, deleteTarget, apiClient, instructorId, EditableCell, businessCurrency, getCurrencySymbol]);

  return (
    <div className="instructor-service-commission">
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={tabItems}
      />
      {/* Add Commission Modal */}
      <Modal
        title="Add Service Commissions"
        open={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            const ids = Array.isArray(values.serviceIds) ? values.serviceIds : [];
            if (!ids.length) {
              message.error('Please select at least one service');
              return;
            }

            const commissionType = values.commissionType || 'percentage';
            const commissionValue = values.commissionValue || 0;

            // Prepare API calls for each selected service
            const tasks = ids.map((id) => {
              const svc = services.find((s) => s.id === id);
              if (!svc) return Promise.resolve({ ok: false, id });
              return apiClient
                .post(`/instructor-commissions/instructors/${instructorId}/commissions`, {
                  serviceId: id,
                  commissionType,
                  commissionValue,
                })
                .then(() => ({ ok: true, id, svc }))
                .catch(() => ({ ok: false, id, svc }));
            });

            const results = await Promise.all(tasks);
            const successes = results.filter((r) => r.ok);
            const failures = results.filter((r) => !r.ok);

            if (successes.length) {
              // Add new commissions to local state
              setCommissions((prev) => [
                ...prev,
                ...successes.map(({ id, svc }) => ({
                  key: id,
                  serviceId: id,
                  serviceName: svc.name,
                  serviceCategory: svc.category,
                  serviceLevel: svc.level,
                  commissionType,
                  commissionValue,
                })),
              ]);
              message.success(`Added commissions for ${successes.length} service(s)`);
            }
            if (failures.length) {
              message.warning(`${failures.length} service(s) failed`);
            }

            if (successes.length) onSave();
            if (results.length) setAddModalVisible(false);
          } catch {
            // validation or API error is shown via message already
          }
        }}
        destroyOnHidden
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="serviceIds"
            label="Select Services"
            rules={[{ required: true, message: 'Please select at least one service' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select one or more services"
              showSearch
              optionFilterProp="children"
              maxTagCount="responsive"
            >
              {services
                .filter((service) => !commissions.some((c) => c.serviceId === service.id))
                .map((service) => (
                  <Option key={service.id} value={service.id}>
                    {service.name} - {service.category} - {service.level}
                  </Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item name="commissionType" label="Commission Type" initialValue="fixed">
            <Radio.Group>
              <Radio value="fixed">Fixed Rate (per hour)</Radio>
              <Radio value="percentage">Percentage (%)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item 
            name="commissionValue" 
            label="Commission Value" 
            initialValue={50}
            rules={[
              { required: true, message: 'Please enter a commission value' },
              { type: 'number', min: 0, message: 'Commission value must be positive' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const commissionType = getFieldValue('commissionType');
                  if (commissionType === 'percentage' && value > 100) {
                    return Promise.reject(new Error('Percentage cannot exceed 100%'));
                  }
                  if (commissionType === 'fixed' && value > 10000) {
                    return Promise.reject(new Error('Fixed amount seems unreasonably high'));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <InputNumber
              min={0}
              max={form.getFieldValue('commissionType') === 'percentage' ? 100 : undefined}
              addonAfter={form.getFieldValue('commissionType') === 'percentage' ? '%' : getCurrencySymbol(businessCurrency || 'EUR')}
              placeholder="Enter commission value"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
      
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button onClick={onCancel} style={{ marginRight: 8 }}>
          Cancel
        </Button>
        <Button type="primary" onClick={onSave}>
          Done
        </Button>
      </div>
    </div>
  );
});

export default InstructorServiceCommission;
