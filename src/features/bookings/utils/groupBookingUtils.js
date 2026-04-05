/**
 * Utility functions for handling group bookings display
 */

/**
 * Format participant names for display in booking cards
 * @param {Object} booking - The booking object
 * @returns {string} - Formatted participant names
 */
const _getDisplayName = (p) => p.userName || p.name || 'Participant';
const _firstName = (n) => (n || 'Participant').split(' ')[0];

const _formatParticipantsArray = (participants) => {
  const len = participants.length;
  if (len === 1) return _getDisplayName(participants[0]);
  const firstNames = participants.map((p) => _firstName(_getDisplayName(p)));
  if (len === 2) return `${firstNames[0]} & ${firstNames[1]}`;
  if (len <= 4) {
    return len === 3
      ? `${firstNames[0]}, ${firstNames[1]} & ${firstNames[2]}`
      : `${firstNames[0]}, ${firstNames[1]}, ${firstNames[2]} & ${firstNames[3]}`;
  }
  const displayNames = firstNames.slice(0, 3).join(', ');
  const remainingCount = len - 3;
  return `${displayNames} +${remainingCount}`;
};

export const formatParticipantNames = (booking) => {
  const participants = booking.participants;
  if (participants && Array.isArray(participants) && participants.length > 0) {
    return _formatParticipantsArray(participants);
  }
  if (booking.userName || booking.studentName) {
    return booking.userName || booking.studentName;
  }
  if (booking.group_size && booking.group_size > 1) {
    const primaryName = _firstName(booking.userName || booking.studentName || 'Participant');
    const additionalCount = booking.group_size - 1;
    return `${primaryName} +${additionalCount}`;
  }
  return booking.userName || booking.studentName || 'Participant';
};

/**
 * Get group booking tooltip text
 * @param {Object} booking - The booking object
 * @returns {string} - Tooltip text with all participant names
 */
export const getGroupBookingTooltip = (booking) => {
  const serviceName = booking.serviceName || 'Service';
  const timeDisplay = formatBookingTime(booking);
  
  // Handle single participant bookings
  if (!booking.participants || booking.participants.length <= 1) {
    const participantName = formatParticipantNames(booking);
    return `${serviceName} with ${participantName} at ${timeDisplay}`;
  }
  
  // Handle group bookings
  const participantNames = booking.participants
    .map(p => p.userName || p.name || 'Participant')
    .join(', ');
  
  const groupSize = booking.participants.length;
  return `${serviceName} - Group of ${groupSize}: ${participantNames} at ${timeDisplay}`;
};

/**
 * Format booking time for display
 * @param {Object} booking - The booking object
 * @returns {string} - Formatted time string
 */
export const formatBookingTime = (booking) => {
  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hour, minute] = timeString.split(':');
    const hourNum = parseInt(hour, 10);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const hour12 = hourNum % 12 || 12;
    return `${hour12}${minute !== '00' ? `:${minute}` : ''} ${ampm}`;
  };

  const startTime = booking.startTime || booking.time;
  let timeDisplay = formatTime(startTime);
  
  if (booking.endTime) {
    timeDisplay += ` - ${formatTime(booking.endTime)}`;
  } else if (booking.duration) {
    const durationMinutes = parseFloat(booking.duration) <= 12 
      ? parseFloat(booking.duration) * 60 
      : parseFloat(booking.duration);
    
    if (startTime) {
      const [hour, minute] = startTime.split(':');
      const startMinutes = parseInt(hour) * 60 + parseInt(minute);
      const endMinutes = startMinutes + durationMinutes;
      const endHour = Math.floor(endMinutes / 60);
      const endMin = endMinutes % 60;
      const endTimeString = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
      timeDisplay += ` - ${formatTime(endTimeString)}`;
    }
  }
  
  return timeDisplay;
};

/**
 * Format booking time range in compact 24h style using dots (e.g., 09.00-11.30)
 * Falls back to hours-only when minutes are 00 on both ends if hideMinutesIfZero is true.
 */
export const formatBookingTimeRangeDot = (booking, { hideMinutesIfZero = true } = {}) => {
  const parseTime = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return { h, m, minutes: h * 60 + m };
  };

  const startStr = booking.startTime || booking.time;
  const start = parseTime(startStr);
  if (!start) return '';

  let end = null;
  if (booking.endTime) {
    end = parseTime(booking.endTime);
  } else if (booking.duration) {
    const durMinutes = parseFloat(booking.duration) <= 12
      ? Math.round(parseFloat(booking.duration) * 60)
      : Math.round(parseFloat(booking.duration));
    const endTotal = start.minutes + durMinutes;
    const eh = Math.floor(endTotal / 60);
    const em = endTotal % 60;
    end = { h: eh, m: em };
  }

  const fmt = ({ h, m }, allowHourOnly) => {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    if (allowHourOnly && mm === '00') return hh; // "09"
    return `${hh}.${mm}`; // "09.00"
  };

  // Start should always include minutes (e.g., 09.00)
  const startOut = fmt(start, false);
  if (!end) return startOut;
  // End can drop minutes if :00
  const endOut = fmt(end, !!hideMinutesIfZero);
  return `${startOut}-${endOut}`;
};

/**
 * Compact participant names for month labels: "Mert +2"
 */
export const formatParticipantNamesCompact = (booking) => {
  const getFirstName = (name) => (name || 'Participant').split(' ')[0];
  const participants = booking.participants;
  if (participants && Array.isArray(participants) && participants.length > 0) {
    const first = participants[0];
    const firstName = getFirstName(first.userName || first.name || 'Participant');
    const extra = participants.length - 1;
    return extra > 0 ? `${firstName} +${extra}` : firstName;
  }
  if (booking.group_size && booking.group_size > 1) {
    const primary = getFirstName(booking.userName || booking.studentName || 'Participant');
    return `${primary} +${booking.group_size - 1}`;
  }
  const single = booking.userName || booking.studentName;
  return getFirstName(single || 'Participant');
};

/**
 * Check if a booking is a group booking
 * @param {Object} booking - The booking object
 * @returns {boolean} - True if it's a group booking
 */
export const isGroupBooking = (booking) => {
  return (booking.participants && booking.participants.length > 1) || 
         (booking.group_size && booking.group_size > 1);
};

/**
 * Get group booking icon/indicator
 * @param {Object} booking - The booking object
 * @returns {string|null} - Group indicator text or null
 */
export const getGroupIndicator = (booking) => {
  if (isGroupBooking(booking)) {
    const groupSize = booking.participants?.length || booking.group_size || 0;
    return `👥${groupSize}`;
  }
  return null;
};
