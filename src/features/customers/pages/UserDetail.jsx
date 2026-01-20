// src/pages/UserDetail.jsx
import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Modal, Alert } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  CalendarOutlined,
  PlusOutlined,
  CreditCardOutlined,
  ArrowLeftOutlined,
  GiftOutlined,
  AppstoreOutlined,
  UserSwitchOutlined,
  DeleteOutlined,
  EditOutlined
} from '@ant-design/icons';
import FloatingActionLauncher from '@/shared/components/FloatingActionLauncher';
import DataService from '@/shared/services/dataService';
import LessonHistoryTable from '../../instructors/components/LessonHistoryTable';
import UserRolePromotion from '@/shared/components/UserRolePromotion';
import StepBookingModal from '../../bookings/components/components/StepBookingModal';
import { CalendarProvider } from '../../bookings/components/contexts/CalendarContext';

const CustomerDeleteModal = lazy(() => import('../components/CustomerDeleteModal'));

const DEFAULT_LOCATIONS = [
  { id: 'loc1', name: 'Main Beach' },
  { id: 'loc2', name: 'North Bay' },
  { id: 'loc3', name: 'South Harbor' }
];

function getStatistics(bookings = []) {
  const totalLessons = bookings?.length || 0;
  const completedLessons = bookings?.filter((lesson) => lesson.status === 'completed').length || 0;
  const canceledLessons = bookings?.filter((lesson) => lesson.status === 'cancelled').length || 0;
  const noShowLessons = bookings?.filter((lesson) => lesson.status === 'no-show').length || 0;
  const upcomingLessons = bookings?.filter((lesson) => {
    if (!lesson?.start_time) {
      return false;
    }
    const startDate = new Date(lesson.start_time);
    return startDate > new Date() && lesson.status !== 'cancelled';
  }).length || 0;

  return {
    totalLessons,
    completedLessons,
    canceledLessons,
    noShowLessons,
    upcomingLessons,
    attendanceRate:
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  };
}

function getInstructorId(lesson) {
  if (!lesson) {
    return null;
  }

  const candidate = lesson.instructor;
  if (typeof candidate === 'string') {
    return candidate;
  }

  return candidate?.id || lesson.instructor_user_id || null;
}

function resolveInstructor(lesson, instructorsList) {
  const existingInstructor = lesson?.instructor;
  if (existingInstructor && typeof existingInstructor !== 'string' && existingInstructor.name) {
    return existingInstructor;
  }

  const instructorId = getInstructorId(lesson);
  const fallbackName = lesson?.instructor_name || 'Instructor deleted';

  if (!instructorId) {
    return {
      id: 'unknown',
      name: fallbackName
    };
  }

  const matchedInstructor = instructorsList.find((item) => item.id === instructorId);
  if (matchedInstructor) {
    return matchedInstructor;
  }

  return {
    id: instructorId,
    name: fallbackName
  };
}

function processLessons(lessonData = [], instructorsList = []) {
  return lessonData.map((lesson) => ({
    ...lesson,
    instructor: resolveInstructor(lesson, instructorsList)
  }));
}

function formatDate(value, fallback = 'Not provided') {
  if (!value) {
    return fallback;
  }

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return fallback;
    }
    return date.toLocaleDateString();
  } catch {
    return fallback;
  }
}

function selectValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return values[values.length - 1];
}

function buildFullName(user, studentProfile) {
  const parts = [user?.first_name, user?.last_name].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return studentProfile?.name || user?.name || 'Unknown customer';
}

function LoadingState() {
  return (
    <div className="p-4">
      <div className="text-center py-8">
        <div className="spinner" />
        <p className="mt-2 text-gray-600">Loading customer data...</p>
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
          Back to Customers
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onBack }) {
  return (
    <div className="p-4">
      <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
        <p>Customer not found.</p>
        <button
          className="text-yellow-700 underline mt-2"
          onClick={onBack}
        >
          Back to Customers
        </button>
      </div>
    </div>
  );
}

function UserInformationCard({ user, studentProfile }) {
  const fullName = buildFullName(user, studentProfile);
  const infoRows = [
    { label: 'Full Name', value: fullName },
    { label: 'Email', value: selectValue(user?.email, studentProfile?.email, 'Not provided'), valueClassName: 'break-all' },
    { label: 'Phone', value: selectValue(user?.phone, studentProfile?.phone, 'Not provided') },
    { label: 'Role', value: selectValue(user?.role_name, user?.role, 'Not specified'), valueClassName: 'capitalize' },
    { label: 'Date of Birth', value: formatDate(selectValue(studentProfile?.dateOfBirth, user?.date_of_birth)) },
    { label: 'Emergency Contact', value: selectValue(studentProfile?.emergencyContact, 'Not provided') },
    { label: 'Notes', value: selectValue(studentProfile?.notes, user?.notes, 'No notes'), valueClassName: 'whitespace-pre-wrap' },
    { label: 'Registered', value: formatDate(selectValue(user?.created_at, studentProfile?.createdAt), 'Unknown') }
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Customer Information</h2>

      <div className="space-y-3">
        {infoRows.map(({ label, value, valueClassName }) => (
          <div key={label}>
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`font-medium ${valueClassName || ''}`.trim()}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserStatisticsCard({ stats }) {
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

function StudentPreferencesCard({ profile, instructors, locations }) {
  const preferredActivities = Array.from(new Set(profile?.preferredActivities || []));
  const preferredInstructorIds = profile?.preferredInstructorIds || [];
  const preferredLocationIds = profile?.preferredLocationIds || [];
  const specialRequirements = profile?.specialRequirements || 'None specified';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Preferences</h2>

      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-500">Preferred Activities</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {preferredActivities.length > 0 ? (
              preferredActivities.map((activity) => (
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
            {preferredInstructorIds.length > 0 ? (
              <div className="space-y-2">
                {preferredInstructorIds.map((instructorId) => {
                  const instructor = instructors.find((item) => item.id === instructorId);
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
            {preferredLocationIds.length > 0 ? (
              <div className="space-y-1">
                {preferredLocationIds.map((locationId) => {
                  const location = locations.find((item) => item.id === locationId);
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
          <p className="font-medium">{specialRequirements}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyPreferencesCard() {
  return (
    <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center text-gray-500">
      No student preference data available.
    </div>
  );
}

function LessonHistorySection({ lessons, hasError }) {
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
        <LessonHistoryTable lessons={lessons} />
      ) : (
        <p className="text-gray-500">No lessons found for this customer.</p>
      )}
    </div>
  );
}

function resolveBlockingState({ loading, error, user, navigate }) {
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState messageText={error} onBack={() => navigate('/customers')} />;
  }

  if (!user) {
    return <EmptyState onBack={() => navigate('/customers')} />;
  }

  return null;
}

function isValidCustomerId(value) {
  return Boolean(value) && value !== 'new';
}

function applyUserResponse(result, assignUser) {
  if (result.status !== 'fulfilled' || !result.value) {
    throw new Error('User not found');
  }
  assignUser(result.value);
}

function applyStudentResponse(result, assignStudentProfile) {
  if (result.status === 'fulfilled') {
    assignStudentProfile(result.value || null);
    return;
  }
  assignStudentProfile(null);
}

function applyLessonsResponse(result, assignLessons, setLessonsErrorFlag) {
  if (result.status === 'fulfilled') {
    assignLessons(result.value || []);
    setLessonsErrorFlag(false);
    return;
  }

  assignLessons([]);
  setLessonsErrorFlag(true);
  const errMessage = result.reason?.message || 'Unable to load lessons for this customer.';
  message.error(errMessage);
}

function applyInstructorsResponse(result, assignInstructors) {
  if (result.status === 'fulfilled') {
    assignInstructors(result.value || []);
    return;
  }
  assignInstructors([]);
}

function resolveBackNavigation(cameFromProfile, customerId) {
  if (cameFromProfile) {
    return {
      path: `/customers/${customerId}/profile`,
      options: { replace: true, state: {} }
    };
  }

  return {
    path: '/customers',
    options: undefined
  };
}

function useCustomerDetail(customerId) {
  const [user, setUser] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lessonsError, setLessonsError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchDetails() {
      setLoading(true);
      setError(null);
      setLessonsError(false);

      if (!isValidCustomerId(customerId)) {
        if (isMounted) {
          setError('This page is for viewing existing customers. Use the customer form to create a new profile.');
          setLoading(false);
        }
        return;
      }

      try {
        const [userResponse, lessonsResponse, instructorsResponse, studentResponse] = await Promise.allSettled([
          DataService.getUserById(customerId),
          DataService.getLessonsByUserId(customerId),
          DataService.getInstructors(),
          DataService.getUserWithStudentRoleById(customerId)
        ]);

        if (!isMounted) {
          return;
        }

        applyUserResponse(userResponse, setUser);
        applyStudentResponse(studentResponse, setStudentProfile);
        applyLessonsResponse(lessonsResponse, setLessons, setLessonsError);
        applyInstructorsResponse(instructorsResponse, setInstructors);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const errorMessage = err?.message || 'Failed to load customer data.';
        setError(errorMessage);
        message.error(errorMessage);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  const refreshLessons = useCallback(async () => {
    try {
      const updatedLessons = await DataService.getLessonsByUserId(customerId);
      setLessons(updatedLessons || []);
      setLessonsError(false);
    } catch (err) {
      setLessonsError(true);
      const errorMessage = err?.message || 'Failed to refresh lessons.';
      message.error(errorMessage);
    }
  }, [customerId]);

  return {
    user,
    studentProfile,
    lessons,
    instructors,
    loading,
    error,
    lessonsError,
    setUser,
    setError,
    refreshLessons
  };
}

function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromProfile = Boolean(location.state?.fromProfile);

  const {
    user,
    studentProfile,
    lessons,
    instructors,
    loading,
    error,
    lessonsError,
    setUser,
    setError,
    refreshLessons
  } = useCustomerDetail(id);
  const [showRolePromotion, setShowRolePromotion] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const currentUser = useMemo(() => DataService.getCurrentUser(), []);
  const locations = DEFAULT_LOCATIONS;

  const processedLessons = useMemo(
    () => processLessons(lessons, instructors),
    [lessons, instructors]
  );

  const stats = useMemo(() => getStatistics(processedLessons), [processedLessons]);
  const fullName = useMemo(() => buildFullName(user, studentProfile), [user, studentProfile]);
  const backNavigation = useMemo(() => resolveBackNavigation(cameFromProfile, id), [cameFromProfile, id]);

  const handleDelete = useCallback(() => {
    setShowDeleteModal(true);
  }, []);
  
  const handleDeleteSuccess = useCallback(() => {
    message.success('Customer deleted successfully.');
    navigate('/customers');
  }, [navigate]);

  const handleRoleChanged = useCallback((response) => {
    if (!response) {
      return;
    }

    setUser((prevUser) => {
      if (!prevUser) {
        return prevUser;
      }

      const nextUser = { ...prevUser };

      if (response.user && typeof response.user === 'object') {
        Object.assign(nextUser, response.user);
      }

      if (response.newRole) {
        nextUser.role = response.newRole;
        nextUser.role_name = response.newRole;
      }

      return nextUser;
    });

    message.success('User role updated successfully.');
  }, [setUser]);

  const handleBookingCreated = useCallback(async () => {
    await refreshLessons();
    setShowBookingModal(false);
  }, [refreshLessons]);

  const canManageRole = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const canDeleteCustomer = currentUser?.role === 'owner';

  const navigateToProfileSection = useCallback((openModal) => {
    navigate(`/customers/${id}/profile`, openModal ? { state: { openModal } } : undefined);
  }, [id, navigate]);

  const actionItems = useMemo(() => {
    const items = [
      {
        key: 'make-booking',
        label: 'Make a booking',
        description: 'Schedule a new session',
        icon: CalendarOutlined,
        iconClassName: 'text-sky-500',
        onClick: () => setShowBookingModal(true)
      },
      {
        key: 'assign-package',
        label: 'Assign a package',
        description: 'Start a package for this customer',
        icon: GiftOutlined,
        iconClassName: 'text-amber-500',
        onClick: () => navigateToProfileSection('assignPackage')
      },
      {
        key: 'manage-packages',
        label: 'Manage packages',
        icon: AppstoreOutlined,
        iconClassName: 'text-indigo-500',
        onClick: () => navigateToProfileSection('managePackages')
      },
      {
        key: 'add-balance',
        label: 'Add balance',
        icon: PlusOutlined,
        iconClassName: 'text-emerald-500',
        onClick: () => navigateToProfileSection('addFunds')
      },
      {
        key: 'charge',
        label: 'Charge customer',
        icon: CreditCardOutlined,
        iconClassName: 'text-rose-500',
        onClick: () => navigateToProfileSection('charge')
      },
      {
        key: 'edit-profile',
        label: 'Edit profile',
        icon: EditOutlined,
        iconClassName: 'text-slate-500',
        onClick: () => navigate(`/customers/edit/${id}`)
      },
      // Back handled by floating launcher secondary button
    ];

    if (canManageRole) {
      items.push({
        key: 'change-role',
        label: 'Change role',
        icon: UserSwitchOutlined,
        iconClassName: 'text-purple-500',
        onClick: () => setShowRolePromotion(true)
      });
    }

    if (canDeleteCustomer) {
      items.push({
        key: 'delete',
        label: 'Delete customer',
        icon: DeleteOutlined,
        danger: true,
        onClick: handleDelete
      });
    }

    return items;
  }, [canManageRole, canDeleteCustomer, handleDelete, id, navigate, navigateToProfileSection, setShowRolePromotion]);

  const handleBack = useCallback(() => {
    navigate(backNavigation.path, backNavigation.options);
  }, [backNavigation, navigate]);

  const blockingState = resolveBlockingState({ loading, error, user, navigate });
  if (blockingState) {
    return blockingState;
  }

  return (
    <div className="p-4">
      <div className="flex flex-col gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Customer: {fullName}
          </h1>
          <p className="text-gray-500">Role: {user?.role_name || user?.role || 'Not specified'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <UserInformationCard user={user} studentProfile={studentProfile} />
        <UserStatisticsCard stats={stats} />
        {studentProfile ? (
          <StudentPreferencesCard
            profile={studentProfile}
            instructors={instructors}
            locations={locations}
          />
        ) : (
          <EmptyPreferencesCard />
        )}
      </div>

      <LessonHistorySection lessons={processedLessons} hasError={lessonsError} />

      <FloatingActionLauncher
        title="Customer actions"
        subtitle={fullName}
        actions={actionItems}
        backAction={{
          onClick: handleBack,
          icon: ArrowLeftOutlined,
          tooltip: 'Back to customers',
          ariaLabel: 'Back to customers'
        }}
      />

      {showRolePromotion && (
        <UserRolePromotion
          userId={id}
          currentRole={user?.role_name || user?.role}
          userName={fullName}
          onRoleChanged={handleRoleChanged}
          onClose={() => setShowRolePromotion(false)}
        />
      )}

      <CalendarProvider>
        <StepBookingModal
          isOpen={showBookingModal}
          onClose={() => setShowBookingModal(false)}
          onBookingCreated={handleBookingCreated}
        />
      </CalendarProvider>
      
      {/* Customer Delete Modal */}
      <Suspense fallback={null}>
        {showDeleteModal && (
          <CustomerDeleteModal
            visible={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            userId={id}
            userName={fullName}
            onDeleted={handleDeleteSuccess}
          />
        )}
      </Suspense>
    </div>
  );
}

export default UserDetail;