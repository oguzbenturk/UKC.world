/**
 * StudentBookServicePage
 * 
 * Redirect page that sends students to their dashboard with booking wizard open.
 * Handles navigation state to pre-select service category and discipline.
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';

const StudentBookServicePage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Redirect to student dashboard with booking state
    const state = {
      openBooking: true,
      ...location.state // Pass through any service category/discipline from lesson pages
    };
    
    navigate('/student/dashboard', { replace: true, state });
  }, [navigate, location.state]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spin size="large" tip="Opening booking..." />
    </div>
  );
};

export default StudentBookServicePage;
