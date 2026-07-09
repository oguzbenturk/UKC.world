import { SPOTS, SPOT_LIST, getSpot } from './spots.js';
import { fetchWindguruModels } from './windguruScraper.js';
import { buildMix } from './mix.js';
import { MODEL_ORDER } from './modelOrder.js';

export { SPOTS, SPOT_LIST, getSpot };
export { MODEL_ORDER };
export { getUkcLive } from './ukcStation.js';
export { getPwsLive } from './wundergroundStation.js';
export { recordPwsReading, getPwsHistory, HISTORY_RANGES } from './history.js';
export { getModelAccuracy } from './accuracy.js';
export const listSpots = () => SPOT_LIST;

const horizonHours = (hours) => {
  if (!hours.length) return 0;
  const ts = hours.map((x) => Date.parse(`${x.dateLocal}T${x.timeLocal}:00`));
  return Math.round((Math.max(...ts) - Math.min(...ts)) / 3600000);
};

// Latest init among the mix contributors (mix has no single init of its own).
const maxInit = (models, contributors) =>
  contributors
    .map((k) => models.find((m) => m.key === k)?.initUtcIso)
    .filter(Boolean)
    .sort()
    .pop() || null;

export const buildForecast = (bundle, opts = {}) => {
  const modelKey = opts.model || 'mix';
  const mix = buildMix(bundle.models);

  // Tab metadata: mix first (if it has contributors), then each raw model in MODEL_ORDER.
  const tabs = [];
  if (mix.contributors.length) {
    tabs.push({ key: 'mix', name: 'UKC Mix', resolution: '', initUtcIso: maxInit(bundle.models, mix.contributors), horizonHours: horizonHours(mix.hours) });
  }
  for (const key of MODEL_ORDER) {
    if (key === 'mix') continue;
    const m = bundle.models.find((x) => x.key === key);
    if (m) tabs.push({ key: m.key, name: m.name, resolution: m.resolution, initUtcIso: m.initUtcIso, horizonHours: horizonHours(m.hours) });
  }

  let effectiveKey = modelKey;
  if (effectiveKey === 'mix' && !mix.contributors.length) {
    // No mix contributors upstream (e.g. only GFS returned) — fall back to the
    // sharpest available raw model so the default view is never empty.
    const firstRaw = MODEL_ORDER.find((k) => k !== 'mix' && bundle.models.some((m) => m.key === k));
    if (!firstRaw) throw new Error('No forecast models available');
    effectiveKey = firstRaw;
  }

  let selected;
  if (effectiveKey === 'mix') {
    selected = { hours: mix.hours, meta: { key: 'mix', name: 'UKC Mix', resolution: '', initUtcIso: maxInit(bundle.models, mix.contributors) } };
  } else {
    const m = bundle.models.find((x) => x.key === effectiveKey);
    if (!m) throw new Error(`Unknown model: ${effectiveKey}`);
    selected = { hours: m.hours, meta: { key: m.key, name: m.name, resolution: m.resolution, initUtcIso: m.initUtcIso } };
  }

  return {
    location: bundle.location, lat: bundle.lat, lon: bundle.lon, altM: bundle.altM, sstC: bundle.sstC,
    tzOffsetHours: bundle.tzOffsetHours, fetchedAt: bundle.fetchedAt,
    model: selected.meta,
    models: tabs,
    hours: selected.hours,
  };
};

export const getSpotReport = async (spotId, opts = {}) => {
  const spot = getSpot(spotId);
  if (!spot) throw new Error(`Unknown spot: ${spotId}`);
  if (!spot.windguruSpotId) throw new Error(`Spot ${spotId} has no windguruSpotId configured`);
  const bundle = await fetchWindguruModels({ spotId: spot.windguruSpotId, lang: opts.lang || 'en' });
  return { spot, forecast: buildForecast(bundle, { model: opts.model }) };
};

export const getAllSpotReports = async (opts = {}) => {
  return Promise.all(
    SPOT_LIST.map((spot) => getSpotReport(spot.id, { lang: opts.lang }).catch((err) => ({ spot, error: err.message })))
  );
};
