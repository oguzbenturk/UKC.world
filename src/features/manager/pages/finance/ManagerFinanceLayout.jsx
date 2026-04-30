// src/features/manager/pages/finance/ManagerFinanceLayout.jsx
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DollarOutlined,
  WalletOutlined,
  RocketOutlined,
  BankOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const tabs = [
  { to: '/manager/finance', end: true, icon: <DollarOutlined />, key: 'overview' },
  { to: '/manager/finance/earnings', icon: <WalletOutlined />, key: 'earnings' },
  { to: '/manager/finance/upcoming', icon: <RocketOutlined />, key: 'upcoming' },
  { to: '/manager/finance/payouts', icon: <BankOutlined />, key: 'payouts' },
  { to: '/manager/finance/settings', icon: <SettingOutlined />, key: 'settings' },
];

function ManagerFinanceLayout() {
  const { t } = useTranslation(['manager']);

  return (
    <div className="min-h-screen bg-slate-50/40">
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-0">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-3">
            <DollarOutlined className="text-green-500" />
            {t('manager:finance.layout.title')}
          </h1>
          <nav className="flex items-center gap-1 overflow-x-auto -mb-px">
            {tabs.map((tab) => (
              <NavLink
                key={tab.key}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-sky-500 text-sky-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                  }`
                }
              >
                {tab.icon}
                {t(`manager:finance.layout.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  );
}

export default ManagerFinanceLayout;
