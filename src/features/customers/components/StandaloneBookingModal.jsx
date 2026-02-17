// src/features/customers/components/StandaloneBookingModal.jsx
import React, { Suspense } from 'react';
import { Spin, Alert } from 'antd';
import { CalendarProvider } from '../../bookings/components/contexts/CalendarContext';
import StepBookingModal from '../../bookings/components/components/StepBookingModal';

/**
 * Error boundary for catching context errors
 */
class ModalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('StandaloneBookingModal Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          message="Booking Modal Error"
          description="There was an error loading the booking form. Please try again."
          type="error"
          closable
          onClose={this.props.onClose}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Standalone booking modal that includes the CalendarProvider
 * This allows using StepBookingModal outside of calendar pages
 */
const StandaloneBookingModal = ({ isOpen, onClose, onBookingCreated }) => {
  // Only render if the modal should be open
  if (!isOpen) {
    return null;
  }

  return (
    <ModalErrorBoundary onClose={onClose}>
      <CalendarProvider>
        <Suspense fallback={<Spin size="large" />}>
          <StepBookingModal 
            isOpen={isOpen} 
            onClose={onClose}
            onBookingCreated={onBookingCreated}
          />
        </Suspense>
      </CalendarProvider>
    </ModalErrorBoundary>
  );
};

export default StandaloneBookingModal;
