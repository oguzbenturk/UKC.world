// src/pages/BookingCalendarPage.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DataService from '@/shared/services/dataService';
import { useData } from '@/shared/hooks/useData';
import BookingForm from '../components/BookingForm';
import Timeline from 'react-calendar-timeline';
import moment from 'moment';
import '../components/styles/bookingCalendar.css';
import { stripHtml } from '../utils/nameDisplay';
import { sanitizeHtml } from '@/shared/utils/sanitizeHtml';
import { Modal, Button } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  STANDARD_SLOTS, 
  createBookingItems, 
  createStandardSlotItems 
} from '../utils/timelineUtils';

// SVG Icons
const CalendarIcon = (props) => <svg {...props} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>;
const PlusIcon = (props) => <svg {...props} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>;
const KiteIcon = (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9l-9 9M16 14l-3 3M17 6l-7 7M5 19a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v1M9 21h10a2 2 0 002-2V10M21 10l-6-6"/></svg>;
const WaveIcon = (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4c1.1 0 2-.9 2-2s-.9-2-2-2H2m18 0h-4c-1.1 0-2 .9-2 2s.9 2 2 2h4M2 20h4c1.1 0 2-.9 2-2s-.9-2-2-2H2m18 0h-4c-1.1 0-2 .9-2 2s.9-2 2-2h4M2 4h4c-1.1 0-2-.9-2-2s-.9-2-2-2H2m18 0h-4c-1.1 0-2 .9-2 2s.9-2 2-2h4"/></svg>;
const ListIcon = (props) => <svg {...props} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>;

function BookingCalendarPage() {
  const [bookings, setBookings] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(moment());
  const timelineRef = useRef(null);
  const { students: usersWithStudentRole, instructors } = useData();
  const [visibleTimeStart, setVisibleTimeStart] = useState(moment().startOf('day').hour(8).valueOf());
  const [visibleTimeEnd, setVisibleTimeEnd] = useState(moment().startOf('day').hour(20).valueOf());
  useEffect(() => {
    const loadBookings = async () => {
      try {
        const data = await DataService.getBookings();
        setBookings(data);
      } catch (error) {
        console.error('Error loading bookings:', error);
      }
    };

    loadBookings();
  }, []);

  useEffect(() => {
    const newDate = moment(selectedDate);
    const dayStartHour = 8;
    const dayEndHour = 20;
    setVisibleTimeStart(newDate.clone().startOf('day').hour(dayStartHour).valueOf());
    setVisibleTimeEnd(newDate.clone().startOf('day').hour(dayEndHour).valueOf());
  }, [selectedDate]);

  const handleSelectSlot = (slotInfo) => {
    setSelectedEvent({
      date: slotInfo.date,
      instructor_user_id: slotInfo.instructorId,
      start_hour: slotInfo.startHour,
      duration: slotInfo.duration
    });
    setShowBookingForm(true);
  };

  const handleSelectEvent = (event) => {
    const booking = bookings.find(b => b.id === event.id || `booking-${b.id}` === event.id);
    if (booking) {
      setSelectedEvent(booking);
      setShowBookingForm(true);
    }
  };

  const handleCloseForm = () => {
    setShowBookingForm(false);
    setSelectedEvent(null);
  };

  const handleSaveBooking = async (bookingData) => {
    setShowBookingForm(false);
    setSelectedEvent(null);
    try {
      const data = await fetchBookings();
      setBookings(data);
      message.success(bookingData.id ? 'Booking updated successfully' : 'New booking created successfully');
      // Dispatch global refresh event to trigger calendar auto-refresh
      window.dispatchEvent(new CustomEvent(bookingData.id ? 'booking-updated' : 'booking-created', {
        detail: { bookingId: bookingData.id }
      }));
    } catch (error) {
      console.error('Error refreshing bookings:', error);
      message.error('There was an error updating the bookings display');
    }
  };

  const handleDelete = async (id) => {
    Modal.confirm({
      title: 'Delete Booking',
      content: 'Are you sure you want to delete this booking?',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await DataService.deleteBooking(id);
          const data = await fetchBookings();
          setBookings(data);
          message.success('Booking deleted successfully');
          // Dispatch global refresh event to trigger calendar auto-refresh
          window.dispatchEvent(new CustomEvent('booking-deleted', {
            detail: { bookingId: id }
          }));
        } catch (error) {
          console.error('Error deleting booking:', error);
          message.error('Failed to delete booking');
        }
      }
    });
  };

  const navigateToDate = (date) => {
    const newDate = moment(date);
    const start = newDate.clone().startOf('day').hour(9).valueOf();
    const end = newDate.clone().startOf('day').hour(19).valueOf();

    if (timelineRef.current && typeof timelineRef.current.updateScrollCanvas === 'function') {
      timelineRef.current.updateScrollCanvas(start, end);
    } else {
      setVisibleTimeStart(start);
      setVisibleTimeEnd(end);
    }
    setSelectedDate(newDate);
  };

  const groups = useMemo(() => instructors.map(inst => ({ 
    id: inst.id, 
    title: inst.name,
    rightTitle: 'Instructor'
  })), [instructors]);

  const bookingItems = useMemo(() => {
    const items = createBookingItems(bookings, instructors, usersWithStudentRole);
    return items.map(item => ({
      ...item,
      itemProps: {
        ...item.itemProps,
        onDoubleClick: () => handleSelectEvent({ id: item.bookingData.id })
      }
    }));
  }, [bookings, instructors, usersWithStudentRole]);

  const standardSlotItems = useMemo(() => {
    const items = createStandardSlotItems(instructors, selectedDate);
    return items.map(item => ({
      ...item,
      itemProps: {
        ...item.itemProps,
        onClick: () => {
          const [, instructorId, dateStr, slotId] = item.id.split('-');
          const slot = STANDARD_SLOTS.find(s => s.id === parseInt(slotId));
          
          handleSelectSlot({
            date: dateStr,
            instructorId: parseInt(instructorId),
            startHour: slot.start,
            duration: slot.end - slot.start
          });
        }
      }
    }));
  }, [instructors, selectedDate]);

  const items = useMemo(() => 
    [...standardSlotItems, ...bookingItems].sort((a, b) => a.start_time - b.start_time),
    [standardSlotItems, bookingItems]);

  const handleItemMove = async (itemId, dragTime, newGroupId) => {
    const bookingToMove = bookings.find(b => `booking-${b.id}` === itemId);
    if (bookingToMove) {
      const newStartTime = moment(dragTime);
      const newDate = newStartTime.format('YYYY-MM-DD');
      const newStartHour = newStartTime.hour() + (newStartTime.minute() / 60);

      const updatedBookingPayload = {
        date: newDate,
        start_hour: newStartHour,
        instructor_user_id: newGroupId,
      };

      try {
        await DataService.updateBooking(bookingToMove.id, updatedBookingPayload);
        const refreshedBookings = await fetchBookings();
        setBookings(refreshedBookings);
      } catch (error) {
        console.error('Error updating booking after move:', error);
        const refreshedBookings = await fetchBookings();
        setBookings(refreshedBookings);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-300 p-4 flex flex-col">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-sky-600/10 rounded-full filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-0 -right-4 w-72 h-72 bg-indigo-600/10 rounded-full filter blur-3xl opacity-20"></div>
      
      <div className="flex justify-between items-center mb-6 relative z-10">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <KiteIcon className="w-8 h-8 mr-3 text-sky-400" />
          <span>Kitesurfing Lessons - Calendar View</span>
        </h1>
        <div className="flex space-x-4">
          <Link
            to="/bookings"
            className="flex items-center bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg shadow-lg transition-all"
          >
            <ListIcon className="w-5 h-5 mr-2" />
            <span>List View</span>
          </Link>
          
          <div className="flex items-center space-x-1 bg-slate-800 rounded-lg shadow-lg p-2">
            <button 
              onClick={() => navigateToDate(selectedDate.clone().subtract(1, 'day'))} 
              className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </button>
            <button 
              onClick={() => navigateToDate(moment())} 
              className="px-3 py-1 text-sm rounded hover:bg-slate-700 text-sky-300"
            >
              Today
            </button>
            <button 
              onClick={() => navigateToDate(selectedDate.clone().add(1, 'day'))} 
              className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </button>
          </div>
          
          <button 
            onClick={() => { setSelectedEvent(null); setShowBookingForm(true); }} 
            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white rounded-lg shadow-lg flex items-center transition duration-200"
          >
            <PlusIcon className="w-5 h-5 mr-1.5" />
            New Booking
          </button>
        </div>
      </div>
      
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-3 mb-4 flex flex-wrap gap-4 relative z-10 shadow-lg border border-slate-700/40">
        <div className="text-white font-semibold flex items-center">
          <WaveIcon className="w-5 h-5 text-sky-400 mr-2" />
          Standard Time Slots:
        </div>
        {STANDARD_SLOTS.map(slot => (
          <div key={slot.id} className="flex items-center text-sky-300 text-sm">
            <div className="w-3 h-3 rounded-sm bg-sky-400/30 border border-sky-400/50 mr-2"></div>
            {slot.title}
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-3 mb-6 flex flex-wrap gap-x-6 gap-y-3 items-center relative z-10 shadow-lg border border-slate-700/40">
        <div className="text-white font-semibold mr-4">Status:</div>
        <div className="flex items-center text-sm"><div className="w-3 h-3 rounded-full bg-blue-500 mr-1.5"></div>Booked</div>
        <div className="flex items-center text-sm"><div className="w-3 h-3 rounded-full bg-amber-500 mr-1.5"></div>Pending</div>
        <div className="flex items-center text-sm"><div className="w-3 h-3 rounded-full bg-green-500 mr-1.5"></div>Confirmed</div>
        <div className="flex items-center text-sm"><div className="w-3 h-3 rounded-full bg-emerald-500 mr-1.5"></div>Completed</div>
        <div className="flex items-center text-sm"><div className="w-3 h-3 rounded-full bg-red-500 mr-1.5"></div>Cancelled</div>
        <div className="flex items-center text-sm"><div className="w-3 h-3 rounded-full bg-gray-500 mr-1.5"></div>Other</div>
      </div>
      
      <div className="flex-grow rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden relative z-10 bg-slate-800/30 backdrop-blur-md">
        <Timeline
          ref={timelineRef}
          groups={groups}
          items={items}
          visibleTimeStart={visibleTimeStart}
          visibleTimeEnd={visibleTimeEnd}
          onTimeChange={(visStart, visEnd, updateScrollCanvas) => {
            const newSelectedMoment = moment(visStart);
            if (!newSelectedMoment.isSame(selectedDate, 'day')) {
              setSelectedDate(newSelectedMoment.startOf('day'));
            } else {
              setVisibleTimeStart(visStart);
              setVisibleTimeEnd(visEnd);
            }
            if (typeof updateScrollCanvas === 'function') {
              updateScrollCanvas(visStart, visEnd);
            }
          }}
          canMove={true}
          canResize={false}
          onItemMove={handleItemMove}
          stackItems
          stickyHeader={true}
          lineHeight={70} 
          itemHeightRatio={0.8} 
          minZoom={60 * 60 * 1000 * 1}
          maxZoom={24 * 60 * 60 * 1000 * 7}
          sidebarWidth={160}
          horizontalLineClassNamesForTime={(timeStart, timeEnd) => {
            const mTime = moment(timeStart);
            const classes = [];
            if (mTime.minute() === 0) classes.push('timeline-hour-line');
            if (mTime.minute() === 30) classes.push('timeline-half-hour-line');
            if (mTime.hour() === 13 || mTime.hour() === 18) classes.push('timeline-highlight-time');
            return classes;
          }}
          timeSteps={{
            second: 0, 
            minute: 15, 
            hour: 1,
            day: 1,
            month: 1,
            year: 1
          }}
          groupRenderer={({ group }) => {
            return (
              <div className="flex flex-col items-start p-2 h-full justify-center">
                <div className="text-sky-300 font-medium">{group.title}</div>
                <div className="text-xs text-slate-400">Instructor</div>
              </div>
            );
          }}
          itemRenderer={({ item, getItemProps, getResizeProps }) => {
            const { style, ...restOfItemProps } = getItemProps(item.itemProps);
            
            const time = item.titleContent?.time || moment(item.start_time).format('HH:mm') + ' - ' + moment(item.end_time).format('HH:mm');
            const userName = item.titleContent?.user || item.title.split('(')[0].trim();
            const service = item.titleContent?.service || '';
            const status = item.titleContent?.status || '';
            const statusIcon = item.titleContent?.statusIcon || '';
            
            const bgColor = item.bgColor || style.background;
            
            let statusBadgeColor = 'bg-gray-500';
            if (status === 'confirmed') statusBadgeColor = 'bg-green-500';
            if (status === 'pending') statusBadgeColor = 'bg-amber-500';
            if (status === 'completed') statusBadgeColor = 'bg-emerald-500';
            if (status === 'booked') statusBadgeColor = 'bg-blue-500';
            if (status === 'cancelled') statusBadgeColor = 'bg-red-500';
            
            return (
              <div
                {...restOfItemProps}
                style={{
                  ...style,
                  background: bgColor,
                  color: 'white',
                  border: item.borderColor ? `2px solid ${item.borderColor}` : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  padding: '8px',
                  overflow: 'hidden',
                  height: '100%',
                  opacity: status === 'cancelled' ? 0.7 : 1
                }}
                className={`booking-item ${status === 'cancelled' ? 'booking-status-cancelled' : ''}`}
              >
                <div className="flex justify-between items-center mb-1 min-w-0">
                  <span className="font-bold text-sm">{time}</span>
                  {status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeColor} text-white uppercase tracking-wide`}>
                      {status}
                    </span>
                  )}
                </div>
                {/* Name: single-line truncate on small screens; up to 2 lines on md+ */}
                <div
                  className="font-semibold text-sm mb-1 min-w-0 max-w-full truncate whitespace-nowrap md:whitespace-normal md:line-clamp-2"
                  title={stripHtml(userName)}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(userName) }}
                />

                <div className="text-xs opacity-90 mb-1 min-w-0 max-w-full truncate" title={service}>{service}</div>
                
                <div className="text-xs opacity-80">
                  {item.bookingData?.duration && `${item.bookingData.duration}h`}
                </div>
              </div>
            );
          }}
        />
      </div>

      <style>{`
        .react-calendar-timeline .rct-header-root {
          background-color: rgba(15, 23, 42, 0.85) !important; 
          border-bottom: 1px solid rgba(51, 65, 85, 0.7) !important; 
          backdrop-filter: blur(5px); 
        }
        
        .react-calendar-timeline .rct-calendar-header {
          border-left: 1px solid rgba(51, 65, 85, 0.7) !important;
        }
        
        .react-calendar-timeline .rct-dateHeader {
          background-color: rgba(17, 24, 39, 0.75) !important; 
          color: rgb(203, 213, 225) !important; 
          border-left: 1px solid rgba(51, 65, 85, 0.7) !important;
          font-weight: 500;
          text-transform: uppercase; 
          font-size: 0.8rem; 
        }
        
        .react-calendar-timeline .rct-dateHeader-primary {
          color: rgb(56, 189, 248) !important; 
          background-color: rgba(15, 23, 42, 0.9) !important; 
          font-weight: 700; 
        }
        
        .react-calendar-timeline .rct-sidebar {
          background-color: rgba(15, 23, 42, 0.75) !important; 
          border-right: 1px solid rgba(51, 65, 85, 0.7) !important;
          backdrop-filter: blur(5px); 
        }

        .react-calendar-timeline .rct-sidebar .rct-sidebar-row {
          padding: 0 !important; 
          height: 100% !important; 
        }
        
        .react-calendar-timeline .rct-vertical-lines .rct-vl {
          border-left: 1px dotted rgba(51, 65, 85, 0.4) !important; 
        }

        .react-calendar-timeline .rct-vertical-lines .timeline-hour-line {
           border-left: 1px solid rgba(71, 85, 105, 0.6) !important; 
        }
        .react-calendar-timeline .rct-vertical-lines .timeline-half-hour-line {
           border-left: 1px dashed rgba(71, 85, 105, 0.4) !important; 
        }
        
        .react-calendar-timeline .rct-vertical-lines .rct-vl.rct-day-6, 
        .react-calendar-timeline .rct-vertical-lines .rct-vl.rct-day-0 {
          background-color: rgba(30, 41, 59, 0.5) !important; 
        }
        
        .react-calendar-timeline .rct-horizontal-lines .rct-hl-even, 
        .react-calendar-timeline .rct-horizontal-lines .rct-hl-odd {
          border-bottom: 1px solid rgba(51, 65, 85, 0.4) !important; 
        }
        
        .react-calendar-timeline .rct-horizontal-lines .timeline-highlight-time {
          background-color: rgba(14, 165, 233, 0.03) !important; 
          border-bottom: 1px dashed rgba(14, 165, 233, 0.15) !important;
        }

        .standard-time-slot {
          pointer-events: all !important;
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        .standard-time-slot:hover {
          background: rgba(14, 165, 233, 0.15) !important; 
          border: 1px solid rgba(14, 165, 233, 0.6) !important;
        }
        
        .booking-item {
          transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, opacity 0.15s ease-out;
          position: relative;
        }
        
        .booking-item:hover {
          transform: translateY(-2px) scale(1.02);
          z-index: 100 !important;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25) !important;
        }
        
        .booking-status-confirmed {
          box-shadow: 0 3px 6px rgba(34, 197, 94, 0.2);
        }
        
        .booking-status-pending {
          box-shadow: 0 3px 6px rgba(245, 158, 11, 0.2);
        }
        
        .booking-status-completed {
          box-shadow: 0 3px 6px rgba(16, 185, 129, 0.2);
        }
        
        .booking-status-cancelled {
          text-decoration: line-through;
          box-shadow: 0 3px 6px rgba(239, 68, 68, 0.1);
        }
        
        .react-calendar-timeline .rct-horizontal-lines .rct-hl-odd:hover,
        .react-calendar-timeline .rct-horizontal-lines .rct-hl-even:hover {
          background-color: rgba(14, 165, 233, 0.05) !important;
        }
        
        .react-calendar-timeline .rct-now-indicator {
          z-index: 50;
          border-color: rgba(239, 68, 68, 0.7) !important;
        }
        
        .react-calendar-timeline {
          height: 100% !important;
        }
        
        .rct-scroll {
          height: 100% !important;
        }
      `}</style>

      {showBookingForm && (        <BookingForm
          booking={selectedEvent}
          onClose={handleCloseForm}
          onSave={handleSaveBooking}
          students={usersWithStudentRole}
          instructors={instructors}
        />
      )}
    </div>
  );
}

export default BookingCalendarPage;
