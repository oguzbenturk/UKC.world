/**
 * Global ref consumed by `PackageDetailsModal`.
 * Pages that call `openPackageDetailsModal(pkg)` should assign handlers each render
 * (or in useEffect) and clear on unmount:
 *
 *   packageDetailsModalDepsRef.current = { handleBookNow, ownedByPackageId };
 *   handleBookNow(pkg, durationIndex, durationOverride?) — optional third arg for custom pro-rata row.
 *   useEffect(() => () => { packageDetailsModalDepsRef.current = {}; }, []);
 */
export const packageDetailsModalDepsRef = { current: {} };
