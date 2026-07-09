// Degrees → 16-point cardinal. Shared by the mix blender and the weather routes.
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const degToCardinal = (deg) => {
  if (deg == null || Number.isNaN(deg)) return null;
  return DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};
