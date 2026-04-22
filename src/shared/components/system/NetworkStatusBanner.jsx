import { Alert, Button, Space } from 'antd';
import { ReloadOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import useNetworkStatus from '@/shared/hooks/useNetworkStatus';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const formatTimestamp = (date) => {
  if (!(date instanceof Date)) {
    return '';
  }
  return DATE_TIME_FORMAT.format(date);
};

/**
 * Sticky banner that surfaces offline state to the user.
 */
const NetworkStatusBanner = () => {
  const { t } = useTranslation(['common']);
  const { isOnline, effectiveType, lastChangedAt } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  const descriptionParts = [
    t('common:network.cannotSave'),
  ];
  if (effectiveType) {
    descriptionParts.push(t('common:network.lastConnection', { type: effectiveType }));
  }
  if (lastChangedAt) {
    descriptionParts.push(t('common:network.lostAt', { time: formatTimestamp(lastChangedAt) }));
  }

  return (
    <div className="sticky top-0 z-[1200] shadow-sm">
      <Alert
        type="error"
        showIcon
        banner
        icon={<DisconnectOutlined />}
        message={t('common:network.offline')}
        description={descriptionParts.join(' ')}
        action={(
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
            >
              {t('common:network.retry')}
            </Button>
          </Space>
        )}
      />
    </div>
  );
};

export default NetworkStatusBanner;
