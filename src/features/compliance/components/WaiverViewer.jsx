import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Alert, Button, Card, Skeleton, Space, Tag, Timeline, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, FileDoneOutlined, ReloadOutlined } from '@ant-design/icons';
import * as waiverApi from '../services/waiverApi';

const { Text, Paragraph } = Typography;

const formatDateTime = (value) => {
  if (!value) return 'Unknown date';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const buildStatusTag = (status) => {
  if (!status) {
    return <Tag color="default">Status unknown</Tag>;
  }

  if (status.isExpired) {
    return <Tag color="red">Expired</Tag>;
  }

  if (status.needsNewVersion) {
    return <Tag color="orange">Re-sign required</Tag>;
  }

  if (status.hasSigned) {
    return <Tag color="green">Signed</Tag>;
  }

  return <Tag color="gold">Not signed</Tag>;
};

// eslint-disable-next-line complexity
const WaiverViewer = ({ userId = null, userType = 'user', onRequestSign = null, refreshToken = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [statusResponse, historyResponse] = await Promise.all([
        waiverApi.checkWaiverStatus(userId, userType),
        waiverApi.getWaiverHistory(userId, userType),
      ]);

      setStatus(statusResponse || null);
      setHistory(Array.isArray(historyResponse) ? historyResponse : []);
    } catch (err) {
      setError(err?.message || 'Unable to load waiver status.');
      setStatus(null);
      setHistory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, userType]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshToken]);

  const needsSignature = useMemo(() => {
    if (!status) return true;
    if (status.needsToSign) return true;
    if (status.isExpired) return true;
    if (status.needsNewVersion) return true;
    return !status.hasSigned;
  }, [status]);

  const primaryMessage = useMemo(() => {
    if (!status) {
      return 'We could not determine your waiver status. Please refresh or contact support.';
    }

    if (status.isExpired) {
      return 'Your previous liability waiver has expired. Please sign the latest version to continue booking.';
    }

    if (status.needsNewVersion) {
      return `A new waiver version (${status.latestVersion}) is available. Please review and sign the updated terms.`;
    }

    if (!status.hasSigned) {
      return 'You have not signed the liability waiver yet. Please sign it before booking lessons or rentals.';
    }

    return 'Your liability waiver is up to date.';
  }, [status]);

  const handleManualRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const timelineItems = useMemo(() => {
    if (!history?.length) {
      return [
        {
          color: 'gray',
          dot: <ClockCircleOutlined />,
          children: <Text type="secondary">No signed waivers recorded yet.</Text>,
        },
      ];
    }

    return history.map((entry, index) => {
      const isMostRecent = index === 0;
      const versionLabel = entry.waiver_version ? `Version ${entry.waiver_version}` : 'Unknown version';

      return {
        key: entry.id,
        color: isMostRecent ? 'green' : 'blue',
        dot: isMostRecent ? <CheckCircleOutlined /> : <FileDoneOutlined />,
        children: (
          <Space direction="vertical" size={2}>
            <Text strong>{versionLabel}</Text>
            <Text type="secondary">Signed {formatDateTime(entry.signed_at)}</Text>
            {entry.photo_consent ? (
              <Tag color="geekblue">Photo consent granted</Tag>
            ) : (
              <Tag color="default">Photo consent not granted</Tag>
            )}
          </Space>
        ),
      };
    });
  }, [history]);

  return (
    <Card
      title="Liability Waiver"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleManualRefresh} loading={refreshing}>
            Refresh
          </Button>
          <Button type={needsSignature ? 'primary' : 'default'} onClick={onRequestSign} disabled={!onRequestSign}>
            {needsSignature ? 'Sign Waiver' : 'View / Re-sign'}
          </Button>
        </Space>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <Space direction="vertical" size="middle" className="w-full">
          {error ? (
            <Alert type="error" message="Unable to load waiver status" description={error} showIcon />
          ) : (
            <Alert
              type={needsSignature ? 'warning' : 'success'}
              message={primaryMessage}
              description={
                <Space direction="vertical" size={4} className="w-full">
                  <div>
                    <Text strong>Status:</Text> {buildStatusTag(status)}
                  </div>
                  {status?.lastSigned && (
                    <div>
                      <Text strong>Last signed:</Text> {formatDateTime(status.lastSigned)}
                    </div>
                  )}
                  {status?.currentVersion && (
                    <div>
                      <Text strong>Current version:</Text> {status.currentVersion}
                    </div>
                  )}
                  {status?.latestVersion && status?.latestVersion !== status?.currentVersion && (
                    <div>
                      <Text strong>Latest version available:</Text> {status.latestVersion}
                    </div>
                  )}
                </Space>
              }
              showIcon
            />
          )}

          <div>
            <Paragraph strong className="mb-2">
              Signature History
            </Paragraph>
            <Timeline mode="left" items={timelineItems} />
          </div>
        </Space>
      )}
    </Card>
  );
};

WaiverViewer.propTypes = {
  userId: PropTypes.string,
  userType: PropTypes.oneOf(['user', 'family_member']),
  onRequestSign: PropTypes.func,
  refreshToken: PropTypes.number,
};

export default WaiverViewer;
