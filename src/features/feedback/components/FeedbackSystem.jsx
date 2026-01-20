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

const { TextArea } = Input;
const { Option } = Select;

const FeedbackSystem = ({ bookingId, onFeedbackSubmitted }) => {
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
        title: 'Error',
        content: 'Failed to submit feedback. Please try again.'
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
      title: '🏆 Achievement Unlocked!',
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
        <h2 className="text-2xl font-bold mb-4">Thank You for Your Feedback!</h2>
        <p className="text-gray-600 mb-6">
          Your feedback helps us improve our kitesurfing lessons and provide better experiences for all students.
        </p>
        <Button type="primary" onClick={() => setShowThankYou(false)}>
          Continue
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
            {existingFeedback ? 'Update Your Feedback' : 'Share Your Experience'}
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
              label="Overall Experience"
              rules={[{ required: true, message: 'Please rate your overall experience' }]}
            >
              <Rate allowHalf />
            </Form.Item>

            <Form.Item
              name="would_recommend"
              label="Would you recommend us to friends?"
              rules={[{ required: true }]}
            >
              <Select>
                <Option value={true}>Yes, definitely!</Option>
                <Option value={false}>No, probably not</Option>
              </Select>
            </Form.Item>
          </div>

          {/* Detailed Ratings */}
          <Card title="Detailed Ratings" className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Form.Item
                name="instructor_rating"
                label="Instructor"
                rules={[{ required: true, message: 'Please rate your instructor' }]}
              >
                <Rate allowHalf />
              </Form.Item>

              <Form.Item
                name="equipment_rating"
                label="Equipment Quality"
                rules={[{ required: true, message: 'Please rate the equipment' }]}
              >
                <Rate allowHalf />
              </Form.Item>

              <Form.Item
                name="location_rating"
                label="Location & Conditions"
                rules={[{ required: true, message: 'Please rate the location' }]}
              >
                <Rate allowHalf />
              </Form.Item>

              <Form.Item
                name="value_rating"
                label="Value for Money"
                rules={[{ required: true, message: 'Please rate the value' }]}
              >
                <Rate allowHalf />
              </Form.Item>
            </div>
          </Card>

          {/* Skill Progress */}
          <Card title="Your Kitesurfing Progress" className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="skill_level_before"
                label="Skill Level Before Lesson"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select your skill level before the lesson">
                  <Option value="complete_beginner">Complete Beginner</Option>
                  <Option value="beginner">Beginner</Option>
                  <Option value="intermediate">Intermediate</Option>
                  <Option value="advanced">Advanced</Option>
                  <Option value="expert">Expert</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="skill_level_after"
                label="Skill Level After Lesson"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select your skill level after the lesson">
                  <Option value="complete_beginner">Complete Beginner</Option>
                  <Option value="beginner">Beginner</Option>
                  <Option value="intermediate">Intermediate</Option>
                  <Option value="advanced">Advanced</Option>
                  <Option value="expert">Expert</Option>
                </Select>
              </Form.Item>
            </div>
          </Card>

          {/* Weather and Conditions */}
          <Card title="Lesson Conditions" className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="weather_conditions"
                label="How were the weather conditions?"
                rules={[{ required: true }]}
              >
                <Select>
                  <Option value="excellent">Excellent - Perfect for kitesurfing</Option>
                  <Option value="good">Good - Nice conditions</Option>
                  <Option value="fair">Fair - Acceptable conditions</Option>
                  <Option value="poor">Poor - Challenging conditions</Option>
                  <Option value="unsuitable">Unsuitable - Should have been cancelled</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="favorite_aspect"
                label="Favorite Aspect of the Lesson"
              >
                <Select placeholder="What did you enjoy most?">
                  <Option value="instructor_teaching">Instructor's teaching style</Option>
                  <Option value="equipment_quality">High quality equipment</Option>
                  <Option value="location_beauty">Beautiful location</Option>
                  <Option value="safety_measures">Safety measures</Option>
                  <Option value="skill_progress">Learning progress</Option>
                  <Option value="overall_experience">Overall experience</Option>
                </Select>
              </Form.Item>
            </div>
          </Card>

          {/* Comments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Form.Item
              name="comments"
              label="Tell us about your experience"
            >
              <TextArea
                rows={4}
                placeholder="Share details about your lesson, what you learned, how you felt..."
              />
            </Form.Item>

            <Form.Item
              name="improvement_suggestions"
              label="How can we improve?"
            >
              <TextArea
                rows={4}
                placeholder="Any suggestions to make our lessons even better?"
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
              {existingFeedback ? 'Update Feedback' : 'Submit Feedback'}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

// Feedback Summary Component for Instructors/Admins
export const FeedbackSummary = ({ instructorId, period = '30' }) => {
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
        <p className="mt-4">Loading feedback summary...</p>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <Alert
          message="No feedback data available"
          description="No feedback has been received for the selected period."
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
          <div className="text-gray-600">Total Reviews</div>
        </Card>
        
        <Card className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {summary.average_rating?.toFixed(1) || 'N/A'}
          </div>
          <div className="text-gray-600">Average Rating</div>
          <Rate disabled value={summary.average_rating} allowHalf />
        </Card>
        
        <Card className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {summary.recommendation_rate}%
          </div>
          <div className="text-gray-600">Recommendation Rate</div>
        </Card>
        
        <Card className="text-center">
          <div className="text-2xl font-bold text-orange-600">{summary.response_rate}%</div>
          <div className="text-gray-600">Response Rate</div>
        </Card>
      </div>

      {/* Detailed Ratings */}
      <Card title="Rating Breakdown">
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
        <Card title="Recent Comments">
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
                    <strong>Suggestion:</strong> {comment.improvement_suggestions}
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
