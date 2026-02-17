import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Card, Empty, List, Progress, Rate, Space, Tag, Typography } from 'antd';
import { StarFilled, UserOutlined, TrophyFilled, MessageOutlined } from '@ant-design/icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useInstructorRatings } from '../hooks/useInstructorRatings';

const { Text, Paragraph } = Typography;

const formatTimestamp = (isoString) => {
  if (!isoString) return 'Recently';
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch {
    return 'Recently';
  }
};

const ratingColors = {
  5: '#52c41a',
  4: '#73d13d',
  3: '#fadb14',
  2: '#fa8c16',
  1: '#f5222d'
};

const RatingItem = ({ rating }) => {
  const studentName = rating.isAnonymous ? 'Anonymous Student' : (rating.studentName || 'Student');
  
  return (
    <List.Item className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="w-full">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar 
              size={40} 
              icon={<UserOutlined />} 
              className="bg-gradient-to-br from-sky-400 to-indigo-500"
            >
              {!rating.isAnonymous && studentName[0]?.toUpperCase()}
            </Avatar>
            <div>
              <Text strong className="text-slate-800 dark:text-white">{studentName}</Text>
              <div className="flex items-center gap-2">
                <Rate disabled value={rating.rating} className="text-sm" />
                <Tag 
                  color={rating.rating >= 4 ? 'green' : rating.rating >= 3 ? 'gold' : 'orange'}
                  className="ml-1"
                >
                  {rating.serviceType || 'Lesson'}
                </Tag>
              </div>
            </div>
          </div>
          <Text type="secondary" className="text-xs whitespace-nowrap">
            {formatTimestamp(rating.createdAt)}
          </Text>
        </div>
        
        {rating.feedbackText && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <div className="flex items-start gap-2">
              <MessageOutlined className="mt-1 text-slate-400" />
              <Paragraph className="!mb-0 text-slate-600 dark:text-slate-300">
                "{rating.feedbackText}"
              </Paragraph>
            </div>
          </div>
        )}
      </div>
    </List.Item>
  );
};

RatingItem.propTypes = {
  rating: PropTypes.shape({
    id: PropTypes.string,
    rating: PropTypes.number.isRequired,
    feedbackText: PropTypes.string,
    studentName: PropTypes.string,
    isAnonymous: PropTypes.bool,
    serviceType: PropTypes.string,
    createdAt: PropTypes.string
  }).isRequired
};

const StatsOverview = ({ summary, stats }) => {
  const averageRating = summary?.averageRating || 0;
  const totalRatings = summary?.totalRatings || 0;
  
  const distribution = useMemo(() => {
    if (!stats?.distribution) return [];
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: stats.distribution[star] || 0,
      percent: totalRatings > 0 ? ((stats.distribution[star] || 0) / totalRatings) * 100 : 0
    }));
  }, [stats?.distribution, totalRatings]);

  const fiveStarPercent = totalRatings > 0 
    ? ((stats?.distribution?.[5] || 0) / totalRatings) * 100 
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Average Rating Card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:border-slate-700 dark:from-amber-900/20 dark:to-orange-900/20">
        <div className="flex items-center justify-between">
          <div>
            <Text type="secondary" className="text-xs uppercase tracking-wide">Your Rating</Text>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-amber-600 dark:text-amber-400">
                {averageRating.toFixed(1)}
              </span>
              <StarFilled className="text-2xl text-amber-500" />
            </div>
            <Rate disabled value={Math.round(averageRating)} className="mt-2" />
            <Text type="secondary" className="mt-2 block text-sm">
              Based on {totalRatings} rating{totalRatings !== 1 ? 's' : ''}
            </Text>
          </div>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/80 shadow-lg dark:bg-slate-800">
            <TrophyFilled className="text-4xl text-amber-500" />
          </div>
        </div>
      </div>

      {/* Distribution Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900/70">
        <Text type="secondary" className="text-xs uppercase tracking-wide">Rating Distribution</Text>
        <div className="mt-4 space-y-2">
          {distribution.map(({ star, count, percent }) => (
            <div key={star} className="flex items-center gap-3">
              <div className="flex w-12 items-center gap-1">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{star}</span>
                <StarFilled className="text-amber-400 text-xs" />
              </div>
              <Progress 
                percent={percent} 
                showInfo={false}
                strokeColor={ratingColors[star]}
                trailColor="#e2e8f0"
                className="flex-1"
              />
              <span className="w-8 text-right text-sm text-slate-500">{count}</span>
            </div>
          ))}
        </div>
        {fiveStarPercent > 0 && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
            <Text className="text-sm text-emerald-700 dark:text-emerald-400">
              🌟 {fiveStarPercent.toFixed(0)}% of your ratings are 5 stars!
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};

StatsOverview.propTypes = {
  summary: PropTypes.shape({
    averageRating: PropTypes.number,
    totalRatings: PropTypes.number
  }),
  stats: PropTypes.shape({
    distribution: PropTypes.object
  })
};

const InstructorRatingsCard = ({ limit = 5 }) => {
  const { ratings, summary, stats, isLoading, error } = useInstructorRatings({ limit });

  const recentRatings = useMemo(() => ratings.slice(0, limit), [ratings, limit]);
  const hasRatings = recentRatings.length > 0;

  return (
    <Card 
      className="rounded-2xl border border-slate-200 shadow-sm dark:border-slate-700"
      title={
        <Space>
          <StarFilled className="text-amber-500" />
          <span>Your Ratings & Feedback</span>
        </Space>
      }
      loading={isLoading}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400">
          {error.message || 'Failed to load ratings'}
        </div>
      )}

      {!isLoading && !error && (
        <>
          <StatsOverview summary={summary} stats={stats} />
          
          {!hasRatings ? (
            <Empty 
              description={
                <Space direction="vertical" size={4}>
                  <Text>No ratings yet</Text>
                  <Text type="secondary" className="text-sm">
                    Your student feedback will appear here after lessons
                  </Text>
                </Space>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <>
              <Text strong className="mb-3 block text-slate-700 dark:text-slate-300">
                Recent Feedback
              </Text>
              <List
                dataSource={recentRatings}
                renderItem={(rating) => <RatingItem key={rating.id} rating={rating} />}
                split={false}
                className="space-y-3"
              />
            </>
          )}
        </>
      )}
    </Card>
  );
};

InstructorRatingsCard.propTypes = {
  limit: PropTypes.number
};

export default InstructorRatingsCard;
