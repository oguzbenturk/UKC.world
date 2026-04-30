// src/features/manager/pages/finance/ManagerCommissionSettings.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Spin, Tag, Alert } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  SettingOutlined,
  PercentageOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { getManagerDashboard } from '../../services/managerCommissionApi';
import StatBox from '../../components/finance/StatBox';
import { formatCurrency } from '@/shared/utils/formatters';

const SALARY_LABELS = {
  commission: { color: 'blue', icon: <PercentageOutlined /> },
  fixed_per_lesson: { color: 'green', icon: <ThunderboltOutlined /> },
  monthly_salary: { color: 'purple', icon: <CalendarOutlined /> },
};

function ManagerCommissionSettings() {
  const { t } = useTranslation(['manager']);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getManagerDashboard();
      if (response.success) setSettings(response.data?.settings || null);
      else message.error(t('manager:errors.loadFailed'));
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Spin size="large" /></div>;
  }

  const salaryType = settings?.salaryType || 'commission';
  const salaryInfo = SALARY_LABELS[salaryType] || SALARY_LABELS.commission;

  const rates = [
    { key: 'bookingRate', label: t('manager:dashboard.categoryBreakdown.bookings'), value: settings?.bookingRate },
    { key: 'rentalRate', label: t('manager:dashboard.categoryBreakdown.rentals'), value: settings?.rentalRate },
    { key: 'accommodationRate', label: t('manager:dashboard.categoryBreakdown.accommodation'), value: settings?.accommodationRate },
    { key: 'shopRate', label: t('manager:dashboard.categoryBreakdown.shop'), value: settings?.shopRate },
    { key: 'membershipRate', label: t('manager:dashboard.categoryBreakdown.membership'), value: settings?.membershipRate },
    { key: 'packageRate', label: t('manager:dashboard.categoryBreakdown.packages'), value: settings?.packageRate },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-1">
          <SettingOutlined className="text-slate-500" />
          {t('manager:finance.settings.title')}
        </h1>
        <p className="text-sm text-slate-400">{t('manager:finance.settings.subtitle')}</p>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t('manager:finance.settings.adminNotice')}
        className="rounded-xl border-sky-100 bg-sky-50/40"
      />

      {/* Salary type */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          {t('manager:finance.settings.salaryType')}
        </div>
        <div className="flex items-center gap-2">
          <Tag color={salaryInfo.color} icon={salaryInfo.icon} bordered={false} className="rounded-full text-sm py-1 px-3">
            {t(`manager:dashboard.salaryTypes.${salaryType}`)}
          </Tag>
        </div>
      </div>

      {/* Per-lesson amount */}
      {salaryType === 'fixed_per_lesson' && (
        <StatBox
          label={t('manager:finance.settings.perLessonAmount')}
          value={formatCurrency(settings?.perLessonAmount || 0, 'EUR')}
          sub={t('manager:detailPanel.commissions.perLessonDesc')}
          color="text-green-600"
          border="border-green-100"
        />
      )}

      {/* Monthly salary */}
      {salaryType === 'monthly_salary' && (
        <StatBox
          label={t('manager:finance.settings.monthlySalary')}
          value={formatCurrency(settings?.fixedSalaryAmount || 0, 'EUR')}
          color="text-purple-600"
          border="border-purple-100"
        />
      )}

      {/* Commission rates */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          {t('manager:finance.settings.commissionRates')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rates.map(rate => {
            const num = parseFloat(rate.value) || 0;
            const isActive = num > 0;
            return (
              <div
                key={rate.key}
                className={`rounded-lg border p-3 flex items-center justify-between ${
                  isActive ? 'border-blue-100 bg-blue-50/30' : 'border-slate-100 bg-slate-50/40'
                }`}
              >
                <span className="text-sm text-slate-600">{rate.label}</span>
                {isActive ? (
                  <span className="font-semibold text-blue-600">{num}%</span>
                ) : (
                  <span className="text-xs text-slate-400">{t('manager:finance.settings.notSet')}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ManagerCommissionSettings;
