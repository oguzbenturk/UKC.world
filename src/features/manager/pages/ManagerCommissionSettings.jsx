// src/features/manager/pages/ManagerCommissionSettings.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['manager']);
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
        message.error(t('manager:errors.loadFailed'));
      }
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  const openPanel = (record) => {
    setPanelManager(record);
    setPanelOpen(true);
  };

  const columns = [
    {
      title: t('manager:commissionSettings.columns.manager'),
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
      title: t('manager:commissionSettings.columns.salaryType'),
      key: 'salaryType',
      render: (_, record) => {
        const type = record.settings?.salaryType || 'commission';
        const map = {
          commission: { color: 'blue', icon: <PercentageOutlined />, label: t('manager:commissionSettings.salaryTypeLabels.commission') },
          fixed_per_lesson: { color: 'green', icon: <DollarOutlined />, label: t('manager:commissionSettings.salaryTypeLabels.fixed_per_lesson') },
          monthly_salary: { color: 'purple', icon: <DollarOutlined />, label: t('manager:commissionSettings.salaryTypeLabels.monthly_salary') }
        };
        const info = map[type] || map.commission;
        return <Tag color={info.color} icon={info.icon}>{info.label}</Tag>;
      }
    },
    {
      title: t('manager:commissionSettings.columns.rateAmount'),
      key: 'rateAmount',
      render: (_, record) => {
        const s = record.settings || {};
        const type = s.salaryType || 'commission';
        if (type === 'monthly_salary') {
          return <span className="font-semibold text-purple-600">{formatCurrency(s.fixedSalaryAmount || 0, 'EUR')}{t('manager:detailPanel.profile.perMonth')}</span>;
        }
        if (type === 'fixed_per_lesson') {
          return <span className="font-semibold text-green-600">{formatCurrency(s.perLessonAmount || 0, 'EUR')}{t('manager:detailPanel.profile.perLesson')}</span>;
        }
        return <span className="font-semibold text-blue-600">{s.defaultRate ?? 0}%</span>;
      }
    },
    {
      title: t('manager:commissionSettings.columns.categoryRates'),
      key: 'categoryRates',
      render: (_, record) => {
        const s = record.settings || {};
        if (s.salaryType !== 'commission' || s.commissionType !== 'per_category') {
          return <span className="text-gray-400">—</span>;
        }
        const rates = [
          { key: 'bookingRate', label: t('manager:detailPanel.commissions.categories.bookingRate') },
          { key: 'rentalRate', label: t('manager:detailPanel.commissions.categories.rentalRate') },
          { key: 'accommodationRate', label: t('manager:detailPanel.commissions.categories.accommodationRate') },
          { key: 'packageRate', label: t('manager:detailPanel.commissions.categories.packageRate') },
          { key: 'shopRate', label: t('manager:detailPanel.commissions.categories.shopRate') },
          { key: 'membershipRate', label: t('manager:detailPanel.commissions.categories.membershipRate') }
        ].filter(r => s[r.key]);
        return (
          <Space size="small" wrap>
            {rates.map(r => (
              <Tooltip key={r.key} title={`${r.label}`}>
                <Tag>{r.label}: {s[r.key]}%</Tag>
              </Tooltip>
            ))}
          </Space>
        );
      }
    },
    {
      title: t('manager:commissionSettings.columns.totalEarnings'),
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
      title: t('manager:commissionSettings.columns.pending'),
      key: 'pending',
      render: (_, record) => (
        <Tooltip title={t('manager:commissionSettings.tooltips.pendingCommission')}>
          <span className="flex items-center gap-1 text-amber-600">
            <ClockCircleOutlined />
            {formatCurrency(record.pendingCommission || 0, 'EUR')}
          </span>
        </Tooltip>
      )
    },
    {
      title: t('manager:commissionSettings.columns.paid'),
      key: 'paid',
      render: (_, record) => (
        <Tooltip title={t('manager:commissionSettings.tooltips.totalPaid')}>
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircleOutlined />
            {formatCurrency(record.paidCommission || 0, 'EUR')}
          </span>
        </Tooltip>
      )
    },
    {
      title: t('manager:commissionSettings.columns.actions'),
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          <Tooltip title={t('manager:commissionSettings.tooltips.viewDetails')}>
            <Button
              icon={<UserOutlined />}
              onClick={(e) => { e.stopPropagation(); openPanel(record); }}
              size="small"
            >
              {t('manager:commissionSettings.actions.details')}
            </Button>
          </Tooltip>
          <Tooltip title={t('manager:commissionSettings.tooltips.viewPayroll')}>
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
          description={t('manager:commissionSettings.empty')}
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
