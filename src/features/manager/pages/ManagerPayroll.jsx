// src/features/manager/pages/ManagerPayroll.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Table, Spin, Empty, Tag, Select, Row, Col, Statistic, Button, Descriptions, Avatar, Progress } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { getManagerPayroll, getManagerSettings } from '../services/managerCommissionApi';
import { formatCurrency } from '@/shared/utils/formatters';

// SALARY_TYPE_LABELS built inside component via t()

const SALARY_TYPE_COLORS = {
  commission: 'blue',
  fixed_per_lesson: 'green',
  monthly_salary: 'purple'
};

const SEASON_COLORS = {
  Winter: '#1890ff',
  Spring: '#52c41a',
  Summer: '#faad14',
  Autumn: '#fa541c'
};

const renderDash = <span className="text-gray-300">—</span>;
const renderEarnings = (val, color) => val > 0 ? <span className={color}>{formatCurrency(val, 'EUR')}</span> : renderDash;
const renderCount = (count) => count || renderDash;

function getPaymentStatus(r, t) {
  if (r.grossAmount === 0) return renderDash;
  if (r.paidAmount >= r.grossAmount) return <Tag color="green" icon={<CheckCircleOutlined />}>{t('manager:payroll.status.paid')}</Tag>;
  if (r.paidAmount > 0) return <Tag color="orange">{t('manager:payroll.status.partial')}</Tag>;
  return <Tag color="gold" icon={<ClockCircleOutlined />}>{t('manager:payroll.status.pending')}</Tag>;
}

function buildMonthColumns(t) {
  return [
    { title: t('manager:payroll.months.columns.month'), dataIndex: 'monthName', key: 'month', fixed: 'left', width: 120, render: (text) => <span className="font-medium">{text}</span> },
    {
      title: t('manager:payroll.months.columns.bookings'),
      children: [
        { title: t('manager:payroll.months.columns.count'), key: 'bookingCount', width: 70, align: 'center', render: (_, r) => renderCount(r.bookings.count) },
        { title: t('manager:payroll.months.columns.earned'), key: 'bookingEarned', width: 100, align: 'right', render: (_, r) => renderEarnings(r.bookings.earnings, 'text-blue-600') }
      ]
    },
    {
      title: t('manager:payroll.months.columns.rentals'),
      children: [
        { title: t('manager:payroll.months.columns.count'), key: 'rentalCount', width: 70, align: 'center', render: (_, r) => renderCount(r.rentals.count) },
        { title: t('manager:payroll.months.columns.earned'), key: 'rentalEarned', width: 100, align: 'right', render: (_, r) => renderEarnings(r.rentals.earnings, 'text-green-600') }
      ]
    },
    { title: t('manager:payroll.months.columns.accommodation'), key: 'accomEarned', width: 100, align: 'right', render: (_, r) => renderEarnings(r.accommodation.earnings, '') },
    { title: t('manager:payroll.months.columns.shop'), key: 'shopEarned', width: 100, align: 'right', render: (_, r) => renderEarnings(r.shop.earnings, '') },
    { title: t('manager:payroll.months.columns.membership'), key: 'membershipEarned', width: 100, align: 'right', render: (_, r) => renderEarnings(r.membership.earnings, '') },
    { title: t('manager:payroll.months.columns.packages'), key: 'packageEarned', width: 100, align: 'right', render: (_, r) => renderEarnings(r.packages?.earnings || 0, '') },
    { title: t('manager:payroll.months.columns.grossTotal'), dataIndex: 'grossAmount', key: 'gross', width: 120, align: 'right', render: (val) => <span className="font-semibold">{formatCurrency(val, 'EUR')}</span> },
    { title: t('manager:payroll.months.columns.status'), key: 'status', width: 100, align: 'center', render: (_, r) => getPaymentStatus(r, t) }
  ];
}

function PayrollSettingsCard({ settings, salaryType }) {
  const { t } = useTranslation(['manager']);
  const SALARY_TYPE_LABELS = {
    commission: t('manager:payroll.totals.gross'),
    fixed_per_lesson: t('manager:dashboard.salaryTypes.fixed_per_lesson'),
    monthly_salary: t('manager:dashboard.salaryTypes.monthly_salary'),
  };
  // Use explicit labels matching the payroll settingsCard keys
  const salaryLabelMap = {
    commission: t('manager:dashboard.salaryTypes.commission'),
    fixed_per_lesson: t('manager:dashboard.salaryTypes.fixed_per_lesson'),
    monthly_salary: t('manager:dashboard.salaryTypes.monthly_salary'),
  };
  const salaryLabel = salaryLabelMap[salaryType] || salaryType;
  const salaryColor = SALARY_TYPE_COLORS[salaryType] || 'blue';
  const amountLabels = {
    commission: null,
    monthly_salary: [t('manager:payroll.settingsCard.salaryType'), settings?.fixedSalaryAmount],
    fixed_per_lesson: [t('manager:payroll.settingsCard.salaryType'), settings?.perLessonAmount],
  };
  const amountEntry = amountLabels[salaryType];

  return (
    <Card className="shadow-sm">
      <Descriptions title={t('manager:payroll.settingsCard.title')} bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
        <Descriptions.Item label={t('manager:payroll.settingsCard.salaryType')}><Tag color={salaryColor}>{salaryLabel}</Tag></Descriptions.Item>
        {salaryType === 'commission' && (
          <Descriptions.Item label={t('manager:payroll.settingsCard.commissionType')}>
            <Tag>{settings?.commissionType === 'per_category' ? t('manager:payroll.settingsCard.perCategory') : t('manager:payroll.settingsCard.flatRate')}</Tag>
          </Descriptions.Item>
        )}
        {salaryType === 'commission' && (
          <Descriptions.Item label={t('manager:payroll.settingsCard.defaultRate')}>{settings?.defaultRate ?? 0}%</Descriptions.Item>
        )}
        {amountEntry && (
          <Descriptions.Item label={amountEntry[0]}>{formatCurrency(amountEntry[1] || 0, 'EUR')}</Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
}

function SeasonalSummary({ seasons }) {
  const { t } = useTranslation(['manager']);
  return (
    <Card title={t('manager:payroll.seasonalSummary')} className="shadow-sm">
      <Row gutter={16}>
        {seasons.map((season) => (
          <Col xs={24} sm={12} lg={6} key={season.name}>
            <Card size="small" className="mb-4" style={{ borderLeft: `4px solid ${SEASON_COLORS[season.name]}` }}>
              <div className="font-semibold text-gray-700 mb-2">{season.label}</div>
              <div className="text-2xl font-bold mb-1" style={{ color: SEASON_COLORS[season.name] }}>
                {formatCurrency(season.grossAmount, 'EUR')}
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{t('manager:payroll.season.bookings', { count: season.bookingCount })}</span>
                <span>{t('manager:payroll.season.rentals', { count: season.rentalCount })}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-green-600">{t('manager:payroll.season.paid', { amount: formatCurrency(season.paidAmount, 'EUR') })}</span>
                <span className="text-amber-600">{t('manager:payroll.season.pending', { amount: formatCurrency(season.pendingAmount, 'EUR') })}</span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

function ManagerPayroll() {
  const { t } = useTranslation(['manager']);
  const { managerId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [payroll, setPayroll] = useState(null);
  const [settings, setSettings] = useState(null);
  const [managerInfo, setManagerInfo] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());

  // Get manager info from navigation state
  useEffect(() => {
    const state = window.history.state?.usr;
    if (state?.managerName) {
      setManagerInfo({
        name: state.managerName,
        email: state.managerEmail,
        profileImage: state.managerImage
      });
    }
  }, []);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const [payrollRes, settingsRes] = await Promise.all([
        getManagerPayroll(managerId, { year }),
        getManagerSettings(managerId)
      ]);
      if (payrollRes.success) setPayroll(payrollRes.data);
      if (settingsRes.success) setSettings(settingsRes.data);
    } catch (error) {
      message.error(error.message || t('manager:payroll.noData'));
    } finally {
      setLoading(false);
    }
  }, [managerId, year]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    yearOptions.push({ value: y, label: String(y) });
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spin size="large" />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="p-6">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/manager-commissions')} className="mb-4">
          {t('manager:payroll.backToCommissions')}
        </Button>
        <Empty description={t('manager:payroll.noData')} />
      </div>
    );
  }

  const salaryType = payroll.salaryType || 'commission';
  const MONTH_COLUMNS = buildMonthColumns(t);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="flex items-center gap-4">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/manager-commissions')}>
            {t('manager:payroll.back')}
          </Button>
          <div className="flex items-center gap-3">
            {managerInfo?.profileImage && (
              <Avatar src={managerInfo.profileImage} icon={<UserOutlined />} size={48} className="shadow" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-0">
                <DollarOutlined className="text-green-500" />
                {managerInfo?.name ? `${managerInfo.name} — ${t('manager:payroll.title')}` : t('manager:payroll.title')}
              </h1>
              <p className="text-gray-500 mb-0">{t('manager:payroll.subtitle')}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            icon={<UserOutlined />}
            onClick={() => navigate('/admin/manager-commissions')}
          >
            {t('manager:payroll.backButton')}
          </Button>
          <Select
            value={year}
            onChange={setYear}
            options={yearOptions}
            style={{ width: 120 }}
            suffixIcon={<CalendarOutlined />}
          />
        </div>
      </div>

      {settings && <PayrollSettingsCard settings={settings} salaryType={salaryType} />}

      {/* Year Totals */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={6}>
          <Card className="shadow-sm border-t-4 border-t-blue-400">
            <Statistic
              title={t('manager:payroll.totals.gross')}
              value={payroll.totals.gross}
              precision={2}
              prefix="€"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card className="shadow-sm border-t-4 border-t-green-400">
            <Statistic
              title={t('manager:payroll.totals.paid')}
              value={payroll.totals.paid}
              precision={2}
              prefix="€"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card className="shadow-sm border-t-4 border-t-amber-400">
            <Statistic
              title={t('manager:payroll.totals.pending')}
              value={payroll.totals.pending}
              precision={2}
              prefix="€"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card className="shadow-sm border-t-4 border-t-purple-400">
            <div className="text-gray-500 text-sm mb-2">{t('manager:payroll.paymentProgress')}</div>
            <Progress
              percent={payroll.totals.gross > 0 ? Math.round((payroll.totals.paid / payroll.totals.gross) * 100) : 0}
              strokeColor={{ '0%': '#52c41a', '100%': '#87d068' }}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      <SeasonalSummary seasons={payroll.seasons} />

      {/* Monthly Breakdown Table */}
      <Card title={t('manager:payroll.months.title')} className="shadow-sm">
        <Table
          columns={MONTH_COLUMNS}
          dataSource={payroll.months}
          rowKey="period"
          pagination={false}
          scroll={{ x: 1000 }}
          bordered
          size="small"
          summary={() => {
            const totals = payroll.totals;
            return (
              <Table.Summary fixed>
                <Table.Summary.Row className="bg-gray-50 font-bold">
                  <Table.Summary.Cell index={0}>{t('manager:payroll.months.total')}</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center">
                    {payroll.months.reduce((s, m) => s + m.bookings.count, 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    {formatCurrency(payroll.months.reduce((s, m) => s + m.bookings.earnings, 0), 'EUR')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="center">
                    {payroll.months.reduce((s, m) => s + m.rentals.count, 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    {formatCurrency(payroll.months.reduce((s, m) => s + m.rentals.earnings, 0), 'EUR')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    {formatCurrency(payroll.months.reduce((s, m) => s + m.accommodation.earnings, 0), 'EUR')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    {formatCurrency(payroll.months.reduce((s, m) => s + m.shop.earnings, 0), 'EUR')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    {formatCurrency(payroll.months.reduce((s, m) => s + m.membership.earnings, 0), 'EUR')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    {formatCurrency(payroll.months.reduce((s, m) => s + (m.packages?.earnings || 0), 0), 'EUR')}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right">
                    <span className="text-blue-600">{formatCurrency(totals.gross, 'EUR')}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={10} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
    </div>
  );
}

export default ManagerPayroll;
