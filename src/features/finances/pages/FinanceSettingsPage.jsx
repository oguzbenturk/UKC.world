// src/features/finances/pages/FinanceSettingsPage.jsx
import { Card, Button } from 'antd';
import FinanceSettingsView from '../components/FinanceSettingsView';
import { useEffect, useState } from 'react';

function FinanceSettingsPage() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // Ensure the form is shown by default when navigating to this page
    setOpen(true);
  }, []);
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Finance Settings</h1>
          <p className="text-gray-600">View resolved settings by context; editing UI can be added here later.</p>
        </div>
        <Button type="primary" onClick={() => setOpen((v) => !v)}>{open ? 'Hide Form' : 'Edit Settings'}</Button>
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
