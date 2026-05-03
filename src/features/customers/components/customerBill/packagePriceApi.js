import apiClient from '@/shared/services/apiClient';

export const updatePackagePrice = async ({ packageId, newPrice, reason, settleWallet = true }) => {
  try {
    const { data } = await apiClient.patch(
      `/services/customer-packages/${encodeURIComponent(packageId)}/price`,
      {
        new_price: newPrice,
        reason,
        settle_wallet: settleWallet,
      }
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
