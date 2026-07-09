// Model tab order + labels — mirrors backend MODEL_ORDER (services/weather/index.js).
export const MIX_KEY = 'mix';
export const MODEL_ORDER = ['mix', 'wrf3', 'wrf9', 'icon7', 'ifs9', 'icon13', 'gfs13'];
export const MODEL_LABEL = {
  mix: 'UKC Mix',
  wrf3: 'WRF 3',
  wrf9: 'WRF 9',
  icon7: 'ICON 7',
  ifs9: 'IFS 9',
  icon13: 'ICON 13',
  gfs13: 'GFS 13',
};
// Shown as muted "reference" tabs — GFS is the model the owner does not trust locally.
export const GHOST_MODELS = ['gfs13'];
