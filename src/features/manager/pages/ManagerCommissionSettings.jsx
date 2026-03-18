// src/features/manager/pages/ManagerCommissionSettings.jsx
import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Spin, Empty, Avatar, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  UserOutlined,
  PercentageOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getAllManagersWithSettings } from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';
import EnhancedManagerDetailPanel from '../components/EnhancedManagerDetailPanel';

function ManagerCommissionSettings() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelManager, setPanelManager] = useState(null);
  const navigate = useNavigate();

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

  const openPanel = (record) => {
    setPanelManager(record);
    setPanelOpen(true);
  };

  const columns = [
    {
      title: 'Manager',
      key: 'manager',
      render: (_, record) => (
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => openPanel(record)}
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
        return <span className="font-semibold text-blue-600">{s.defaultRate ?? 0}%</span>;
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
      width: 160,
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              icon={<UserOutlined />}
              onClick={(e) => { e.stopPropagation(); openPanel(record); }}
              size="small"
            >
              Details
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

  // Summary calculations
  const totalPending = managers.reduce((sum, m) => sum + (m.pendingCommission || 0), 0);
  const totalPaid = managers.reduce((sum, m) => sum + (m.paidCommission || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Spin size="large" />
        </div>
      ) : managers.length === 0 ? (
        <Empty 
          description="No managers found. Change a user's role to Manager to get started."
        />
      ) : (
        <Table 
          columns={columns} 
          dataSource={managers}
          rowKey="id"
          pagination={false}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => openPanel(record),
            className: 'cursor-pointer hover:bg-blue-50/50 transition-colors'
          })}
        />
      )}

      <EnhancedManagerDetailPanel
        manager={panelManager}
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onUpdate={fetchManagers}
      />
    </div>
  );
}

export default ManagerCommissionSettings;
