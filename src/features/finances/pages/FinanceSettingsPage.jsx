// src/features/finances/pages/FinanceSettingsPage.jsx
import { useTranslation } from 'react-i18next';
import { Card, Button } from 'antd';
import FinanceSettingsView from '../components/FinanceSettingsView';
import { useEffect, useState } from 'react';

function FinanceSettingsPage() {
  const { t } = useTranslation(['manager']);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // Ensure the form is shown by default when navigating to this page
    setOpen(true);
  }, []);
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('manager:financePages.settings.title')}</h1>
          <p className="text-gray-600">{t('manager:financePages.settings.subtitle')}</p>
        </div>
        <Button type="primary" onClick={() => setOpen((v) => !v)}>{open ? t('manager:financePages.settings.hideForm') : t('manager:financePages.settings.editSettings')}</Button>
      </div>

      {open && (
        <Card>
          <FinanceSettingsView />
        </Card>
      )}
    </div>
  );
}

export default FinanceSettingsPage;
