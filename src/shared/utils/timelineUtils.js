import moment from 'moment';
import calendarConfig from '../../config/calendarConfig';

// Standard booking time slots for kitesurfing lessons
export const STANDARD_SLOTS = calendarConfig.standardSlots;

// Enhanced status colors with more distinct values
export const STATUS_COLORS = {
  completed: 'rgba(16, 185, 129, 0.9)',  // emerald-500
  booked: 'rgba(59, 130, 246, 0.9)',    // blue-500
  pending: 'rgba(245, 158, 11, 0.9)',   // amber-500
  confirmed: 'rgba(34, 197, 94, 0.9)',  // green-500
  cancelled: 'rgba(239, 68, 68, 0.9)',  // red-500
  other: 'rgba(107, 114, 128, 0.9)'     // gray-500
};

// Add more descriptive icons
export const STATUS_ICONS = {
  completed: '✅ ',    // Checkmark for completed
  booked: '📅 ',      // Calendar for booked
  pending: '⏳ ',      // Hourglass for pending
  confirmed: '👍 ',   // Thumbs up for confirmed
  cancelled: '❌ '    // Cross for cancelled
};

// Helper function to get formatted user name with first name highlighted
const getFormattedUserName = (booking, users) => {
  if (booking.user_name || booking.student_name) return booking.user_name || booking.student_name;
  
  const user = users?.find(s => s.id === booking.student_user_id);
  if (!user) return 'Unknown User';
  
  // Return first name in bold if possible
  return user.first_name ? `<strong>${user.first_name}</strong> ${user.last_name}` : user.name;
};

// Helper function to get instructor name
const getInstructorName = (instructorId, instructors) => {
  const instructor = instructors?.find(i => i.id === instructorId);
  return instructor ? instructor.name : 'Unknown Instructor';
};

// Helper function to get formatted service name
const getServiceName = (booking, services) => {
  if (booking.service_name) return booking.service_name;
  
  const service = services?.find(s => s.id === booking.service_id);
  return service ? service.name : 'Lesson';
};

export function createBookingItems(bookings, instructors = [], users = [], services = []) {
  const groupLessons = {}; // Track group lessons to combine them

  // First pass: process all bookings and identify group lessons
  return bookings.map(booking => {
    const day = moment(booking.date);
    const startHour = Math.floor(booking.start_hour);
    const startMin = Math.round((booking.start_hour % 1) * 60);
    const start = day.clone().hour(startHour).minute(startMin);
    
    const durH = Math.floor(booking.duration);
    const durM = Math.round((booking.duration % 1) * 60);
    const end = start.clone().add(durH, 'hours').add(durM, 'minutes');
    
    // Check if this is a group lesson
    if (booking.group_id) {
      const groupKey = `${booking.group_id}-${start.valueOf()}-${end.valueOf()}`;
      if (!groupLessons[groupKey]) {
        groupLessons[groupKey] = {
          instructors: [booking.instructor_user_id],
          booking
        };
      } else {
        groupLessons[groupKey].instructors.push(booking.instructor_user_id);
      }
    }
      // Get formatted info for display
    const userName = getFormattedUserName(booking, users);
    const instructorName = getInstructorName(booking.instructor_user_id, instructors);
    const serviceName = getServiceName(booking, services);
    const statusColor = STATUS_COLORS[booking.status] || STATUS_COLORS.other;
    const statusIcon = STATUS_ICONS[booking.status] || '';
      // Create useful content for the renderer
    const titleContent = {
      time: `${start.format('HH:mm')} - ${end.format('HH:mm')}`,
      user: userName,
      instructor: instructorName,
      service: serviceName,
      statusIcon,
      status: booking.status
    };
    
    return {
      id: `booking-${booking.id}`,
      group: booking.instructor_user_id,
      title: `${statusIcon}${userName}`,
      start_time: start.valueOf(),
      end_time: end.valueOf(),
      // Custom properties for the itemRenderer
      titleContent,
      bgColor: statusColor,
      borderColor: booking.status === 'cancelled' ? 'rgba(239, 68, 68, 0.8)' : null, // Red border for cancelled
      itemProps: {
        className: `booking-item booking-status-${booking.status}`,
      },
      // Keep the original data for reference
      bookingData: booking,
      // Group lesson info
      groupId: booking.group_id
    };
  }).map(item => {
    // Second pass: modify items for group lessons to span multiple instructors
    if (item.groupId) {
      const groupKey = `${item.groupId}-${item.start_time}-${item.end_time}`;
      const group = groupLessons[groupKey];
      if (group && group.instructors.length > 1) {
        // This is a multi-instructor group lesson, make it span all instructors
        return {
          ...item,
          canChangeGroup: false, // Prevent moving group lessons
          canMove: false, // Prevent moving group lessons
          isGroupLesson: true,
          groupInstructors: group.instructors,
          itemProps: {
            ...item.itemProps,
            className: `${item.itemProps.className} group-lesson-item`,
            style: {
              ...(item.itemProps.style || {}),
              border: '2px dashed rgba(255,255,255,0.5)',
              background: `linear-gradient(45deg, ${item.bgColor} 0%, rgba(59, 130, 246, 0.9) 100%)`,
            }
          }
        };
      }
    }
    return item;
  });
}

export function createStandardSlotItems(instructors, startDate = moment().startOf('day')) {
  const standardSlotItems = [];
  const day = startDate.clone();
  
  instructors.forEach(instructor => {
    STANDARD_SLOTS.forEach(slot => {
      const slotStart = day.clone().hour(slot.start).minute((slot.start % 1) * 60);
      const slotEnd = day.clone().hour(slot.end).minute((slot.end % 1) * 60);
      const simplifiedTime = `${slotStart.format('HH:mm')}-${slotEnd.format('HH:mm')}`;
      
      standardSlotItems.push({
        id: `timeslot-${instructor.id}-${day.format('YYYY-MM-DD')}-${slot.id}`,
        group: instructor.id,
        title: simplifiedTime, // Use just the time (no "Morning/Mid-day" labels)
        start_time: slotStart.valueOf(),
        end_time: slotEnd.valueOf(),
        canMove: false,
        canResize: false,
        canChangeGroup: false,
        className: 'available-time-slot',        itemProps: {
          style: {
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px dashed rgba(56, 189, 248, 0.5)',
            borderRadius: '6px',
            color: '#e0f2fe',
            fontSize: '11px',
            zIndex: -1,
            cursor: 'pointer',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 0,
            padding: '2px',
            height: '100%'
          }
        },
        instructorName: instructor.name // Add instructor name for reference
      });
    });
  });
  
  return standardSlotItems;
}
