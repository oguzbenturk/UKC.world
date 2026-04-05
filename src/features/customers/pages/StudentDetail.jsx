// src/pages/StudentDetail.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Modal, Alert } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { EditOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import DataService from '@/shared/services/dataService';
import LessonHistoryTable from '../../instructors/components/LessonHistoryTable';
import StepBookingModal from '../../bookings/components/components/StepBookingModal';
import { CalendarProvider } from '../../bookings/components/contexts/CalendarContext';

const DEFAULT_LOCATIONS = [
  { id: 'loc1', name: 'Main Beach' },
  { id: 'loc2', name: 'North Bay' },
  { id: 'loc3', name: 'South Harbor' }
];

/**
 * Calculate statistics for a student based on their bookings
 * @param {Array} bookings
 * @returns {Object}
 */
function getStatistics(bookings = []) {
  const totalLessons = bookings?.length || 0;
  const completedLessons = bookings?.filter(b => b.status === 'completed').length || 0;
  const canceledLessons = bookings?.filter(b => b.status === 'cancelled').length || 0;
  const noShowLessons = bookings?.filter(b => b.status === 'no-show').length || 0;
  const upcomingLessons = bookings?.filter(
    b => new Date(b.start_time) > new Date() && b.status !== 'cancelled'
  ).length || 0;

  return {
    totalLessons,
    completedLessons,
    canceledLessons,
    noShowLessons,
    upcomingLessons,
    attendanceRate:
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0,
  };
}

function resolveInstructor(lesson, instructorsList) {
  const instructor = lesson?.instructor;

  if (instructor && typeof instructor !== 'string' && instructor.name) {
    return instructor;
  }

  const instructorId = typeof instructor === 'string'
    ? instructor
    : (lesson?.instructor?.id || lesson?.instructor_user_id);

  const foundInstructor = instructorId && instructorsList.find(i => i.id === instructorId);

  return foundInstructor || {
    id: instructorId || 'unknown',
    name: lesson?.instructor_name || 'Instructor deleted'
  };
}

function processLessons(lessonData = [], instructorsList = []) {
  return lessonData.map(lesson => ({
    ...lesson,
    instructor: resolveInstructor(lesson, instructorsList)
  }));
}

function LoadingState() {
  return (
    <div className="p-4">
      <div className="text-center py-8">
        <div className="spinner" />
        <p className="mt-2 text-gray-600">Loading student data...</p>
      </div>
    </div>
  );
}

function ErrorState({ messageText, onBack }) {
  return (
    <div className="p-4">
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
        <p>{messageText}</p>
        <button
          className="text-red-700 underline mt-2"
          onClick={onBack}
        >
          Back to Students
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onBack }) {
  return (
    <div className="p-4">
      <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
        <p>Student not found.</p>
        <button
          className="text-yellow-700 underline mt-2"
          onClick={onBack}
        >
          Back to Students
        </button>
      </div>
    </div>
  );
}

function StudentInformationCard({ student }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Student Information</h2>

      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-500">Full Name</p>
          <p className="font-medium">{student.name}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Email</p>
          <p className="font-medium">{student.email}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Phone</p>
          <p className="font-medium">{student.phone || 'Not provided'}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Date of Birth</p>
          <p className="font-medium">
            {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : 'Not provided'}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Skill Level</p>
          <p className="font-medium capitalize">{student.skillLevel || 'Not specified'}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Emergency Contact</p>
          <p className="font-medium">{student.emergencyContact || 'Not provided'}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Notes</p>
          <p className="font-medium">{student.notes || 'No notes'}</p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Registered</p>
          <p className="font-medium">
            {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
      </div>
    </div>
  );
}

function StudentStatisticsCard({ stats }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Statistics</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Total Lessons</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalLessons}</p>
        </div>

        <div className="bg-green-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completedLessons}</p>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Upcoming</p>
          <p className="text-2xl font-bold text-purple-600">{stats.upcomingLessons}</p>
        </div>

        <div className="bg-red-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Cancelled</p>
          <p className="text-2xl font-bold text-red-600">{stats.canceledLessons}</p>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">No Show</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.noShowLessons}</p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
        <p className="text-sm text-gray-500">Attendance Rate</p>
        <p className="text-2xl font-bold text-yellow-600">{stats.attendanceRate}%</p>
      </div>
    </div>
  );
}

function StudentPreferencesCard({ student, instructors, locations }) {
  const preferredInstructors = useMemo(
    () => student.preferredInstructorIds || [],
    [student.preferredInstructorIds]
  );

  const preferredLocations = useMemo(
    () => student.preferredLocationIds || [],
    [student.preferredLocationIds]
  );

  const preferredActivities = useMemo(
    () => Array.from(new Set(student.preferredActivities || [])),
    [student.preferredActivities]
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Preferences</h2>

      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-500">Preferred Activities</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {preferredActivities.length > 0 ? (
              preferredActivities.map(activity => (
                <span
                  key={activity}
                  className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                >
                  {activity}
                </span>
              ))
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-500">Preferred Instructors</p>
          <div className="mt-1">
            {preferredInstructors.length > 0 ? (
              <div className="space-y-2">
                {preferredInstructors.map((instructorId) => {
                  const instructor = instructors.find(i => i.id === instructorId);
                  return instructor ? (
                    <div key={instructorId} className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        {instructor.name.charAt(0)}
                      </div>
                      <span>{instructor.name}</span>
                    </div>
                  ) : null;
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-500">Preferred Locations</p>
          <div className="mt-1">
            {preferredLocations.length > 0 ? (
              <div className="space-y-1">
                {preferredLocations.map((locationId) => {
                  const location = locations.find(l => l.id === locationId);
                  return location ? (
                    <p key={locationId}>{location.name}</p>
                  ) : null;
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-500">Special Requirements</p>
          <p className="font-medium">
            {student.specialRequirements || 'None specified'}
          </p>
        </div>
      </div>
    </div>
  );
}

function LessonHistorySection({ lessons, instructors, locations, hasError }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Lesson History</h2>

      {hasError && (
        <Alert
          type="warning"
          showIcon
          message="Some lesson data could not be loaded. Displaying available information."
          className="mb-4"
        />
      )}

      {lessons.length > 0 ? (
        <LessonHistoryTable lessons={lessons} instructors={instructors} locations={locations} />
      ) : (
        <p className="text-gray-500">No lessons found for this student.</p>
      )}
    </div>
  );
}

function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const currentUser = useMemo(() => DataService.getCurrentUser(), []);
  const [instructors, setInstructors] = useState([]);
  const locations = DEFAULT_LOCATIONS;
  const [lessonsError, setLessonsError] = useState(false);
  
  // Fetch student data
  useEffect(() => {
    let isMounted = true;

    const fetchStudentDetails = async () => {
      setLoading(true);
      setError(null);
      setLessonsError(false);

      if (id === 'new') {
        setError('This page is for viewing existing students. Use the Student form to create a new student.');
        setLoading(false);
        return;
      }

      try {
        const [studentResponse, lessonsResponse, instructorsResponse] = await Promise.allSettled([
          DataService.getUserWithStudentRoleById(id),
          DataService.getLessonsByStudentId(id),
          DataService.getInstructors()
        ]);

        if (!isMounted) {
          return;
        }

        if (studentResponse.status !== 'fulfilled' || !studentResponse.value) {
          throw new Error('User not found');
        }

        setStudent(studentResponse.value);

        if (lessonsResponse.status === 'fulfilled') {
          setLessons(lessonsResponse.value || []);
        } else {
          setLessonsError(true);
          setLessons([]);
          message.error('Unable to load lessons for this student.');
        }

        if (instructorsResponse.status === 'fulfilled') {
          setInstructors(instructorsResponse.value || []);
        } else {
          setInstructors([]);
          message.error('Unable to load instructors.');
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setError(err.message || 'Failed to load student data');
        message.error(err.message || 'Failed to load student data');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchStudentDetails();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const refreshLessons = useCallback(async () => {
    try {
  const updatedLessons = await DataService.getLessonsByStudentId(id);
      setLessons(updatedLessons || []);
      setLessonsError(false);
    } catch (err) {
      setLessonsError(true);
      const errorMessage = err?.message || 'Failed to refresh lessons.';
      message.error(errorMessage);
    }
  }, [id]);

  const processedLessons = useMemo(
    () => processLessons(lessons, instructors),
    [lessons, instructors]
  );
  
  const stats = useMemo(() => getStatistics(processedLessons), [processedLessons]);

  const handleDelete = useCallback(() => {
    Modal.confirm({
      title: 'Delete student',
      content: 'Are you sure you want to delete this student? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DataService.deleteUser(id);
          message.success('Student deleted successfully.');
          navigate('/customers');
        } catch (err) {
          const errorMessage = err?.message || 'Failed to delete user. Please try again.';
          setError(errorMessage);
          message.error(errorMessage);
        }
      }
    });
  }, [id, navigate]);
  
  const handleBookingCreated = useCallback(async () => {
    await refreshLessons();
    setShowBookingModal(false);
  }, [refreshLessons]);
  
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState messageText={error} onBack={() => navigate('/students')} />;
  }

  if (!student) {
    return <EmptyState onBack={() => navigate('/students')} />;
  }
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Student: {student.name}
        </h1>
        
        <div className="flex flex-wrap gap-3 justify-end">
          <Button
            type="default"
            icon={<DollarOutlined />}
            onClick={() => navigate(`/customers/${id}/profile`)}
            className="btn-floating btn-floating-primary"
          >
            Financial Profile
          </Button>
          
          <Button
            type="default"
            icon={<CalendarOutlined />}
            onClick={() => setShowBookingModal(true)}
            className="btn-floating btn-floating-primary"
          >
            Make Booking
          </Button>
          
          <Button
            type="default"
            icon={<EditOutlined />}
            onClick={() => navigate(`/students/edit/${id}`)}
            className="btn-floating btn-floating-secondary"
          >
            Edit
          </Button>
          
          {currentUser?.role === 'owner' && (
            <Button
              danger
              type="default"
              onClick={handleDelete}
              className="btn-floating btn-floating-danger"
            >
              Delete
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <StudentInformationCard student={student} />
        <StudentStatisticsCard stats={stats} />
        <StudentPreferencesCard
          student={student}
          instructors={instructors}
          locations={locations}
        />
      </div>
      
      <LessonHistorySection
        lessons={processedLessons}
        instructors={instructors}
        locations={locations}
        hasError={lessonsError}
      />

      {/* Customer Step Booking Modal */}
      <CalendarProvider>
        <StepBookingModal
          isOpen={showBookingModal}
          onClose={() => setShowBookingModal(false)}
          onBookingCreated={handleBookingCreated}
        />
      </CalendarProvider>
    </div>
  );
}

export default StudentDetail;