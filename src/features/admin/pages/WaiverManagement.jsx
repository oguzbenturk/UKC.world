import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';
import AdminWaiverViewer from '../components/AdminWaiverViewer';
import waiverAdminApi from '../api/waiverAdminApi';

const { Title, Text } = Typography;

const formatDateTime = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—');

const WaiverMobileCard = ({ record, onView }) => {
  const { t } = useTranslation(['admin']);
  const STATUS_TAG = {
    valid: { color: 'green', label: t('admin:waivers.status.valid') },
    outdated: { color: 'orange', label: t('admin:waivers.status.outdated') },
    expired: { color: 'red', label: t('admin:waivers.status.expired') },
    missing: { color: 'default', label: t('admin:waivers.status.missing') }
  };
  const meta = STATUS_TAG[record.status] || STATUS_TAG.missing;
  const isFamily = record.subjectType !== 'user';

  return (
    <Card
      size="small"
      className="mb-3 border-gray-100 shadow-sm"
      actions={[
        <Button key="view" block type="primary" ghost onClick={() => onView(record)}>{t('admin:waivers.mobileCard.viewDetails')}</Button>
      ]}
    >
      <div className="flex justify-between items-start mb-3">
        <Space direction="vertical" size={0} className="w-full">
          <div className="flex justify-between w-full">
             <Text strong className="text-lg">{record.name}</Text>
             <Tag color={meta.color}>{meta.label}</Tag>
          </div>
          <Text type="secondary">{isFamily ? t('admin:waivers.table.familyMember') : t('admin:waivers.table.student')}</Text>
        </Space>
      </div>

      <div className="flex flex-col gap-2 mb-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{t('admin:waivers.mobileCard.signed')}</span>
          <span>{formatDateTime(record.signedAt)}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{t('admin:waivers.mobileCard.version')}</span>
          <Space>
            <span>{record.waiverVersion || '—'}</span>
            {record.latestVersion && record.latestVersion !== record.waiverVersion && (
              <Tag color="orange">{t('admin:waivers.mobileCard.newVersion', { version: record.latestVersion })}</Tag>
            )}
          </Space>
        </div>

        {isFamily && (
          <div className="flex justify-between text-sm border-t pt-2 mt-1">
            <span className="text-gray-500">{t('admin:waivers.mobileCard.parent')}</span>
            <div className="text-right">
              {record.parent ? (
                 <Space direction="vertical" size={0} align="end">
                  <Text>{record.parent.name || '—'}</Text>
                  {record.parent.email && <Text type="secondary" className="text-xs">{record.parent.email}</Text>}
                </Space>
              ) : (
                <Text type="secondary">{t('admin:waivers.mobileCard.noRecord')}</Text>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

const DEFAULT_PAGINATION = {
  page: 1,
  pageSize: 20,
  total: 0,
  pageCount: 0
};

const DEFAULT_FILTERS = {
  page: 1,
  pageSize: 20,
  status: 'all',
  subjectType: 'all',
  sortBy: 'name',
  sortDirection: 'ASC'
};

const resolveSort = (value) => {
  if (!value) return { sortBy: 'name', sortDirection: 'ASC' };
  const [field, direction] = value.split('-');
  switch (field) {
    case 'signedAt':
      return { sortBy: 'signedAt', sortDirection: direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
    case 'status':
      return { sortBy: 'status', sortDirection: direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
    case 'name':
    default:
      return { sortBy: 'name', sortDirection: direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
  }
};

const useWaiverFilters = () => {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchValue(searchInput.trim());
      setFilters((prev) => ({ ...prev, page: 1 }));
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput, setFilters]);

  const queryParams = useMemo(() => ({
    ...filters,
    search: searchValue || undefined,
    status: filters.status === 'all' ? undefined : filters.status,
    subjectType: filters.subjectType === 'all' ? undefined : filters.subjectType
  }), [filters, searchValue]);

  const statsParams = useMemo(() => ({
    search: queryParams.search,
    status: queryParams.status,
    subjectType: queryParams.subjectType
  }), [queryParams]);

  return { filters, setFilters, searchInput, setSearchInput, queryParams, statsParams };
};

const useWaiverData = (queryParams, statsParams) => {
  const { t } = useTranslation(['admin']);
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [stats, setStats] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await waiverAdminApi.list(queryParams);
      setRows(response?.data ?? []);
      setPagination(response?.pagination ?? DEFAULT_PAGINATION);
    } catch (error) {
      message.error(error.message || t('admin:waivers.toast.loadError'));
    } finally {
      setListLoading(false);
    }
  }, [message, queryParams, t]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await waiverAdminApi.stats(statsParams);
      setStats(data ?? null);
    } catch (error) {
      message.error(error.message || t('admin:waivers.toast.statsError'));
    } finally {
      setStatsLoading(false);
    }
  }, [message, statsParams, t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    rows,
    pagination,
    stats,
    listLoading,
    statsLoading,
    refreshList: fetchList
  };
};

const useWaiverExport = (exportParams) => {
  const { t } = useTranslation(['admin']);
  const { message } = App.useApp();
  const [exporting, setExporting] = useState(false);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const blob = await waiverAdminApi.exportCsv(exportParams);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `waivers-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(t('admin:waivers.toast.exportSuccess'));
    } catch (error) {
      message.error(error.message || t('admin:waivers.toast.exportError'));
    } finally {
      setExporting(false);
    }
  }, [exportParams, message, t]);

  return { exporting, exportCsv };
};

const resolveSortValue = (filters) => {
  if (filters.sortBy === 'name') {
    return filters.sortDirection === 'DESC' ? 'name-desc' : 'name-asc';
  }
  if (filters.sortBy === 'signedAt') {
    return filters.sortDirection === 'DESC' ? 'signedAt-desc' : 'signedAt-asc';
  }
  if (filters.sortBy === 'status') {
    return filters.sortDirection === 'DESC' ? 'status-desc' : 'status-asc';
  }
  return 'name-asc';
};

const useColumns = (onView) => {
  const { t } = useTranslation(['admin']);
  const STATUS_TAG = useMemo(() => ({
    valid: { color: 'green', label: t('admin:waivers.status.valid') },
    outdated: { color: 'orange', label: t('admin:waivers.status.outdated') },
    expired: { color: 'red', label: t('admin:waivers.status.expired') },
    missing: { color: 'default', label: t('admin:waivers.status.missing') }
  }), [t]);
  return useMemo(() => ([
    {
      title: t('admin:waivers.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary">{record.subjectType === 'user' ? t('admin:waivers.table.student') : t('admin:waivers.table.familyMember')}</Text>
        </Space>
      )
    },
    {
      title: t('admin:waivers.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (value) => {
        const meta = STATUS_TAG[value] || STATUS_TAG.missing;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      }
    },
    {
      title: t('admin:waivers.table.signedAt'),
      dataIndex: 'signedAt',
      key: 'signedAt',
      render: formatDateTime
    },
    {
      title: t('admin:waivers.table.version'),
      dataIndex: 'waiverVersion',
      key: 'waiverVersion',
      render: (value, record) => (
        <Space>
          <span>{value || '—'}</span>
          {record.latestVersion && record.latestVersion !== value && (
            <Tag color="orange">{t('admin:waivers.table.latestVersion', { version: record.latestVersion })}</Tag>
          )}
        </Space>
      )
    },
    {
      title: t('admin:waivers.table.parentContact'),
      dataIndex: 'parent',
      key: 'parent',
      render: (parent, record) => {
        if (record.subjectType === 'user') {
          return '—';
        }
        if (!parent) {
          return <Text type="secondary">{t('admin:waivers.table.noParent')}</Text>;
        }
        return (
          <Space direction="vertical" size={0}>
            <Text>{parent.name || '—'}</Text>
            {parent.email && <Text type="secondary">{parent.email}</Text>}
          </Space>
        );
      }
    },
    {
      title: t('admin:waivers.table.actions'),
      key: 'actions',
      render: (_, record) => (
        <Button type="link" onClick={() => onView(record)}>
          {t('admin:waivers.table.view')}
        </Button>
      )
    }
  ]), [t, STATUS_TAG, onView]);
};

const WaiverFiltersToolbar = ({
  searchInput,
  onSearchChange,
  status,
  onStatusChange,
  subjectType,
  onSubjectTypeChange,
  sortValue,
  onSortChange,
  onRefresh,
  onExport,
  loading,
  exporting
}) => {
  const { t } = useTranslation(['admin']);
  const STATUS_FILTERS = [
    { value: 'all', label: t('admin:waivers.status.all') },
    { value: 'valid', label: t('admin:waivers.status.valid') },
    { value: 'outdated', label: t('admin:waivers.status.outdated') },
    { value: 'expired', label: t('admin:waivers.status.expired') },
    { value: 'missing', label: t('admin:waivers.status.missing') },
    { value: 'pending', label: t('admin:waivers.status.pending') }
  ];
  const TYPE_FILTERS = [
    { value: 'all', label: t('admin:waivers.subjectType.all') },
    { value: 'user', label: t('admin:waivers.subjectType.user') },
    { value: 'family', label: t('admin:waivers.subjectType.family') }
  ];
  const SORT_OPTIONS = [
    { value: 'name-asc', label: t('admin:waivers.sort.nameAsc') },
    { value: 'name-desc', label: t('admin:waivers.sort.nameDesc') },
    { value: 'signedAt-desc', label: t('admin:waivers.sort.signedAtDesc') },
    { value: 'signedAt-asc', label: t('admin:waivers.sort.signedAtAsc') },
    { value: 'status-asc', label: t('admin:waivers.sort.statusAsc') },
    { value: 'status-desc', label: t('admin:waivers.sort.statusDesc') }
  ];
  return (
    <Card>
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} md={10} lg={8}>
          <Input
            placeholder={t('admin:waivers.filters.searchPlaceholder')}
            allowClear
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </Col>
        <Col xs={24} sm={12} md={7} lg={6}>
          <Select
            className="w-full"
            options={STATUS_FILTERS}
            value={status}
            onChange={onStatusChange}
          />
        </Col>
        <Col xs={24} sm={12} md={7} lg={6}>
          <Select
            className="w-full"
            options={TYPE_FILTERS}
            value={subjectType}
            onChange={onSubjectTypeChange}
          />
        </Col>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Select
            className="w-full"
            options={SORT_OPTIONS}
            value={sortValue}
            onChange={onSortChange}
          />
        </Col>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Space className="w-full" wrap>
            <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
              {t('admin:waivers.filters.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={onExport}
              loading={exporting}
            >
              {t('admin:waivers.filters.exportCsv')}
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  );
};

const StatusBreakdown = ({ breakdown }) => {
  const { t } = useTranslation(['admin']);
  return (
    <Space wrap>
      <Tag color="green">{t('admin:waivers.stats.valid', { count: breakdown.valid ?? 0 })}</Tag>
      <Tag color="orange">{t('admin:waivers.stats.outdated', { count: breakdown.outdated ?? 0 })}</Tag>
      <Tag color="red">{t('admin:waivers.stats.expired', { count: breakdown.expired ?? 0 })}</Tag>
      <Tag color="default">{t('admin:waivers.stats.missing', { count: breakdown.missing ?? 0 })}</Tag>
    </Space>
  );
};

const SummaryCard = ({ title, value, suffix, loading }) => (
  <Col xs={24} md={12} lg={6}>
    <Card loading={loading}>
      <Statistic title={title} value={value} suffix={suffix} />
    </Card>
  </Col>
);

const SummaryCards = ({ stats, loading }) => {
  const { t } = useTranslation(['admin']);
  const totalSubjects = stats?.totals?.subjects ?? 0;
  const config = [
    { key: 'subjects', title: t('admin:waivers.stats.totalSubjects'), value: totalSubjects },
    { key: 'signed', title: t('admin:waivers.stats.signed'), value: stats?.valid?.overall ?? 0, suffix: `/ ${totalSubjects}` },
    { key: 'pending', title: t('admin:waivers.stats.pending'), value: stats?.pending?.overall ?? 0 }
  ];

  return config.map((card) => (
    <SummaryCard
      key={card.key}
      title={card.title}
      value={card.value}
      suffix={card.suffix}
      loading={loading}
    />
  ));
};

const CompletionCard = ({ completionRate, breakdown, loading }) => {
  const { t } = useTranslation(['admin']);
  return (
    <Col xs={24} md={12} lg={6}>
      <Card loading={loading}>
        <Space direction="vertical" className="w-full" size="small">
          <Text type="secondary">{t('admin:waivers.stats.completionRate')}</Text>
          <Progress percent={completionRate} status="active" />
          <StatusBreakdown breakdown={breakdown} />
        </Space>
      </Card>
    </Col>
  );
};

const WaiverStatsGrid = ({ stats, loading }) => {
  const completionRate = stats?.completionRate ?? 0;
  const breakdown = stats?.breakdown ?? {};

  return (
    <Row gutter={[16, 16]}>
      <SummaryCards stats={stats} loading={loading} />
      <CompletionCard completionRate={completionRate} breakdown={breakdown} loading={loading} />
    </Row>
  );
};

const WaiverManagement = () => {
  const { t } = useTranslation(['admin']);
  const { filters, setFilters, searchInput, setSearchInput, queryParams, statsParams } = useWaiverFilters();
  const exportParams = useMemo(() => ({
    ...statsParams,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection
  }), [statsParams, filters.sortBy, filters.sortDirection]);
  const { rows, pagination, stats, listLoading, statsLoading, refreshList } = useWaiverData(queryParams, statsParams);
  const { exporting, exportCsv } = useWaiverExport(exportParams);
  const [viewer, setViewer] = useState({ open: false, record: null });

  const handleTableChange = useCallback((paginationConfig) => {
    setFilters((prev) => ({
      ...prev,
      page: paginationConfig.current,
      pageSize: paginationConfig.pageSize
    }));
  }, [setFilters]);

  const handleSortChange = useCallback((value) => {
    const { sortBy, sortDirection } = resolveSort(value);
    setFilters((prev) => ({
      ...prev,
      sortBy,
      sortDirection,
      page: 1
    }));
  }, [setFilters]);

  const currentSortValue = useMemo(() => resolveSortValue(filters), [filters]);

  const handleView = useCallback((record) => setViewer({ open: true, record }), []);
  const columns = useColumns(handleView);

  return (
    <div className="p-4 md:p-6">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space direction="vertical" className="w-full">
            <Title level={3} style={{ margin: 0 }}>{t('admin:waivers.title')}</Title>
            <Text type="secondary">{t('admin:waivers.subtitle')}</Text>
          </Space>
        </Col>

        <Col span={24}>
          <WaiverFiltersToolbar
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            status={filters.status}
            onStatusChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}
            subjectType={filters.subjectType}
            onSubjectTypeChange={(value) => setFilters((prev) => ({ ...prev, subjectType: value, page: 1 }))}
            sortValue={currentSortValue}
            onSortChange={handleSortChange}
            onRefresh={refreshList}
            onExport={exportCsv}
            loading={listLoading}
            exporting={exporting}
          />
        </Col>

        <Col span={24}>
          <WaiverStatsGrid stats={stats} loading={statsLoading} />
        </Col>

        <Col span={24}>
          <Card>
            <UnifiedResponsiveTable
              rowKey={(record) => record.subjectId}
              columns={columns}
              dataSource={rows}
              loading={listLoading}
              pagination={{
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true
              }}
              onChange={handleTableChange}
              mobileCardRenderer={(props) => (
                <WaiverMobileCard
                  {...props}
                  onView={(record) => setViewer({ open: true, record })}
                />
              )}
            />
          </Card>
        </Col>
      </Row>

      <AdminWaiverViewer
        open={viewer.open}
        subjectId={viewer.record?.subjectId}
        subjectType={viewer.record?.subjectType}
        summary={viewer.record || null}
        onClose={() => setViewer({ open: false, record: null })}
      />
    </div>
  );
};

export default WaiverManagement;
