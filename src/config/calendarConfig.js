// Standard configuration for the kitesurfing booking calendar
const calendarConfig = {
  // Standard booking time slots for kitesurfing lessons
  standardSlots: [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ],
  // Pre-scheduled lesson blocks
  preScheduledSlots: [
    { start: '09:00', end: '11:00' },
    { start: '11:30', end: '13:30' },
    { start: '14:00', end: '16:00' },
    { start: '16:30', end: '18:30' },
    { start: '19:00', end: '21:00' }
  ],
  
  // Hours of operation
  operatingHours: {
    start: 8,  // 8 AM
    end: 21,   // 9 PM
  },
  
  // Lesson duration in minutes
  lessonDuration: 60,
  
  // Calendar UI settings
  ui: {
    defaultView: 'week',
    availableViews: ['day', 'week', 'month'],
    firstDayOfWeek: 1, // Monday
  }
};

export default calendarConfig;
