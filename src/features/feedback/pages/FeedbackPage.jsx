import React, { useState, useEffect } from 'react';
import { useFeatures } from '../../../shared/contexts/FeaturesContext';
import { useAuth } from '../../../shared/hooks/useAuth';
import { FeedbackSystem } from '../components/FeedbackSystem';
import { 
  StarIcon, 
  ChatBubbleBottomCenterTextIcon,
  TrophyIcon,
  ChartBarIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

const FeedbackStats = ({ stats }) => {
  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <StarIconSolid
        key={i}
        className={`h-4 w-4 ${i < Math.floor(rating) ? 'text-yellow-400' : 'text-slate-300'}`}
      />
    ));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <StarIcon className="h-8 w-8 text-yellow-500" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-600">Average Rating</p>
            <div className="flex items-center mt-1">
              <p className="text-2xl font-semibold text-slate-900">
                {stats.average_rating ? parseFloat(stats.average_rating).toFixed(1) : '0.0'}
              </p>
              <div className="flex ml-2">
                {renderStars(stats.average_rating || 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <ChatBubbleBottomCenterTextIcon className="h-8 w-8 text-sky-500" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-600">Total Reviews</p>
            <p className="text-2xl font-semibold text-slate-900">{stats.total_feedback || 0}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <TrophyIcon className="h-8 w-8 text-green-500" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-600">5-Star Reviews</p>
            <p className="text-2xl font-semibold text-slate-900">{stats.five_star_count || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeedbackList = ({ feedbacks }) => {
  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <StarIconSolid
        key={i}
        className={`h-4 w-4 ${i < rating ? 'text-yellow-400' : 'text-slate-300'}`}
      />
    ));
  };

  return (
    <div className="space-y-4">
      {feedbacks.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <ChatBubbleBottomCenterTextIcon className="h-12 w-12 mx-auto mb-4 text-slate-300" />
          <p>No feedback found</p>
        </div>
      ) : (
        feedbacks.map((feedback) => (
          <div key={feedback.id} className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UserIcon className="h-8 w-8 text-slate-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-slate-900">{feedback.student_name}</p>
                  <p className="text-xs text-slate-500">
                    Instructor: {feedback.instructor_name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center">
                  {renderStars(feedback.rating)}
                  <span className="ml-2 text-sm text-slate-600">{feedback.rating}/5</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(feedback.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            
            {feedback.comment && (
              <div className="mt-4">
                <p className="text-slate-700">{feedback.comment}</p>
              </div>
            )}
            
            {feedback.skill_level && (
              <div className="mt-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
                  Skill Level: {feedback.skill_level}
                </span>
              </div>
            )}
            
            {feedback.progress_notes && (
              <div className="mt-3 p-3 bg-slate-50 rounded">
                <p className="text-sm text-slate-600">
                  <strong>Progress Notes:</strong> {feedback.progress_notes}
                </p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

const Achievements = ({ achievements }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Your Achievements</h3>
      {achievements.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <TrophyIcon className="h-12 w-12 mx-auto mb-4 text-slate-300" />
          <p>No achievements yet</p>
          <p className="text-sm">Complete lessons and submit feedback to earn achievements!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {achievements.map((achievement) => (
            <div key={achievement.id} className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <TrophyIcon className="h-8 w-8 text-yellow-500 mr-3" />
                <div>
                  <h4 className="font-semibold text-slate-900">{achievement.title}</h4>
                  <p className="text-sm text-slate-600">{achievement.description}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Earned on {new Date(achievement.earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FeedbackPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState({});
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  // Mock booking for feedback form
  const mockBooking = {
    id: 1,
    lesson_type: 'Beginner Kitesurfing Lesson',
    lesson_date: new Date(),
    instructor_name: 'John Doe',
    instructor_id: 2
  };

  useEffect(() => {
    loadFeedbackData();
  }, [user]);

  const loadFeedbackData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      if (user?.role === 'instructor') {
        // Load instructor feedback summary
        const response = await fetch(`/api/feedback/instructor/${user.id}/summary`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data.summary);
          setFeedbacks(data.recentFeedback);
        }
      } else if (user?.role === 'student') {
        // Load student achievements
        const achievementsResponse = await fetch(`/api/feedback/achievements/${user.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (achievementsResponse.ok) {
          const achievementsData = await achievementsResponse.json();
          setAchievements(achievementsData);
        }
      }
    } catch (error) {
      console.error('Error loading feedback data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (feedbackData) => {
    try {
      // This would typically be handled by the FeedbackSystem component
      await loadFeedbackData(); // Refresh data after submission
      setShowFeedbackForm(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Feedback & Reviews</h1>
        <p className="text-slate-600 mt-2">
          {user?.role === 'instructor' 
            ? 'View your teaching performance and student feedback'
            : user?.role === 'student'
            ? 'Submit feedback and track your achievements'
            : 'Manage feedback and reviews across the platform'
          }
        </p>
      </div>

      {user?.role === 'instructor' && <FeedbackStats stats={stats} />}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {user?.role === 'instructor' ? 'Recent Feedback' : 'Overview'}
            </button>
            
            {user?.role === 'student' && (
              <>
                <button
                  onClick={() => setActiveTab('achievements')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'achievements'
                      ? 'border-sky-500 text-sky-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Achievements
                </button>
                <button
                  onClick={() => setActiveTab('submit')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'submit'
                      ? 'border-sky-500 text-sky-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Submit Feedback
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            user?.role === 'instructor' ? (
              <FeedbackList feedbacks={feedbacks} />
            ) : (
              <div className="text-center py-8">
                <ChartBarIcon className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <h3 className="text-lg font-medium text-slate-900">Welcome to Feedback</h3>
                <p className="text-slate-600 mt-2">
                  Use this section to submit feedback after your lessons and track your progress.
                </p>
              </div>
            )
          )}
          
          {activeTab === 'achievements' && user?.role === 'student' && (
            <Achievements achievements={achievements} />
          )}
          
          {activeTab === 'submit' && user?.role === 'student' && (
            <div className="max-w-2xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Submit Lesson Feedback</h3>
              <FeedbackSystem
                booking={mockBooking}
                onSuccess={handleFeedbackSubmit}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedbackPage;
