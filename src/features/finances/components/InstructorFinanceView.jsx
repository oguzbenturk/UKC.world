import { useRef, useCallback } from 'react';
import { Alert } from 'antd';
import InstructorOverviewCard from '@/features/instructors/components/InstructorOverviewCard';
import PayrollDashboard from '@/features/instructors/components/PayrollDashboard';
import InstructorPayments from '@/features/instructors/components/InstructorPayments';

const InstructorFinanceView = ({ instructor }) => {
  const payrollRef = useRef(null);
  const paymentsRef = useRef(null);

  const handleRefresh = useCallback(async () => {
    const tasks = [];

    if (payrollRef.current?.refreshData) {
      tasks.push(payrollRef.current.refreshData());
    }

    if (paymentsRef.current?.refreshData) {
      tasks.push(paymentsRef.current.refreshData());
    }

    if (tasks.length === 0) return;

    try {
      await Promise.all(tasks);
    } catch (error) {
      // Silently swallow refresh errors; child components already display their own error states
      console.debug('Instructor finance refresh failed', error); // eslint-disable-line no-console
    }
  }, []);

  if (!instructor?.id) {
    return (
      <Alert
        type="warning"
        message="Instructor profile not available"
        description="We couldn't load your instructor profile. Please refresh the page or contact support."
        showIcon
        className="m-6"
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <InstructorOverviewCard instructor={instructor} />

      <PayrollDashboard ref={payrollRef} instructor={instructor} />

      <InstructorPayments
        ref={paymentsRef}
        instructor={instructor}
        onPaymentSuccess={handleRefresh}
        readOnly
      />
    </div>
  );
};

export default InstructorFinanceView;
