/* eslint-disable complexity */
import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Alert,
	Avatar,
	Button,
	Card,
	Empty,
	List,
	Row,
	Col,
	Result,
	Select,
	Space,
	Spin,
	Statistic,
	Tag,
	Switch,
	Tooltip,
	Typography
} from 'antd';
import {
	ResponsiveContainer,
	BarChart,
	Bar,
	CartesianGrid,
	XAxis,
	YAxis,
	Tooltip as RechartsTooltip
} from 'recharts';
import {
	StarFilled,
	LikeFilled,
	TeamOutlined,
	FieldTimeOutlined,
	CrownFilled,
	RiseOutlined,
	FilePdfOutlined,
	ReloadOutlined
} from '@ant-design/icons';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';
import { useInstructorRatingsAnalytics } from '../hooks/useInstructorRatingsAnalytics';

const { Title, Text } = Typography;
const { Option } = Select;

const DEFAULT_FILTERS = {
	serviceType: 'all',
	sortBy: 'average',
	limit: 50,
	timeRange: 'all',
	benchmark: 4.8,
	highlightBenchmark: true
};

// Options moved into component to use t()

const formatPercent = (value) => `${(value ?? 0).toFixed(1)}%`;

const summaryAccentStyles = {
	sky: {
		icon: 'bg-sky-100 text-sky-600',
		valueColor: '#0284c7'
	},
	amber: {
		icon: 'bg-amber-100 text-amber-600',
		valueColor: '#d97706'
	},
	emerald: {
		icon: 'bg-emerald-100 text-emerald-600',
		valueColor: '#047857'
	},
	indigo: {
		icon: 'bg-indigo-100 text-indigo-600',
		valueColor: '#4338ca'
	},
	slate: {
		icon: 'bg-slate-200 text-slate-700',
		valueColor: '#1f2937'
	}
};

const MetricCard = ({ title, description, icon, accent = 'slate', statisticProps, valueRender }) => {
	const accentStyles = summaryAccentStyles[accent] || summaryAccentStyles.slate;

	const renderValue = () => {
		if (valueRender) {
			return valueRender();
		}

		const baseProps = statisticProps ?? { value: 0 };
		const { valueStyle, ...rest } = baseProps;

		return (
			<Statistic
				{...rest}
				valueStyle={{
					fontSize: 28,
					fontWeight: 600,
					lineHeight: '32px',
					color: accentStyles.valueColor,
					...(valueStyle ?? {})
				}}
			/>
		);
	};

	return (
		<div className="h-full rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur">
			<Space direction="vertical" size={12} className="w-full">
				<Space size={12} align="center">
					<span className={`flex h-9 w-9 items-center justify-center rounded-full ${accentStyles.icon}`}>
						{icon}
					</span>
					<Text strong>{title}</Text>
				</Space>
				<div>{renderValue()}</div>
				<Text type="secondary">{description}</Text>
			</Space>
		</div>
	);
};

const LeaderboardMobileCard = ({ record, t }) => {
  const isBenchmark = record.benchmarkHit;
  const isTop3 = record.rank <= 3;

  return (
    <Card
      size="small"
      className={`mb-3 shadow-sm ${isBenchmark ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'} ${isTop3 ? 'border-l-4 border-l-amber-400' : ''}`}
    >
      <div className="flex justify-between items-start mb-2">
         <div className="flex items-center gap-2">
            <Avatar style={{ backgroundColor: isTop3 ? '#f59e0b' : '#1890ff' }}>{record.rank}</Avatar>
            <div className="font-semibold text-lg">{record.instructorName}</div>
         </div>
         <div className="flex flex-col items-end">
            <Tag color="blue" className="mr-0 mb-1">{record.averageRating} {t('admin:ratings.mobileCard.avg')}</Tag>
            {isBenchmark && <Tag color="gold" className="mr-0">{t('admin:ratings.mobileCard.topTier')}</Tag>}
         </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
         <div className="text-gray-500">{t('admin:ratings.mobileCard.ratingsLabel')} <span className="text-gray-900 font-medium">{record.totalRatings}</span></div>
         <div className="text-gray-500 text-right">{t('admin:ratings.mobileCard.fiveStarShare')} <span className="text-gray-900 font-medium">{formatPercent(record.fiveStarShare)}</span></div>
      </div>

      <div className="border-t pt-2 mt-1 grid grid-cols-3 gap-1 text-xs text-center">
         <div>
           <div className="text-gray-500">{t('admin:ratings.mobileCard.lesson')}</div>
           <div className="font-medium">{Number(record.breakdown?.lesson?.average || 0).toFixed(2)}</div>
         </div>
         <div className="border-l border-r border-gray-100">
           <div className="text-gray-500">{t('admin:ratings.mobileCard.rental')}</div>
           <div className="font-medium">{Number(record.breakdown?.rental?.average || 0).toFixed(2)}</div>
         </div>
         <div>
           <div className="text-gray-500">{t('admin:ratings.mobileCard.accomm')}</div>
           <div className="font-medium">{Number(record.breakdown?.accommodation?.average || 0).toFixed(2)}</div>
         </div>
      </div>

      <div className="text-xs text-gray-400 mt-2 text-right">{t('admin:ratings.mobileCard.lastRated', { date: record.lastRatingAt || '—' })}</div>
    </Card>
  );
};


const InstructorRatingsAnalytics = () => {
	const { t } = useTranslation(['admin']);
	const [filters, setFilters] = useState(DEFAULT_FILTERS);

	const SORT_OPTIONS = [
		{ value: 'average', label: t('admin:ratings.sort.average'), title: t('admin:ratings.sort.average') },
		{ value: 'count', label: t('admin:ratings.sort.count'), title: t('admin:ratings.sort.count') },
		{ value: 'recent', label: t('admin:ratings.sort.recent'), title: t('admin:ratings.sort.recent') },
	];

	const SERVICE_TYPE_OPTIONS = [
		{ value: 'all', label: t('admin:ratings.serviceType.all') },
		{ value: 'lesson', label: t('admin:ratings.serviceType.lesson') },
		{ value: 'rental', label: t('admin:ratings.serviceType.rental') },
		{ value: 'accommodation', label: t('admin:ratings.serviceType.accommodation') },
	];

	const TIME_RANGE_OPTIONS = [
		{ value: 'all', label: t('admin:ratings.timeRange.all') },
		{ value: '7d', label: t('admin:ratings.timeRange.7d') },
		{ value: '30d', label: t('admin:ratings.timeRange.30d') },
		{ value: '90d', label: t('admin:ratings.timeRange.90d') },
	];
	const [autoRefresh, setAutoRefresh] = useState(false);
	const { data, isLoading, error, refetch } = useInstructorRatingsAnalytics(filters, {
		autoRefresh,
		refetchIntervalMs: 60_000
	});

	const tableData = useMemo(() => {
		const instructorRows = data?.instructors ?? [];
		return instructorRows.map((item, index) => {
			const average = Number(item.averageRating || 0);
			const totalRatings = Number(item.totalRatings || 0);
			const fiveStarCount = Number(item.distribution?.[5] || 0);
			const fiveStarShare = totalRatings > 0 ? (fiveStarCount / totalRatings) * 100 : 0;
			const lastRatingDate = item.lastRatingAt ? new Date(item.lastRatingAt) : null;

			return {
				key: item.instructorId,
				rank: index + 1,
				instructorName: item.instructorName,
				instructorAvatar: item.instructorAvatar,
				averageRating: average.toFixed(2),
				numericAverage: average,
				totalRatings,
				fiveStarShare,
				lastRatingAt: lastRatingDate ? lastRatingDate.toLocaleDateString() : null,
				lastRatingTimestamp: lastRatingDate ? lastRatingDate.getTime() : null,
				breakdown: item.breakdown,
				distribution: item.distribution,
				benchmarkHit: filters.highlightBenchmark ? average >= filters.benchmark : false
			};
		});
	}, [data?.instructors, filters.benchmark, filters.highlightBenchmark]);

	const handleSortChange = useCallback((value) => {
		setFilters((prev) => ({ ...prev, sortBy: value }));
	}, []);

	const handleServiceTypeChange = useCallback((value) => {
		setFilters((prev) => ({ ...prev, serviceType: value }));
	}, []);

	const handleTimeRangeChange = useCallback((value) => {
		setFilters((prev) => ({ ...prev, timeRange: value }));
	}, []);

	const handleBenchmarkToggle = useCallback((checked) => {
		setFilters((prev) => ({ ...prev, highlightBenchmark: checked }));
	}, []);

	const handleAutoRefreshToggle = useCallback((checked) => {
		setAutoRefresh(checked);
	}, []);

	const handleManualRefresh = useCallback(() => {
		if (typeof refetch === 'function') {
			refetch();
		}
	}, [refetch]);

	const handleExportPdf = useCallback(async () => {
		if (!tableData.length) {
			return;
		}

		const { default: jsPDF } = await import('jspdf');
		const { default: autoTable } = await import('jspdf-autotable');
		const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
		doc.setFontSize(18);
		doc.text('Instructor Rating Overview', 40, 40);
		autoTable(doc, {
			startY: 70,
			head: [['#', 'Instructor', 'Avg Rating', 'Ratings', '5★ Share', 'Last Rating']],
			body: tableData.map((row) => [
				row.rank,
				row.instructorName,
				row.averageRating,
				row.totalRatings,
				formatPercent(row.fiveStarShare),
				row.lastRatingAt || '—'
			])
		});
		doc.save('instructor-rating-overview.pdf');
	}, [tableData]);

	const starDistributionData = useMemo(
		() =>
			data.starBuckets.map((count, index) => ({
				label: t('admin:ratings.charts.stars', { count: 5 - index }),
				count
			})),
		[data.starBuckets, t]
	);

	const serviceBreakdownData = useMemo(
		() => [
			{
				name: 'Lessons',
				average: Number(data.serviceBreakdown.lesson.average || 0),
				count: data.serviceBreakdown.lesson.count
			},
			{
				name: 'Rentals',
				average: Number(data.serviceBreakdown.rental.average || 0),
				count: data.serviceBreakdown.rental.count
			},
			{
				name: 'Accommodation',
				average: Number(data.serviceBreakdown.accommodation.average || 0),
				count: data.serviceBreakdown.accommodation.count
			}
		],
		[data.serviceBreakdown]
	);

	const latestFeedbackLabel = useMemo(() => {
		const latest = tableData.reduce((current, record) => {
			if (!record.lastRatingTimestamp) return current;
			if (!current) return record.lastRatingTimestamp;
			return record.lastRatingTimestamp > current ? record.lastRatingTimestamp : current;
		}, null);

		return latest ? new Date(latest).toLocaleDateString() : t('admin:ratings.metrics.noRatingsYet');
	}, [tableData, t]);

	const totalRatings = data.totals.totalRatings;
	const overallAverage = Number(data.totals.average || 0);
	const fiveStarShareValue = Number(data.totals.fiveStarShare || 0);
	const hasRatings = totalRatings > 0;

	const summaryCards = useMemo(
		() => [
			{
				key: 'average',
				title: t('admin:ratings.metrics.averageRating'),
				icon: <StarFilled style={{ fontSize: 18 }} />,
				accent: 'amber',
				statisticProps: {
					value: overallAverage,
					precision: 2
				},
				description: hasRatings ? t('admin:ratings.metrics.computedAcross', { count: totalRatings }) : t('admin:ratings.metrics.noRatings')
			},
			{
				key: 'fiveStarShare',
				title: t('admin:ratings.metrics.fiveStarShare'),
				icon: <LikeFilled style={{ fontSize: 18 }} />,
				accent: 'sky',
				statisticProps: {
					value: fiveStarShareValue,
					precision: 1,
					suffix: '%'
				},
				description: hasRatings
					? t('admin:ratings.metrics.portionFiveStars')
					: t('admin:ratings.metrics.collectMore')
			},
			{
				key: 'activeInstructors',
				title: t('admin:ratings.metrics.activeInstructors'),
				icon: <TeamOutlined style={{ fontSize: 18 }} />,
				accent: 'emerald',
				statisticProps: {
					value: tableData.length
				},
				description: tableData.length
					? t('admin:ratings.metrics.currentlyOnLeaderboard')
					: t('admin:ratings.metrics.noInstructorsYet')
			},
			{
				key: 'latestFeedback',
				title: t('admin:ratings.metrics.mostRecentFeedback'),
				icon: <FieldTimeOutlined style={{ fontSize: 18 }} />,
				accent: 'indigo',
				statisticProps: {
					value: latestFeedbackLabel
				},
				description: hasRatings
					? t('admin:ratings.metrics.latestSubmissionDate')
					: t('admin:ratings.metrics.noFeedback')
			}
		],
		[hasRatings, latestFeedbackLabel, overallAverage, tableData.length, totalRatings, fiveStarShareValue, t]
	);

	const sortDescriptorMap = {
		average: t('admin:ratings.sort.average'),
		count: t('admin:ratings.sort.count'),
		recent: t('admin:ratings.sort.recent'),
	};
	const sortDescriptor = sortDescriptorMap[filters.sortBy] ?? filters.sortBy;

	const topPerformers = useMemo(() => tableData.slice(0, 3), [tableData]);

	const insights = useMemo(() => {
		if (!hasRatings) {
			return [
				{
					title: t('admin:ratings.insights.noRatings'),
					description: t('admin:ratings.insights.noRatingsDescription')
				}
			];
		}

		const highestFiveStar = tableData.reduce(
			(acc, record) => {
				if (record.fiveStarShare > acc.value) {
					return { name: record.instructorName, value: record.fiveStarShare };
				}
				return acc;
			},
			{ name: '', value: 0 }
		);

		const mostRatings = tableData.reduce(
			(acc, record) => {
				if (record.totalRatings > acc.value) {
					return { name: record.instructorName, value: record.totalRatings };
				}
				return acc;
			},
			{ name: '', value: 0 }
		);

		return [
			{
				title: t('admin:ratings.insights.overallAverage'),
				description: t('admin:ratings.insights.overallAverageDescription', { average: overallAverage.toFixed(2), total: totalRatings })
			},
			{
				title: t('admin:ratings.insights.fiveStarChampions'),
				description: t('admin:ratings.insights.fiveStarChampionsDescription', { name: highestFiveStar.name || '—', percent: formatPercent(highestFiveStar.value) })
			},
			{
				title: t('admin:ratings.insights.mostFeedback'),
				description: t('admin:ratings.insights.mostFeedbackDescription', { name: mostRatings.name || '—', count: mostRatings.value })
			}
		];
	}, [hasRatings, overallAverage, tableData, totalRatings, t]);

	const columns = [
		{
			title: t('admin:ratings.table.rank'),
			dataIndex: 'rank',
			key: 'rank',
			width: 60
		},
		{
			title: t('admin:ratings.table.instructor'),
			dataIndex: 'instructorName',
			key: 'instructorName',
			render: (name, record) => (
				<Space size={8} align="center">
					<Avatar
						src={record.instructorAvatar}
						size="small"
						style={{ backgroundColor: '#2563eb' }}
					>
						{name?.[0] ?? '?'}
					</Avatar>
					<Text strong>{name}</Text>
				</Space>
			),
			sorter: (a, b) => a.instructorName.localeCompare(b.instructorName)
		},
		{
			title: t('admin:ratings.table.averageRating'),
			dataIndex: 'averageRating',
			key: 'averageRating',
			render: (value) => <Text>{value}</Text>,
			sorter: (a, b) => Number(a.averageRating) - Number(b.averageRating)
		},
		{
			title: t('admin:ratings.table.ratings'),
			dataIndex: 'totalRatings',
			key: 'totalRatings',
			sorter: (a, b) => a.totalRatings - b.totalRatings
		},
		{
			title: t('admin:ratings.table.fiveStarShare'),
			dataIndex: 'fiveStarShare',
			key: 'fiveStarShare',
			render: (value) => <Tag color={value >= 60 ? 'green' : 'blue'}>{formatPercent(value)}</Tag>,
			sorter: (a, b) => a.fiveStarShare - b.fiveStarShare
		},
		{
			title: t('admin:ratings.table.lastRating'),
			dataIndex: 'lastRatingAt',
			key: 'lastRatingAt'
		},
		{
			title: t('admin:ratings.table.lessonAvg'),
			dataIndex: ['breakdown', 'lesson', 'average'],
			key: 'lessonAverage',
			render: (_, record) => (
				<Tooltip title={`${record.breakdown?.lesson?.count ?? 0} lesson ratings`}>
					<Text>{Number(record.breakdown?.lesson?.average || 0).toFixed(2)}</Text>
				</Tooltip>
			)
		},
		{
			title: t('admin:ratings.table.rentalAvg'),
			dataIndex: ['breakdown', 'rental', 'average'],
			key: 'rentalAverage',
			render: (_, record) => (
				<Tooltip title={`${record.breakdown?.rental?.count ?? 0} rental ratings`}>
					<Text>{Number(record.breakdown?.rental?.average || 0).toFixed(2)}</Text>
				</Tooltip>
			)
		},
		{
			title: t('admin:ratings.table.accommodationAvg'),
			dataIndex: ['breakdown', 'accommodation', 'average'],
			key: 'accommodationAverage',
			render: (_, record) => (
				<Tooltip title={`${record.breakdown?.accommodation?.count ?? 0} accommodation ratings`}>
					<Text>{Number(record.breakdown?.accommodation?.average || 0).toFixed(2)}</Text>
				</Tooltip>
			)
		},
		filters.highlightBenchmark && {
			title: t('admin:ratings.table.benchmark'),
			dataIndex: 'benchmarkHit',
			key: 'benchmarkHit',
			render: (_, record) =>
				record.benchmarkHit ? <Tag color="gold">{t('admin:ratings.table.topPerformer')}</Tag> : <Tag>{t('admin:ratings.table.belowTarget')}</Tag>
		}
	];

	const sanitizedColumns = columns.filter(Boolean);

	return (
		<div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
			<Card
				variant="borderless"
				className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-8"
			>
				<div className="pointer-events-none absolute -top-20 right-8 h-44 w-44 rounded-full bg-indigo-100" />
				<div className="pointer-events-none absolute -bottom-24 left-16 h-48 w-48 rounded-full bg-purple-50" />
				<div className="relative">
					<Space direction="vertical" size={16} className="w-full">
						<Space size={12} align="center" className="w-full justify-between">\n							<div className="space-y-2">
								<Title level={2} className="!mb-0 text-slate-900 flex items-center gap-3">
									<StarFilled className="text-amber-500 flex-shrink-0" />
									{t('admin:ratings.title')}
								</Title>
								<Text className="text-slate-600 text-base">
									{t('admin:ratings.subtitle')}
								</Text>
							</div>
						</Space>
						<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
							{summaryCards.map(({ key, ...metric }) => (
								<MetricCard key={key} {...metric} />
							))}
						</div>
					</Space>
				</div>
			</Card>

			{error && (
				<Alert
					type="error"
					showIcon
					message={t('admin:ratings.error')}
					description={error.message}
					className="rounded-2xl border border-rose-200 bg-rose-50"
				/>
			)}

			<div className="grid gap-6 2xl:grid-cols-[3fr_1fr]">
				<div className="space-y-6">
					<Card
						className="rounded-2xl border border-slate-200 shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-6"
						loading={isLoading}
					>
						<Space direction="vertical" size={12} className="w-full">
							<Title level={4} style={{ margin: 0 }}>{t('admin:ratings.charts.ratingDistribution')}</Title>
							<Text type="secondary">{t('admin:ratings.charts.ratingDistributionSubtitle')}</Text>
						</Space>
						<div className="mt-4" style={{ height: 260 }}>
							{!totalRatings ? (
								<Empty description={t('admin:ratings.charts.noRatingData')} />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={starDistributionData}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="label" />
										<YAxis allowDecimals={false} />
										<RechartsTooltip />
										<Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</Card>

					<Card
						className="rounded-2xl border border-slate-200 shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-6"
					>
						<Space direction="vertical" size={12} className="w-full">
							<Title level={4} style={{ margin: 0 }}>{t('admin:ratings.charts.serviceBreakdown')}</Title>
							<Text type="secondary">
								{totalRatings
									? t('admin:ratings.charts.serviceBreakdownSubtitle', { fiveStarPercent: formatPercent(fiveStarShareValue), average: overallAverage.toFixed(2) })
									: t('admin:ratings.charts.noServiceBreakdown')}
							</Text>
						</Space>
						<div className="mt-4" style={{ height: 260 }}>
							{!totalRatings ? (
								<Empty description={t('admin:ratings.charts.noServiceBreakdownData')} />
							) : (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={serviceBreakdownData}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="name" />
										<YAxis domain={[0, 5]} tickFormatter={(value) => value.toFixed(1)} />
										<RechartsTooltip />
										<Bar dataKey="average" fill="#34d399" radius={[6, 6, 0, 0]} />
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</Card>
				</div>

				<Card
					className="rounded-2xl border border-slate-200 shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-6"
				>
					<Space direction="vertical" size={16} className="w-full">
						<Space size={10} align="center">
							<RiseOutlined style={{ color: '#0ea5e9' }} />
							<Text strong>{t('admin:ratings.insights.title')}</Text>
						</Space>
						<List
							dataSource={insights}
							split={false}
							renderItem={(item) => (
								<List.Item style={{ padding: '12px 0' }}>
									<List.Item.Meta
										title={<Text strong>{item.title}</Text>}
										description={<Text type="secondary">{item.description}</Text>}
									/>
								</List.Item>
							)}
						/>
					</Space>
				</Card>
			</div>

			<Card
				className="rounded-2xl border border-slate-200 shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-6"
			>
				<Space direction="vertical" size={16} className="w-full">
					<Space size={10} align="center">
						<CrownFilled style={{ color: '#f59e0b' }} />
						<Text strong>{t('admin:ratings.topPerformers.title')}</Text>
					</Space>
					{!topPerformers.length ? (
						<Empty description={t('admin:ratings.topPerformers.noInstructors')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
					) : (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{topPerformers.map((item, index) => (
								<div
									key={item.key}
									className={`flex items-center gap-3 p-3 rounded-xl border ${
										index === 0
											? 'bg-amber-50 border-amber-200'
											: 'bg-slate-50 border-slate-200'
									}`}
								>
									<Avatar
										src={item.instructorAvatar}
										style={{ backgroundColor: index === 0 ? '#f59e0b' : '#2563eb' }}
									>
										{item.instructorName?.[0] ?? '?'}
									</Avatar>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<Text strong className="truncate">#{item.rank} {item.instructorName}</Text>
											{index === 0 && <Tag color="gold" className="m-0 flex-shrink-0">{t('admin:ratings.topPerformers.champion')}</Tag>}
										</div>
										<Text type="secondary" className="text-xs">
											{t('admin:ratings.topPerformers.avgRatingsFormat', { avg: item.averageRating, count: item.totalRatings, fiveStarPct: formatPercent(item.fiveStarShare) })}
										</Text>
									</div>
								</div>
							))}
						</div>
					)}
				</Space>
			</Card>

			<Card
				className="rounded-2xl border border-slate-200 shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-6"
			>
				<Space direction="vertical" size={12} className="w-full">
					<Title level={4} style={{ margin: 0 }}>{t('admin:ratings.leaderboard.title')}</Title>
						<Text type="secondary">
							{totalRatings
								? t('admin:ratings.leaderboard.subtitle')
								: t('admin:ratings.leaderboard.waitingForRatings')}
						</Text>
					</Space>

					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<Spin />
						</div>
					) : !tableData.length ? (
						<Result
							title={t('admin:ratings.leaderboard.noDataTitle')}
							subTitle={t('admin:ratings.leaderboard.noDataSubtitle')}
						/>
					) : (
							<>
								<Row gutter={[16, 16]} className="mb-6">
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>{t('admin:ratings.leaderboard.sortBy')}</Text>
											<Select
												value={filters.sortBy}
												onChange={handleSortChange}
												optionLabelProp="title"
												popupMatchSelectWidth={false}
												className="w-full"
											>
												{SORT_OPTIONS.map((option) => (
													<Option key={option.value} value={option.value} title={option.title}>
														{option.label}
													</Option>
												))}
											</Select>
										</Space>
									</Col>
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>{t('admin:ratings.leaderboard.benchmarkHighlight')}</Text>
											<Space size={8} align="center">
												<Switch
													checked={filters.highlightBenchmark}
													onChange={handleBenchmarkToggle}
													aria-label="Toggle benchmark highlight"
												/>
												<Text type="secondary" className="truncate">
													{filters.highlightBenchmark ? t('admin:ratings.leaderboard.showingBadges') : t('admin:ratings.leaderboard.hidden')}
												</Text>
											</Space>
										</Space>
									</Col>
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>{t('admin:ratings.leaderboard.autoRefresh')}</Text>
											<Space size={8} align="center">
												<Switch
													checked={autoRefresh}
													onChange={handleAutoRefreshToggle}
													aria-label="Auto refresh"
												/>
												<Text type="secondary">{t('admin:ratings.leaderboard.every60s')}</Text>
											</Space>
										</Space>
									</Col>
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>{t('admin:ratings.leaderboard.actions')}</Text>
											<Space size={8} wrap>
												<Button icon={<ReloadOutlined />} onClick={handleManualRefresh}>
													{t('admin:ratings.leaderboard.refresh')}
												</Button>
												<Button
													icon={<FilePdfOutlined />}
													onClick={handleExportPdf}
													disabled={!tableData.length}
												>
													{t('admin:ratings.leaderboard.export')}
												</Button>
											</Space>
										</Space>
									</Col>
								</Row>
								<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
									<Text type="secondary" className="uppercase tracking-wide text-xs">
										{t('admin:ratings.leaderboard.sortedBy', { descriptor: sortDescriptor })}
									</Text>
									<Text type="secondary">{t('admin:ratings.leaderboard.benchmarkNote')}</Text>
								</div>
							<UnifiedResponsiveTable
								columns={sanitizedColumns}
								dataSource={tableData}
								rowKey="key"
								size="middle"
								pagination={{
									pageSize: 10,
									showSizeChanger: false,
									showTotal: (total) => t('admin:ratings.leaderboard.totalInstructors', { count: total })
								}}
								scroll={{ x: 1200 }}
								rowClassName={(record) => {
									const classes = [];
									if (record.benchmarkHit) {
										classes.push('bg-amber-50 dark:bg-amber-900/30 transition-colors');
									}
									if (record.rank <= 3) {
										classes.push('border-l-4 border-l-amber-400');
									}
									return classes.join(' ');
								}}
								mobileCardRenderer={(props) => <LeaderboardMobileCard {...props} t={t} />}
							/>
						</>
					)}
			</Card>
		</div>
	);
};

export default InstructorRatingsAnalytics;
