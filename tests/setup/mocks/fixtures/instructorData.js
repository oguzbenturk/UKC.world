// Demo data for testing instructor profile features
export const mockInstructorData = {
  // Basic instructor data
  instructor: {
    id: 1,
    name: 'Maria Rodriguez',
    email: 'maria@plannivo.com',
    phone: '+34 622 123 456',
    status: 'active',
    profile_image_url: 'https://images.unsplash.com/photo-1494790108755-2616b2b85096?w=150&h=150&fit=crop&crop=face',
    created_at: '2023-01-15T10:30:00.000Z',
    date_of_birth: '1985-03-22',
    address: 'Calle del Mar, 45',
    city: 'Tarifa',
    country: 'Spain',
    postal_code: '11380',
    bio: 'Professional kitesurfing instructor with over 8 years of experience. Specialized in teaching beginners and advanced freestyle techniques.',
    experience: '8 years',
    level: 'Expert',
    specializations: ['kitesurfing', 'windsurfing', 'freestyle', 'wave riding'],
    certificates: ['IKO Level 3', 'First Aid', 'Water Safety'],
    languages: ['Spanish', 'English', 'French'],
    hourly_rate: 75,
    commission_rate: 0.5,
    notes: 'Excellent with nervous beginners. Prefers morning sessions.',
    // Calculated fields
    totalEarnings: 12450.75,
    completedLessons: 165,
    totalHours: 248.5,
    averagePerLesson: 75.46,
    last30DaysEarnings: 2180.25,
    last30DaysLessons: 29,
    last30DaysHours: 43.5
  },

  // Services assigned to instructor
  services: [
    {
      id: 1,
      name: 'Beginner Kitesurfing',
      category: 'Lessons',
      level: 'Beginner',
      price: 60,
      duration: 2,
      commission_rate: 0.5,
      estimated_monthly_bookings: 8
    },
    {
      id: 2,
      name: 'Advanced Freestyle',
      category: 'Lessons',
      level: 'Advanced',
      price: 90,
      duration: 1.5,
      commission_rate: 0.55,
      estimated_monthly_bookings: 4
    },
    {
      id: 3,
      name: 'Equipment Rental Supervision',
      category: 'Equipment',
      level: 'All',
      price: 25,
      duration: 1,
      commission_rate: 0.3,
      estimated_monthly_bookings: 12
    }
  ],

  // Recent lessons
  lessons: [
    {
      id: 101,
      date: '2024-01-15',
      start_hour: 10,
      duration: 2,
      status: 'completed',
      payment_status: 'paid',
      amount: 60,
      final_amount: 60,
      student_name: 'John Smith',
      service_name: 'Beginner Kitesurfing',
      service_id: 1,
      instructor_commission: 30,
      notes: 'Great progress, ready for next level'
    },
    {
      id: 102,
      date: '2024-01-14',
      start_hour: 14,
      duration: 1.5,
      status: 'completed',
      payment_status: 'paid',
      amount: 90,
      final_amount: 90,
      student_name: 'Sarah Johnson',
      service_name: 'Advanced Freestyle',
      service_id: 2,
      instructor_commission: 49.5,
      notes: 'Worked on kite loops and board offs'
    },
    {
      id: 103,
      date: '2024-01-13',
      start_hour: 9,
      duration: 2,
      status: 'completed',
      payment_status: 'paid',
      amount: 60,
      final_amount: 60,
      student_name: 'Mike Wilson',
      service_name: 'Beginner Kitesurfing',
      service_id: 1,
      instructor_commission: 30,
      notes: 'First lesson, covered safety and basic handling'
    },
    {
      id: 104,
      date: '2024-01-12',
      start_hour: 16,
      duration: 1,
      status: 'completed',
      payment_status: 'paid',
      amount: 25,
      final_amount: 25,
      student_name: 'Emma Davis',
      service_name: 'Equipment Rental Supervision',
      service_id: 3,
      instructor_commission: 7.5,
      notes: 'Supervised equipment setup and safety check'
    },
    {
      id: 105,
      date: '2024-01-11',
      start_hour: 11,
      duration: 2,
      status: 'completed',
      payment_status: 'paid',
      amount: 60,
      final_amount: 60,
      student_name: 'David Brown',
      service_name: 'Beginner Kitesurfing',
      service_id: 1,
      instructor_commission: 30,
      notes: 'Second lesson, worked on water starts'
    }
  ],

  // Payment history
  payments: [
    {
      id: 1,
      date: '2024-01-15',
      amount: 467.50,
      method: 'bank_transfer',
      status: 'completed',
      type: 'weekly_payout',
      description: 'Weekly commission payout - Week 2/2024',
      lessons_covered: 15
    },
    {
      id: 2,
      date: '2024-01-08',
      amount: 382.75,
      method: 'bank_transfer',
      status: 'completed',
      type: 'weekly_payout',
      description: 'Weekly commission payout - Week 1/2024',
      lessons_covered: 12
    },
    {
      id: 3,
      date: '2024-01-01',
      amount: 1250.00,
      method: 'bank_transfer',
      status: 'completed',
      type: 'bonus',
      description: 'New Year bonus payment',
      lessons_covered: 0
    }
  ],

  // Commission settings
  commissions: [
    {
      id: 1,
      service_id: 1,
      service_name: 'Beginner Kitesurfing',
      commission_type: 'percentage',
      commission_value: 50,
      effective_date: '2023-01-01',
      status: 'active'
    },
    {
      id: 2,
      service_id: 2,
      service_name: 'Advanced Freestyle',
      commission_type: 'percentage',
      commission_value: 55,
      effective_date: '2023-01-01',
      status: 'active'
    },
    {
      id: 3,
      service_id: 3,
      service_name: 'Equipment Rental Supervision',
      commission_type: 'percentage',
      commission_value: 30,
      effective_date: '2023-01-01',
      status: 'active'
    }
  ],

  // Earnings summary for dashboard
  earningsSummary: {
    today: {
      earnings: 157.50,
      lessons: 3,
      hours: 4.5
    },
    thisWeek: {
      earnings: 647.25,
      lessons: 11,
      hours: 16.5
    },
    thisMonth: {
      earnings: 2180.25,
      lessons: 29,
      hours: 43.5
    },
    lastMonth: {
      earnings: 1950.75,
      lessons: 26,
      hours: 39
    },
    thisYear: {
      earnings: 12450.75,
      lessons: 165,
      hours: 248.5
    }
  },

  // Monthly breakdown for charts
  monthlyBreakdown: [
    { month: 'Jan', earnings: 2180.25, lessons: 29, hours: 43.5 },
    { month: 'Dec', earnings: 1950.75, lessons: 26, hours: 39 },
    { month: 'Nov', earnings: 1875.50, lessons: 25, hours: 37.5 },
    { month: 'Oct', earnings: 2125.00, lessons: 28, hours: 42 },
    { month: 'Sep', earnings: 1980.25, lessons: 27, hours: 40.5 },
    { month: 'Aug', earnings: 2450.00, lessons: 32, hours: 48 }
  ]
};

// Mock API responses
export const mockApiResponses = {
  getInstructor: (id) => ({
    status: 200,
    data: mockInstructorData.instructor
  }),

  getInstructorServices: (id) => ({
    status: 200,
    data: mockInstructorData.services
  }),

  getInstructorLessons: (id, limit = 10) => ({
    status: 200,
    data: mockInstructorData.lessons.slice(0, limit)
  }),

  getInstructorPayments: (id) => ({
    status: 200,
    data: mockInstructorData.payments
  }),

  getInstructorCommissions: (id) => ({
    status: 200,
    data: mockInstructorData.commissions
  }),

  getInstructorEarnings: (id, dateRange) => ({
    status: 200,
    data: mockInstructorData.earningsSummary
  })
};

// Test scenarios
export const testScenarios = {
  // Successful data loading
  success: {
    instructor: mockInstructorData.instructor,
    services: mockInstructorData.services,
    lessons: mockInstructorData.lessons,
    payments: mockInstructorData.payments,
    commissions: mockInstructorData.commissions
  },

  // Loading states
  loading: {
    instructor: null,
    services: null,
    lessons: null,
    payments: null,
    commissions: null
  },

  // Error states
  error: {
    instructor: null,
    services: [],
    lessons: [],
    payments: [],
    commissions: [],
    error: 'Failed to load instructor data'
  },

  // Edge cases
  noCommissions: {
    ...mockInstructorData,
    commissions: []
  },

  newInstructor: {
    ...mockInstructorData,
    instructor: {
      ...mockInstructorData.instructor,
      created_at: new Date().toISOString(),
      totalEarnings: 0,
      completedLessons: 0,
      totalHours: 0
    },
    lessons: [],
    payments: [],
    commissions: []
  }
};

export default mockInstructorData;
