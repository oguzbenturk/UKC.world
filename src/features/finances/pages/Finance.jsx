import { useTranslation } from 'react-i18next';
import { Card } from 'antd';
import { Navigate } from 'react-router-dom';

// Instructors get the dedicated earnings + payout-request page
// (docs/specs/instructor-earnings-payouts.md). The legacy InstructorFinanceView
// stays in the codebase for admin-side reuse but is no longer routed here.
import InstructorEarningsPage from '@/features/instructor/earnings/InstructorEarningsPage';
import { useAuth } from '@/shared/hooks/useAuth';

function Finance() {
  const { t } = useTranslation(['manager']);
  const { user } = useAuth();
  const role = user?.role?.toLowerCase?.();

  if (role === 'instructor' && user?.id) {
    return <InstructorEarningsPage />;
  }

  // Managers get their own dedicated finance hub
  if (role === 'manager') {
    return <Navigate to="/manager/finance" replace />;
  }

  // Fallback: maintenance card for admin / other staff who land here
  // (admin probably shouldn't be here either, but leaving as-is for now)
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 text-center shadow-sm">
        <div className="text-4xl mb-4">🔧</div>
        <h2 className="text-xl font-semibold text-amber-800 mb-2">{t('manager:finances.overview.maintenance.title')}</h2>
        <p className="text-amber-700">
          {t('manager:finances.overview.maintenance.message')}
        </p>
      </Card>
    </div>
  );
}

export default Finance;
