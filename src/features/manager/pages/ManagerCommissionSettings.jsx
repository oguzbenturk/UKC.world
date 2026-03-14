// src/features/manager/pages/ManagerCommissionSettings.jsx
import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, InputNumber, Select, Space, Tag, Spin, Empty, Avatar, Tooltip, Radio, Divider, Row, Col, Statistic } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  SettingOutlined, 
  EditOutlined, 
  UserOutlined,
  PercentageOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  TeamOutlined,
  BarChartOutlined,
  RiseOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const navigate = useNavigate();
  const location = useLocation();

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

  // Handle edit trigger from manager profile page via navigation state
  useEffect(() => {
    if (location.state?.editManagerId && managers.length > 0) {
      const mgr = managers.find(m => m.id === location.state.editManagerId);
      if (mgr) {
        handleEdit(mgr);
        // Clear the state so it doesn't re-trigger
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, managers]);

  const handleEdit = (manager) => {
    setSelectedManager(manager);
    form.setFieldsValue({
      salaryType: manager.settings?.salaryType || 'commission',
      commissionType: manager.settings?.commissionType || 'flat',
      defaultRate: manager.settings?.defaultRate || 10,
      bookingRate: manager.settings?.bookingRate || null,
      rentalRate: manager.settings?.rentalRate || null,
      accommodationRate: manager.settings?.accommodationRate || null,
      packageRate: manager.settings?.packageRate || null,
      shopRate: manager.settings?.shopRate || null,
      membershipRate: manager.settings?.membershipRate || null,
      fixedSalaryAmount: manager.settings?.fixedSalaryAmount || null,
      perLessonAmount: manager.settings?.perLessonAmount || null
    });
    setEditModalVisible(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const isCommission = values.salaryType === 'commission';
      const isPerCategory = isCommission && values.commissionType === 'per_category';
      
      const response = await updateManagerSettings(selectedManager.id, {
        salaryType: values.salaryType,
        commissionType: isCommission ? values.commissionType : 'flat',
        defaultRate: isCommission ? values.defaultRate : 0,
        bookingRate: isPerCategory ? values.bookingRate : null,
        rentalRate: isPerCategory ? values.rentalRate : null,
        accommodationRate: isPerCategory ? values.accommodationRate : null,
        packageRate: isPerCategory ? values.packageRate : null,
        shopRate: isPerCategory ? values.shopRate : null,
        membershipRate: isPerCategory ? values.membershipRate : null,
        fixedSalaryAmount: values.salaryType === 'monthly_salary' ? values.fixedSalaryAmount : null,
        perLessonAmount: values.salaryType === 'fixed_per_lesson' ? values.perLessonAmount : null
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

  const navigateToProfile = (record) => {
    navigate(`/admin/manager-profile/${record.id}`, {
      state: {
        managerName: record.name,
        managerEmail: record.email,
        managerImage: record.profileImage
      }
    });
  };

  const columns = [
    {
      title: 'Manager',
      key: 'manager',
      render: (_, record) => (
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => navigateToProfile(record)}
        >
          <Avatar 
            src={record.profileImage} 
            icon={<UserOutlined />}
            size={40}
            className="group-hover:ring-2 group-hover:ring-blue-400 transition-all"
          />
          <div>
            <div className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{record.name}</div>
            <div className="text-sm text-gray-500">{record.email}</div>
          </div>
        </div>
      )
    },
    {
      title: 'Salary Type',
      key: 'salaryType',
      render: (_, record) => {
        const type = record.settings?.salaryType || 'commission';
        const map = {
          commission: { color: 'blue', icon: <PercentageOutlined />, label: 'Commission' },
          fixed_per_lesson: { color: 'green', icon: <DollarOutlined />, label: 'Per Lesson' },
          monthly_salary: { color: 'purple', icon: <DollarOutlined />, label: 'Monthly Salary' }
        };
        const info = map[type] || map.commission;
        return <Tag color={info.color} icon={info.icon}>{info.label}</Tag>;
      }
    },
    {
      title: 'Rate / Amount',
      key: 'rateAmount',
      render: (_, record) => {
        const s = record.settings || {};
        const type = s.salaryType || 'commission';
        if (type === 'monthly_salary') {
          return <span className="font-semibold text-purple-600">{formatCurrency(s.fixedSalaryAmount || 0, 'EUR')}/mo</span>;
        }
        if (type === 'fixed_per_lesson') {
          return <span className="font-semibold text-green-600">{formatCurrency(s.perLessonAmount || 0, 'EUR')}/lesson</span>;
        }
        return <span className="font-semibold text-blue-600">{s.defaultRate || 10}%</span>;
      }
    },
    {
      title: 'Category Rates',
      key: 'categoryRates',
      render: (_, record) => {
        const s = record.settings || {};
        if (s.salaryType !== 'commission' || s.commissionType !== 'per_category') {
          return <span className="text-gray-400">—</span>;
        }
        const rates = [
          { key: 'bookingRate', label: 'Booking' },
          { key: 'rentalRate', label: 'Rental' },
          { key: 'accommodationRate', label: 'Accommodation' },
          { key: 'packageRate', label: 'Package' },
          { key: 'shopRate', label: 'Shop' },
          { key: 'membershipRate', label: 'Membership' }
        ].filter(r => s[r.key]);
        return (
          <Space size="small" wrap>
            {rates.map(r => (
              <Tooltip key={r.key} title={`${r.label} commission`}>
                <Tag>{r.label}: {s[r.key]}%</Tag>
              </Tooltip>
            ))}
          </Space>
        );
      }
    },
    {
      title: 'Total Earnings',
      key: 'totalEarnings',
      render: (_, record) => {
        const total = (record.pendingCommission || 0) + (record.paidCommission || 0);
        return (
          <span className="font-semibold text-gray-800">
            {formatCurrency(total, 'EUR')}
          </span>
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
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="View Profile">
            <Button
              icon={<UserOutlined />}
              onClick={() => navigateToProfile(record)}
              size="small"
            >
              Profile
            </Button>
          </Tooltip>
          <Tooltip title="Edit Settings">
            <Button 
              type="primary" 
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); handleEdit(record); }}
              size="small"
            >
              Edit
            </Button>
          </Tooltip>
          <Tooltip title="View Payroll">
            <Button
              icon={<BarChartOutlined />}
              onClick={(e) => { e.stopPropagation(); navigate(`/admin/manager-payroll/${record.id}`); }}
              size="small"
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  const commissionType = Form.useWatch('commissionType', form);
  const salaryType = Form.useWatch('salaryType', form);

  // Summary calculations
  const totalPending = managers.reduce((sum, m) => sum + (m.pendingCommission || 0), 0);
  const totalPaid = managers.reduce((sum, m) => sum + (m.paidCommission || 0), 0);
  const totalEarnings = totalPending + totalPaid;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <SettingOutlined className="text-blue-500" />
            Manager Commission Settings
          </h1>
          <p className="text-gray-600">
            Configure commission rates for each manager. Click on a manager to view their full profile.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      {!loading && managers.length > 0 && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card className="shadow-sm border-l-4 border-l-blue-400">
              <Statistic
                title={<span className="flex items-center gap-1"><TeamOutlined /> Total Managers</span>}
                value={managers.length}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card className="shadow-sm border-l-4 border-l-green-400">
              <Statistic
                title={<span className="flex items-center gap-1"><CheckCircleOutlined /> Total Paid</span>}
                value={totalPaid}
                precision={2}
                prefix="€"
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card className="shadow-sm border-l-4 border-l-amber-400">
              <Statistic
                title={<span className="flex items-center gap-1"><ClockCircleOutlined /> Total Pending</span>}
                value={totalPending}
                precision={2}
                prefix="€"
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>
      )}

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
            scroll={{ x: 900 }}
            onRow={(record) => ({
              onClick: () => navigateToProfile(record),
              className: 'cursor-pointer hover:bg-blue-50 transition-colors'
            })}
          />
        )}
      </Card>

      <Modal
        title={
          <div className="flex items-center gap-2">
            <SettingOutlined className="text-blue-500" />
            <span>Edit Salary & Commission Settings</span>
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
        width={600}
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
            name="salaryType"
            label="Salary Type"
            rules={[{ required: true, message: 'Please select salary type' }]}
          >
            <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
              <Radio.Button value="commission" style={{ width: '33.33%', textAlign: 'center' }}>
                Commission %
              </Radio.Button>
              <Radio.Button value="fixed_per_lesson" style={{ width: '33.33%', textAlign: 'center' }}>
                Per Lesson €
              </Radio.Button>
              <Radio.Button value="monthly_salary" style={{ width: '33.33%', textAlign: 'center' }}>
                Monthly Salary
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {salaryType === 'monthly_salary' && (
            <Form.Item
              name="fixedSalaryAmount"
              label="Monthly Salary Amount (€)"
              rules={[
                { required: true, message: 'Please enter monthly salary amount' },
                { type: 'number', min: 0, message: 'Amount must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={50}
                addonAfter="€"
                style={{ width: '100%' }}
                placeholder="e.g. 2000"
              />
            </Form.Item>
          )}

          {salaryType === 'fixed_per_lesson' && (
            <Form.Item
              name="perLessonAmount"
              label="Amount Per Lesson (€)"
              rules={[
                { required: true, message: 'Please enter per-lesson amount' },
                { type: 'number', min: 0, message: 'Amount must be positive' }
              ]}
              extra="Manager earns this fixed amount for each completed lesson/booking"
            >
              <InputNumber
                min={0}
                step={5}
                addonAfter="€"
                style={{ width: '100%' }}
                placeholder="e.g. 25"
              />
            </Form.Item>
          )}

          {salaryType === 'commission' && (
            <>
              <Divider plain>Commission Configuration</Divider>

              <Form.Item
                name="commissionType"
                label="Commission Type"
                rules={[{ required: true, message: 'Please select commission type' }]}
              >
                <Select>
                  <Option value="flat">
                    <div className="flex items-center gap-2">
                      <PercentageOutlined />
                      <span>Flat Rate — Same % for all revenue</span>
                    </div>
                  </Option>
                  <Option value="per_category">
                    <div className="flex items-center gap-2">
                      <DollarOutlined />
                      <span>Per Category — Different % per revenue type</span>
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
                extra={commissionType === 'per_category' 
                  ? 'Fallback rate for categories without a specific rate'
                  : 'This rate applies to all revenue types'}
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
                  <Divider plain>Category Rates</Divider>
                  <p className="text-gray-500 text-sm mb-4">
                    Leave empty to use the default rate above.
                  </p>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="bookingRate" label="Booking Rate (%)">
                        <InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} placeholder="Default" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="rentalRate" label="Rental Rate (%)">
                        <InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} placeholder="Default" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="accommodationRate" label="Accommodation Rate (%)">
                        <InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} placeholder="Default" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="shopRate" label="Shop/Sales Rate (%)">
                        <InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} placeholder="Default" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="membershipRate" label="Membership Rate (%)">
                        <InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} placeholder="Default" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="packageRate" label="Package Rate (%)">
                        <InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} placeholder="Default" />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              )}
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}

export default ManagerCommissionSettings;
