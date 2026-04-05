const initialState = () => ({
  open: false,
  package: null,
  selectedDuration: null
});

/** Keep in sync with exit motion duration in PackageDetailsModal. */
export const PACKAGE_DETAILS_MODAL_CLEAR_MS = 280;

let state = initialState();
const listeners = new Set();
/** Pending timeout from close — must be cleared on reopen or it wipes the new session. */
let clearPayloadTimeoutId = null;

function clearPayloadDelay() {
  if (clearPayloadTimeoutId != null) {
    clearTimeout(clearPayloadTimeoutId);
    clearPayloadTimeoutId = null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPackageDetailsModalSnapshot() {
  return state;
}

/** Open the lesson/rental package details modal (does not touch page React state). */
export function openPackageDetailsModal(pkg) {
  if (!pkg) return;
  clearPayloadDelay();
  state = {
    ...state,
    open: true,
    package: pkg,
    selectedDuration: pkg.durations?.length > 1 ? 1 : 0
  };
  emit();
}

export function setPackageDetailsDuration(index) {
  state = { ...state, selectedDuration: index };
  emit();
}

/** Close: animate out, then clear payload (delay aligned with PackageDetailsModal motion). */
export function closePackageDetailsModal() {
  clearPayloadDelay();
  state = { ...state, open: false };
  emit();
  clearPayloadTimeoutId = setTimeout(() => {
    clearPayloadTimeoutId = null;
    state = initialState();
    emit();
  }, PACKAGE_DETAILS_MODAL_CLEAR_MS);
}

/** Hard reset (e.g. host unmount) — avoids stale open state when leaving the page. */
export function resetPackageDetailsModalState() {
  clearPayloadDelay();
  state = initialState();
  emit();
}

/**
 * When the grid data refetches (e.g. service image updated), replace the open modal payload
 * with the matching live card so the hero image and copy stay in sync.
 */
export function refreshOpenPackageDetailsModal(nextPkg) {
  if (!nextPkg || !state.open || !state.package) return;
  if (String(state.package.id) !== String(nextPkg.id)) return;
  clearPayloadDelay();
  const prevIdx = state.selectedDuration ?? 0;
  const nextIdx =
    nextPkg.durations?.length > 1
      ? Math.min(Math.max(0, prevIdx), nextPkg.durations.length - 1)
      : 0;
  state = {
    ...state,
    package: nextPkg,
    selectedDuration: nextIdx,
  };
  emit();
}
