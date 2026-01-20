import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tag, Spin, Alert, Button } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { logger } from '@/shared/utils/logger';
import { formatCurrency } from '@/shared/utils/formatters';

/**
 * InstructorOverviewCard - Provides a quick summary of instructor stats
 * This component should be displayed at the top of the instructor profile for better UX
 */
const InstructorOverviewCard = ({ instructor }) => {
  const { apiClient } = useData();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInstructorStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch comprehensive instructor statistics
      const [earningsResponse, lessonsResponse] = await Promise.all([
        apiClient.get(`/finances/instructor-earnings/${instructor.id}`),
        apiClient.get(`/instructors/${instructor.id}/lessons?limit=100`)
      ]);

      const earningsPayload = earningsResponse.data || {};
      const earnings = earningsPayload.earnings || [];
      const lessons = lessonsResponse.data || [];

      const aggregatedTotals = {
        totalEarnings: typeof earningsPayload.totalEarnings === 'number' ? earningsPayload.totalEarnings : undefined,
        totalLessons: typeof earningsPayload.totalLessons === 'number' ? earningsPayload.totalLessons : undefined,
        totalHours: typeof earningsPayload.totalHours === 'number' ? earningsPayload.totalHours : undefined,
      };

      const derivedTotals = {
        totalEarnings: earnings.reduce((sum, e) => sum + parseFloat(e.commission_amount || 0), 0),
        completedLessons: lessons.filter(l => (l.status || '').toLowerCase() === 'completed').length,
        totalHours: lessons.reduce((sum, l) => sum + parseFloat(l.duration || 0), 0),
      };

      const totalEarnings = aggregatedTotals.totalEarnings ?? derivedTotals.totalEarnings;
      const completedLessons = aggregatedTotals.totalLessons ?? derivedTotals.completedLessons;
      const totalHours = aggregatedTotals.totalHours ?? derivedTotals.totalHours;
      const lessonsCount = completedLessons || derivedTotals.completedLessons;
      const avgEarningsPerLesson = lessonsCount > 0 ? totalEarnings / lessonsCount : 0;

      setStats({
        totalEarnings,
        completedLessons: lessonsCount,
        totalHours,
        avgEarningsPerLesson,
        status: instructor.status || 'active',
        joinDate: instructor.created_at
      });

    } catch (err) {
      logger.error('Error fetching instructor stats', { error: String(err) });
      setError('Failed to load instructor overview. Some data may be unavailable.');
    } finally {
      setLoading(false);
    }
  }, [apiClient, instructor?.id, instructor?.status, instructor?.created_at]);

  useEffect(() => {
    if (instructor?.id) {
      fetchInstructorStats();
    }
  }, [instructor?.id, fetchInstructorStats]);

  if (loading) {
    return (
  <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ textAlign: 'center', padding: 8 }}>
          <Spin size="small" />
          <span style={{ marginLeft: 8, color: '#666' }}>Loading overview...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
  <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
        <Alert 
          message="Overview unavailable" 
          description={error} 
          type="warning" 
          showIcon 
          size="small"
          action={
            <Button size="small" type="link" onClick={fetchInstructorStats}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Card 
      size="small"
      style={{ marginBottom: 16 }}
  styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <UserOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} />
          <span style={{ fontWeight: 'bold' }}>Quick Overview</span>
        </div>
        <Tag color={stats.status === 'active' ? 'green' : 'red'} size="small">
          {stats.status?.toUpperCase() || 'ACTIVE'}
        </Tag>
      </div>
      
      <Row gutter={[12, 8]}>
        <Col xs={12} sm={6}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--brand-success)' }}>
              {formatCurrency(stats.totalEarnings)}
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>Total Earnings</div>
          </div>
        </Col>
        
        <Col xs={12} sm={6}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--brand-primary)' }}>
              {stats.completedLessons}
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>Lessons</div>
          </div>
        </Col>
        
        <Col xs={12} sm={6}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#722ed1' }}>
              {stats.totalHours.toFixed(1)}h
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>Total Hours</div>
          </div>
        </Col>
        
        <Col xs={12} sm={6}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fa8c16' }}>
              {formatCurrency(stats.avgEarningsPerLesson)}
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>Avg/Lesson</div>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default InstructorOverviewCard;
