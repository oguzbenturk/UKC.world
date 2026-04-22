import express from 'express';
import axios from 'axios';
import { listSpots, getSpotReport, getAllSpotReports } from '../services/weather/index.js';

const router = express.Router();

// Convert degrees to cardinal direction
const degToCardinal = (deg) => {
  if (deg == null || isNaN(deg)) return 'N';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const ix = Math.round(deg / 22.5) % 16;
  return dirs[ix];
};

// GET /api/weather/hourly?date=YYYY-MM-DD&lat=..&lon=..
router.get('/hourly', async (req, res) => {
  try {
    const date = req.query.date; // required
    if (!date) {
      return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD)' });
    }
    const lat = parseFloat(req.query.lat ?? process.env.WEATHER_LAT ?? '37.0');
    const lon = parseFloat(req.query.lon ?? process.env.WEATHER_LON ?? '27.0');

    const params = {
      latitude: lat,
      longitude: lon,
      hourly: ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'temperature_2m'].join(','),
      wind_speed_unit: 'kn',
      temperature_unit: 'celsius',
      timezone: 'auto',
      start_date: date,
      end_date: date,
    };

    const url = 'https://api.open-meteo.com/v1/forecast';
    const { data } = await axios.get(url, { params });

    if (!data?.hourly?.time) {
      return res.status(502).json({ error: 'Upstream weather API returned no data' });
    }

    const times = data.hourly.time;
    const speeds = data.hourly.wind_speed_10m || [];
    const gusts = data.hourly.wind_gusts_10m || [];
    const dirs = data.hourly.wind_direction_10m || [];
    const temps = data.hourly.temperature_2m || [];

    const result = {};
    for (let i = 0; i < times.length; i++) {
      const t = times[i]; // YYYY-MM-DDTHH:MM
      const hour = t.split('T')[1]?.slice(0, 5) || '00:00';
      const speed = Number(speeds[i] ?? 0);
      const gust = Number(gusts[i] ?? 0);
      const dirDeg = Number(dirs[i] ?? 0);
      const temp = Number(temps[i] ?? 0);
      result[hour] = {
        speedKn: Math.round(speed),
        gustKn: Math.round(gust),
        dirDeg,
        dirText: degToCardinal(dirDeg),
        tempC: Math.round(temp * 10) / 10, // Round to 1 decimal place
      };
    }

    res.json({ date, lat, lon, hours: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hourly weather data' });
  }
});

// GET /api/weather/spots — return the list of kite spots (name, coords, windguruSpotId)
router.get('/spots', (_req, res) => {
  res.json({ spots: listSpots() });
});

// GET /api/weather/report/:spotId — dual-purpose: single spot Windguru forecast as JSON
router.get('/report/:spotId', async (req, res) => {
  try {
    const report = await getSpotReport(req.params.spotId, {
      lang: req.query.lang,
      windUnit: req.query.wj,
    });
    res.json(report);
  } catch (err) {
    const msg = err?.message || 'Failed to fetch forecast';
    if (msg.startsWith('Unknown spot')) return res.status(404).json({ error: msg });
    res.status(502).json({ error: msg });
  }
});

// GET /api/weather/report — all spots in one go
router.get('/report', async (req, res) => {
  try {
    const reports = await getAllSpotReports({
      lang: req.query.lang,
      windUnit: req.query.wj,
    });
    res.json({ fetchedAt: new Date().toISOString(), reports });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Failed to fetch forecasts' });
  }
});

export default router;
