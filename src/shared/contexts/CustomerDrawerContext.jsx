import { createContext, useContext, useState, useCallback, lazy, Suspense } from 'react';

// The enhanced customer drawer is heavy (pulls in packages, bookings, rentals,
// shop, memberships, discounts, financial tabs + their lazy children), so it is
// code-split and only mounted once the first customer is opened.
const EnhancedCustomerDetailModal = lazy(() =>
  import('@/features/customers/components/EnhancedCustomerDetailModal')
);

const CustomerDrawerContext = createContext(null);

/**
 * App-wide provider that renders a single enhanced customer drawer and exposes
 * `openCustomer(idOrObject)` so any screen (finance tables, etc.) can open the
 * full customer profile without re-wiring its own drawer instance.
 *
 * Must live inside Auth/Currency/Data providers — the drawer reads those
 * contexts. The drawer loads everything from `customer.id`; passing the name/
 * email too just makes the header render instantly before the fetch resolves.
 */
export function CustomerDrawerProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const openCustomer = useCallback((idOrObject) => {
    if (idOrObject === null || idOrObject === undefined) return;
    const next = typeof idOrObject === 'object' ? idOrObject : { id: idOrObject };
    if (next.id === null || next.id === undefined || next.id === '') return;
    setCustomer(next);
    setIsOpen(true);
  }, []);

  const closeCustomer = useCallback(() => setIsOpen(false), []);

  return (
    <CustomerDrawerContext.Provider value={{ openCustomer, closeCustomer }}>
      {children}
      {customer && (
        <Suspense fallback={null}>
          <EnhancedCustomerDetailModal
            customer={customer}
            isOpen={isOpen}
            // Keep `customer` mounted through the close animation, then drop it.
            onClose={() => { setIsOpen(false); setCustomer(null); }}
          />
        </Suspense>
      )}
    </CustomerDrawerContext.Provider>
  );
}

/**
 * Returns `{ openCustomer, closeCustomer }`. Falls back to no-ops when used
 * outside the provider so a stray caller can never crash the page.
 */
export function useCustomerDrawer() {
  return useContext(CustomerDrawerContext) || { openCustomer: () => {}, closeCustomer: () => {} };
}

export default CustomerDrawerContext;
