import apiClient from '@/shared/services/apiClient';

// Edit a single shop-order line item's price after the sale. The price may be
// entered in any active currency (inputCurrency); the backend converts it to
// the order's currency. Records-only — never moves the customer's wallet.
export const updateShopOrderItemPrice = async ({ orderId, itemId, newUnitPrice, reason, inputCurrency, settleWallet = true }) => {
  try {
    const { data } = await apiClient.patch(
      `/shop-orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/price`,
      {
        new_unit_price: newUnitPrice,
        reason,
        input_currency: inputCurrency || undefined,
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
