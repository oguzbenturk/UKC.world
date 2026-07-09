// Single source of truth for the live-history graph's time ranges and thresholds
// (shared by WindHistoryChart + WindHistoryCard + usePwsHistory).
//
// NOTE: the backend keeps its own copy of these ranges in
// backend/services/weather/history.js — the two run in separate bundles and cannot
// share a module, so keep the values in sync there.

export const HISTORY_RANGES = ['1h', '6h', '24h', '7d'];

// Range key → lookback window (ms).
export const RANGE_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// Range key → time-axis tick spacing (ms).
export const TICK_MS = {
  '1h': 15 * 60 * 1000,
  '6h': 60 * 60 * 1000,
  '24h': 4 * 60 * 60 * 1000,
  '7d': 24 * 60 * 60 * 1000,
};

// A break longer than this between consecutive readings means the station was offline
// (the recorder samples every ~5 min) → render a gap, no interpolation across it.
export const GAP_MS = 20 * 60 * 1000;
