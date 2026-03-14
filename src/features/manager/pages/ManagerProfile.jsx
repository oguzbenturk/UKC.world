// src/features/manager/pages/ManagerProfile.jsx
import { useState, useEffect, useCallback } from 'react';
import { Card, Spin, Empty, Tag, Row, Col, Statistic, Button, Descriptions, Avatar, Table, Progress, Divider } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftOutlined,
  UserOutlined,
  DollarOutlined,
  MailOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PercentageOutlined,
  BarChartOutlined,
  EyeOutlined,
  EditOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getManagerSettings,
  getManagerPayroll,
  getManagerCommissionsAdmin
} from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';

const SALARY_TYPE_MAP = {
  commission: { color: 'blue', icon: <PercentageOutlined />, label: 'Commission Based' },
  fixed_per_lesson: { color: 'green', icon: <DollarOutlined />, label: 'Fixed Per Lesson' },
  monthly_salary: { color: 'purple', icon: <DollarOutlined />, label: 'Monthly Salary' }
};

const SOURCE_COLOR_MAP = { booking: 'blue', rental: 'green', accommodation: 'purple', shop: 'orange', membership: 'cyan', package: 'magenta' };
const STATUS_TAG_MAP = {
  paid: { color: 'green', icon: <CheckCircleOutlined /> },
  pending: { color: 'gold', icon: <ClockCircleOutlined /> },
  cancelled: { color: 'red', icon: null }
};

const COMMISSION_COLUMNS = [
  {
    title: 'Date', dataIndex: 'createdAt', key: 'date', width: 110,
    render: (val) => val ? new Date(val).toLocaleDateString() : '—'
  },
  {
    title: 'Source', dataIndex: 'sourceType', key: 'source', width: 120,
    render: (val) => <Tag color={SOURCE_COLOR_MAP[val] || 'default'} className="capitalize">{val || '—'}</Tag>
  },
  {
    title: 'Amount', dataIndex: 'commissionAmount', key: 'amount', width: 100, align: 'right',
    render: (val) => <span className="font-semibold">{formatCurrency(val || 0, 'EUR')}</span>
  },
  {
    title: 'Rate', dataIndex: 'commissionRate', key: 'rate', width: 70, align: 'center',
    render: (val) => val ? `${val}%` : '—'
  },
  {
    title: 'Status', dataIndex: 'status', key: 'status', width: 90,
    render: (val) => {
      const info = STATUS_TAG_MAP[val] || STATUS_TAG_MAP.pending;
      return <Tag color={info.color} icon={info.icon} className="capitalize">{val}</Tag>;
    }
  }
];

function SalaryConfigCard({ settings, salaryType, salaryInfo }) {
  const isCommission = salaryType === 'commission';
  const perCategoryRates = ['bookingRate', 'rentalRate', 'accommodationRate', 'packageRate', 'shopRate', 'membershipRate'];
  const rateItems = perCategoryRates
    .filter(key => isCommission && settings?.commissionType === 'per_category' && settings[key])
    .map(key => ({ label: key.replace('Rate', ' Rate').replace(/([A-Z])/g, ' $1').trim(), value: `${settings[key]}%` }));

  const amountMap = {
    monthly_salary: { label: 'Monthly Amount', value: formatCurrency(settings?.fixedSalaryAmount || 0, 'EUR') + '/month', cls: 'text-purple-600' },
    fixed_per_lesson: { label: 'Per Lesson Amount', value: formatCurrency(settings?.perLessonAmount || 0, 'EUR') + '/lesson', cls: 'text-green-600' }
  };
  const amountInfo = amountMap[salaryType];
  const statusTag = settings?.isActive !== false
    ? { color: 'green', label: 'Active' }
    : { color: 'red', label: 'Inactive' };

  return (
    <Card title={<span className="flex items-center gap-2"><SettingOutlined className="text-blue-500" />Salary Configuration</span>} className="shadow-sm">
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
        <Descriptions.Item label="Salary Type">
          <Tag color={salaryInfo.color} icon={salaryInfo.icon}>{salaryInfo.label}</Tag>
        </Descriptions.Item>
        {isCommission && (
          <Descriptions.Item label="Commission Type">
            <Tag>{settings?.commissionType === 'per_category' ? 'Per Category' : 'Flat Rate'}</Tag>
          </Descriptions.Item>
        )}
        {isCommission && (
          <Descriptions.Item label="Default Rate">
            <span className="font-semibold text-blue-600">{settings?.defaultRate || 10}%</span>
          </Descriptions.Item>
        )}
        {rateItems.map(item => (
          <Descriptions.Item key={item.label} label={item.label}>{item.value}</Descriptions.Item>
        ))}
        {amountInfo && (
          <Descriptions.Item label={amountInfo.label}>
            <span className={`font-semibold ${amountInfo.cls}`}>{amountInfo.value}</span>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Status">
          <Tag color={statusTag.color}>{statusTag.label}</Tag>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function CategoryBreakdownCard({ categoryData, maxAmount }) {
  return (
    <Card
      title={<span className="flex items-center gap-2"><BarChartOutlined className="text-green-500" />Earnings by Category (YTD)</span>}
      className="shadow-sm"
    >
      <div className="space-y-4">
        {categoryData.map(cat => (
          <div key={cat.category} className="flex items-center gap-4">
            <div className="w-28 text-sm font-medium text-gray-600 shrink-0">{cat.category}</div>
            <div className="flex-1">
              <Progress
                percent={Math.round((cat.amount / maxAmount) * 100)}
                strokeColor={cat.color}
                format={() => formatCurrency(cat.amount, 'EUR')}
                size="small"
              />
            </div>
          </div>
        ))}
        <Divider className="my-2" />
        <div className="flex items-center gap-4">
          <div className="w-28 text-sm font-bold text-gray-800 shrink-0">Total</div>
          <div className="flex-1 text-right font-bold text-lg text-gray-800">
            {formatCurrency(categoryData.reduce((s, c) => s + c.amount, 0), 'EUR')}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SeasonalCard({ seasons, year }) {
  return (
    <Card
      title={<span className="flex items-center gap-2"><CalendarOutlined className="text-orange-500" />Seasonal Performance ({year})</span>}
      className="shadow-sm"
    >
      <Row gutter={[16, 16]}>
        {seasons.map(season => (
          <Col xs={24} sm={12} lg={6} key={season.name}>
            <Card size="small" className="text-center border-t-4" style={{ borderTopColor: season.grossAmount > 0 ? '#52c41a' : '#d9d9d9' }}>
              <div className="font-semibold text-gray-700 mb-2">{season.label}</div>
              <div className="text-xl font-bold" style={{ color: season.grossAmount > 0 ? '#1890ff' : '#bfbfbf' }}>
                {formatCurrency(season.grossAmount, 'EUR')}
              </div>
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                <div>{season.bookingCount} bookings · {season.rentalCount} rentals</div>
                <div>
                  <Tag color="green" className="text-xs">{formatCurrency(season.paidAmount, 'EUR')} paid</Tag>
                  {season.pendingAmount > 0 && (
                    <Tag color="gold" className="text-xs">{formatCurrency(season.pendingAmount, 'EUR')} pending</Tag>
                  )}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

function ProfileHeader({ managerName, managerEmail, managerImage, managerId, navigate }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
      <div className="flex items-center gap-4">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/manager-commissions')}>Back</Button>
        <div className="flex items-center gap-3">
          <Avatar src={managerImage} icon={<UserOutlined />} size={56} className="shadow" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{managerName}</h1>
            {managerEmail && <p className="text-gray-500 flex items-center gap-1"><MailOutlined /> {managerEmail}</p>}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button icon={<BarChartOutlined />} onClick={() => navigate(`/admin/manager-payroll/${managerId}`)}>View Payroll</Button>
        <Button type="primary" icon={<EditOutlined />} onClick={() => navigate('/admin/manager-commissions', { state: { editManagerId: managerId } })}>Edit Settings</Button>
      </div>
    </div>
  );
}

function StatsRow({ totals, paidPercent }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <Statistic title="Total Earnings (YTD)" value={totals.gross} precision={2} prefix="€" valueStyle={{ color: '#1890ff', fontSize: '1.5rem' }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <Statistic title="Paid Amount" value={totals.paid} precision={2} prefix="€" valueStyle={{ color: '#52c41a', fontSize: '1.5rem' }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <Statistic title="Pending Amount" value={totals.pending} precision={2} prefix="€" valueStyle={{ color: '#faad14', fontSize: '1.5rem' }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <div className="mb-2 text-gray-500 text-sm">Payment Completion</div>
          <Progress type="circle" percent={paidPercent} size={80} strokeColor={{ '0%': '#52c41a', '100%': '#87d068' }} format={(p) => `${p}%`} />
        </Card>
      </Col>
    </Row>
  );
}

const CATEGORY_DEFS = [
  { key: 'bookings', label: 'Bookings', color: '#1890ff' },
  { key: 'rentals', label: 'Rentals', color: '#52c41a' },
  { key: 'accommodation', label: 'Accommodation', color: '#722ed1' },
  { key: 'shop', label: 'Shop', color: '#fa8c16' },
  { key: 'membership', label: 'Membership', color: '#13c2c2' },
  { key: 'packages', label: 'Packages', color: '#eb2f96' }
];

function computeCategoryData(months) {
  const totals = {};
  CATEGORY_DEFS.forEach(d => { totals[d.key] = 0; });
  (months || []).forEach(m => {
    CATEGORY_DEFS.forEach(d => {
      totals[d.key] += (m[d.key]?.earnings || 0);
    });
  });
  return CATEGORY_DEFS
    .map(d => ({ category: d.label, amount: totals[d.key], color: d.color }))
    .filter(c => c.amount > 0);
}

function RecentCommissionsCard({ commissions, managerId, navigate }) {
  return (
    <Card
      title={<span className="flex items-center gap-2"><DollarOutlined className="text-blue-500" />Recent Commission Entries</span>}
      extra={<Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/admin/manager-payroll/${managerId}`)}>View Full Payroll</Button>}
      className="shadow-sm"
    >
      {commissions.length > 0
        ? <Table columns={COMMISSION_COLUMNS} dataSource={commissions} rowKey="id" pagination={false} size="small" scroll={{ x: 500 }} />
        : <Empty description="No commission entries yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      }
    </Card>
  );
}

async function fetchManagerData(managerId) {
  const year = new Date().getFullYear();
  const [settingsRes, payrollRes, commissionsRes] = await Promise.all([
    getManagerSettings(managerId),
    getManagerPayroll(managerId, { year }),
    getManagerCommissionsAdmin(managerId, { limit: 10 })
  ]);
  return {
    settings: settingsRes.success ? settingsRes.data : null,
    payroll: payrollRes.success ? payrollRes.data : null,
    commissions: commissionsRes.success ? (commissionsRes.data || []) : []
  };
}

function deriveProfileState(settings, payroll) {
  const salaryType = settings?.salaryType || payroll?.salaryType || 'commission';
  const salaryInfo = SALARY_TYPE_MAP[salaryType] || SALARY_TYPE_MAP.commission;
  const totals = payroll?.totals || { gross: 0, paid: 0, pending: 0 };
  const paidPercent = totals.gross > 0 ? Math.round((totals.paid / totals.gross) * 100) : 0;
  const categoryData = computeCategoryData(payroll?.months);
  const maxCategoryAmount = Math.max(...categoryData.map(c => c.amount), 1);
  return { salaryType, salaryInfo, totals, paidPercent, categoryData, maxCategoryAmount };
}

function ManagerProfile() {
  const { managerId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [payroll, setPayroll] = useState(null);
  const [recentCommissions, setRecentCommissions] = useState([]);
  const [managerInfo, setManagerInfo] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchManagerData(managerId);
      setSettings(data.settings);
      setPayroll(data.payroll);
      setRecentCommissions(data.commissions);
    } catch (error) {
      message.error(error.message || 'Failed to load manager profile');
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const state = window.history.state?.usr;
    if (state?.managerName) {
      setManagerInfo({ name: state.managerName, email: state.managerEmail, profileImage: state.managerImage });
    }
  }, []);

  if (loading) {
    return <div className="flex justify-center items-center py-24"><Spin size="large" /></div>;
  }

  const { salaryType, salaryInfo, totals, paidPercent, categoryData, maxCategoryAmount } = deriveProfileState(settings, payroll);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <ProfileHeader
        managerName={managerInfo?.name || 'Manager'}
        managerEmail={managerInfo?.email || ''}
        managerImage={managerInfo?.profileImage}
        managerId={managerId}
        navigate={navigate}
      />
      <StatsRow totals={totals} paidPercent={paidPercent} />
      <SalaryConfigCard settings={settings} salaryType={salaryType} salaryInfo={salaryInfo} />
      {categoryData.length > 0 && <CategoryBreakdownCard categoryData={categoryData} maxAmount={maxCategoryAmount} />}
      {payroll?.seasons && <SeasonalCard seasons={payroll.seasons} year={payroll.year} />}
      <RecentCommissionsCard commissions={recentCommissions} managerId={managerId} navigate={navigate} />
    </div>
  );
}

export default ManagerProfile;
