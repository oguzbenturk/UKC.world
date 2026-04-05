import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Image,
  Space,
  Spin,
  Table,
  Typography
} from 'antd';
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import waiverAdminApi from '../api/waiverAdminApi';

const { Title, Text, Paragraph } = Typography;

const STATUS_META = {
  valid: { icon: <CheckCircleOutlined />, label: 'Valid', tone: 'success' },
  outdated: { icon: <ExclamationCircleOutlined />, label: 'Needs Re-sign', tone: 'error' },
  expired: { icon: <ClockCircleOutlined />, label: 'Expired', tone: 'error' },
  missing: { icon: <CalendarOutlined />, label: 'Not Signed', tone: 'warning' }
};

const formatDateTime = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—');

const createParentContent = (parent) => {
  if (!parent) return null;
  return (
    <Space direction="vertical" size={0}>
      <Text strong>{parent.name || '—'}</Text>
      {parent.email && <Text type="secondary">{parent.email}</Text>}
    </Space>
  );
};

const createSignerContent = (signer) => {
  if (!signer) return null;
  return (
    <Space direction="vertical" size={0}>
      <Text strong>{signer.name || '—'}</Text>
      {signer.email && <Text type="secondary">{signer.email}</Text>}
    </Space>
  );
};

const buildSubjectDefinitions = (subject, parentContent, signerContent, hasDistinctContactEmail, hasPhotoConsent) => [
  [true, { key: 'name', label: 'Name', children: subject.name || '—' }],
  [Boolean(subject.relationship), { key: 'relationship', label: 'Relationship', children: subject.relationship }],
  [Boolean(subject.email), { key: 'email', label: 'Email', children: subject.email }],
  [hasDistinctContactEmail, { key: 'contactEmail', label: 'Contact Email', children: subject.contactEmail }],
  [Boolean(parentContent), {
    key: 'parent',
    label: subject.subjectType === 'family' ? 'Parent / Guardian' : 'Account Owner',
    children: parentContent
  }],
  [Boolean(signerContent), { key: 'signer', label: 'Last Signed By', children: signerContent }],
  [Boolean(subject.languageCode), {
    key: 'language',
    label: 'Language',
    children: subject.languageCode?.toUpperCase?.() || subject.languageCode
  }],
  [hasPhotoConsent, {
    key: 'photoConsent',
    label: 'Photo Consent',
    children: subject.photoConsent ? 'Granted' : 'Declined'
  }],
  [Boolean(subject.ipAddress), { key: 'ip', label: 'IP Address', children: subject.ipAddress }],
  [Boolean(subject.userAgent), { key: 'agent', label: 'User Agent', children: subject.userAgent }]
];

const buildSubjectLines = (subject) => {
  if (!subject) return [];

  const parentContent = createParentContent(subject.parent);
  const signerContent = createSignerContent(subject.signer);
  const hasDistinctContactEmail = Boolean(subject.contactEmail && subject.contactEmail !== subject.email);
  const hasPhotoConsent = subject.photoConsent !== undefined && subject.photoConsent !== null;

  return buildSubjectDefinitions(subject, parentContent, signerContent, hasDistinctContactEmail, hasPhotoConsent)
    .filter(([condition]) => condition)
    .map(([, item]) => item);
};

const historyColumns = [
  {
    title: 'Signed At',
    dataIndex: 'signed_at',
    key: 'signed_at',
    render: formatDateTime
  },
  {
    title: 'Version',
    dataIndex: 'waiver_version',
    key: 'waiver_version'
  },
  {
    title: 'Language',
    dataIndex: 'language_code',
    key: 'language_code',
    render: (value) => value?.toUpperCase?.() || value || '—'
  },
  {
    title: 'Photo Consent',
    dataIndex: 'photo_consent',
    key: 'photo_consent',
    render: (value) => (value ? 'Yes' : 'No')
  }
];

const useWaiverDetail = (open, subjectId, subjectType) => {
  const [state, setState] = useState({ loading: false, error: null, detail: null });

  useEffect(() => {
    if (!open || !subjectId || !subjectType) {
      setState({ loading: false, error: null, detail: null });
      return;
    }

    let cancelled = false;
    setState({ loading: true, error: null, detail: null });

    waiverAdminApi
      .detail(subjectId, subjectType)
      .then((data) => {
        if (!cancelled) {
          setState({ loading: false, error: null, detail: data });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ loading: false, error: err.message || 'Failed to load waiver detail', detail: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, subjectId, subjectType]);

  return state;
};

const deriveSubject = (detail, summary, subjectType) => {
  if (detail?.subject) {
    return detail.subject;
  }
  if (summary) {
    return { subjectType, ...summary };
  }
  return null;
};

const deriveStatusInfo = (detail, summary, subject) => {
  const statusFromSubject = subject?.status || summary?.status;
  const computedKey = detail?.status
    ? detail.status.needsToSign
      ? 'outdated'
      : detail.status.hasSigned
        ? 'valid'
        : 'missing'
    : statusFromSubject || null;

  if (!computedKey) {
    return null;
  }

  const key = STATUS_META[computedKey] ? computedKey : 'missing';
  return {
    key,
    meta: STATUS_META[key],
    status: detail?.status || null
  };
};

const StatusAlert = ({ info }) => {
  if (!info) return null;

  const { meta, status } = info;
  const type = meta.tone;

  return (
    <Alert
      type={type}
      showIcon
      message={
        <Space>
          {meta.icon}
          <span>{meta.label}</span>
        </Space>
      }
      description={
        <Space direction="vertical" size={0}>
          <Text>{status?.message || 'Latest waiver status information displayed below.'}</Text>
          <Text type="secondary">
            {status?.lastSigned ? `Last signed ${formatDateTime(status.lastSigned)}` : 'No signature on record'}
          </Text>
        </Space>
      }
    />
  );
};

const SignaturePreview = ({ subject }) => {
  if (!subject?.signatureUrl) return null;

  return (
    <div>
      <Title level={5}>Signature Image</Title>
      <Image
        src={subject.signatureUrl}
        alt="Signature"
        width={320}
        height={200}
        style={{ border: '1px solid #f0f0f0', padding: 8, background: '#fff' }}
      />
    </div>
  );
};

const HistorySection = ({ history }) => (
  <div>
    <Title level={5}>Waiver History</Title>
    {history.length === 0 ? (
      <Empty description="No waiver submissions yet" />
    ) : (
      <Table
        size="small"
        rowKey={(record) => record.id || `${record.waiver_version}-${record.signed_at}`}
        columns={historyColumns}
        dataSource={history}
        pagination={false}
      />
    )}
  </div>
);

const NotesSection = ({ hasHistory }) => {
  if (!hasHistory) return null;
  return (
    <>
      <Divider />
      <Title level={5}>Notes</Title>
      <Paragraph type="secondary">
        History includes every waiver submission captured for this subject. A record marked as "Needs Re-sign" indicates either a newer version is active or the waiver has expired.
      </Paragraph>
    </>
  );
};

const AdminWaiverViewer = ({
  open,
  subjectId,
  subjectType,
  summary = null,
  onClose = () => {}
}) => {
  const { loading, error, detail } = useWaiverDetail(open, subjectId, subjectType);
  const subject = useMemo(() => deriveSubject(detail, summary, subjectType), [detail, summary, subjectType]);
  const statusInfo = useMemo(() => deriveStatusInfo(detail, summary, subject), [detail, summary, subject]);
  const history = detail?.history ?? [];

  let content = null;

  if (loading) {
    content = (
      <div className="flex items-center justify-center py-12">
        <Spin tip="Loading waiver detail..." />
      </div>
    );
  } else if (error) {
    content = <Alert type="error" showIcon message="Failed to load waiver detail" description={error} />;
  } else if (!subject) {
    content = <Empty description="No subject selected" />;
  } else {
    content = (
      <Space direction="vertical" size="large" className="w-full">
        <StatusAlert info={statusInfo} />
        <div>
          <Title level={5}>Subject Information</Title>
          <Descriptions bordered size="small" column={1} items={buildSubjectLines(subject)} />
        </div>
        <SignaturePreview subject={subject} />
        <HistorySection history={history} />
        <NotesSection hasHistory={history.length > 0} />
      </Space>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      destroyOnHidden
      title={
        <Space direction="vertical" size={2}>
          <Title level={4} style={{ margin: 0 }}>Waiver Detail</Title>
          {subject?.name && <Text type="secondary">{subject.name}</Text>}
        </Space>
      }
    >
      {content}
    </Drawer>
  );
};

AdminWaiverViewer.propTypes = {
  open: PropTypes.bool.isRequired,
  subjectId: PropTypes.string,
  subjectType: PropTypes.oneOf(['user', 'family']),
  summary: PropTypes.object,
  onClose: PropTypes.func
};

export default AdminWaiverViewer;
