import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Card } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import BookingForm from '../components/BookingForm';
import DataService from '@/shared/services/dataService';

const BookingEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [students, setStudents] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, studs, instrs] = await Promise.all([
        DataService.getBooking(id),
        DataService.getUsersWithStudentRole(),
        DataService.getInstructors(),
      ]);
      setBooking(b);
      setStudents(studs || []);
      setInstructors(instrs || []);
  } catch {
      message.error('Failed to load booking');
      // Navigate back to bookings list on failure
      navigate('/bookings', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClose = () => navigate('/bookings');

  const handleSave = async (updated) => {
    try {
      await DataService.updateBooking(id, updated);
      message.success('Booking updated');
      navigate('/bookings');
    } catch {
      message.error('Failed to update booking');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Spin />
      </div>
    );
  }

  if (!booking) {
    return null;
  }

  return (
    <div className="p-6">
      <Card className="max-w-3xl mx-auto shadow-sm border-0 rounded-xl" title="Edit Booking">
        <BookingForm
          booking={booking}
          onClose={handleClose}
          onSave={handleSave}
          students={students}
          instructors={instructors}
        />
      </Card>
    </div>
  );
};

export default BookingEditPage;
