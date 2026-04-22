import React, { useState, useEffect } from 'react';
import { Card, Rate, Input, Button, Form, Select, Alert, Spin, Modal } from 'antd';
import {
  StarOutlined,
  MessageOutlined,
  TrophyOutlined,
  UserOutlined,
  WindPowerOutlined,
  BookOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;
const { Option } = Select;

const FeedbackSystem = ({ bookingId, onFeedbackSubmitted }) => {
  const { t } = useTranslation(['student']);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState(null);
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    if (bookingId) {
      loadExistingFeedback();
    }
  }, [bookingId]);

  const loadExistingFeedback = async () => {
    try {
      const response = await fetch(`/api/feedback/booking/${bookingId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const feedback = await response.json();
        setExistingFeedback(feedback);
        form.setFieldsValue(feedback);
      }
    } catch (error) {
      console.error('Error loading feedback:', error);
    }
  };

  const submitFeedback = async (values) => {
    setLoading(true);
    try {
      const feedbackData = {
        booking_id: bookingId,
        overall_rating: values.overall_rating,
        instructor_rating: values.instructor_rating,
        equipment_rating: values.equipment_rating,
        location_rating: values.location_rating,
        value_rating: values.value_rating,
        comments: values.comments,
        improvement_suggestions: values.improvement_suggestions,
        would_recommend: values.would_recommend,
        skill_level_before: values.skill_level_before,
        skill_level_after: values.skill_level_after,
        favorite_aspect: values.favorite_aspect,
        weather_conditions: values.weather_conditions
      };

      const url = existingFeedback 
        ? `/api/feedback/${existingFeedback.id}`
        : '/api/feedback';
      
      const method = existingFeedback ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(feedbackData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      const result = await response.json();
      setShowThankYou(true);
      
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(result);
      }

      // Calculate achievement if it's a new feedback
      if (!existingFeedback) {
        await checkForAchievements(result);
      }

    } catch (error) {
      console.error('Error submitting feedback:', error);
      Modal.error({
        title: t('student:feedback.form.errors.errorTitle'),
        content: t('student:feedback.form.errors.submitFailed')
      });
    } finally {
      setLoading(false);
    }
  };

  const checkForAchievements = async (feedback) => {
    try {
      const response = await fetch('/api/achievements/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          type: 'feedback_submitted',
          feedback_id: feedback.id,
          booking_id: bookingId
        })
      });

      if (response.ok) {
        const achievements = await response.json();
        if (achievements.length > 0) {
          showAchievementModal(achievements);
        }
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  };

  const showAchievementModal = (achievements) => {
    Modal.success({
      title: t('student:feedback.achievements.modalTitle'),
      content: (
        <div>
          {achievements.map((achievement, index) => (
            <div key={index} className="mb-4">
              <h4 className="font-semibold">{achievement.name}</h4>
              <p className="text-gray-600">{achievement.description}</p>
            </div>
          ))}
        </div>
      )
    });
  };

  if (showThankYou) {
    return (
      <Card className="text-center p-8">
        <div className="mb-6">
          <TrophyOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
        </div>
        <h2 className="text-2xl font-bold mb-4">{t('student:feedback.thankYou.heading')}</h2>
        <p className="text-gray-600 mb-6">
          {t('student:feedback.thankYou.body')}
        </p>
        <Button type="primary" onClick={() => setShowThankYou(false)}>
          {t('student:feedback.thankYou.continueButton')}
        </Button>
      </Card>
    );
  }

  return (
    <div className="feedback-system max-w-4xl mx-auto">
      <Card 
        title={
          <div className="flex items-center">
            <StarOutlined className="mr-2" />
            {existingFeedback ? t('student:feedback.form.updateTitle') : t('student:feedback.form.title')}
          </div>
        }
        className="shadow-lg"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submitFeedback}
          initialValues={{
            would_recommend: true,
            weather_conditions: 'good'
          }}
        >
          {/* Overall Rating */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Form.Item
              name="overall_rating"
              label={t('student:feedback.form.overallExperience')}
              rules={[{ required: true, message: t('student:feedback.form.validation.overallRequired') }]}
            >
              <Rate allowHalf />
            </Form.Item>

            <Form.Item
              name="would_recommend"
              label={t('student:feedback.form.wouldRecommend')}
              rules={[{ required: true }]}
            >
              <Select>
                <Option value={true}>{t('student:feedback.form.recommendYes')}</Option>
                <Option value={false}>{t('student:feedback.form.recommendNo')}</Option>
              </Select>
            </Form.Item>
          </div>

          {/* Detailed Ratings */}
          <Card title={t('student:feedback.form.detailedRatings')} className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Form.Item
                name="instructor_rating"
                label={t('student:feedback.form.instructorRating')}
                rules={[{ required: true, message: t('student:feedback.form.validation.instructorRequired') }]}
              >
                <Rate allowHalf />
              </Form.Item>

              <Form.Item
                name="equipment_rating"
                label={t('student:feedback.form.equipmentRating')}
                rules={[{ required: true, message: t('student:feedback.form.validation.equipmentRequired') }]}
              >
                <Rate allowHalf />
              </Form.Item>

              <Form.Item
                name="location_rating"
                label={t('student:feedback.form.locationRating')}
                rules={[{ required: true, message: t('student:feedback.form.validation.locationRequired') }]}
              >
                <Rate allowHalf />
              </Form.Item>

              <Form.Item
                name="value_rating"
                label={t('student:feedback.form.valueRating')}
                rules={[{ required: true, message: t('student:feedback.form.validation.valueRequired') }]}
              >
                <Rate allowHalf />
              </Form.Item>
            </div>
          </Card>

          {/* Skill Progress */}
          <Card title={t('student:feedback.form.skillProgress')} className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="skill_level_before"
                label={t('student:feedback.form.skillBefore')}
                rules={[{ required: true }]}
              >
                <Select placeholder={t('student:feedback.form.skillPlaceholderBefore')}>
                  <Option value="complete_beginner">{t('student:feedback.form.skillLevels.complete_beginner')}</Option>
                  <Option value="beginner">{t('student:feedback.form.skillLevels.beginner')}</Option>
                  <Option value="intermediate">{t('student:feedback.form.skillLevels.intermediate')}</Option>
                  <Option value="advanced">{t('student:feedback.form.skillLevels.advanced')}</Option>
                  <Option value="expert">{t('student:feedback.form.skillLevels.expert')}</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="skill_level_after"
                label={t('student:feedback.form.skillAfter')}
                rules={[{ required: true }]}
              >
                <Select placeholder={t('student:feedback.form.skillPlaceholderAfter')}>
                  <Option value="complete_beginner">{t('student:feedback.form.skillLevels.complete_beginner')}</Option>
                  <Option value="beginner">{t('student:feedback.form.skillLevels.beginner')}</Option>
                  <Option value="intermediate">{t('student:feedback.form.skillLevels.intermediate')}</Option>
                  <Option value="advanced">{t('student:feedback.form.skillLevels.advanced')}</Option>
                  <Option value="expert">{t('student:feedback.form.skillLevels.expert')}</Option>
                </Select>
              </Form.Item>
            </div>
          </Card>

          {/* Weather and Conditions */}
          <Card title={t('student:feedback.form.lessonConditions')} className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="weather_conditions"
                label={t('student:feedback.form.weatherConditions')}
                rules={[{ required: true }]}
              >
                <Select>
                  <Option value="excellent">{t('student:feedback.form.weatherOptions.excellent')}</Option>
                  <Option value="good">{t('student:feedback.form.weatherOptions.good')}</Option>
                  <Option value="fair">{t('student:feedback.form.weatherOptions.fair')}</Option>
                  <Option value="poor">{t('student:feedback.form.weatherOptions.poor')}</Option>
                  <Option value="unsuitable">{t('student:feedback.form.weatherOptions.unsuitable')}</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="favorite_aspect"
                label={t('student:feedback.form.favoriteAspect')}
              >
                <Select placeholder={t('student:feedback.form.favoriteAspectPlaceholder')}>
                  <Option value="instructor_teaching">{t('student:feedback.form.favoriteOptions.instructor_teaching')}</Option>
                  <Option value="equipment_quality">{t('student:feedback.form.favoriteOptions.equipment_quality')}</Option>
                  <Option value="location_beauty">{t('student:feedback.form.favoriteOptions.location_beauty')}</Option>
                  <Option value="safety_measures">{t('student:feedback.form.favoriteOptions.safety_measures')}</Option>
                  <Option value="skill_progress">{t('student:feedback.form.favoriteOptions.skill_progress')}</Option>
                  <Option value="overall_experience">{t('student:feedback.form.favoriteOptions.overall_experience')}</Option>
                </Select>
              </Form.Item>
            </div>
          </Card>

          {/* Comments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Form.Item
              name="comments"
              label={t('student:feedback.form.commentsLabel')}
            >
              <TextArea
                rows={4}
                placeholder={t('student:feedback.form.commentsPlaceholder')}
              />
            </Form.Item>

            <Form.Item
              name="improvement_suggestions"
              label={t('student:feedback.form.improvementLabel')}
            >
              <TextArea
                rows={4}
                placeholder={t('student:feedback.form.improvementPlaceholder')}
              />
            </Form.Item>
          </div>

          {/* Submit Button */}
          <div className="text-center">
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              className="px-8"
            >
              {existingFeedback ? t('student:feedback.form.updateButton') : t('student:feedback.form.submitButton')}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

// Feedback Summary Component for Instructors/Admins
export const FeedbackSummary = ({ instructorId, period = '30' }) => {
  const { t } = useTranslation(['student']);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedbackSummary();
  }, [instructorId, period]);

  const loadFeedbackSummary = async () => {
    try {
      const params = new URLSearchParams({
        period,
        ...(instructorId && { instructor_id: instructorId })
      });

      const response = await fetch(`/api/feedback/summary?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Error loading feedback summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="text-center p-8">
        <Spin size="large" />
        <p className="mt-4">{t('student:feedback.summary.loading')}</p>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <Alert
          message={t('student:feedback.summary.noFeedback')}
          description={t('student:feedback.summary.noFeedbackDesc')}
          type="info"
          showIcon
        />
      </Card>
    );
  }

  return (
    <div className="feedback-summary space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-2xl font-bold text-blue-600">{summary.total_reviews}</div>
          <div className="text-gray-600">{t('student:feedback.summary.totalReviews')}</div>
        </Card>

        <Card className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {summary.average_rating?.toFixed(1) || 'N/A'}
          </div>
          <div className="text-gray-600">{t('student:feedback.summary.averageRating')}</div>
          <Rate disabled value={summary.average_rating} allowHalf />
        </Card>

        <Card className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {summary.recommendation_rate}%
          </div>
          <div className="text-gray-600">{t('student:feedback.summary.recommendationRate')}</div>
        </Card>

        <Card className="text-center">
          <div className="text-2xl font-bold text-orange-600">{summary.response_rate}%</div>
          <div className="text-gray-600">{t('student:feedback.summary.responseRate')}</div>
        </Card>
      </div>

      {/* Detailed Ratings */}
      <Card title={t('student:feedback.summary.ratingBreakdown')}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {summary.category_averages && Object.entries(summary.category_averages).map(([category, rating]) => (
            <div key={category} className="text-center">
              <div className="text-lg font-semibold capitalize mb-2">
                {category.replace('_', ' ')}
              </div>
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {rating.toFixed(1)}
              </div>
              <Rate disabled value={rating} allowHalf />
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Comments */}
      {summary.recent_comments && summary.recent_comments.length > 0 && (
        <Card title={t('student:feedback.summary.recentComments')}>
          <div className="space-y-4">
            {summary.recent_comments.map((comment, index) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4">
                <div className="flex items-center mb-2">
                  <Rate disabled value={comment.overall_rating} size="small" />
                  <span className="ml-2 text-gray-500 text-sm">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-gray-700">{comment.comments}</p>
                {comment.improvement_suggestions && (
                  <p className="text-sm text-gray-600 mt-2">
                    <strong>{t('student:feedback.summary.suggestionPrefix')}</strong> {comment.improvement_suggestions}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default FeedbackSystem;
