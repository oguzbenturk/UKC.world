import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { resolveAntdLocale, resolveDayjsLocale } from './localeMap';

const AppLocaleProvider = ({ children, theme }) => {
  const { i18n } = useTranslation();
  const code = i18n.resolvedLanguage || i18n.language || 'en';

  useEffect(() => {
    dayjs.locale(resolveDayjsLocale(code));
  }, [code]);

  return (
    <ConfigProvider locale={resolveAntdLocale(code)} theme={theme}>
      {children}
    </ConfigProvider>
  );
};

export default AppLocaleProvider;
