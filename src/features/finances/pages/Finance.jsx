import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from 'antd';
import { Navigate } from 'react-router-dom';

import InstructorFinanceView from '../components/InstructorFinanceView';
import { useAuth } from '@/shared/hooks/useAuth';

function Finance({ defaultFilter = 'all' }) {
  const { t } = useTranslation(['manager']);
  const { user } = useAuth();
  const role = user?.role?.toLowerCase?.();

  const instructorProfile = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name || user.fullName || 'Instructor',
      email: user.email,
      phone: user.phone,
      status: user.status,
      created_at: user.created_at,
      avatar: user.avatar_url || user.avatar
    };
  }, [user]);

  if (role === 'instructor' && instructorProfile?.id) {
    return <InstructorFinanceView instructor={instructorProfile} />;
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
