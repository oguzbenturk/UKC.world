/**
 * @typedef {Object} TimeSlot
 * @property {string} time - The time slot in "HH:MM" format
 * @property {"available" | "booked" | "unavailable" | "pending" | "completed"} status - Current status of the time slot
 * @property {string} instructor - Name of the instructor assigned to this slot
 * @property {number} instructorId - ID of the instructor
 * @property {string} [studentName] - Name of the student (for booked slots)
 * @property {number} [userId] - ID of the user (for booked slots)
 * @property {string} [serviceType] - Type of lesson/service
 */

/**
 * @typedef {Object} DaySchedule
 * @property {string} date - The date in "YYYY-MM-DD" format
 * @property {TimeSlot[]} slots - Array of time slots for this date
 */

/**
 * @typedef {Object} Instructor
 * @property {number} id - Unique identifier
 * @property {string} name - Full name
 * @property {string} [avatar] - URL to avatar image
 * @property {string[]} [specialties] - Array of instructor specialties
 * @property {boolean} active - Whether instructor is currently active
 */

/**
 * @typedef {Object} Service
 * @property {number} id - Unique identifier
 * @property {string} name - Service name
 * @property {string} description - Service description 
 * @property {number} duration - Duration in hours
 * @property {number} price - Price in TL
 */

/**
 * @typedef {Object} CalendarViewOptions
 * @property {"month" | "week" | "day"} view - Current calendar view
 * @property {Date} selectedDate - Currently selected date
 * @property {number[]} [selectedInstructors] - IDs of filtered instructors 
 * @property {number[]} [selectedServices] - IDs of filtered services
 */

export {};
