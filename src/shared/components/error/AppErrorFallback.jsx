// src/shared/components/error/AppErrorFallback.jsx
import PropTypes from 'prop-types';
import { Button, Result, Space, Typography } from 'antd';
import { RedoOutlined, ReloadOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

const AppErrorFallback = ({ error = null, onRetry = undefined }) => {
  const isDevelopment = import.meta.env.DEV;
  const errorText = isDevelopment && error?.message
    ? error.message
    : 'An unexpected error occurred. Please try again in a moment.';

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
          title="We hit a snag"
          subTitle={errorText}
          extra={(
            <Space wrap>
              <Button type="primary" icon={<RedoOutlined />} onClick={handleRetry}>
                Try again
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReload}>
                Reload app
              </Button>
              {error && (
                <Button id="copy-error-btn" onClick={handleCopyError}>
                  Copy Error
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
