// src/features/manager/pages/ManagerCommissionSettings.jsx
import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, InputNumber, Select, Space, Tag, Spin, Empty, Avatar, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  SettingOutlined, 
  EditOutlined, 
  UserOutlined,
  PercentageOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { getAllManagersWithSettings, updateManagerSettings } from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';

const { Option } = Select;

function ManagerCommissionSettings() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedManager, setSelectedManager] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchManagers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAllManagersWithSettings();
      if (response.success) {
        setManagers(response.data || []);
      } else {
        message.error('Failed to load managers');
      }
    } catch (error) {
      message.error(error.message || 'Failed to load managers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  const handleEdit = (manager) => {
    setSelectedManager(manager);
    form.setFieldsValue({
      commissionType: manager.settings?.commissionType || 'flat',
      defaultRate: manager.settings?.defaultRate || 10,
      bookingRate: manager.settings?.bookingRate || null,
      rentalRate: manager.settings?.rentalRate || null
    });
    setEditModalVisible(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      const response = await updateManagerSettings(selectedManager.id, {
        commissionType: values.commissionType,
        defaultRate: values.defaultRate,
        bookingRate: values.commissionType === 'per_category' ? values.bookingRate : null,
        rentalRate: values.commissionType === 'per_category' ? values.rentalRate : null
      });

      if (response.success) {
        message.success('Commission settings saved successfully');
        setEditModalVisible(false);
        fetchManagers();
      } else {
        message.error(response.error || 'Failed to save settings');
      }
    } catch (error) {
      if (!error.errorFields) {
        message.error(error.message || 'Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Manager',
      key: 'manager',
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <Avatar 
            src={record.profileImage} 
            icon={<UserOutlined />}
            size={40}
          />
          <div>
            <div className="font-medium text-gray-800">{record.name}</div>
            <div className="text-sm text-gray-500">{record.email}</div>
          </div>
        </div>
      )
    },
    {
      title: 'Commission Type',
      key: 'commissionType',
      render: (_, record) => {
        const type = record.settings?.commissionType || 'flat';
        const colors = {
          flat: 'blue',
          per_category: 'purple',
          tiered: 'orange'
        };
        const labels = {
          flat: 'Flat Rate',
          per_category: 'Per Category',
          tiered: 'Tiered'
        };
        return (
          <Tag color={colors[type]} icon={<PercentageOutlined />}>
            {labels[type] || type}
          </Tag>
        );
      }
    },
    {
      title: 'Default Rate',
      key: 'defaultRate',
      render: (_, record) => (
        <span className="font-semibold text-blue-600">
          {record.settings?.defaultRate || 10}%
        </span>
      )
    },
    {
      title: 'Category Rates',
      key: 'categoryRates',
      render: (_, record) => {
        if (record.settings?.commissionType !== 'per_category') {
          return <span className="text-gray-400">—</span>;
        }
        return (
          <Space size="small">
            {record.settings?.bookingRate && (
              <Tooltip title="Booking commission">
                <Tag>Booking: {record.settings.bookingRate}%</Tag>
              </Tooltip>
            )}
            {record.settings?.rentalRate && (
              <Tooltip title="Rental commission">
                <Tag>Rental: {record.settings.rentalRate}%</Tag>
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Pending',
      key: 'pending',
      render: (_, record) => (
        <Tooltip title="Pending commission amount">
          <span className="flex items-center gap-1 text-amber-600">
            <ClockCircleOutlined />
            {formatCurrency(record.pendingCommission || 0, 'EUR')}
          </span>
        </Tooltip>
      )
    },
    {
      title: 'Paid',
      key: 'paid',
      render: (_, record) => (
        <Tooltip title="Total paid commission">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircleOutlined />
            {formatCurrency(record.paidCommission || 0, 'EUR')}
          </span>
        </Tooltip>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button 
          type="primary" 
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
          size="small"
        >
          Edit
        </Button>
      )
    }
  ];

  const commissionType = Form.useWatch('commissionType', form);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <SettingOutlined className="text-blue-500" />
            Manager Commission Settings
          </h1>
          <p className="text-gray-600">
            Configure commission rates for each manager. Managers earn commission from completed bookings and rentals.
          </p>
        </div>
      </div>

      <Card className="shadow-sm">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
          </div>
        ) : managers.length === 0 ? (
          <Empty 
            description={
              <span>
                No managers found. <br />
                To add a manager, go to a customer's profile and change their role to "Manager".
              </span>
            }
          />
        ) : (
          <Table 
            columns={columns} 
            dataSource={managers}
            rowKey="id"
            pagination={false}
          />
        )}
      </Card>

      <Modal
        title={
          <div className="flex items-center gap-2">
            <SettingOutlined className="text-blue-500" />
            <span>Edit Commission Settings</span>
          </div>
        }
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={handleSave}>
            Save Settings
          </Button>
        ]}
        width={500}
      >
        {selectedManager && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
            <Avatar 
              src={selectedManager.profileImage} 
              icon={<UserOutlined />}
              size={48}
            />
            <div>
              <div className="font-semibold">{selectedManager.name}</div>
              <div className="text-sm text-gray-500">{selectedManager.email}</div>
            </div>
          </div>
        )}

        <Form form={form} layout="vertical">
          <Form.Item
            name="commissionType"
            label="Commission Type"
            rules={[{ required: true, message: 'Please select commission type' }]}
          >
            <Select>
              <Option value="flat">
                <div className="flex items-center gap-2">
                  <PercentageOutlined />
                  <span>Flat Rate - Same percentage for all revenue</span>
                </div>
              </Option>
              <Option value="per_category">
                <div className="flex items-center gap-2">
                  <DollarOutlined />
                  <span>Per Category - Different rates for bookings/rentals</span>
                </div>
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="defaultRate"
            label="Default Commission Rate (%)"
            rules={[
              { required: true, message: 'Please enter commission rate' },
              { type: 'number', min: 0, max: 100, message: 'Rate must be between 0 and 100' }
            ]}
            extra="This rate applies to all revenue types (or as fallback for per-category)"
          >
            <InputNumber 
              min={0} 
              max={100} 
              step={0.5}
              addonAfter="%" 
              style={{ width: '100%' }}
              placeholder="10"
            />
          </Form.Item>

          {commissionType === 'per_category' && (
            <>
              <Form.Item
                name="bookingRate"
                label="Booking Commission Rate (%)"
                extra="Rate for lesson bookings (leave empty to use default)"
              >
                <InputNumber 
                  min={0} 
                  max={100} 
                  step={0.5}
                  addonAfter="%" 
                  style={{ width: '100%' }}
                  placeholder="Use default"
                />
              </Form.Item>

              <Form.Item
                name="rentalRate"
                label="Rental Commission Rate (%)"
                extra="Rate for equipment rentals (leave empty to use default)"
              >
                <InputNumber 
                  min={0} 
                  max={100} 
                  step={0.5}
                  addonAfter="%" 
                  style={{ width: '100%' }}
                  placeholder="Use default"
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}

export default ManagerCommissionSettings;
