// Windguru spot IDs — update these if they point to the wrong spot on windguru.cz
// Find an ID by visiting https://www.windguru.cz and searching for the spot.
// Order here drives display order on the Wind Report page.
export const SPOTS = {
  gulbahce: {
    id: 'gulbahce',
    nameKey: 'windReport.spots.gulbahce',
    lat: 38.3700,
    lon: 26.5750,
    region: 'izmir',
    timezone: 'Europe/Istanbul',
    windguruSpotId: '574666',
  },
  alacati: {
    id: 'alacati',
    nameKey: 'windReport.spots.alacati',
    lat: 38.2658,
    lon: 26.3770,
    region: 'izmir',
    timezone: 'Europe/Istanbul',
    windguruSpotId: '30910',
  },
  pirlanta: {
    id: 'pirlanta',
    nameKey: 'windReport.spots.pirlanta',
    lat: 38.3170,
    lon: 26.2818,
    region: 'izmir',
    timezone: 'Europe/Istanbul',
    windguruSpotId: '24929',
  },
  gokceada: {
    id: 'gokceada',
    nameKey: 'windReport.spots.gokceada',
    lat: 40.1843,
    lon: 25.8500,
    region: 'canakkale',
    timezone: 'Europe/Istanbul',
    windguruSpotId: '1289863',
  },
};

export const SPOT_LIST = Object.values(SPOTS);

export const getSpot = (id) => SPOTS[id] || null;
