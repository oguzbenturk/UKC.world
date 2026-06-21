import apiClient from '@/shared/services/apiClient';

const unwrap = (err) => {
  const detail = err?.response?.data?.error || err?.response?.data?.message;
  if (detail) {
    const wrapped = new Error(detail);
    wrapped.status = err?.response?.status;
    return wrapped;
  }
  return err;
};

// All lesson-bearing package tiers from the catalog (candidate upgrade targets).
export const fetchLessonPackageTiers = async () => {
  try {
    const { data } = await apiClient.get('/services/packages');
    const rows = Array.isArray(data) ? data : [];
    return rows.filter((p) => p.includesLessons !== false && Number(p.totalHours) > 0);
  } catch {
    return [];
  }
};

// Dry-run: returns the exact upgrade summary (per-lesson old→new, wallet delta,
// paid-out count) WITHOUT persisting.
export const previewPackageUpgrade = async ({ packageId, newServicePackageId, settleWallet = true }) => {
  try {
    const { data } = await apiClient.post(
      `/services/customer-packages/${encodeURIComponent(packageId)}/upgrade/preview`,
      { new_service_package_id: newServicePackageId, settle_wallet: settleWallet }
    );
    return data;
  } catch (err) {
    throw unwrap(err);
  }
};

export const upgradePackage = async ({ packageId, newServicePackageId, reason, settleWallet = true }) => {
  try {
    const { data } = await apiClient.post(
      `/services/customer-packages/${encodeURIComponent(packageId)}/upgrade`,
      { new_service_package_id: newServicePackageId, reason, settle_wallet: settleWallet }
    );
    return data;
  } catch (err) {
    throw unwrap(err);
  }
};
