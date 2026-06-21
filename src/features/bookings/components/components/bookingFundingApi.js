import apiClient from '@/shared/services/apiClient';

// Fetch a customer's packages (used to pick which package a lesson should draw
// from when switching a cash lesson onto a package).
export const fetchCustomerPackagesForFunding = async (customerId) => {
  if (!customerId) return [];
  try {
    const { data } = await apiClient.get(
      `/services/customer-packages/${encodeURIComponent(customerId)}`
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

// Switch a booking between cash and package funding.
//   mode: 'package' | 'cash'
//   customerPackageId (optional, mode='package'): pin a specific package;
//   omit to let the backend auto-match the customer's compatible packages.
export const switchBookingFunding = async ({ bookingId, mode, customerPackageId = null }) => {
  try {
    const { data } = await apiClient.post(
      `/bookings/${encodeURIComponent(bookingId)}/switch-funding`,
      { mode, customer_package_id: customerPackageId || undefined }
    );
    return data;
  } catch (err) {
    const detail = err?.response?.data?.error || err?.response?.data?.message;
    if (detail) {
      const wrapped = new Error(detail);
      wrapped.status = err?.response?.status;
      throw wrapped;
    }
    throw err;
  }
};
