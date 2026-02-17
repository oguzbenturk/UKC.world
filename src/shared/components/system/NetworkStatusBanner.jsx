import { Alert, Button, Space } from 'antd';
import { ReloadOutlined, DisconnectOutlined } from '@ant-design/icons';
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
  const { isOnline, effectiveType, lastChangedAt } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  const descriptionParts = [
    'Changes cannot be saved while offline.',
  ];
  if (effectiveType) {
    descriptionParts.push(`Last detected connection: ${effectiveType}`);
  }
  if (lastChangedAt) {
    descriptionParts.push(`Lost connection at ${formatTimestamp(lastChangedAt)}.`);
  }

  return (
    <div className="sticky top-0 z-[1200] shadow-sm">
      <Alert
        type="error"
        showIcon
        banner
        icon={<DisconnectOutlined />}
        message="You are currently offline"
        description={descriptionParts.join(' ')}
        action={(
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
            >
              Retry Connection
            </Button>
          </Space>
        )}
      />
    </div>
  );
};

export default NetworkStatusBanner;
