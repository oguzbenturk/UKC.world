// src/components/BookingCalendarUpdated.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import DataService from '@/shared/services/dataService';
import Timeline from 'react-calendar-timeline';
import moment from 'moment';
import './styles/bookingCalendar.css'; // Comprehensive, production-ready calendar styling
import { 
  STANDARD_SLOTS, 
  createBookingItems, 
  createStandardSlotItems 
} from '@/shared/utils/timelineUtils';

const BookingCalendarUpdated = ({ 
  instructors = [], 
  students = [], 
  onBookingClick, 
  onTimeSlotClick,
  filterDate = moment(),
  services = [],
  bookings: externalBookings
}) => {
  const [bookings, setBookings] = useState(externalBookings || []);
  const [selectedDate, setSelectedDate] = useState(moment(filterDate));
  const timelineRef = useRef(null);
  const [visibleTimeStart, setVisibleTimeStart] = useState(selectedDate.clone().startOf('day').hour(8).valueOf());
  const [visibleTimeEnd, setVisibleTimeEnd] = useState(selectedDate.clone().startOf('day').hour(20).valueOf());
  const [mobileView, setMobileView] = useState(false);
  const [mobileViewType, setMobileViewType] = useState('list'); // 'list' or 'calendar'

  // Check viewport width on mount and window resize
  useEffect(() => {
    const checkMobileView = () => {
      setMobileView(window.innerWidth < 768);
    };
    
    checkMobileView(); // Initial check
    window.addEventListener('resize', checkMobileView);
    
    return () => {
      window.removeEventListener('resize', checkMobileView);
    };
  }, []);

  // Listen for booking creation events to refresh calendar
  useEffect(() => {
    let refreshTimeout;
    
    const handleBookingCreated = async (event) => {
      try {
        console.log('Calendar: Refreshing after booking creation', event.detail);
        
        // Debounce the refresh to prevent multiple rapid calls
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(async () => {
          const data = await DataService.getBookings();
          setBookings(data);
        }, 500); // 500ms debounce
        
      } catch (error) {
        console.error('Error refreshing calendar after booking creation:', error);
      }
    };

    window.addEventListener('booking-created', handleBookingCreated);
    
    return () => {
      window.removeEventListener('booking-created', handleBookingCreated);
      clearTimeout(refreshTimeout);
    };
  }, []);

  useEffect(() => {
    const loadBookings = async () => {
      try {
        if (!externalBookings) {
          const data = await DataService.getBookings();
          setBookings(data);
        }
      } catch (error) {
        console.error('Error loading bookings:', error);
      }
    };

    loadBookings();
  }, [externalBookings]);

  useEffect(() => {
    if (externalBookings) {
      setBookings(externalBookings);
    }
  }, [externalBookings]);

  useEffect(() => {
    const newDate = moment(filterDate);
    setSelectedDate(newDate);
  }, [filterDate]);

  useEffect(() => {
    // Fixed 08:00-20:00 view as required
    setVisibleTimeStart(selectedDate.clone().startOf('day').hour(8).valueOf());
    setVisibleTimeEnd(selectedDate.clone().startOf('day').hour(20).valueOf());
  }, [selectedDate]);

  // Create instructor groups
  const groups = useMemo(() => instructors.map(inst => ({ 
    id: inst.id, 
    title: inst.name
  })), [instructors]);

  // Process booking items
  const bookingItems = useMemo(() => {
    const items = createBookingItems(bookings, instructors, students, services);
    
    // Process the items to handle group lessons that span multiple instructors
    const processedItems = items.map(item => {
      // If this is a group lesson and has multiple instructors, make it span all instructors
      if (item.isGroupLesson && item.groupInstructors?.length > 1) {
        // Find all the instructor indices
        const instructorIndices = item.groupInstructors.map(instructorId => 
          instructors.findIndex(instructor => instructor.id === instructorId)
        ).filter(idx => idx !== -1);
        
        if (instructorIndices.length > 1) {
          // Sort the indices
          instructorIndices.sort((a, b) => a - b);
          
          // Set the group to the first instructor and stackItems options
          return {
            ...item,
            group: instructors[instructorIndices[0]].id,
            stackItems: true,
            // We'll use this to span multiple rows in the timeline
            className: 'group-lesson-spanning-rows'
          };
        }
      }
      
      return {
        ...item,
        itemProps: {
          ...item.itemProps,
          onDoubleClick: () => onBookingClick && onBookingClick(item.bookingData)
        }
      };
    });
    
    return processedItems;
  }, [bookings, instructors, students, services, onBookingClick]);

  // Process standard slot items
  const standardSlotItems = useMemo(() => {
    const items = createStandardSlotItems(instructors, selectedDate);
    return items.map(item => ({
      ...item,
      itemProps: {
        ...item.itemProps,
        onClick: () => {
          if (!onTimeSlotClick) return;
          
          // Extract data from item ID with more robust splitting
          const parts = item.id.split('-');
          if (parts.length < 4) return;
          
          const instructorId = parseInt(parts[1]);
          const dateStr = parts[2];
          const slotId = parseInt(parts[3]);
          
          // Find the slot in our standard slots
          const slot = STANDARD_SLOTS.find(s => s.id === slotId);
          if (!slot) return;
          
          // Call the handler with structured data
          onTimeSlotClick({
            date: dateStr,
            instructorId: instructorId,
            startHour: slot.start,
            duration: slot.end - slot.start
          });
        }
      }
    }));
  }, [instructors, selectedDate, onTimeSlotClick]);
  
  // Combine items and sort by start time, but hide standard slots that overlap with actual bookings
  const finalItems = useMemo(() => {
    // First identify all time ranges that are booked for each instructor
    const bookedRanges = {};
    
    // Initialize for each instructor
    instructors.forEach(instructor => {
      bookedRanges[instructor.id] = [];
    });
    
    // Collect all booking ranges by instructor
    bookingItems.forEach(booking => {
      if (!bookedRanges[booking.group]) {
        bookedRanges[booking.group] = [];
      }
      
      bookedRanges[booking.group].push({
        start: booking.start_time,
        end: booking.end_time
      });
    });
    
    // Filter standard slots that overlap with any bookings
    const filteredStandardSlots = standardSlotItems.filter(slot => {
      // First, check all bookings for this instructor
      const relevantBookings = bookingItems.filter(booking => booking.group === slot.group);
      
      // Check if any booking overlaps with this slot's time range
      const hasOverlap = relevantBookings.some(booking => {
        // Check all possible overlap scenarios
        return (
          (booking.start_time <= slot.start_time && booking.end_time > slot.start_time) || // booking starts before slot and overlaps
          (booking.start_time >= slot.start_time && booking.start_time < slot.end_time) || // booking starts during slot
          (booking.start_time <= slot.start_time && booking.end_time >= slot.end_time)     // booking completely covers slot
        );
      });
      
      // Only include slots with no overlapping bookings
      return !hasOverlap;
    });
    
    // Combine and sort all items
    return [...filteredStandardSlots, ...bookingItems].sort((a, b) => a.start_time - b.start_time);
  }, [standardSlotItems, bookingItems, instructors]);

  // Handle item movement (for drag-and-drop)
  const handleItemMove = async (itemId, dragTime, newGroupId) => {
    const bookingToMove = bookings.find(b => `booking-${b.id}` === itemId);
    if (bookingToMove) {
      const newStartTime = moment(dragTime);
      const newDate = newStartTime.format('YYYY-MM-DD');
      
      // Calculate hours with proper rounding to nearest hour (as per requirements)
      let minutes = newStartTime.minute();
      let roundedMinutes = minutes < 30 ? 0 : 60;
      
      // Create a clean time with proper rounding
      const roundedTime = newStartTime.clone().minute(roundedMinutes);
      if (roundedMinutes === 60) {
        roundedTime.add(1, 'hour').minute(0);
      }
      
      // Get exact decimal hours (e.g., 9.0 for 9:00)
      const newStartHour = roundedTime.hour() + (roundedTime.minute() / 60);

      const updatedBookingPayload = {
        date: newDate,
        start_hour: newStartHour,
        instructor_user_id: newGroupId,
      };      try {
        await DataService.updateBooking(bookingToMove.id, updatedBookingPayload);
        const data = await DataService.getBookings();
        setBookings(data);
      } catch (error) {
        console.error('Error updating booking after move:', error);
        const data = await DataService.getBookings();
        setBookings(data);
      }
    }
  };

  // Render the mobile calendar view (simplified version of the desktop view)
  const renderMobileCalendarView = () => (
    <div className="mobile-calendar-view">
      <Timeline
        groups={groups.slice(0, 2)} // Show only first 2 instructors for better mobile experience
        items={finalItems.filter(item => 
          groups.slice(0, 2).some(g => g.id === item.group)
        )}
        visibleTimeStart={visibleTimeStart}
        visibleTimeEnd={visibleTimeEnd}
        onTimeChange={() => {}}
        dragSnap={60 * 60 * 1000}
        canMove={false} // Disable drag on mobile
        canResize={false}
        stackItems
        stickyHeader={true}
        lineHeight={42} // Increased from 28px for mobile
        itemHeightRatio={0.8}
        sidebarWidth={100} // Smaller sidebar for mobile
        height={Math.min(150, groups.slice(0, 2).length * 52)} // Increased height for mobile view
        zoomable={false}
        moveable={false}
        timeSteps={{
          second: 0, 
          minute: 0, 
          hour: 1,
          day: 1,
          month: 1,
          year: 1
        }}
        headerLabelFormats={{
          hour: '',
          day: '',
          week: '',
          month: '',
          year: ''
        }}
        subHeaderLabelFormats={{
          hour: '',
          day: '',
          week: '',
          month: '',
          year: ''
        }}
        groupRenderer={({ group }) => (
          <div className="instructor-sidebar-mobile">
            <div className="instructor-name">{group.title}</div>
          </div>
        )}
        itemRenderer={({ item, getItemProps }) => {
          const { style, ...restOfItemProps } = getItemProps(item.itemProps);
          
          // Identify if this is a standard slot (available) or booking
          const isStandardSlot = item.id.startsWith('timeslot-');
          
          if (isStandardSlot) {
            return (
              <div
                {...restOfItemProps}
                style={{
                  ...style,
                  background: 'rgba(14, 165, 233, 0.1)',
                  border: '1px dashed rgba(56, 189, 248, 0.5)',
                  borderRadius: '6px',
                  color: '#e0f2fe',
                  fontSize: '13px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: 0,
                  padding: '2px'
                }}
                className="available-time-slot-mobile"
                onClick={() => {
                  if (!onTimeSlotClick) return;
                  
                  const parts = item.id.split('-');
                  if (parts.length < 4) return;
                  
                  const instructorId = parseInt(parts[1]);
                  const dateStr = parts[2];
                  const slotId = parseInt(parts[3]);
                  
                  const slot = STANDARD_SLOTS.find(s => s.id === slotId);
                  if (!slot) return;
                  
                  onTimeSlotClick({
                    date: dateStr,
                    instructorId: instructorId,
                    startHour: slot.start,
                    duration: slot.end - slot.start
                  });
                }}
              >
                {moment(item.start_time).format('HH:mm')}
              </div>
            );
          }
          
          // Get content from the titleContent object
          const student = item.titleContent?.student || item.title.split('(')[0].trim();
          
          // Simplified booking display for mobile
          return (
            <div
              {...restOfItemProps}
              style={{
                ...style,
                background: item.bgColor || '#334155',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                padding: '4px',
                fontSize: '13px',
                overflow: 'hidden',
                height: '100%',
                margin: 0
              }}
              className="booking-item-mobile"
              onClick={() => onBookingClick && onBookingClick(item.bookingData)}
            >
              <div className="booking-student-mobile" title={student}>
                {student}
              </div>
            </div>
          );
        }}
      />
    </div>
  );

  // Render mobile list view
  const renderMobileListView = () => {
    // Group bookings by instructor
    const bookingsByInstructor = {};
    instructors.forEach(instructor => {
      bookingsByInstructor[instructor.id] = bookingItems.filter(
        item => item.group === instructor.id
      ).sort((a, b) => a.start_time - b.start_time);
    });

    return (
      <div className="mobile-instructor-tabs">
        {instructors.map(instructor => (
          <div key={instructor.id} className="mobile-instructor-section">
            <div className="mobile-instructor-header">
              <h3>{instructor.name}</h3>
            </div>
            <div className="mobile-slots-container">
              {bookingsByInstructor[instructor.id].length > 0 ? (
                bookingsByInstructor[instructor.id].map(item => (
                  <div 
                    key={item.id} 
                    className={`mobile-booking-card ${item.titleContent?.status || 'available'}`}
                    onClick={() => onBookingClick && onBookingClick(item.bookingData)}
                    style={{
                      backgroundColor: item.bgColor || '#334155',
                      borderStyle: 'solid',
                      borderWidth: '2px',
                      borderColor: 'rgba(255,255,255,0.3)'
                    }}
                  >
                    <div className="mobile-booking-time">
                      {item.titleContent?.time || moment(item.start_time).format('HH:mm')}
                    </div>
                    <div className="mobile-booking-student">
                      {item.titleContent?.student || ''}
                    </div>
                    <div className="mobile-booking-service">
                      {item.titleContent?.service || ''}
                      {item.bookingData?.duration && <span> ({item.bookingData.duration}h)</span>}
                    </div>
                    {item.titleContent?.status && item.titleContent.status !== 'booked' && (
                      <div className={`mobile-booking-status ${item.titleContent.status}`}>
                        {item.titleContent.status}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                // Display standard slots for this instructor
                standardSlotItems
                  .filter(slot => slot.group === instructor.id)
                  .map(slot => (
                    <div 
                      key={slot.id} 
                      className="mobile-available-slot"
                      onClick={() => {
                        if (!onTimeSlotClick) return;
                        const parts = slot.id.split('-');
                        if (parts.length < 4) return;
                        const instructorId = parseInt(parts[1]);
                        const dateStr = parts[2];
                        const slotId = parseInt(parts[3]);
                        const slotInfo = STANDARD_SLOTS.find(s => s.id === slotId);
                        if (!slotInfo) return;
                        onTimeSlotClick({
                          date: dateStr,
                          instructorId: instructorId,
                          startHour: slotInfo.start,
                          duration: slotInfo.end - slotInfo.start
                        });
                      }}
                    >
                      <div className="mobile-slot-time">{slot.title}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };
  // Mobile view with only calendar view
  if (mobileView) {
    return (
      <div className="booking-calendar-mobile">
        <div className="calendar-header bg-slate-800/50 p-3 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-sky-300 text-center">
            {selectedDate.format('dddd, D MMMM YYYY')}
          </h2>
        </div>
        
        {renderMobileCalendarView()}
      </div>
    );
  }

  // Desktop view with timeline
  return (
    <div className="booking-calendar rounded-xl shadow-lg border border-slate-700/40 overflow-hidden relative z-10 bg-slate-800/30 backdrop-blur-sm">
      <div className="calendar-header bg-slate-800/50 p-3 border-b border-slate-700/50">
        <h2 className="text-lg font-semibold text-sky-300 text-center">
          {selectedDate.format('dddd, D MMMM YYYY')}
        </h2>
      </div>        <Timeline        ref={timelineRef}
        groups={groups} 
        items={finalItems}
        visibleTimeStart={visibleTimeStart}
        visibleTimeEnd={visibleTimeEnd}
        onTimeChange={() => {}}
        dragSnap={60 * 60 * 1000}
        canMove={true}
        canResize={false}
        onItemMove={handleItemMove}        stackItems={false}
        stickyHeader={true}          
        lineHeight={70} // Row height - must match with CSS
        itemHeightRatio={0.7}
        minZoom={60 * 60 * 1000}
        maxZoom={24 * 60 * 60 * 1000 * 7}
        sidebarWidth={220} // Sidebar width - must match with CSS
        height={instructors.length * 70 + 38} // Exact height calculation: rows + header
        rowHeight={70} // Force consistent row height
        style={{ width: '100%' }} // Force to use full width
        zoomable={false}
        moveable={window.innerWidth >= 768}
        traditionalZoom={true}
        horizontalLineClassNamesForTime={(timeStart, timeEnd) => {
          const mTime = moment(timeStart);
          const classes = ['timeline-hour-marker'];
          if (mTime.minute() === 0) classes.push('timeline-hour-line');
          if (mTime.hour() === 13 || mTime.hour() === 18) classes.push('timeline-highlight-time');
          return classes;
        }}
        timeSteps={{
          second: 0, 
          minute: 0, 
          hour: 1, // Show only full hours
          day: 1,
          month: 1,
          year: 1
        }}
        headerLabelFormats={{
          hour: '', // Hide hour labels completely
          day: '',  // Hide day labels in header
          week: '',
          month: '',
          year: ''
        }}
        subHeaderLabelFormats={{
          hour: '',  // Hide minute labels 
          day: '',   // No day subheader
          week: '',
          month: '',
          year: ''
        }}          groupRenderer={({ group }) => {
          // Determine if this is the first instructor (which is usually zeliha yilmaz)
          const isFirstInstructor = group.title.toLowerCase().includes('zeliha') || instructors.indexOf(instructors.find(i => i.id === group.id)) === 0;
          
          // Apply special class for the first instructor row
          const specialClass = isFirstInstructor ? 'instructor-sidebar-first' : '';
          
          return (
            <div className={`instructor-sidebar ${specialClass}`} style={{ 
              height: '70px', 
              display: 'flex', 
              alignItems: 'center', 
              width: '100%', 
              padding: 0, 
              margin: 0, 
              boxSizing: 'border-box', 
              minWidth: '220px',
              zIndex: isFirstInstructor ? 101 : 95,
              position: 'relative'
            }}>
              <div className={`instructor-name ${isFirstInstructor ? 'first-instructor' : ''}`} style={{ 
                height: '70px', 
                display: 'flex', 
                alignItems: 'center', 
                width: '100%', 
                padding: '0 15px', 
                margin: 0, 
                boxSizing: 'border-box', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                position: 'relative'
              }}>
                {group.title}
                <div className="instructor-indicator"></div>
              </div>
            </div>
          );
        }}
        itemRenderer={({ item, getItemProps }) => {
          const { style, ...restOfItemProps } = getItemProps(item.itemProps);
          
          // Identify if this is a standard slot (available) or booking
          const isStandardSlot = item.id.startsWith('timeslot-');
          
          if (isStandardSlot) {
            // Show simplified standard slot
            return (
              <div
                {...restOfItemProps}
                style={{
                  ...style,
                  position: 'absolute',
                  top: '10px',
                  height: '50px',
                  minHeight: '50px',
                  maxHeight: '50px',
                  background: 'rgba(14, 165, 233, 0.1)',
                  border: '1px dashed rgba(56, 189, 248, 0.5)',
                  borderRadius: '6px',
                  color: '#e0f2fe',
                  fontSize: '13px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: 0,
                  padding: '0 8px',
                  boxSizing: 'border-box',
                  zIndex: 50,
                  left: style.left,
                  width: style.width
                }}
                className="available-time-slot"
              >
                {moment(item.start_time).format('HH:mm')} - {moment(item.end_time).format('HH:mm')}
              </div>
            );
          }
          
          // Get content from the titleContent object
          const time = item.titleContent?.time || moment(item.start_time).format('HH:mm') + ' - ' + moment(item.end_time).format('HH:mm');
          const student = item.titleContent?.student || item.title.split('(')[0].trim();
          const service = item.titleContent?.service || '';
          const status = item.titleContent?.status || '';
          
          // Background color based on status
          const bgColor = item.bgColor || style.background;
          // Special styling for group lessons
          const isGroupLesson = item.isGroupLesson;
          
          let styles = {
            ...style,
            overflow: 'hidden',
            height: '50px',
            minHeight: '50px',
            maxHeight: '50px',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            zIndex: 80
          };
          
          // If this is a group lesson, add special class
          if (isGroupLesson) {
            styles = {
              ...styles,
              backgroundColor: 'transparent'
            };
          }
          
          // Create status badge color
          let statusBadgeColor = 'bg-gray-500';
          if (status === 'confirmed') statusBadgeColor = 'bg-green-500';
          if (status === 'pending') statusBadgeColor = 'bg-amber-500';
          if (status === 'completed') statusBadgeColor = 'bg-emerald-500';
          if (status === 'booked') statusBadgeColor = 'bg-blue-500';
          if (status === 'cancelled') statusBadgeColor = 'bg-red-500';
          
          return (            <div
              {...restOfItemProps}
              style={{
                ...styles,
                position: 'absolute',
                top: '10px',
                height: '50px',
                minHeight: '50px',
                maxHeight: '50px',
                left: style.left,
                width: style.width
              }}
              className={`booking-item status-${status} ${isGroupLesson ? 'group-lesson-item' : ''}`}
            >
              {/* Time and status row */}
              <div className="time-status-row">
                <span className="booking-time">{time}</span>
                {status && status !== 'booked' && (
                  <span className={`booking-status status-${status}`}>
                    {status}
                  </span>
                )}
              </div>
              
              {/* Student name */}
              <div className="booking-student" title={student}>
                {student}
              </div>
              
              {/* Duration - only show if available */}
              {item.bookingData?.duration && (
                <div className="booking-duration">
                  {item.bookingData.duration}h
                </div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
};

export default BookingCalendarUpdated;
