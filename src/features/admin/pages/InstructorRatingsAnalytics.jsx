/* eslint-disable complexity */
import { useMemo, useState, useCallback } from 'react';
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
	Table,
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const SORT_OPTIONS = [
	{ value: 'average', label: 'Highest average rating', title: 'Highest average rating' },
	{ value: 'count', label: 'Most ratings submitted', title: 'Most ratings submitted' },
	{ value: 'recent', label: 'Most recent feedback', title: 'Most recent feedback' }
];

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

const LeaderboardMobileCard = ({ record }) => {
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
            <Tag color="blue" className="mr-0 mb-1">{record.averageRating} Avg</Tag>
            {isBenchmark && <Tag color="gold" className="mr-0">Top Tier</Tag>}
         </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
         <div className="text-gray-500">Ratings: <span className="text-gray-900 font-medium">{record.totalRatings}</span></div>
         <div className="text-gray-500 text-right">5★ Share: <span className="text-gray-900 font-medium">{formatPercent(record.fiveStarShare)}</span></div>
      </div>
      
      <div className="border-t pt-2 mt-1 grid grid-cols-3 gap-1 text-xs text-center">
         <div>
           <div className="text-gray-500">Lesson</div>
           <div className="font-medium">{Number(record.breakdown?.lesson?.average || 0).toFixed(2)}</div>
         </div>
         <div className="border-l border-r border-gray-100">
           <div className="text-gray-500">Rental</div>
           <div className="font-medium">{Number(record.breakdown?.rental?.average || 0).toFixed(2)}</div>
         </div>
         <div>
           <div className="text-gray-500">Accomm</div>
           <div className="font-medium">{Number(record.breakdown?.accommodation?.average || 0).toFixed(2)}</div>
         </div>
      </div>

      <div className="text-xs text-gray-400 mt-2 text-right">Last rated: {record.lastRatingAt || 'Never'}</div>
    </Card>
  );
};


const InstructorRatingsAnalytics = () => {
	const [filters, setFilters] = useState(DEFAULT_FILTERS);
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

	const handleExportPdf = useCallback(() => {
		if (!tableData.length) {
			return;
		}

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
				label: `${5 - index} Stars`,
				count
			})),
		[data.starBuckets]
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

		return latest ? new Date(latest).toLocaleDateString() : 'No ratings';
	}, [tableData]);

	const totalRatings = data.totals.totalRatings;
	const overallAverage = Number(data.totals.average || 0);
	const fiveStarShareValue = Number(data.totals.fiveStarShare || 0);
	const hasRatings = totalRatings > 0;

	const summaryCards = useMemo(
		() => [
			{
				key: 'average',
				title: 'Average rating',
				icon: <StarFilled style={{ fontSize: 18 }} />,
				accent: 'amber',
				statisticProps: {
					value: overallAverage,
					precision: 2
				},
				description: hasRatings ? `Computed across ${totalRatings} submissions.` : 'No ratings submitted yet.'
			},
			{
				key: 'fiveStarShare',
				title: 'Five-star share',
				icon: <LikeFilled style={{ fontSize: 18 }} />,
				accent: 'sky',
				statisticProps: {
					value: fiveStarShareValue,
					precision: 1,
					suffix: '%'
				},
				description: hasRatings
					? 'Portion of total reviews earning five stars.'
					: 'Collect more feedback to populate this metric.'
			},
			{
				key: 'activeInstructors',
				title: 'Active instructors',
				icon: <TeamOutlined style={{ fontSize: 18 }} />,
				accent: 'emerald',
				statisticProps: {
					value: tableData.length
				},
				description: tableData.length
					? 'Currently included in the leaderboard.'
					: 'No instructors have ratings yet.'
			},
			{
				key: 'latestFeedback',
				title: 'Most recent feedback',
				icon: <FieldTimeOutlined style={{ fontSize: 18 }} />,
				accent: 'indigo',
				statisticProps: {
					value: latestFeedbackLabel
				},
				description: hasRatings
					? 'Latest submission date among tracked instructors.'
					: 'No feedback submitted yet.'
			}
		],
		[hasRatings, latestFeedbackLabel, overallAverage, tableData.length, totalRatings, fiveStarShareValue]
	);

	const sortDescriptorMap = {
		average: 'highest average rating',
		count: 'most ratings submitted',
		recent: 'most recent feedback'
	};
	const sortDescriptor = sortDescriptorMap[filters.sortBy] ?? filters.sortBy;

	const topPerformers = useMemo(() => tableData.slice(0, 3), [tableData]);

	const insights = useMemo(() => {
		if (!hasRatings) {
			return [
				{
					title: 'No ratings yet',
					description: 'Encourage students to submit their first reviews to unlock analytics.'
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
				title: 'Overall average',
				description: `${overallAverage.toFixed(2)} across ${totalRatings} total ratings.`
			},
			{
				title: 'Five-star champions',
				description: `${highestFiveStar.name || '—'} leads with ${formatPercent(highestFiveStar.value)} five-star reviews.`
			},
			{
				title: 'Most feedback collected',
				description: `${mostRatings.name || '—'} has received ${mostRatings.value} ratings in total.`
			}
		];
	}, [hasRatings, overallAverage, tableData, totalRatings]);

	const columns = [
		{
			title: '#',
			dataIndex: 'rank',
			key: 'rank',
			width: 60
		},
		{
			title: 'Instructor',
			dataIndex: 'instructorName',
			key: 'instructorName',
			render: (name) => <Text strong>{name}</Text>,
			sorter: (a, b) => a.instructorName.localeCompare(b.instructorName)
		},
		{
			title: 'Average Rating',
			dataIndex: 'averageRating',
			key: 'averageRating',
			render: (value) => <Text>{value}</Text>,
			sorter: (a, b) => Number(a.averageRating) - Number(b.averageRating)
		},
		{
			title: 'Ratings',
			dataIndex: 'totalRatings',
			key: 'totalRatings',
			sorter: (a, b) => a.totalRatings - b.totalRatings
		},
		{
			title: '5★ Share',
			dataIndex: 'fiveStarShare',
			key: 'fiveStarShare',
			render: (value) => <Tag color={value >= 60 ? 'green' : 'blue'}>{formatPercent(value)}</Tag>,
			sorter: (a, b) => a.fiveStarShare - b.fiveStarShare
		},
		{
			title: 'Last Rating',
			dataIndex: 'lastRatingAt',
			key: 'lastRatingAt'
		},
		{
			title: 'Lesson Avg',
			dataIndex: ['breakdown', 'lesson', 'average'],
			key: 'lessonAverage',
			render: (_, record) => (
				<Tooltip title={`${record.breakdown?.lesson?.count ?? 0} lesson ratings`}>
					<Text>{Number(record.breakdown?.lesson?.average || 0).toFixed(2)}</Text>
				</Tooltip>
			)
		},
		{
			title: 'Rental Avg',
			dataIndex: ['breakdown', 'rental', 'average'],
			key: 'rentalAverage',
			render: (_, record) => (
				<Tooltip title={`${record.breakdown?.rental?.count ?? 0} rental ratings`}>
					<Text>{Number(record.breakdown?.rental?.average || 0).toFixed(2)}</Text>
				</Tooltip>
			)
		},
		{
			title: 'Accommodation Avg',
			dataIndex: ['breakdown', 'accommodation', 'average'],
			key: 'accommodationAverage',
			render: (_, record) => (
				<Tooltip title={`${record.breakdown?.accommodation?.count ?? 0} accommodation ratings`}>
					<Text>{Number(record.breakdown?.accommodation?.average || 0).toFixed(2)}</Text>
				</Tooltip>
			)
		},
		filters.highlightBenchmark && {
			title: 'Benchmark',
			dataIndex: 'benchmarkHit',
			key: 'benchmarkHit',
			render: (_, record) =>
				record.benchmarkHit ? <Tag color="gold">Top performer</Tag> : <Tag>Below target</Tag>
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
									Instructor Ratings Analytics
								</Title>
								<Text className="text-slate-600 text-base">
									Track instructor performance and student feedback across all services.
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
					message="Failed to load instructor analytics"
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
							<Title level={4} style={{ margin: 0 }}>Rating distribution</Title>
							<Text type="secondary">How students score instructors over time.</Text>
						</Space>
						<div className="mt-4" style={{ height: 260 }}>
							{!totalRatings ? (
								<Empty description="No rating data yet" />
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
							<Title level={4} style={{ margin: 0 }}>Service breakdown</Title>
							<Text type="secondary">
								{totalRatings
									? `${formatPercent(fiveStarShareValue)} of ratings are five-star. Overall average is ${overallAverage.toFixed(2)}.`
									: 'Collect more feedback to unlock this breakdown.'}
							</Text>
						</Space>
						<div className="mt-4" style={{ height: 260 }}>
							{!totalRatings ? (
								<Empty description="No service breakdown available" />
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
							<Text strong>Key insights</Text>
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
				<Space direction="vertical" size={12} className="w-full">
					<Title level={4} style={{ margin: 0 }}>Instructor leaderboard</Title>
						<Text type="secondary">
							{totalRatings
								? 'Use the leaderboard to spot consistently high performers and areas needing support.'
								: 'Leaderboard data will appear once instructors receive ratings.'}
						</Text>
					</Space>

					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<Spin />
						</div>
					) : !tableData.length ? (
						<Result
							title="No data available"
							subTitle="Ratings will appear once students start submitting feedback."
						/>
					) : (
							<>
								<Row gutter={[16, 16]} className="mb-6">
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>Sort by</Text>
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
											<Text strong>Benchmark highlight</Text>
											<Space size={8} align="center">
												<Switch
													checked={filters.highlightBenchmark}
													onChange={handleBenchmarkToggle}
													aria-label="Toggle benchmark highlight"
												/>
												<Text type="secondary" className="truncate" title={filters.highlightBenchmark ? 'Showing top performer badges' : 'Hidden from leaderboard'}>
													{filters.highlightBenchmark ? 'Showing badges' : 'Hidden'}
												</Text>
											</Space>
										</Space>
									</Col>
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>Auto refresh</Text>
											<Space size={8} align="center">
												<Switch
													checked={autoRefresh}
													onChange={handleAutoRefreshToggle}
													aria-label="Auto refresh"
												/>
												<Text type="secondary">Every 60s</Text>
											</Space>
										</Space>
									</Col>
									<Col xs={24} sm={12} lg={12} xl={6}>
										<Space direction="vertical" size={4} className="w-full">
											<Text strong>Actions</Text>
											<Space size={8} wrap>
												<Button icon={<ReloadOutlined />} onClick={handleManualRefresh}>
													Refresh
												</Button>
												<Button
													icon={<FilePdfOutlined />}
													onClick={handleExportPdf}
													disabled={!tableData.length}
												>
													Export
												</Button>
											</Space>
										</Space>
									</Col>
								</Row>
								<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
									<Text type="secondary" className="uppercase tracking-wide text-xs">
										Sorted by {sortDescriptor}
									</Text>
									<Text type="secondary">Benchmark performers are highlighted in amber.</Text>
								</div>
							<UnifiedResponsiveTable
								columns={sanitizedColumns}
								dataSource={tableData}
								size="middle"
								pagination={{
									pageSize: 10,
									showSizeChanger: false,
									showTotal: (total) => `${total} instructor${total === 1 ? '' : 's'}`
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
								mobileCardRenderer={(props) => <LeaderboardMobileCard {...props} />}
							/>
						</>
					)}
			</Card>

			<Card
				className="rounded-2xl border border-slate-200 shadow-sm [&>.ant-card-body]:p-5 sm:[&>.ant-card-body]:p-6"
			>
				<Space direction="vertical" size={16} className="w-full">
					<Space size={10} align="center">
						<CrownFilled style={{ color: '#f59e0b' }} />
						<Text strong>Top performers</Text>
					</Space>
					{!topPerformers.length ? (
						<Empty description="No instructors ranked yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
									<Avatar style={{ backgroundColor: index === 0 ? '#f59e0b' : '#2563eb' }}>
										{item.instructorName?.[0] ?? '?'}
									</Avatar>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<Text strong className="truncate">#{item.rank} {item.instructorName}</Text>
											{index === 0 && <Tag color="gold" className="m-0 flex-shrink-0">Champion</Tag>}
										</div>
										<Text type="secondary" className="text-xs">
											Avg {item.averageRating} · {item.totalRatings} ratings · {formatPercent(item.fiveStarShare)} 5★
										</Text>
									</div>
								</div>
							))}
						</div>
					)}
				</Space>
			</Card>
		</div>
	);
};

export default InstructorRatingsAnalytics;
