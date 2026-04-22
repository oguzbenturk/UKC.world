// src/shared/components/error/AppErrorFallback.jsx
import PropTypes from 'prop-types';
import { Button, Result, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { RedoOutlined, ReloadOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

const AppErrorFallback = ({ error = null, onRetry = undefined }) => {
  const { t } = useTranslation(['common']);
  const isDevelopment = import.meta.env.DEV;
  const errorText = isDevelopment && error?.message
    ? error.message
    : t('common:error.unexpected');

  const fullErrorText = error
    ? `${error.message || 'Unknown error'}\n\n${error.stack || ''}\n\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}`
    : '';

  const handleReload = () => {
    window.location.reload();
  };

  const handleRetry = () => {
    if (typeof onRetry === 'function') {
      onRetry();
    }
  };

  const handleCopyError = async () => {
    try {
      await navigator.clipboard.writeText(fullErrorText);
      // Brief visual feedback via the button text (no state needed)
      const btn = document.getElementById('copy-error-btn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = fullErrorText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Result
          status="500"
          title={t('common:error.title')}
          subTitle={errorText}
          extra={(
            <Space wrap>
              <Button type="primary" icon={<RedoOutlined />} onClick={handleRetry}>
                {t('common:error.tryAgain')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReload}>
                {t('common:error.reloadApp')}
              </Button>
              {error && (
                <Button id="copy-error-btn" onClick={handleCopyError}>
                  {t('common:error.copyError')}
                </Button>
              )}
            </Space>
          )}
        >
          {isDevelopment && error && (
            <Paragraph className="mt-4">
              <Text code className="bg-slate-900/90 text-slate-100 block max-h-64 overflow-auto rounded px-3 py-2 text-xs">
                {error.stack || error.message}
              </Text>
            </Paragraph>
          )}
        </Result>
      </div>
    </div>
  );
};

AppErrorFallback.propTypes = {
  error: PropTypes.instanceOf(Error),
  onRetry: PropTypes.func
};

export default AppErrorFallback;
