import { SPOTS, SPOT_LIST, getSpot } from './spots.js';
import { fetchWindguruForecast } from './windguruScraper.js';

export { SPOTS, SPOT_LIST, getSpot };
export const listSpots = () => SPOT_LIST;

export const getSpotReport = async (spotId, opts = {}) => {
  const spot = getSpot(spotId);
  if (!spot) throw new Error(`Unknown spot: ${spotId}`);
  if (!spot.windguruSpotId) throw new Error(`Spot ${spotId} has no windguruSpotId configured`);
  const forecast = await fetchWindguruForecast({
    spotId: spot.windguruSpotId,
    windUnit: opts.windUnit || 'knots',
    tempUnit: opts.tempUnit || 'c',
    lang: opts.lang || 'en',
  });
  return { spot, forecast };
};

export const getAllSpotReports = async (opts = {}) => {
  const reports = await Promise.all(
    SPOT_LIST.map((spot) =>
      getSpotReport(spot.id, opts).catch((err) => ({ spot, error: err.message }))
    )
  );
  return reports;
};
