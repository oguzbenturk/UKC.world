// Self-contained launcher that loads every family member's cohort data and
// opens CustomerBillModal in cohort mode. Used from the navbar so the
// Organizer can pull a combined bill across all linked family accounts
// without having a customer-detail screen open.

import { useEffect, useState } from 'react';
import { Spin, App } from 'antd';
import CustomerBillModal from './CustomerBillModal';
import { loadBillCohort } from './customerBill/billCustomerLoader';

const FamilyCombinedBillLauncher = ({ memberIds, primaryId, onClose }) => {
  const { message } = App.useApp();
  const [cohort, setCohort] = useState(null);
  const [primary, setPrimary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ids = Array.isArray(memberIds) ? memberIds : [];
    if (ids.length === 0 || !primaryId) {
      onClose?.();
      return;
    }

    const ordered = [primaryId, ...ids.filter((id) => id !== primaryId)];
    Promise.all(ordered.map((id) => loadBillCohort(id)))
      .then((entries) => {
        if (cancelled) return;
        const cleaned = entries.filter(Boolean);
        if (cleaned.length === 0) {
          message.error('Could not load family bill data');
          onClose?.();
          return;
        }
        setPrimary(cleaned[0].customer || null);
        setCohort(cleaned);
      })
      .catch((err) => {
        console.error('Family combined bill load failed', err);
        message.error('Could not load combined bill');
        onClose?.();
      });

    return () => { cancelled = true; };
  }, [memberIds, primaryId, message, onClose]);

  if (!cohort || !primary) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const first = cohort[0];

  return (
    <CustomerBillModal
      open
      onClose={onClose}
      customer={primary}
      bookings={first.bookings || []}
      rentals={first.rentals || []}
      packages={first.packages || []}
      accommodationBookings={first.accommodationBookings || []}
      transactions={first.transactions || []}
      instructors={first.instructors || []}
      discountsByEntity={first.discountsByEntity}
      cohort={cohort}
    />
  );
};

export default FamilyCombinedBillLauncher;
